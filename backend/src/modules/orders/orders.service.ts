import { pool, query } from "../../config/db.js";
import { ApiError } from "../../utils/api.response.utils.js";
import type { z } from "zod";
import type { CreateOrderSchema } from "./dto/orders.dto.js";
import type { PoolClient } from "pg";

export const SHIPPING_COST_NGN = 5000;
type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
type OrderClient = PoolClient;

type LockedItem = {
  productId: number;
  variantId: number | null;
  quantity: number;
  name: string;
  unitPrice: number;
  stock: number;
  variantHasOwnStock: boolean;
};

async function restoreOrderStock(client: OrderClient, orderId: number): Promise<void> {
  const result = await client.query(
    `SELECT oi.product_id,oi.variant_id,oi.quantity,v.stock AS variant_stock
     FROM order_items oi LEFT JOIN product_variants v ON v.id=oi.variant_id
     WHERE oi.order_id=$1 AND oi.product_id IS NOT NULL`,
    [orderId]
  );
  const productRestocks = new Map<number, number>();
  const variantRestocks = new Map<number, number>();
  for (const item of result.rows) {
    if (item.variant_id !== null && item.variant_stock !== null) {
      variantRestocks.set(
        item.variant_id,
        (variantRestocks.get(item.variant_id) ?? 0) + Number(item.quantity)
      );
    } else {
      productRestocks.set(
        item.product_id,
        (productRestocks.get(item.product_id) ?? 0) + Number(item.quantity)
      );
    }
  }

  for (const [productId, quantity] of productRestocks) {
    const product = await client.query(
      "SELECT stock FROM products WHERE id=$1 FOR UPDATE",
      [productId]
    );
    if (!product.rowCount) continue;
    await client.query(
      "UPDATE products SET stock=$1 WHERE id=$2",
      [Number(product.rows[0].stock) + quantity, productId]
    );
  }
  for (const [variantId, quantity] of variantRestocks) {
    const variant = await client.query(
      "SELECT stock FROM product_variants WHERE id=$1 AND stock IS NOT NULL FOR UPDATE",
      [variantId]
    );
    if (!variant.rowCount) continue;
    await client.query(
      "UPDATE product_variants SET stock=$1 WHERE id=$2",
      [Number(variant.rows[0].stock) + quantity, variantId]
    );
  }
}

export class OrdersService {
  async createOrder(userId: number, input: CreateOrderInput) {
    const aggregated = new Map<string, {
      productId: string;
      variantId: string | null;
      quantity: number;
    }>();
    for (const item of input.items) {
      const variantId = item.variantId ?? null;
      const key = `${item.productId}:${variantId ?? "base"}`;
      const previous = aggregated.get(key);
      aggregated.set(key, {
        productId: item.productId,
        variantId,
        quantity: (previous?.quantity ?? 0) + item.quantity,
      });
    }

    const itemsToLock = [...aggregated.values()].sort(
      (a, b) => a.productId.localeCompare(b.productId) ||
        (a.variantId ?? "").localeCompare(b.variantId ?? "")
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const profile = await client.query(
        "SELECT public_id,name,email,phone FROM users WHERE id=$1",
        [userId]
      );
      if (!profile.rowCount) throw ApiError.unauthorized("User account no longer exists.");

      const address = {
        name: input.shippingAddress.name || profile.rows[0].name || "Customer",
        email: input.shippingAddress.email || profile.rows[0].email || "",
        phone: input.shippingAddress.phone || profile.rows[0].phone || "",
        country: input.shippingAddress.country,
        city: input.shippingAddress.city,
        address: input.shippingAddress.address,
        postalCode: input.shippingAddress.postalCode || "",
      };

      const lockedItems: LockedItem[] = [];
      const productStockUpdates = new Map<number, { stock: number; quantity: number }>();
      const variantStockUpdates = new Map<number, { stock: number; quantity: number }>();
      let subtotalKobo = 0;
      for (const item of itemsToLock) {
        const productResult = await client.query(
          `SELECT id,public_id,name,price,discount_price,stock
           FROM products WHERE public_id=$1 AND active=true FOR UPDATE`,
          [item.productId]
        );
        if (!productResult.rowCount) throw ApiError.conflict("One or more items are unavailable.");

        const product = productResult.rows[0];
        const productId = product.id as number;
        let stock = Number(product.stock);
        let unitPrice = Number(product.discount_price ?? product.price);
        let variantHasOwnStock = false;
        let internalVariantId: number | null = null;
        if (item.variantId !== null) {
          const variantResult = await client.query(
            `SELECT id,public_id,price,stock FROM product_variants
             WHERE public_id=$1 AND product_id=$2 AND active=true FOR UPDATE`,
            [item.variantId, productId]
          );
          if (!variantResult.rowCount) throw ApiError.conflict("One or more options are unavailable.");
          const variant = variantResult.rows[0];
          internalVariantId = variant.id as number;
          variantHasOwnStock = variant.stock !== null;
          stock = variantHasOwnStock ? Number(variant.stock) : Number(product.stock);
          if (variant.price !== null) unitPrice = Number(variant.price);
        }
        if (stock < item.quantity) throw ApiError.conflict("One or more items are unavailable.");
        const stockUpdates = variantHasOwnStock ? variantStockUpdates : productStockUpdates;
        const stockKey = variantHasOwnStock ? internalVariantId as number : productId;
        const existingStockUpdate = stockUpdates.get(stockKey);
        const nextQuantity = (existingStockUpdate?.quantity ?? 0) + item.quantity;
        if (nextQuantity > stock) {
          throw ApiError.conflict("One or more items are unavailable.");
        }
        stockUpdates.set(stockKey, {
          stock,
          quantity: nextQuantity,
        });
        const unitPriceKobo = Math.round(unitPrice * 100);
        subtotalKobo += unitPriceKobo * item.quantity;
        lockedItems.push({
          productId,
          variantId: internalVariantId,
          quantity: item.quantity,
          name: product.name,
          unitPrice: unitPriceKobo / 100,
          stock,
          variantHasOwnStock,
        });
      }

      const subtotal = subtotalKobo / 100;
      const total = subtotal + SHIPPING_COST_NGN;
      const orderResult = await client.query(
        `INSERT INTO orders(user_id,status,payment_status,subtotal,shipping_cost,total,shipping_address)
         VALUES($1,'pending_payment','pending',$2,$3,$4,$5)
         RETURNING id,public_id,status,payment_status,subtotal,shipping_cost,total,shipping_address,tracking_number,created_at`,
        [userId, subtotal, SHIPPING_COST_NGN, total, JSON.stringify(address)]
      );
      const order = orderResult.rows[0];

      for (const item of lockedItems) {
        await client.query(
          `INSERT INTO order_items(order_id,product_id,variant_id,name,unit_price,quantity)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [order.id, item.productId, item.variantId, item.name, item.unitPrice, item.quantity]
        );
      }

      for (const [productId, stockUpdate] of productStockUpdates) {
        await client.query(
          "UPDATE products SET stock=$1 WHERE id=$2",
          [stockUpdate.stock - stockUpdate.quantity, productId]
        );
      }
      for (const [variantId, stockUpdate] of variantStockUpdates) {
        await client.query(
          "UPDATE product_variants SET stock=$1 WHERE id=$2",
          [stockUpdate.stock - stockUpdate.quantity, variantId]
        );
      }

      await client.query(
        `DELETE FROM cart_items
         WHERE cart_id=(SELECT id FROM carts WHERE user_id=$1)`,
        [userId]
      );
      await client.query("COMMIT");
      const { id: _internalId, public_id: publicId, ...orderFields } = order;
      return { ...orderFields, id: publicId, user_id: profile.rows[0].public_id };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listOrders(userId: number) {
    const result = await query(
      `SELECT o.id,o.public_id,o.status,o.payment_status,o.subtotal,o.shipping_cost,o.total,
        o.shipping_address,o.tracking_number,o.created_at,u.public_id AS user_public_id
       FROM orders o LEFT JOIN users u ON u.id=o.user_id
       WHERE o.user_id=$1 ORDER BY o.created_at DESC`,
      [userId]
    );
    return result.rows.map((order) => {
      const { id: _internalId, public_id: publicId, user_public_id, ...fields } = order;
      return { ...fields, id: publicId, user_id: user_public_id };
    });
  }

  async cancelOrder(userId: number, orderId: string) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT id,public_id FROM orders WHERE public_id=$1 AND user_id=$2
         AND payment_status='pending' AND status='pending_payment' FOR UPDATE`,
        [orderId, userId]
      );
      if (!result.rowCount) {
        throw ApiError.conflict("Only unpaid pending orders can be cancelled.");
      }
      await client.query(
        "UPDATE orders SET status='cancelled' WHERE id=$1",
        [result.rows[0].id]
      );
      await restoreOrderStock(client, result.rows[0].id);
      await client.query("COMMIT");
      return { message: "Order cancelled.", orderId: result.rows[0].public_id };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelPendingOrder(orderId: number, transactionClient?: PoolClient) {
    const client = transactionClient ?? await pool.connect();
    const ownsTransaction = !transactionClient;
    try {
      if (ownsTransaction) await client.query("BEGIN");
      const result = await client.query(
        `SELECT id FROM orders WHERE id=$1 AND status='pending_payment'
         AND payment_status='pending' FOR UPDATE`,
        [orderId]
      );
      if (!result.rowCount) {
        if (ownsTransaction) await client.query("COMMIT");
        return false;
      }
      await client.query(
        "UPDATE orders SET status='cancelled' WHERE id=$1",
        [orderId]
      );
      await restoreOrderStock(client, orderId);
      if (ownsTransaction) await client.query("COMMIT");
      return true;
    } catch (error) {
      if (ownsTransaction) await client.query("ROLLBACK");
      throw error;
    } finally {
      if (ownsTransaction) client.release();
    }
  }
}
