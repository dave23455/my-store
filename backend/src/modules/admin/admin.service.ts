import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, query } from "../../config/db.js";
import { ApiError } from "../../utils/api.response.utils.js";
import type {
  CreateStaffDTO,
  StoreSettingsDTO,
} from "./dto/admin.dto.js";

type AdminOrder = Record<string, unknown> & { id: number };

async function ordersWithItems(orders: AdminOrder[]) {
  return Promise.all(
    orders.map(async (order) => {
      const items = await query(
        `SELECT id,product_id,variant_id,name,quantity,unit_price
         FROM order_items WHERE order_id=$1 ORDER BY id`,
        [order.id]
      );
      return { ...order, items: items.rows };
    })
  );
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK");
}

export class AdminService {
  async getDashboard() {
    const [sales, orders, customers, products, lowStock, recentOrders] =
      await Promise.all([
        query("SELECT COALESCE(SUM(total),0) AS total FROM orders WHERE payment_status='paid'"),
        query(
          "SELECT count(*) AS total,count(*) FILTER(WHERE status=$1) AS pending,count(*) FILTER(WHERE status=$2) AS delivered FROM orders",
          ["processing", "delivered"]
        ),
        query("SELECT count(*) AS total FROM users WHERE role='customer'"),
        query("SELECT count(*) AS total FROM products"),
        query("SELECT id,name,stock FROM products WHERE stock <= 5 AND active=true ORDER BY stock"),
        query("SELECT id,status,total,created_at FROM orders ORDER BY created_at DESC LIMIT 5"),
      ]);

    return {
      sales: sales.rows[0].total,
      orders: orders.rows[0],
      customers: customers.rows[0].total,
      products: products.rows[0].total,
      lowStock: lowStock.rows,
      recentOrders: recentOrders.rows,
    };
  }

  async listOrders() {
    const orders = await query<AdminOrder>(
      `SELECT o.*,u.name AS customer_name,u.email AS customer_email
       FROM orders o
       LEFT JOIN users u ON u.id=o.user_id
       ORDER BY o.created_at DESC`
    );
    return ordersWithItems(orders.rows);
  }

  async updateOrder(orderId: number, input: {
    status: string;
    trackingNumber?: string;
  }) {
    const result = await query(
      `UPDATE orders
       SET status=$1,tracking_number=COALESCE($2,tracking_number)
       WHERE id=$3 RETURNING *`,
      [input.status, input.trackingNumber || null, orderId]
    );
    if (!result.rowCount) throw ApiError.notFound("Order not found.");
    return result.rows[0];
  }

  async listCustomers() {
    const result = await query(
      `SELECT u.public_id AS id,u.name,u.email,u.phone,u.created_at,
              COALESCE(SUM(o.total) FILTER(WHERE o.payment_status='paid'),0) AS total_spending,
              COUNT(o.id) AS orders
       FROM users u
       LEFT JOIN orders o ON o.user_id=u.id
       WHERE u.role IN('customer','employee')
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    return result.rows;
  }

  async listCustomerOrders(customerPublicId: string) {
    const customer = await query(
      "SELECT id FROM users WHERE public_id=$1",
      [customerPublicId]
    );
    if (!customer.rowCount) return [];
    const orders = await query<AdminOrder>(
      `SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC`,
      [customer.rows[0].id]
    );
    return ordersWithItems(orders.rows);
  }

  async listPaymentConfirmations() {
    const result = await query(
      `SELECT pc.*,o.total AS order_total,u.name AS customer_name,u.email
       FROM payment_confirmations pc
       JOIN orders o ON o.id=pc.order_id
       LEFT JOIN users u ON u.id=pc.user_id
       ORDER BY pc.created_at DESC`
    );
    return result.rows;
  }

  async reviewPaymentConfirmation(id: number, status: "approved" | "rejected") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const confirmation = await client.query(
        "SELECT * FROM payment_confirmations WHERE id=$1 FOR UPDATE",
        [id]
      );
      if (!confirmation.rowCount) {
        throw ApiError.notFound("Payment confirmation not found.");
      }
      const updated = await client.query(
        "UPDATE payment_confirmations SET status=$1,reviewed_at=now() WHERE id=$2 RETURNING *",
        [status, id]
      );
      if (status === "approved") {
        await client.query(
          "UPDATE orders SET payment_status='paid',status='paid' WHERE id=$1",
          [confirmation.rows[0].order_id]
        );
      }
      await client.query("COMMIT");
      return updated.rows[0];
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async listStaff() {
    const result = await query(
      "SELECT public_id AS id,name,email,role,created_at FROM users WHERE role IN('admin','owner') ORDER BY role DESC,created_at"
    );
    return result.rows;
  }

  async createStaff(input: CreateStaffDTO) {
    if (input.role === "owner") {
      const existingOwner = await query("SELECT id FROM users WHERE role='owner' LIMIT 1");
      if (existingOwner.rowCount) {
        throw ApiError.conflict("Only one owner account is allowed.");
      }
    }
    try {
      const result = await query(
        `INSERT INTO users(name,email,password_hash,role,public_id)
         VALUES($1,$2,$3,$4,$5)
         RETURNING public_id AS id,name,email,role,created_at`,
        [
          input.name,
          input.email.toLowerCase(),
          await bcrypt.hash(input.password, 12),
          input.role,
          randomUUID(),
        ]
      );
      return result.rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw ApiError.conflict("An account with this email already exists.");
      }
      throw error;
    }
  }

  async removeStaff(publicId: string) {
    const result = await query(
      "DELETE FROM users WHERE public_id=$1 AND role='admin' RETURNING public_id",
      [publicId]
    );
    if (!result.rowCount) {
      throw ApiError.conflict("Only admin accounts can be removed here.");
    }
  }

  async getSettings() {
    const result = await query(
      "SELECT data FROM store_settings WHERE id=1"
    );
    return result.rowCount ? result.rows[0].data : {};
  }

  async updateSettings(settings: StoreSettingsDTO) {
    const result = await query(
      `INSERT INTO store_settings(id,data,updated_at)
       VALUES(1,$1,now())
       ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()
       RETURNING data`,
      [JSON.stringify(settings)]
    );
    return result.rows[0].data;
  }
}
