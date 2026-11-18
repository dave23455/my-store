import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL = "";
process.env.JWT_SECRET = "payment-test-secret";
process.env.PAYMENT_PROVIDER = "paystack";
process.env.PAYSTACK_SECRET_KEY = "payment-test-paystack-secret";
process.env.STORE_CURRENCY = "NGN";

const [{ createApp }, { pool }] = await Promise.all([
  import("../src/app.ts"),
  import("../src/config/db.ts"),
]);

test("payments API uses public order IDs and handles payment state transitions safely", async (t) => {
  const suffix = randomUUID();
  const userPublicId = randomUUID();
  const otherUserPublicId = randomUUID();
  const [user, otherUser] = await Promise.all([
    pool.query(
      `INSERT INTO users(public_id,name,email,password_hash,role)
       VALUES($1,'Payment Test User',$2,'unused','customer') RETURNING id`,
      [userPublicId, `payment-${suffix}@example.test`]
    ),
    pool.query(
      `INSERT INTO users(public_id,name,email,password_hash,role)
       VALUES($1,'Other Payment User',$2,'unused','customer') RETURNING id`,
      [otherUserPublicId, `other-payment-${suffix}@example.test`]
    ),
  ]);
  const makeOrder = async (ownerId, total) => {
    const result = await pool.query(
      `INSERT INTO orders(user_id,status,payment_status,subtotal,shipping_cost,total,shipping_address)
       VALUES($1,'pending_payment','pending',$2,0,$2,'{}') RETURNING id,public_id`,
      [ownerId, total]
    );
    return result.rows[0];
  };
  const paidOrder = await makeOrder(user.rows[0].id, 5000);
  const manualOrder = await makeOrder(user.rows[0].id, 6500);
  const failedOrder = await makeOrder(user.rows[0].id, 5000);
  const cancelledAttemptOrder = await makeOrder(user.rows[0].id, 5000);
  const product = await pool.query(
    `INSERT INTO products(category_id,name,description,price,stock,sku)
     SELECT id,'Payment Failure Stock Test','',100,8,$1
     FROM categories WHERE slug='hair' RETURNING id`,
    [`PAYMENT-${suffix}`]
  );
  await pool.query(
    `INSERT INTO order_items(order_id,product_id,name,unit_price,quantity)
     VALUES($1,$2,'Payment Failure Stock Test',100,2)`,
    [failedOrder.id, product.rows[0].id]
  );

  const makeToken = (publicId, email) =>
    jwt.sign({ sub: publicId, email, role: "customer" }, process.env.JWT_SECRET);
  const headers = {
    Authorization: `Bearer ${makeToken(userPublicId, `payment-${suffix}@example.test`)}`,
    "Content-Type": "application/json",
  };
  const otherHeaders = {
    Authorization: `Bearer ${makeToken(otherUserPublicId, `other-payment-${suffix}@example.test`)}`,
    "Content-Type": "application/json",
  };
  const originalFetch = globalThis.fetch;
  const providerCalls = [];
  let verifyResult = { status: "success", amount: 500000, currency: "NGN" };
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith("http://127.0.0.1:")) {
      return originalFetch(url, init);
    }
    providerCalls.push({ url: String(url), init });
    const reference = decodeURIComponent(String(url).split("/").at(-1));
    return Response.json({
      status: true,
      message: "Verified",
      data: { ...verifyResult, reference },
    });
  };
  const server = createApp().listen(0);
  t.after(async () => {
    globalThis.fetch = originalFetch;
    delete process.env.PAYMENT_PROVIDER;
    delete process.env.PAYSTACK_SECRET_KEY;
    delete process.env.STORE_CURRENCY;
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/payments`;

  const initialize = await fetch(`${baseUrl}/initialize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orderId: paidOrder.public_id }),
  });
  assert.equal(initialize.status, 200, await initialize.clone().text());
  const initialized = await initialize.json();
  assert.match(initialized.reference, /^LSY-[0-9a-f]{32}$/);
  assert.equal(initialized.amount, 500000);
  assert.equal(initialized.currency, "NGN");

  const manualWhileOnlinePending = await fetch(`${baseUrl}/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      orderId: paidOrder.public_id,
      payerName: "Test Payer",
      amount: 5000,
    }),
  });
  assert.equal(manualWhileOnlinePending.status, 409);

  const duplicateInitialize = await fetch(`${baseUrl}/initialize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orderId: paidOrder.public_id }),
  });
  assert.equal(duplicateInitialize.status, 409);

  const foreignVerify = await fetch(
    `${baseUrl}/${initialized.reference}/verify`,
    { headers: otherHeaders }
  );
  assert.equal(foreignVerify.status, 404);
  const providerVerifyCalls = providerCalls.filter((call) =>
    call.url.includes("/transaction/verify/")
  ).length;

  const verify = await fetch(`${baseUrl}/${initialized.reference}/verify`, { headers });
  assert.equal(verify.status, 200, await verify.clone().text());
  assert.deepEqual(await verify.json(), {
    paid: true,
    orderId: paidOrder.public_id,
    status: "success",
  });
  assert.equal(
    (await pool.query("SELECT status,payment_status FROM orders WHERE id=$1", [paidOrder.id]))
      .rows[0].payment_status,
    "paid"
  );
  const repeatedVerify = await fetch(`${baseUrl}/${initialized.reference}/verify`, { headers });
  assert.equal(repeatedVerify.status, 200);
  assert.equal(
    providerCalls.filter((call) => call.url.includes("/transaction/verify/")).length,
    providerVerifyCalls + 2
  );
  const initializePaidOrder = await fetch(`${baseUrl}/initialize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orderId: paidOrder.public_id }),
  });
  assert.equal(initializePaidOrder.status, 409);

  const amountMismatchOrder = await makeOrder(user.rows[0].id, 5000);
  const amountMismatchInitialization = await fetch(`${baseUrl}/initialize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orderId: amountMismatchOrder.public_id }),
  });
  const amountMismatchReference = (await amountMismatchInitialization.json()).reference;
  verifyResult = { status: "success", amount: 499999, currency: "NGN" };
  const amountMismatch = await fetch(`${baseUrl}/${amountMismatchReference}/verify`, { headers });
  assert.equal(amountMismatch.status, 409);
  assert.equal(
    (await pool.query(
      "SELECT payment_status FROM orders WHERE id=$1",
      [amountMismatchOrder.id]
    )).rows[0].payment_status,
    "pending"
  );
  verifyResult = { status: "success", amount: 500000, currency: "NGN" };
  const retryAmountMismatch = await fetch(
    `${baseUrl}/${amountMismatchReference}/verify`,
    { headers }
  );
  assert.equal(retryAmountMismatch.status, 200);

  const mismatchedAmount = await fetch(`${baseUrl}/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orderId: manualOrder.public_id, payerName: "Test Payer", amount: 6400 }),
  });
  assert.equal(mismatchedAmount.status, 400);
  const confirmationResponse = await fetch(`${baseUrl}/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      orderId: manualOrder.public_id,
      payerName: "Test Payer",
      amount: 6500,
      reference: `MANUAL-${suffix}`,
    }),
  });
  assert.equal(confirmationResponse.status, 201);
  const confirmation = (await confirmationResponse.json()).confirmation;
  assert.match(confirmation.id, /^[0-9a-f-]{36}$/i);
  assert.equal(confirmation.order_id, manualOrder.public_id);
  assert.equal(confirmation.user_id, userPublicId);
  const onlineWhileManualPending = await fetch(`${baseUrl}/initialize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orderId: manualOrder.public_id }),
  });
  assert.equal(onlineWhileManualPending.status, 409);
  const duplicateConfirmation = await fetch(`${baseUrl}/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      orderId: manualOrder.public_id,
      payerName: "Test Payer",
      amount: 6500,
    }),
  });
  assert.equal(duplicateConfirmation.status, 409);

  const cancelledAttempt = await fetch(
    `${baseUrl}/${(await (await fetch(`${baseUrl}/initialize`, {
      method: "POST",
      headers,
      body: JSON.stringify({ orderId: cancelledAttemptOrder.public_id }),
    })).json()).reference}/cancel`,
    { method: "POST", headers }
  );
  assert.equal(cancelledAttempt.status, 200);
  assert.deepEqual(await cancelledAttempt.json(), { cancelled: true });
  const cancelledAttemptAgain = await fetch(
    `${baseUrl}/${(await pool.query(
      "SELECT reference FROM payments WHERE order_id=$1",
      [cancelledAttemptOrder.id]
    )).rows[0].reference}/cancel`,
    { method: "POST", headers }
  );
  assert.equal(cancelledAttemptAgain.status, 200);
  const retryCancelledAttempt = await fetch(`${baseUrl}/initialize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orderId: cancelledAttemptOrder.public_id }),
  });
  assert.equal(retryCancelledAttempt.status, 200);

  const failedInitialization = await fetch(`${baseUrl}/initialize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orderId: failedOrder.public_id }),
  });
  const failedReference = (await failedInitialization.json()).reference;
  verifyResult = { status: "failed", amount: 500000, currency: "NGN" };
  const failedVerification = await fetch(`${baseUrl}/${failedReference}/verify`, { headers });
  assert.equal(failedVerification.status, 200);
  assert.deepEqual(await failedVerification.json(), {
    paid: false,
    orderId: failedOrder.public_id,
    status: "failed",
  });
  assert.equal(
    (await pool.query("SELECT status FROM orders WHERE id=$1", [failedOrder.id])).rows[0].status,
    "cancelled"
  );
  assert.equal(
    Number((await pool.query("SELECT stock FROM products WHERE id=$1", [product.rows[0].id])).rows[0].stock),
    10
  );
  const initializeCancelledOrder = await fetch(`${baseUrl}/initialize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orderId: failedOrder.public_id }),
  });
  assert.equal(initializeCancelledOrder.status, 409);

  const webhookOrder = await makeOrder(user.rows[0].id, 5000);
  const webhookInitialization = await fetch(`${baseUrl}/initialize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orderId: webhookOrder.public_id }),
  });
  const webhookReference = (await webhookInitialization.json()).reference;
  verifyResult = { status: "success", amount: 500000, currency: "NGN" };
  const webhookBody = JSON.stringify({
    event: "charge.success",
    data: { reference: webhookReference },
  });
  const webhookSignature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(webhookBody)
    .digest("hex");
  const webhook = await fetch(
    `http://127.0.0.1:${server.address().port}/api/payments/webhook`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": webhookSignature,
      },
      body: webhookBody,
    }
  );
  assert.equal(webhook.status, 200, await webhook.clone().text());
  assert.equal(
    (await pool.query("SELECT payment_status FROM orders WHERE id=$1", [webhookOrder.id]))
      .rows[0].payment_status,
    "paid"
  );

  const invalidSignature = await fetch(
    `http://127.0.0.1:${server.address().port}/api/payments/webhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-paystack-signature": "invalid" },
      body: webhookBody,
    }
  );
  assert.equal(invalidSignature.status, 401);
  const malformedBody = "{";
  const malformedSignature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(malformedBody)
    .digest("hex");
  const malformedWebhook = await fetch(
    `http://127.0.0.1:${server.address().port}/api/payments/webhook`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": malformedSignature,
      },
      body: malformedBody,
    }
  );
  assert.equal(malformedWebhook.status, 400);
});
