import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL = "";
process.env.JWT_SECRET = "orders-test-secret";

const [{ createApp }, { pool }] = await Promise.all([
  import("../src/app.ts"),
  import("../src/config/db.ts"),
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("orders API calculates prices, aggregates stock, and cancels atomically", async (t) => {
  const suffix = randomUUID();
  const userPublicId = randomUUID();
  const otherUserPublicId = randomUUID();
  const userResult = await pool.query(
    `INSERT INTO users(public_id,name,email,password_hash,role)
     VALUES($1,'Orders Test User',$2,'unused','customer') RETURNING id`,
    [userPublicId, `orders-${suffix}@example.test`]
  );
  const otherUserResult = await pool.query(
    `INSERT INTO users(public_id,name,email,password_hash,role)
     VALUES($1,'Other Orders User',$2,'unused','customer') RETURNING id`,
    [otherUserPublicId, `other-orders-${suffix}@example.test`]
  );
  const productResult = await pool.query(
    `INSERT INTO products(category_id,name,description,price,discount_price,stock,sku)
     SELECT id,'Orders API Test Product','',120,100,10,$1 FROM categories WHERE slug='hair'
     RETURNING id,public_id`,
    [`ORDER-${suffix}`]
  );
  const product = productResult.rows[0];
  const variants = await pool.query(
    `INSERT INTO product_variants(product_id,name,options,price,stock,sku)
     VALUES
       ($1,'Small','{"size":"Small"}',80,2,$2),
       ($1,'Standard','{"size":"Standard"}',NULL,NULL,$3)
     RETURNING id,public_id`,
    [product.id, `ORDER-S-${suffix}`, `ORDER-ST-${suffix}`]
  );
  const [smallVariant, standardVariant] = variants.rows;
  const cart = await pool.query(
    "INSERT INTO carts(user_id) VALUES($1) RETURNING id,public_id",
    [userResult.rows[0].id]
  );
  await pool.query(
    "INSERT INTO cart_items(cart_id,product_id,quantity) VALUES($1,$2,1)",
    [cart.rows[0].id, product.id]
  );

  const tokenFor = (publicId, email) => jwt.sign(
    { sub: publicId, email, role: "customer" },
    process.env.JWT_SECRET
  );
  const headers = {
    Authorization: `Bearer ${tokenFor(userPublicId, `orders-${suffix}@example.test`)}`,
    "Content-Type": "application/json",
  };
  const otherHeaders = {
    Authorization: `Bearer ${tokenFor(otherUserPublicId, `other-orders-${suffix}@example.test`)}`,
    "Content-Type": "application/json",
  };
  const server = createApp().listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/orders`;
  const shippingAddress = {
    country: "Nigeria",
    city: "Lagos",
    address: "1 Test Street",
  };

  assert.equal((await fetch(baseUrl)).status, 401);
  const invalidPublicId = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      items: [{ productId: "1", quantity: 1 }],
      shippingAddress,
    }),
  });
  assert.equal(invalidPublicId.status, 422, await invalidPublicId.clone().text());

  const overstock = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      items: [
        { productId: product.public_id, quantity: 3 },
        { productId: product.public_id, quantity: 8 },
      ],
      shippingAddress,
    }),
  });
  assert.equal(overstock.status, 409);
  assert.equal(Number((await pool.query(
    "SELECT stock FROM products WHERE id=$1",
    [product.id]
  )).rows[0].stock), 10);
  assert.equal((await pool.query(
    "SELECT id FROM orders WHERE user_id=$1",
    [userResult.rows[0].id]
  )).rowCount, 0);

  const createResponse = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      items: [
        { productId: product.public_id, quantity: 1 },
        { productId: product.public_id, quantity: 1 },
        { productId: product.public_id, variantId: smallVariant.public_id, quantity: 1 },
        { productId: product.public_id, variantId: standardVariant.public_id, quantity: 1 },
      ],
      shippingAddress,
    }),
  });
  assert.equal(createResponse.status, 201, await createResponse.clone().text());
  const order = await createResponse.json();
  assert.ok(UUID_PATTERN.test(order.id));
  assert.equal(order.user_id, userPublicId);
  assert.equal(order.subtotal, 380);
  assert.equal(order.shipping_cost, 5000);
  assert.equal(order.total, 5380);
  assert.equal("public_id" in order, false);
  assert.equal(Number((await pool.query(
    "SELECT stock FROM products WHERE id=$1",
    [product.id]
  )).rows[0].stock), 7);
  assert.equal(Number((await pool.query(
    "SELECT stock FROM product_variants WHERE id=$1",
    [smallVariant.id]
  )).rows[0].stock), 1);
  assert.equal((await pool.query(
    "SELECT id FROM cart_items WHERE cart_id=$1",
    [cart.rows[0].id]
  )).rowCount, 0);

  const listResponse = await fetch(baseUrl, { headers });
  const orders = await listResponse.json();
  assert.equal(orders.length, 1);
  assert.equal(orders[0].id, order.id);
  assert.equal(orders[0].user_id, userPublicId);
  assert.equal("public_id" in orders[0], false);

  const foreignCancel = await fetch(`${baseUrl}/${order.id}/cancel`, {
    method: "PATCH",
    headers: otherHeaders,
  });
  assert.equal(foreignCancel.status, 409);
  const cancelResponse = await fetch(`${baseUrl}/${order.id}/cancel`, {
    method: "PATCH",
    headers,
  });
  assert.equal(cancelResponse.status, 200, await cancelResponse.clone().text());
  assert.equal((await cancelResponse.json()).orderId, order.id);
  assert.equal(Number((await pool.query(
    "SELECT stock FROM products WHERE id=$1",
    [product.id]
  )).rows[0].stock), 10);
  assert.equal(Number((await pool.query(
    "SELECT stock FROM product_variants WHERE id=$1",
    [smallVariant.id]
  )).rows[0].stock), 2);

  const repeatCancel = await fetch(`${baseUrl}/${order.id}/cancel`, {
    method: "PATCH",
    headers,
  });
  assert.equal(repeatCancel.status, 409);
});
