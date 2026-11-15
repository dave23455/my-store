import { pool } from "../../config/db.js";
import { ApiError } from "../../utils/api.response.utils.js";
import type { CartItemInput } from "./dto/cart.dto.js";
import type { Pool, PoolClient } from "pg";

type CartClient = PoolClient;
type ResolvedCartItem = { productId: number; variantId: number | null; quantity: number };

async function getOrCreateCart(client: CartClient, userId: number): Promise<number> {
  const inserted = await client.query(
    "INSERT INTO carts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING RETURNING id",
    [userId]
  );
  if (inserted.rowCount) return inserted.rows[0].id;

  const existing = await client.query(
    "SELECT id FROM carts WHERE user_id=$1 FOR UPDATE",
    [userId]
  );
  if (!existing.rowCount) throw ApiError.internal("Could not load the customer cart.");
  return existing.rows[0].id;
}

async function lockStock(
  client: CartClient,
  productId: number,
  variantId: number | null
): Promise<number> {
  const product = await client.query(
    "SELECT id,stock,active FROM products WHERE id=$1 FOR UPDATE",
    [productId]
  );
  if (!product.rowCount || !product.rows[0].active) {
    throw ApiError.notFound("Product unavailable.");
  }
  if (variantId === null) return product.rows[0].stock;

  const variant = await client.query(
    `SELECT stock FROM product_variants
     WHERE id=$1 AND product_id=$2 AND active=true FOR UPDATE`,
    [variantId, productId]
  );
  if (!variant.rowCount) throw ApiError.notFound("Product option unavailable.");
  return variant.rows[0].stock ?? product.rows[0].stock;
}

async function upsertItem(
  client: CartClient,
  cartId: number,
  item: ResolvedCartItem
): Promise<void> {
  const variantId = item.variantId ?? null;
  const stock = await lockStock(client, item.productId, variantId);
  const existing = await client.query(
    `SELECT id,quantity FROM cart_items
     WHERE cart_id=$1 AND product_id=$2
       AND (variant_id=$3 OR (variant_id IS NULL AND $3 IS NULL))
     FOR UPDATE`,
    [cartId, item.productId, variantId]
  );
  const nextQuantity = (existing.rows[0]?.quantity ?? 0) + item.quantity;
  if (nextQuantity > stock) {
    throw ApiError.conflict("Not enough stock for the requested quantity.");
  }

  if (existing.rowCount) {
    await client.query("UPDATE cart_items SET quantity=$1 WHERE id=$2", [
      nextQuantity,
      existing.rows[0].id,
    ]);
  } else {
    await client.query(
      "INSERT INTO cart_items(cart_id,product_id,variant_id,quantity) VALUES($1,$2,$3,$4)",
      [cartId, item.productId, variantId, item.quantity]
    );
  }
}

export class CartService {
  constructor(private readonly db: Pool = pool) {}

  async getCart(userId: number) {
    const client = await this.db.connect();
    let cartId: number;
    try {
      cartId = await getOrCreateCart(client, userId);
    } finally {
      client.release();
    }

    const result = await this.db.query(
      `SELECT ci.public_id AS id,c.public_id AS cart_id,ci.quantity,
      v.public_id AS variant_id,v.name AS variant_name,v.options AS variant_options,
      p.public_id AS product_id,p.name,
        COALESCE(v.price,p.discount_price,p.price) AS price,
        NULL::numeric AS discount_price,
        COALESCE(v.stock,p.stock) AS stock,p.sku,
        (p.active AND (ci.variant_id IS NULL OR COALESCE(v.active,false))
          AND COALESCE(v.stock,p.stock)>0) AS available
       FROM cart_items ci
       JOIN carts c ON c.id=ci.cart_id
       JOIN products p ON p.id=ci.product_id
       LEFT JOIN product_variants v ON v.id=ci.variant_id
       WHERE ci.cart_id=$1
       ORDER BY ci.id`,
      [cartId]
    );
    return Promise.all(result.rows.map(async (item) => {
      const image = await this.db.query(
        `SELECT i.url FROM product_images i
         JOIN products p ON p.id=i.product_id
         WHERE p.public_id=$1 ORDER BY i.position LIMIT 1`,
        [item.product_id]
      );
      return { ...item, image: image.rows[0]?.url ?? "" };
    }));
  }

  async clearCart(userId: number) {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const cartId = await getOrCreateCart(client, userId);
      await client.query("DELETE FROM cart_items WHERE cart_id=$1", [cartId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addItem(userId: number, item: CartItemInput) {
    await this.mergeItems(userId, [item]);
    const cart = await this.getCart(userId);
    const addedItem = cart.find(
      (row) => row.product_id === item.productId && row.variant_id === (item.variantId ?? null)
    );
    if (!addedItem) throw ApiError.internal("Could not load the updated cart item.");
    return {
      id: addedItem.id,
      cart_id: addedItem.cart_id,
      product_id: addedItem.product_id,
      variant_id: addedItem.variant_id,
      quantity: addedItem.quantity,
    };
  }

  async updateItem(userId: number, itemId: string, quantity: number) {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const cartId = await getOrCreateCart(client, userId);
      const result = await client.query(
        `SELECT id,product_id,variant_id FROM cart_items
         WHERE public_id=$1 AND cart_id=$2 FOR UPDATE`,
        [itemId, cartId]
      );
      if (!result.rowCount) throw ApiError.notFound("Cart item not found.");
      const item = result.rows[0];
      const details = await client.query(
        `SELECT p.public_id AS product_public_id,v.public_id AS variant_public_id,
                c.public_id AS cart_public_id
         FROM products p
         JOIN carts c ON c.id=$2
         LEFT JOIN product_variants v ON v.id=$3
         WHERE p.id=$1`,
        [item.product_id, cartId, item.variant_id]
      );
      if (!details.rowCount) throw ApiError.notFound("Cart item not found.");
      const stock = await lockStock(client, item.product_id, item.variant_id);
      if (quantity > stock) throw ApiError.conflict("Not enough stock for the requested quantity.");
      const updated = await client.query(
        "UPDATE cart_items SET quantity=$1 WHERE id=$2 RETURNING public_id AS id,quantity",
        [quantity, result.rows[0].id]
      );
      await client.query("COMMIT");
      return {
        ...updated.rows[0],
        cart_id: details.rows[0].cart_public_id,
        product_id: details.rows[0].product_public_id,
        variant_id: details.rows[0].variant_public_id ?? null,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async removeItem(userId: number, itemId: string) {
    const client = await this.db.connect();
    try {
      const cartId = await getOrCreateCart(client, userId);
      await client.query(
        "DELETE FROM cart_items WHERE public_id=$1 AND cart_id=$2",
        [itemId, cartId]
      );
    } finally {
      client.release();
    }
  }

  async mergeItems(userId: number, items: CartItemInput[]) {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const cartId = await getOrCreateCart(client, userId);
      const mergedItems = new Map<string, ResolvedCartItem>();
      for (const item of items) {
        const product = await client.query(
          "SELECT id FROM products WHERE public_id=$1",
          [item.productId]
        );
        if (!product.rowCount) throw ApiError.notFound("Product unavailable.");
        const productId = product.rows[0].id as number;
        const publicVariantId = item.variantId ?? null;
        let variantId: number | null = null;
        if (publicVariantId !== null) {
          const variant = await client.query(
            "SELECT id FROM product_variants WHERE public_id=$1 AND product_id=$2",
            [publicVariantId, productId]
          );
          if (!variant.rowCount) throw ApiError.notFound("Product option unavailable.");
          variantId = variant.rows[0].id as number;
        }
        const key = `${productId}:${variantId ?? "base"}`;
        const current = mergedItems.get(key);
        mergedItems.set(key, {
          productId,
          variantId,
          quantity: (current?.quantity ?? 0) + item.quantity,
        });
      }

      const orderedItems = [...mergedItems.values()].sort(
        (a, b) => a.productId - b.productId || (a.variantId ?? 0) - (b.variantId ?? 0)
      );
      for (const item of orderedItems) {
        const variantId = item.variantId ?? null;
        const stock = await lockStock(client, item.productId, variantId);
        const existing = await client.query(
          `SELECT quantity FROM cart_items
           WHERE cart_id=$1 AND product_id=$2
             AND (variant_id=$3 OR (variant_id IS NULL AND $3 IS NULL))
           FOR UPDATE`,
          [cartId, item.productId, variantId]
        );
        if ((existing.rows[0]?.quantity ?? 0) + item.quantity > stock) {
          throw ApiError.conflict("Not enough stock for the requested quantity.");
        }
      }

      for (const item of orderedItems) {
        await upsertItem(client, cartId, item);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getCart(userId);
  }
}
