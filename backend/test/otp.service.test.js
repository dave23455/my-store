import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { newDb } from "pg-mem";

const { OtpService } = await import("../src/modules/otp/otp.service.ts");
const {
  ResetPasswordOtpSchema,
  ResendVerificationSchema,
  VerifyEmailSchema,
} = await import("../src/modules/otp/dto/otp.dto.ts");

async function createOtpService() {
  const memoryDb = newDb();
  const { Pool } = memoryDb.adapters.createPg();
  const pool = new Pool();
  await pool.query(`
    CREATE TABLE users(
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      public_id UUID,
      email_verified BOOLEAN NOT NULL DEFAULT true
    );
    CREATE TABLE password_reset_otps(
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0 CHECK(attempts>=0),
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE email_verification_otps(
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0 CHECK(attempts>=0),
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  const originalPassword = await bcrypt.hash("OriginalPassword123", 4);
  const { rows } = await pool.query(
    "INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id",
    ["shopper@example.com", originalPassword]
  );
  let loggedOtp;
  const service = new OtpService(pool, (_email, otp) => {
    loggedOtp = otp;
  });
  return {
    pool,
    service,
    userId: rows[0].id,
    originalPassword,
    readLoggedOtp: () => loggedOtp,
  };
}

test("generates a six-digit OTP and stores only its hash for one hour", async (t) => {
  const state = await createOtpService();
  t.after(() => state.pool.end());

  const result = await state.service.requestPasswordReset({
    email: "SHOPPER@example.com",
  });
  const { rows } = await state.pool.query(
    "SELECT otp_hash,expires_at FROM password_reset_otps WHERE user_id=$1",
    [state.userId]
  );
  const otp = state.readLoggedOtp();

  assert.equal(result.status_code, 200);
  assert.match(otp, /^\d{6}$/);
  assert.notEqual(rows[0].otp_hash, otp);
  assert.equal(await bcrypt.compare(otp, rows[0].otp_hash), true);
  assert.ok(new Date(rows[0].expires_at).getTime() > Date.now() + 59 * 60 * 1000);
  assert.ok(new Date(rows[0].expires_at).getTime() <= Date.now() + 61 * 60 * 1000);
});

test("does not reveal or log whether an email has an account", async (t) => {
  const state = await createOtpService();
  t.after(() => state.pool.end());

  const result = await state.service.requestPasswordReset({
    email: "unknown@example.com",
  });
  const records = await state.pool.query("SELECT id FROM password_reset_otps");

  assert.equal(result.status_code, 200);
  assert.equal(state.readLoggedOtp(), undefined);
  assert.equal(records.rowCount, 0);
});

test("resets the password atomically and consumes the OTP once", async (t) => {
  const state = await createOtpService();
  t.after(() => state.pool.end());
  await state.service.requestPasswordReset({ email: "shopper@example.com" });

  const result = await state.service.resetPassword({
    email: "shopper@example.com",
    otp: state.readLoggedOtp(),
    password: "ChangedPassword456",
  });
  const user = await state.pool.query(
    "SELECT password_hash FROM users WHERE id=$1",
    [state.userId]
  );
  const otpRecords = await state.pool.query(
    "SELECT id FROM password_reset_otps WHERE user_id=$1",
    [state.userId]
  );

  assert.equal(result.status_code, 200);
  assert.notEqual(user.rows[0].password_hash, state.originalPassword);
  assert.equal(await bcrypt.compare("ChangedPassword456", user.rows[0].password_hash), true);
  assert.equal(otpRecords.rowCount, 0);
  await assert.rejects(
    state.service.resetPassword({
      email: "shopper@example.com",
      otp: state.readLoggedOtp(),
      password: "AnotherPassword789",
    }),
    /invalid or expired/
  );
});

test("limits failed OTP attempts and deletes expired OTP records", async (t) => {
  const state = await createOtpService();
  t.after(() => state.pool.end());
  await state.service.requestPasswordReset({ email: "shopper@example.com" });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      state.service.resetPassword({
        email: "shopper@example.com",
        otp: "000000",
        password: "ChangedPassword456",
      }),
      /invalid or expired/
    );
  }
  const afterAttempts = await state.pool.query(
    "SELECT id FROM password_reset_otps WHERE user_id=$1",
    [state.userId]
  );
  assert.equal(afterAttempts.rowCount, 0);

  await state.service.requestPasswordReset({ email: "shopper@example.com" });
  await state.pool.query(
    "UPDATE password_reset_otps SET expires_at=now() - interval '1 minute' WHERE user_id=$1",
    [state.userId]
  );
  await state.service.deleteExpiredOtps();
  const afterCleanup = await state.pool.query(
    "SELECT id FROM password_reset_otps WHERE user_id=$1",
    [state.userId]
  );
  assert.equal(afterCleanup.rowCount, 0);
});

test("validates OTPs as exactly six numeric digits", () => {
  const base = {
    email: "shopper@example.com",
    password: "ChangedPassword456",
  };
  assert.equal(ResetPasswordOtpSchema.safeParse({ ...base, otp: "012345" }).success, true);
  assert.equal(ResetPasswordOtpSchema.safeParse({ ...base, otp: "12345" }).success, false);
  assert.equal(ResetPasswordOtpSchema.safeParse({ ...base, otp: "12a456" }).success, false);
});

test("verification endpoints require opaque UUID user IDs", () => {
  assert.equal(
    VerifyEmailSchema.safeParse({ userId: "123", otp: "012345" }).success,
    false
  );
  assert.equal(
    ResendVerificationSchema.safeParse({ userId: "123" }).success,
    false
  );
  assert.equal(
    ResendVerificationSchema.safeParse({
      userId: "4bc95d0b-76e4-4c8f-b823-00ebf0d108a3",
    }).success,
    true
  );
});
