import crypto from "node:crypto";
import { pool } from "../../config/db.js";
import { ApiError } from "../../utils/api.response.utils.js";
import { OrdersService } from "../orders/orders.service.js";

const PAYSTACK_ENDPOINT = "https://api.paystack.co";
const ordersService = new OrdersService();

type PaystackResponse<T> = {
  status: boolean;
  message: string;
  data: T;
};

type PaystackTransaction = {
  status: string;
  amount: number;
  reference: string;
  currency?: string;
};

async function paystackRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new ApiError(503, "PAYMENTS_UNAVAILABLE", "Online payments are not configured.");
  }

  const response = await fetch(`${PAYSTACK_ENDPOINT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  let payload: PaystackResponse<T>;
  try {
    payload = await response.json() as PaystackResponse<T>;
  } catch {
    throw new ApiError(502, "PAYMENT_PROVIDER_ERROR", "The payment provider returned an invalid response.");
  }
  if (!response.ok || !payload.status) {
    throw new ApiError(
      502,
      "PAYMENT_PROVIDER_ERROR",
      payload.message || "Payment provider request failed."
    );
  }
  return payload.data;
}

export class PaymentService {
  private isEnabled(): boolean {
    return process.env.PAYMENT_PROVIDER === "paystack" &&
      Boolean(process.env.PAYSTACK_SECRET_KEY);
  }

  async initializePayment(orderPublicId: string, userId: number) {
    if (!this.isEnabled()) {
      throw new ApiError(503, "PAYMENTS_UNAVAILABLE", "Online payments are not configured.");
    }

    const client = await pool.connect();
    const reference = `LSY-${crypto.randomUUID().replaceAll("-", "")}`;
    let order: { id: number; public_id: string; total: number | string };
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT id,public_id,total,payment_status,status
         FROM orders WHERE public_id=$1 AND user_id=$2 FOR UPDATE`,
        [orderPublicId, userId]
      );
      if (!result.rowCount) throw ApiError.notFound("Order not found.");
      const currentOrder = result.rows[0];
      if (currentOrder.payment_status !== "pending" || currentOrder.status !== "pending_payment") {
        throw ApiError.conflict("Only pending unpaid orders can be paid.");
      }
      const pendingPayment = await client.query(
        "SELECT id FROM payments WHERE order_id=$1 AND status='pending' LIMIT 1",
        [currentOrder.id]
      );
      if (pendingPayment.rowCount) {
        throw ApiError.conflict("A payment attempt is already pending for this order.");
      }
      const pendingConfirmation = await client.query(
        "SELECT id FROM payment_confirmations WHERE order_id=$1 AND status='pending' LIMIT 1",
        [currentOrder.id]
      );
      if (pendingConfirmation.rowCount) {
        throw ApiError.conflict("A manual payment confirmation is already awaiting review.");
      }
      await client.query(
        `INSERT INTO payments(order_id,provider,reference,status,amount)
         VALUES($1,'paystack',$2,'pending',$3)`,
        [currentOrder.id, reference, currentOrder.total]
      );
      await client.query("COMMIT");
      order = currentOrder;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return {
      reference,
      amount: Math.round(Number(order.total) * 100),
      currency: process.env.STORE_CURRENCY || "NGN",
    };
  }

  async verifyPayment(reference: string, userId?: number) {
    if (!this.isEnabled()) {
      throw new ApiError(503, "PAYMENTS_UNAVAILABLE", "Online payments are not configured.");
    }

    const paymentLookup = userId === undefined
      ? await pool.query(
          "SELECT p.id FROM payments p WHERE p.reference=$1",
          [reference]
        )
      : await pool.query(
          `SELECT p.id FROM payments p JOIN orders o ON o.id=p.order_id
           WHERE p.reference=$1 AND o.user_id=$2`,
          [reference, userId]
        );
    if (!paymentLookup.rowCount) throw ApiError.notFound("Payment not found.");

    const data = await paystackRequest<PaystackTransaction>(
      `/transaction/verify/${encodeURIComponent(reference)}`
    );
    if (data.reference !== reference) {
      throw ApiError.conflict("The payment reference does not match.");
    }
    if (
      data.status === "success" &&
      data.currency !== (process.env.STORE_CURRENCY || "NGN")
    ) {
      throw ApiError.conflict("The payment currency does not match the order.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const paymentResult = await client.query(
        "SELECT * FROM payments WHERE reference=$1 FOR UPDATE",
        [reference]
      );
      if (!paymentResult.rowCount) throw ApiError.notFound("Payment not found.");
      const payment = paymentResult.rows[0];
      const orderResult = await client.query(
        `SELECT id,public_id,user_id,status,payment_status
         FROM orders WHERE id=$1 FOR UPDATE`,
        [payment.order_id]
      );
      if (!orderResult.rowCount) throw ApiError.notFound("Order not found.");
      const order = orderResult.rows[0];
      if (userId !== undefined && order.user_id !== userId) {
        throw ApiError.notFound("Payment not found.");
      }

      if (data.status === "success") {
        if (Number(data.amount) !== Math.round(Number(payment.amount) * 100)) {
          throw ApiError.conflict("The payment amount does not match the order total.");
        }
        if (
          payment.status !== "paid" &&
          (order.status !== "pending_payment" || order.payment_status !== "pending")
        ) {
          throw ApiError.conflict("This order is no longer awaiting payment.");
        }
        if (payment.status !== "paid") {
          await client.query("UPDATE payments SET status='paid' WHERE id=$1", [payment.id]);
        }
        await client.query(
          "UPDATE payments SET status='failed' WHERE order_id=$1 AND id<>$2 AND status='pending'",
          [payment.order_id, payment.id]
        );
        if (order.payment_status !== "paid") {
          await client.query(
            "UPDATE orders SET payment_status='paid',status='paid' WHERE id=$1",
            [payment.order_id]
          );
        }
        await client.query("COMMIT");
        return { paid: true, orderId: order.public_id, status: "success" };
      }

      if (data.status === "failed" || data.status === "abandoned") {
        if (payment.status === "paid") {
          throw ApiError.conflict("A completed payment cannot be marked as failed.");
        }
        if (payment.status === "pending") {
          await client.query(
            "UPDATE payments SET status='failed' WHERE id=$1",
            [payment.id]
          );
        }
        const remaining = await client.query(
          "SELECT 1 FROM payments WHERE order_id=$1 AND status='pending' LIMIT 1",
          [payment.order_id]
        );
        if (!remaining.rowCount) {
          await ordersService.cancelPendingOrder(payment.order_id, client);
        }
        await client.query("COMMIT");
        return { paid: false, orderId: order.public_id, status: data.status };
      }

      await client.query("COMMIT");
      return { paid: false, orderId: order.public_id, status: "pending" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  validWebhook(signature: string | string[] | undefined, body: Buffer): boolean {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret || typeof signature !== "string") return false;
    const expected = crypto.createHmac("sha512", secret).update(body).digest();
    const provided = Buffer.from(signature, "hex");
    return provided.length === expected.length &&
      crypto.timingSafeEqual(provided, expected);
  }

  async cancelPaymentAttempt(reference: string, userId: number) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const payment = await client.query(
        "SELECT id,order_id,status FROM payments WHERE reference=$1 FOR UPDATE",
        [reference]
      );
      if (!payment.rowCount) throw ApiError.notFound("Payment not found.");
      const order = await client.query(
        "SELECT user_id,status,payment_status FROM orders WHERE id=$1 FOR UPDATE",
        [payment.rows[0].order_id]
      );
      if (!order.rowCount || order.rows[0].user_id !== userId) {
        throw ApiError.notFound("Payment not found.");
      }
      if (payment.rows[0].status === "paid") {
        throw ApiError.conflict("A completed payment cannot be cancelled.");
      }
      if (
        order.rows[0].status !== "pending_payment" ||
        order.rows[0].payment_status !== "pending"
      ) {
        throw ApiError.conflict("This order is no longer awaiting payment.");
      }
      if (payment.rows[0].status === "pending") {
        await client.query(
          "UPDATE payments SET status='failed' WHERE id=$1",
          [payment.rows[0].id]
        );
      }
      await client.query("COMMIT");
      return { cancelled: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async confirmManualPayment(input: {
    orderId: string;
    userId: number;
    payerName: string;
    amount: number;
    reference?: string;
    notes?: string;
  }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const order = await client.query(
        `SELECT id,total FROM orders
         WHERE public_id=$1 AND user_id=$2 AND payment_status='pending'
           AND status='pending_payment' FOR UPDATE`,
        [input.orderId, input.userId]
      );
      if (!order.rowCount) {
        throw ApiError.notFound("Order not found or no longer awaiting payment.");
      }
      if (Math.round(input.amount * 100) !== Math.round(Number(order.rows[0].total) * 100)) {
        throw ApiError.badRequest("The submitted amount must match the order total.");
      }

      const pendingPayment = await client.query(
        "SELECT id FROM payments WHERE order_id=$1 AND status='pending' LIMIT 1",
        [order.rows[0].id]
      );
      if (pendingPayment.rowCount) {
        throw ApiError.conflict("An online payment attempt is already pending for this order.");
      }
      const pendingConfirmation = await client.query(
        `SELECT id FROM payment_confirmations
         WHERE order_id=$1 AND status='pending' LIMIT 1`,
        [order.rows[0].id]
      );
      if (pendingConfirmation.rowCount) {
        throw ApiError.conflict("A payment confirmation is already awaiting review.");
      }
      await client.query(
        `INSERT INTO payment_confirmations(order_id,user_id,payer_name,amount,reference,notes)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          order.rows[0].id,
          input.userId,
          input.payerName,
          input.amount,
          input.reference ?? null,
          input.notes ?? null,
        ]
      );
      const result = await client.query(
        `SELECT pc.public_id AS id,o.public_id AS order_id,u.public_id AS user_id,
                pc.payer_name,pc.amount,pc.reference,pc.notes,pc.status,
                pc.reviewed_at,pc.created_at
         FROM payment_confirmations pc
         JOIN orders o ON o.id=pc.order_id
         JOIN users u ON u.id=pc.user_id
         WHERE pc.order_id=$1 AND pc.user_id=$2 AND pc.status='pending'
         ORDER BY pc.id DESC LIMIT 1`,
        [order.rows[0].id, input.userId]
      );
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const paymentService = new PaymentService();
