import autoBind from "auto-bind";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { query } from "../../config/db.js";
import { ApiError, ApiSuccess } from "../../utils/api.response.utils.js";
import { sendPasswordResetEmail } from "../../services/email.service.js";
import {
  RegisterDTO,
  LoginDTO,
  UpdateProfileDTO,
  ForgotPasswordDTO,
  ResetPasswordDTO,
} from "./dto/auth.dto.js";
import { User, UserRole } from "../../types/database.types.js";

export class AuthService {
  constructor() {
    autoBind(this);
  }

  public generateToken(user: { id: number; role: UserRole; email: string; name: string }): string {
    const secret = process.env.JWT_SECRET || "default_secret";
    return jwt.sign(
      { id: user.id, role: user.role, email: user.email, name: user.name },
      secret,
      { expiresIn: "7d" }
    );
  }

  public formatUser(user: Partial<User>) {
    return {
      id: user.id,
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
    try {
      const result = await query(
        `INSERT INTO users(name, email, password_hash, phone)
         VALUES($1, $2, $3, $4)
         RETURNING id, name, email, role, phone, created_at`,
        [dto.name || "Customer", dto.email.toLowerCase(), hash, dto.phone || null]
      );
      const user = this.formatUser(result.rows[0]);
      const token = this.generateToken(result.rows[0]);
      return ApiSuccess.created("Account created successfully", { user, token });
    } catch (error: any) {
      if (error?.code === "23505") {
        throw ApiError.conflict("An account with this email already exists. Please sign in instead.");
      }
      throw error;
    }
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

    const user = this.formatUser(userRecord);
    const token = this.generateToken(userRecord);
    return ApiSuccess.ok("Login successful", { user, token });
  }

  public async getProfile(userId: number) {
    const userRes = await query(
      "SELECT id, name, email, role, phone, created_at FROM users WHERE id = $1",
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
      query("SELECT * FROM addresses WHERE user_id = $1", [userId]),
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
       RETURNING id, name, email, role, phone, created_at`,
      [dto.name ? dto.name.trim() : null, dto.phone || null, userId]
    );

    if (!result.rowCount) {
      throw ApiError.notFound("User not found");
    }

    const user = this.formatUser(result.rows[0]);
    return ApiSuccess.ok("Profile updated", { user });
  }

  public async forgotPassword(dto: ForgotPasswordDTO) {
    const result = await query("SELECT id FROM users WHERE email = $1", [dto.email.toLowerCase()]);
    if (result.rowCount) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
      await query(
        "INSERT INTO password_reset_tokens(user_id, token_hash, expires_at) VALUES($1, $2, now() + interval '30 minutes')",
        [result.rows[0].id, hash]
      );
      const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
      await sendPasswordResetEmail({
        to: dto.email,
        link: `${clientUrl}/reset-password?token=${rawToken}`,
      });
    }

    return ApiSuccess.ok("If that email exists, a reset link will be sent.");
  }

  public async resetPassword(dto: ResetPasswordDTO) {
    const hash = crypto.createHash("sha256").update(dto.token).digest("hex");
    const tokenRes = await query(
      "SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()",
      [hash]
    );

    if (!tokenRes.rowCount) {
      throw ApiError.badRequest("This reset link is invalid or expired");
    }

    const newPasswordHash = await bcrypt.hash(dto.password, 12);
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      newPasswordHash,
      tokenRes.rows[0].user_id,
    ]);
    await query("UPDATE password_reset_tokens SET used_at = now() WHERE id = $1", [
      tokenRes.rows[0].id,
    ]);

    return ApiSuccess.ok("Password updated successfully. You can now sign in.");
  }
}
