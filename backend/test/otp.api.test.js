import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

process.env.DATABASE_URL = "";
process.env.NODE_ENV = "development";

const [{ createApp }, { pool }] = await Promise.all([
  import("../src/app.ts"),
  import("../src/config/db.ts"),
]);

test("auth endpoints generate and consume a development password-reset OTP", async (t) => {
  const email = `otp-${Date.now()}@example.com`;
  const passwordHash = await bcrypt.hash("OriginalPassword123", 4);
  const user = await pool.query(
    "INSERT INTO users(name,email,password_hash,public_id) VALUES($1,$2,$3,$4) RETURNING id",
    ["OTP test user", email, passwordHash, crypto.randomUUID()]
  );
  const server = createApp().listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/auth`;

  const originalInfo = console.info;
  const logs = [];
  console.info = (...args) => logs.push(args.join(" "));
  let forgotResponse;
  try {
    forgotResponse = await fetch(`${baseUrl}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(forgotResponse.status, 200);
  assert.match((await forgotResponse.json()).message, /If an account exists/);
  const otp = logs.join("\n").match(/Development OTP for .*: (\d{6})/)?.[1];
  assert.match(otp, /^\d{6}$/);

  const invalidOtpResponse = await fetch(`${baseUrl}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp: "12345", password: "ChangedPassword456" }),
  });
  assert.equal(invalidOtpResponse.status, 422);

  const resetResponse = await fetch(`${baseUrl}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp, password: "ChangedPassword456" }),
  });
  assert.equal(resetResponse.status, 200);

  const storedUser = await pool.query(
    "SELECT password_hash FROM users WHERE id=$1",
    [user.rows[0].id]
  );
  assert.equal(await bcrypt.compare("ChangedPassword456", storedUser.rows[0].password_hash), true);

  const reuseResponse = await fetch(`${baseUrl}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp, password: "AnotherPassword789" }),
  });
  assert.equal(reuseResponse.status, 400);
});

test("registration requires email verification and exposes only a UUID user ID", async (t) => {
  const email = `verify-${Date.now()}@example.com`;
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "LinaStyledYou <no-reply@example.com>";
  const originalFetch = globalThis.fetch;
  const sentEmails = [];
  globalThis.fetch = async (url, options) => {
    if (url === "https://api.resend.com/emails") {
      sentEmails.push(JSON.parse(options.body));
      return new Response("{}", { status: 200 });
    }
    return originalFetch(url, options);
  };
  const server = createApp().listen(0);
  t.after(() => {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    return new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/auth`;

  const registerResponse = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Verification Test",
      email,
      password: "ChangedPassword456",
    }),
  });
  assert.equal(registerResponse.status, 201);
  const registration = await registerResponse.json();
  assert.match(registration.userId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(registration.user.id, registration.userId);
  assert.equal(registration.token, undefined);
  assert.equal(registration.nextStep.endpoint, "/auth/verifyemail");
  assert.equal(registration.nextStep.body.userId, registration.userId);
  assert.match(registration.message, /check your email/i);
  assert.match(sentEmails[0].text, /\b\d{6}\b/);
  assert.doesNotMatch(JSON.stringify(sentEmails[0]), /html/i);
  const verificationOtp = sentEmails[0].text.match(/\b(\d{6})\b/)?.[1];
  assert.match(verificationOtp, /^\d{6}$/);

  const loginResponse = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "ChangedPassword456" }),
  });
  assert.equal(loginResponse.status, 403);

  const verifyResponse = await fetch(`${baseUrl}/verifyemail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: registration.userId, otp: verificationOtp }),
  });
  assert.equal(verifyResponse.status, 200);

  const loginAfterVerify = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "ChangedPassword456" }),
  });
  assert.equal(loginAfterVerify.status, 200);
  const loginBody = await loginAfterVerify.json();
  assert.equal(loginBody.user.id, registration.userId);
  assert.equal(typeof loginBody.token, "string");
  const tokenPayload = JSON.parse(
    Buffer.from(loginBody.token.split(".")[1], "base64url").toString("utf8")
  );
  assert.equal(tokenPayload.sub, registration.userId);
  assert.equal(tokenPayload.id, undefined);

  const profileResponse = await fetch(`${baseUrl}/me`, {
    headers: { Authorization: `Bearer ${loginBody.token}` },
  });
  assert.equal(profileResponse.status, 200);
  assert.equal((await profileResponse.json()).user.id, registration.userId);

  const reusedCodeResponse = await fetch(`${baseUrl}/verifyemail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: registration.userId, otp: verificationOtp }),
  });
  assert.equal(reusedCodeResponse.status, 400);
});

test("resendverification replaces and emails the verification OTP", async (t) => {
  const email = `resend-${Date.now()}@example.com`;
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "LinaStyledYou <no-reply@example.com>";
  const originalFetch = globalThis.fetch;
  const sentEmails = [];
  globalThis.fetch = async (url, options) => {
    if (url === "https://api.resend.com/emails") {
      sentEmails.push(JSON.parse(options.body));
      return new Response("{}", { status: 200 });
    }
    return originalFetch(url, options);
  };
  const server = createApp().listen(0);
  t.after(() => {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    return new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/auth`;

  const registerResponse = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "ChangedPassword456" }),
  });
  const { userId } = await registerResponse.json();
  const invalidPublicIdResponse = await fetch(`${baseUrl}/resendverification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "1" }),
  });
  assert.equal(invalidPublicIdResponse.status, 422);
  const originalOtp = sentEmails[0].text.match(/\b(\d{6})\b/)?.[1];

  const resendResponse = await fetch(`${baseUrl}/resendverification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  assert.equal(resendResponse.status, 200);
  assert.equal(sentEmails.length, 2);
  const resentOtp = sentEmails[1].text.match(/\b(\d{6})\b/)?.[1];
  assert.match(resentOtp, /^\d{6}$/);

  const oldOtpResponse = await fetch(`${baseUrl}/verifyemail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, otp: originalOtp }),
  });
  assert.equal(oldOtpResponse.status, 400);
  const validOtpResponse = await fetch(`${baseUrl}/verifyemail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, otp: resentOtp }),
  });
  assert.equal(validOtpResponse.status, 200);
});
