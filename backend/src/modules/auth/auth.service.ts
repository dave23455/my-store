import autoBind from "auto-bind";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { pool, query } from "../../config/db.js";
import { ApiError, ApiSuccess } from "../../utils/api.response.utils.js";
import { otpService } from "../otp/otp.service.js";
import {
  RegisterDTO,
  LoginDTO,
  UpdateProfileDTO,
} from "./dto/auth.dto.js";
import { User, UserRole } from "../../types/database.types.js";

export class AuthService {
  constructor() {
    autoBind(this);
  }

  public generateToken(user: { public_id: string; role: UserRole; email: string; name: string }): string {
    const secret = process.env.JWT_SECRET || "default_secret";
    return jwt.sign(
      { sub: user.public_id, role: user.role, email: user.email, name: user.name },
      secret,
      { expiresIn: "7d" }
    );
  }

  public formatUser(user: Partial<User> & Pick<User, "public_id">) {
    return {
      id: user.public_id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || null,
      created_at: user.created_at,
      permissions:
        user.role === UserRole.OWNER
          ? ["all", "manage_staff", "manage_store", "manage_products", "manage_orders", "view_analytics"]
          : user.role === UserRole.ADMIN
          ? ["manage_store", "manage_products", "manage_orders", "view_analytics"]
          : ["browse", "buy", "review", "comment"],
    };
  }

  public async register(dto: RegisterDTO) {
    const hash = await bcrypt.hash(dto.password, 12);
    const publicId = randomUUID();
    const client = await pool.connect();
    let userRecord: User;
    try {
      await client.query("BEGIN");
      const result = await client.query<User>(
        `INSERT INTO users(name, email, password_hash, phone, public_id, email_verified)
         VALUES($1, $2, $3, $4, $5, false)
         RETURNING id, public_id, name, email, password_hash, role, phone, email_verified, created_at`,
        [dto.name || "Customer", dto.email.toLowerCase(), hash, dto.phone || null, publicId]
      );
      userRecord = result.rows[0];
      await client.query("COMMIT");
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error?.code === "23505") {
        throw ApiError.conflict("An account with this email already exists. Please sign in instead.");
      }
      throw error;
    } finally {
      client.release();
    }

    await otpService.issueEmailVerificationOtp(
      userRecord.id,
      publicId,
      userRecord.email
    );
    const user = this.formatUser(userRecord);
    return ApiSuccess.created("Account created. Check your email and verify your account before signing in.", {
      user,
      userId: publicId,
      message: "Check your email for the six-digit verification code, then verify your account before signing in.",
      nextStep: {
        action: "verify_email",
        method: "POST",
        endpoint: "/auth/verifyemail",
        body: { userId: publicId, otp: "<6-digit code from your email>" },
      },
    });
  }

  public async login(dto: LoginDTO) {
    const result = await query("SELECT * FROM users WHERE email = $1", [dto.email.toLowerCase()]);
    if (!result.rowCount) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    const userRecord = result.rows[0];
    const passwordMatch = await bcrypt.compare(dto.password, userRecord.password_hash);
    if (!passwordMatch) {
      throw ApiError.unauthorized("Invalid email or password");
    }
    if (!userRecord.email_verified) {
      throw ApiError.forbidden("Please verify your email before signing in.");
    }

    const user = this.formatUser(userRecord);
    const token = this.generateToken(userRecord);
    return ApiSuccess.ok("Login successful", { user, token });
  }

  public async getProfile(userId: number) {
    const userRes = await query(
      "SELECT id, public_id, name, email, role, phone, created_at FROM users WHERE id = $1",
      [userId]
    );
    if (!userRes.rowCount) {
      throw ApiError.notFound("User not found");
    }

    const [ordersRes, addressesRes] = await Promise.all([
      query(
        "SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total_spent FROM orders WHERE user_id = $1",
        [userId]
      ),
      query(
        `SELECT a.public_id AS id,u.public_id AS user_id,a.name,a.phone,a.country,
          a.region,a.city,a.address,a.postal_code
         FROM addresses a JOIN users u ON u.id=a.user_id
         WHERE a.user_id=$1`,
        [userId]
      ),
    ]);

    const user = {
      ...this.formatUser(userRes.rows[0]),
      stats: {
        orders_count: Number(ordersRes.rows[0]?.count || 0),
        total_spent: Number(ordersRes.rows[0]?.total_spent || 0),
      },
      addresses: addressesRes.rows,
    };

    return ApiSuccess.ok("Profile retrieved", { user });
  }

  public async updateProfile(userId: number, dto: UpdateProfileDTO) {
    const result = await query(
      `UPDATE users
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone)
       WHERE id = $3
       RETURNING id, public_id, name, email, role, phone, created_at`,
      [dto.name ? dto.name.trim() : null, dto.phone || null, userId]
    );

    if (!result.rowCount) {
      throw ApiError.notFound("User not found");
    }

    const user = this.formatUser(result.rows[0]);
    return ApiSuccess.ok("Profile updated", { user });
  }

}
