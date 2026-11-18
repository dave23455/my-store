import { query } from "../../config/db.js";
import { ApiError } from "../../utils/api.response.utils.js";
import { parsePublicId } from "../../utils/public-id.utils.js";
import type {
  CreateCommentDTO,
  CreateMessageDTO,
  CreateReviewDTO,
} from "./dto/support.dto.js";

async function productId(publicId: string): Promise<number> {
  const result = await query(
    "SELECT id FROM products WHERE public_id=$1 AND active=true",
    [parsePublicId(publicId, "product id")]
  );
  if (!result.rowCount) throw ApiError.notFound("Product not found.");
  return result.rows[0].id;
}

export class SupportService {
  async getSettings() {
    const result = await query("SELECT data FROM store_settings WHERE id=1");
    return result.rowCount ? result.rows[0].data : {};
  }

  async listReviews(publicProductId: string) {
    const id = await productId(publicProductId);
    const result = await query(
      `SELECT r.id,r.rating,r.body,r.created_at,u.name
       FROM reviews r
       LEFT JOIN users u ON u.id=r.user_id
       WHERE r.product_id=$1 AND r.approved=true
       ORDER BY r.created_at DESC`,
      [id]
    );
    return result.rows;
  }

  async createReview(
    publicProductId: string,
    userId: number,
    input: CreateReviewDTO
  ) {
    const id = await productId(publicProductId);
    const purchase = await query(
      `SELECT 1 FROM order_items oi
       JOIN orders o ON o.id=oi.order_id
       WHERE oi.product_id=$1 AND o.user_id=$2 AND o.payment_status='paid'
       LIMIT 1`,
      [id, userId]
    );
    if (!purchase.rowCount) {
      throw ApiError.forbidden("Only verified purchasers can review.");
    }

    const result = await query(
      `INSERT INTO reviews(product_id,user_id,rating,body,approved)
       VALUES($1,$2,$3,$4,true)
       ON CONFLICT(product_id,user_id)
       DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,approved=true
       RETURNING *`,
      [id, userId, input.rating, input.body]
    );
    const average = await query(
      "SELECT AVG(rating) AS average FROM reviews WHERE product_id=$1 AND approved=true",
      [id]
    );
    const rating = average.rows[0].average === null
      ? 0
      : Math.round(Number(average.rows[0].average) * 10) / 10;
    await query("UPDATE products SET rating=$1 WHERE id=$2", [rating, id]);
    return result.rows[0];
  }

  async listComments(publicProductId: string) {
    const id = await productId(publicProductId);
    const result = await query(
      `SELECT c.*,u.name
       FROM comments c
       LEFT JOIN users u ON u.id=c.user_id
       WHERE c.product_id=$1 AND c.approved=true
       ORDER BY c.created_at DESC`,
      [id]
    );
    return result.rows;
  }

  async createComment(
    publicProductId: string,
    userId: number,
    input: CreateCommentDTO
  ) {
    const id = await productId(publicProductId);
    const result = await query(
      "INSERT INTO comments(product_id,user_id,body) VALUES($1,$2,$3) RETURNING *",
      [id, userId, input.body]
    );
    return result.rows[0];
  }

  async createMessage(input: CreateMessageDTO) {
    const result = await query(
      "INSERT INTO messages(name,email,body) VALUES($1,$2,$3) RETURNING id,created_at",
      [input.name, input.email, input.body]
    );
    return result.rows[0];
  }

  async listMessages() {
    const result = await query(
      "SELECT * FROM messages WHERE archived=false ORDER BY created_at DESC"
    );
    return result.rows;
  }
}
