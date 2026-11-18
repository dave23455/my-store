import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

process.env.DATABASE_URL = "";
process.env.JWT_SECRET = "support-test-secret";

const [{ createApp }, { pool }] = await Promise.all([
  import("../src/app.ts"),
  import("../src/config/db.ts"),
]);

test("support routes serve settings, reviews, comments, and the admin inbox", async (t) => {
  const suffix = randomUUID();
  const product = await pool.query(
    "SELECT id,public_id FROM products WHERE active=true LIMIT 1"
  );
  const owner = await pool.query(
    "SELECT public_id,email,name,role FROM users WHERE role='owner' LIMIT 1"
  );
  assert.equal(product.rowCount, 1);
  assert.equal(owner.rowCount, 1);

  const customerPublicId = randomUUID();
  const customer = await pool.query(
    `INSERT INTO users(public_id,name,email,password_hash,role)
     VALUES($1,'Support Test Customer',$2,'unused','customer') RETURNING id`,
    [customerPublicId, `support-${suffix}@example.test`]
  );
  const order = await pool.query(
    `INSERT INTO orders(user_id,status,payment_status,subtotal,shipping_cost,total,shipping_address)
     VALUES($1,'paid','paid',100,0,100,'{}') RETURNING id`,
    [customer.rows[0].id]
  );
  await pool.query(
    `INSERT INTO order_items(order_id,product_id,name,unit_price,quantity)
     VALUES($1,$2,'Support test purchase',100,1)`,
    [order.rows[0].id, product.rows[0].id]
  );

  const customerHeaders = {
    Authorization: `Bearer ${jwt.sign(
      { sub: customerPublicId, role: "customer" },
      process.env.JWT_SECRET
    )}`,
    "Content-Type": "application/json",
  };
  const ownerHeaders = {
    Authorization: `Bearer ${jwt.sign(
      { sub: owner.rows[0].public_id, role: owner.rows[0].role },
      process.env.JWT_SECRET
    )}`,
    "Content-Type": "application/json",
  };
  const server = createApp().listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const settings = await fetch(`${baseUrl}/settings`);
  assert.equal(settings.status, 200);
  assert.ok((await settings.json()).store_name);

  const unverifiedReview = await fetch(
    `${baseUrl}/products/${product.rows[0].public_id}/reviews`,
    {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ rating: 5, body: "No purchase for this product." }),
    }
  );
  assert.equal(unverifiedReview.status, 403);

  const reviewResponse = await fetch(
    `${baseUrl}/products/${product.rows[0].public_id}/reviews`,
    {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({ rating: 5, body: "A verified purchase review." }),
    }
  );
  assert.equal(reviewResponse.status, 201, await reviewResponse.clone().text());
  const updatedProduct = await pool.query(
    "SELECT rating FROM products WHERE id=$1",
    [product.rows[0].id]
  );
  assert.equal(Number(updatedProduct.rows[0].rating), 5);
  const reviews = await fetch(
    `${baseUrl}/products/${product.rows[0].public_id}/reviews`
  );
  assert.equal(reviews.status, 200);
  assert.equal((await reviews.json()).length, 1);

  const commentResponse = await fetch(
    `${baseUrl}/products/${product.rows[0].public_id}/comments`,
    {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({ body: "A product question." }),
    }
  );
  assert.equal(commentResponse.status, 201);
  const comments = await fetch(
    `${baseUrl}/products/${product.rows[0].public_id}/comments`
  );
  assert.equal(comments.status, 200);
  assert.equal((await comments.json()).length, 1);

  const messageResponse = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Support Test",
      email: `support-${suffix}@example.test`,
      body: "Please contact me about my order.",
    }),
  });
  assert.equal(messageResponse.status, 201);

  const forbiddenInbox = await fetch(`${baseUrl}/messages`, {
    headers: customerHeaders,
  });
  assert.equal(forbiddenInbox.status, 403);
  const inbox = await fetch(`${baseUrl}/messages`, { headers: ownerHeaders });
  assert.equal(inbox.status, 200);
  assert.ok((await inbox.json()).some((message) => message.email === `support-${suffix}@example.test`));
});
