import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Pool } from "pg";
import { pool } from "../../config/db.js";
import { ApiError, ApiSuccess } from "../../utils/api.response.utils.js";
import { sendVerificationOtpEmail } from "../../services/email.service.js";
import type {
  ForgotPasswordOtpDTO,
  ResendVerificationDTO,
  ResetPasswordOtpDTO,
  VerifyEmailDTO,
} from "./dto/otp.dto.js";

const MAX_OTP_ATTEMPTS = 5;

type OtpLogger = (email: string, otp: string, expiresAt: Date) => void;

const defaultOtpLogger: OtpLogger = (email, otp, expiresAt) => {
  if (process.env.NODE_ENV === "development") {
    console.info(
      `[password-reset] Development OTP for ${email}: ${otp} (expires ${expiresAt.toISOString()})`
    );
  }
};

export class OtpService {
  constructor(
    private readonly db: Pool = pool,
    private readonly logOtp: OtpLogger = defaultOtpLogger
  ) {}

  async deleteExpiredOtps(): Promise<void> {
    await this.db.query(
      "DELETE FROM password_reset_otps WHERE expires_at <= now()"
    );
    await this.db.query(
      "DELETE FROM email_verification_otps WHERE expires_at <= now()"
    );
  }

  async issueEmailVerificationOtp(
    userId: number,
    publicId: string,
    email: string
  ): Promise<void> {
    const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    const client = await this.db.connect();
    let expiresAt: Date | undefined;
    try {
      await client.query("BEGIN");
      const user = await client.query<{ email_verified: boolean }>(
        "SELECT email_verified FROM users WHERE id=$1 FOR UPDATE",
        [userId]
      );
      if (!user.rowCount) {
        throw ApiError.notFound("Account not found.");
      }
      if (user.rows[0].email_verified) {
        await client.query("ROLLBACK");
        return;
      }
      await client.query(
        "DELETE FROM email_verification_otps WHERE user_id=$1",
        [userId]
      );
      const inserted = await client.query<{ expires_at: Date }>(
        `INSERT INTO email_verification_otps(user_id,otp_hash,expires_at)
         VALUES($1,$2,now() + interval '60 minutes')
         RETURNING expires_at`,
        [userId, await bcrypt.hash(otp, 12)]
      );
      expiresAt = inserted.rows[0].expires_at;
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    if (!expiresAt) {
      throw new Error("Email verification OTP was not saved.");
    }
    if (process.env.NODE_ENV === "development") {
      console.info(
        `[email-verification] Development OTP for ${email}: ${otp} (expires ${expiresAt.toISOString()})`
      );
    }

    try {
      await sendVerificationOtpEmail({ to: email, otp, expiresAt });
    } catch (error) {
      throw new ApiError(
        error instanceof ApiError ? error.status_code : 502,
        error instanceof ApiError ? error.code : "EMAIL_DELIVERY_FAILED",
        "Your account was created, but the verification email could not be sent. Please request a new code.",
        { userId: publicId }
      );
    }
  }

  async verifyEmail(dto: VerifyEmailDTO) {
    await this.deleteExpiredOtps();
    const client = await this.db.connect();
    let invalidOtp = false;
    try {
      await client.query("BEGIN");
      const user = await client.query<{ id: number; email_verified: boolean }>(
        "SELECT id,email_verified FROM users WHERE public_id=$1 FOR UPDATE",
        [dto.userId]
      );
      if (!user.rowCount || user.rows[0].email_verified) {
        invalidOtp = true;
      } else {
        const otpResult = await client.query<{
          id: number;
          otp_hash: string;
          attempts: number;
        }>(
          `SELECT id,otp_hash,attempts
           FROM email_verification_otps
           WHERE user_id=$1 AND expires_at>now()
           ORDER BY created_at DESC
           LIMIT 1 FOR UPDATE`,
          [user.rows[0].id]
        );
        if (!otpResult.rowCount) {
          invalidOtp = true;
        } else {
          const record = otpResult.rows[0];
          if (!await bcrypt.compare(dto.otp, record.otp_hash)) {
            const attempts = record.attempts + 1;
            if (attempts >= MAX_OTP_ATTEMPTS) {
              await client.query(
                "DELETE FROM email_verification_otps WHERE id=$1",
                [record.id]
              );
            } else {
              await client.query(
                "UPDATE email_verification_otps SET attempts=$1 WHERE id=$2",
                [attempts, record.id]
              );
            }
            invalidOtp = true;
          } else {
            await client.query(
              "UPDATE users SET email_verified=true WHERE id=$1",
              [user.rows[0].id]
            );
            await client.query(
              "DELETE FROM email_verification_otps WHERE id=$1",
              [record.id]
            );
          }
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    if (invalidOtp) {
      throw ApiError.badRequest("This verification code is invalid or expired.");
    }
    return ApiSuccess.ok("Email verified. You can now sign in.");
  }

  async resendEmailVerification(dto: ResendVerificationDTO) {
    await this.deleteExpiredOtps();
    const user = await this.db.query<{
      id: number;
      public_id: string;
      email: string;
      email_verified: boolean;
    }>(
      "SELECT id,public_id,email,email_verified FROM users WHERE public_id=$1",
      [dto.userId]
    );
    if (user.rowCount && !user.rows[0].email_verified) {
      await this.issueEmailVerificationOtp(
        user.rows[0].id,
        user.rows[0].public_id,
        user.rows[0].email
      );
    }
    return ApiSuccess.ok(
      "If this account needs verification, a new code has been sent to its email address."
    );
  }

  async requestPasswordReset(dto: ForgotPasswordOtpDTO) {
    await this.deleteExpiredOtps();
    const user = await this.db.query<{ id: number }>(
      "SELECT id FROM users WHERE lower(email)=$1",
      [dto.email.toLowerCase()]
    );

    if (user.rowCount) {
      const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
      const client = await this.db.connect();
      let expiresAt: Date;
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT id FROM users WHERE id=$1 FOR UPDATE",
          [user.rows[0].id]
        );
        await client.query(
          "DELETE FROM password_reset_otps WHERE user_id=$1",
          [user.rows[0].id]
        );
        const inserted = await client.query<{ expires_at: Date }>(
          `INSERT INTO password_reset_otps(user_id,otp_hash,expires_at)
           VALUES($1,$2,now() + interval '60 minutes')
           RETURNING expires_at`,
          [user.rows[0].id, await bcrypt.hash(otp, 12)]
        );
        expiresAt = inserted.rows[0].expires_at;
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      if (!expiresAt) {
        throw new Error("Password reset OTP was not saved.");
      }
      this.logOtp(dto.email.toLowerCase(), otp, expiresAt);
    }

    return ApiSuccess.ok(
      "If an account exists for that email, a password-reset code has been generated."
    );
  }

  async resetPassword(dto: ResetPasswordOtpDTO) {
    await this.deleteExpiredOtps();
    const client = await this.db.connect();
    let invalidOtp = false;
    try {
      await client.query("BEGIN");
      const user = await client.query<{ id: number }>(
        "SELECT id FROM users WHERE lower(email)=$1",
        [dto.email.toLowerCase()]
      );
      if (!user.rowCount) {
        invalidOtp = true;
      } else {
        const otpResult = await client.query<{
          id: number;
          otp_hash: string;
          attempts: number;
        }>(
          `SELECT id,otp_hash,attempts
           FROM password_reset_otps
           WHERE user_id=$1 AND expires_at>now()
           ORDER BY created_at DESC
           LIMIT 1 FOR UPDATE`,
          [user.rows[0].id]
        );

        if (!otpResult.rowCount) {
          invalidOtp = true;
        } else {
          const record = otpResult.rows[0];
          if (!await bcrypt.compare(dto.otp, record.otp_hash)) {
            const attempts = record.attempts + 1;
            if (attempts >= MAX_OTP_ATTEMPTS) {
              await client.query(
                "DELETE FROM password_reset_otps WHERE id=$1",
                [record.id]
              );
            } else {
              await client.query(
                "UPDATE password_reset_otps SET attempts=$1 WHERE id=$2",
                [attempts, record.id]
              );
            }
            invalidOtp = true;
          } else {
            const passwordHash = await bcrypt.hash(dto.password, 12);
            await client.query(
              "UPDATE users SET password_hash=$1 WHERE id=$2",
              [passwordHash, user.rows[0].id]
            );
            await client.query(
              "DELETE FROM password_reset_otps WHERE id=$1",
              [record.id]
            );
          }
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    if (invalidOtp) {
      throw ApiError.badRequest("This OTP is invalid or expired.");
    }
    return ApiSuccess.ok("Password updated successfully. You can now sign in.");
  }
}

export const otpService = new OtpService();

export function startOtpCleanup(db: Pool = pool): NodeJS.Timeout {
  const interval = setInterval(() => {
    db.query("DELETE FROM password_reset_otps WHERE expires_at <= now()")
        .then(() =>
          db.query("DELETE FROM email_verification_otps WHERE expires_at <= now()")
        )
        .catch((error: unknown) => {
          console.error("[otp] Failed to remove expired OTPs:", error);
        });
  }, 10 * 60 * 1000);
  interval.unref();
  return interval;
}
