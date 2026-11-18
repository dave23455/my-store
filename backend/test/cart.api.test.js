import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL = "";
process.env.JWT_SECRET = "cart-test-secret";

const [{ createApp }, { pool }] = await Promise.all([
  import("../src/app.ts"),
  import("../src/config/db.ts"),
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("cart API enforces ownership, variant stock, and atomic guest-cart merge", async (t) => {
  const suffix = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const users = await Promise.all([
    pool.query(
      `INSERT INTO users(public_id,name,email,password_hash,role)
       VALUES($1,'Cart Test User',$2,'unused','customer') RETURNING id`,
      [userId, `cart-${suffix}@example.test`]
    ),
    pool.query(
      `INSERT INTO users(public_id,name,email,password_hash,role)
       VALUES($1,'Other Cart User',$2,'unused','customer') RETURNING id`,
      [otherUserId, `other-cart-${suffix}@example.test`]
    ),
  ]);
  const product = await pool.query(
    `INSERT INTO products(category_id,name,description,price,discount_price,stock,sku)
     SELECT id,'Cart API Test Product','',120,100,5,$1 FROM categories WHERE slug='hair'
     RETURNING id,public_id`,
    [`CART-${suffix}`]
  );
  const productId = product.rows[0].public_id;
  const productInternalId = product.rows[0].id;
  const variants = await pool.query(
    `INSERT INTO product_variants(product_id,name,options,price,stock,sku)
     VALUES
       ($1,'Small','{"size":"Small"}',80,2,$2),
       ($1,'Standard','{"size":"Standard"}',NULL,NULL,$3)
     RETURNING id,public_id`,
    [productInternalId, `CART-S-${suffix}`, `CART-ST-${suffix}`]
  );
  const [smallVariant, standardVariant] = variants.rows;
  await pool.query(
    "INSERT INTO product_images(product_id,url,position) VALUES($1,$2,0)",
    [productInternalId, "https://example.test/cart-product.png"]
  );

  const makeToken = (publicId, email) =>
    jwt.sign({ sub: publicId, email, role: "customer" }, process.env.JWT_SECRET);
  const headers = {
    Authorization: `Bearer ${makeToken(userId, `cart-${suffix}@example.test`)}`,
    "Content-Type": "application/json",
  };
  const otherHeaders = {
    Authorization: `Bearer ${makeToken(otherUserId, `other-cart-${suffix}@example.test`)}`,
    "Content-Type": "application/json",
  };
  const server = createApp().listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/cart`;

  assert.equal((await fetch(baseUrl)).status, 401);
  const emptyResponse = await fetch(baseUrl, { headers });
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), []);

  const addBaseResponse = await fetch(`${baseUrl}/items`, {
    method: "POST",
    headers,
    body: JSON.stringify({ productId, quantity: 2 }),
  });
  assert.equal(addBaseResponse.status, 201, await addBaseResponse.clone().text());
  const baseItem = await addBaseResponse.json();
  assert.ok(UUID_PATTERN.test(baseItem.id));
  assert.ok(UUID_PATTERN.test(baseItem.cart_id));
  assert.equal(baseItem.product_id, productId);

  for (const variant of [smallVariant, standardVariant]) {
    const response = await fetch(`${baseUrl}/items`, {
      method: "POST",
      headers,
      body: JSON.stringify({ productId, variantId: variant.public_id, quantity: 1 }),
    });
    assert.equal(response.status, 201);
  }
  const duplicateVariantResponse = await fetch(`${baseUrl}/items`, {
    method: "POST",
    headers,
    body: JSON.stringify({ productId, variantId: smallVariant.public_id, quantity: 1 }),
  });
  assert.equal(duplicateVariantResponse.status, 201);

  const cartResponse = await fetch(baseUrl, { headers });
  const cart = await cartResponse.json();
  assert.equal(cart.length, 3);
  assert.ok(cart.every((item) => UUID_PATTERN.test(item.id)));
  assert.ok(cart.every((item) => UUID_PATTERN.test(item.cart_id)));
  const smallItem = cart.find((item) => item.variant_id === smallVariant.public_id);
  const standardItem = cart.find((item) => item.variant_id === standardVariant.public_id);
  assert.equal(smallItem.quantity, 2);
  assert.equal(smallItem.available, true);
  assert.equal(Number(smallItem.price), 80);
  assert.equal(smallItem.variant_name, "Small");
  assert.deepEqual(smallItem.variant_options, { size: "Small" });
  assert.equal(standardItem.stock, 5);
  assert.equal(Number(standardItem.price), 100);
  assert.equal(standardItem.image, "https://example.test/cart-product.png");

  const overstockAdd = await fetch(`${baseUrl}/items`, {
    method: "POST",
    headers,
    body: JSON.stringify({ productId, variantId: smallVariant.public_id, quantity: 1 }),
  });
  assert.equal(overstockAdd.status, 409);

  const overstockUpdate = await fetch(`${baseUrl}/items/${smallItem.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ quantity: 3 }),
  });
  assert.equal(overstockUpdate.status, 409);
  const validUpdate = await fetch(`${baseUrl}/items/${smallItem.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ quantity: 1 }),
  });
  assert.equal(validUpdate.status, 200);
  assert.equal((await validUpdate.json()).quantity, 1);
  const baseItemUpdate = await fetch(`${baseUrl}/items/${baseItem.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ quantity: 3 }),
  });
  assert.equal(baseItemUpdate.status, 200, await baseItemUpdate.clone().text());
  const updatedBaseItem = await baseItemUpdate.json();
  assert.equal(updatedBaseItem.quantity, 3);
  assert.equal(updatedBaseItem.variant_id, null);

  const foreignUpdate = await fetch(`${baseUrl}/items/${baseItem.id}`, {
    method: "PUT",
    headers: otherHeaders,
    body: JSON.stringify({ quantity: 1 }),
  });
  assert.equal(foreignUpdate.status, 404);
  const foreignDelete = await fetch(`${baseUrl}/items/${baseItem.id}`, {
    method: "DELETE",
    headers: otherHeaders,
  });
  assert.equal(foreignDelete.status, 204);
  assert.ok((await (await fetch(baseUrl, { headers })).json()).some(
    (item) => item.id === baseItem.id
  ));

  const invalidQuantity = await fetch(`${baseUrl}/items`, {
    method: "POST",
    headers,
    body: JSON.stringify({ productId, quantity: 0 }),
  });
  assert.equal(invalidQuantity.status, 422);
  assert.equal((await fetch(`${baseUrl}/items/not-an-id`, {
    method: "DELETE",
    headers,
  })).status, 400);

  const mergeResponse = await fetch(`${baseUrl}/merge`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      items: [
        { productId, variantId: standardVariant.public_id, quantity: 1 },
        { productId, variantId: standardVariant.public_id, quantity: 1 },
      ],
    }),
  });
  assert.equal(mergeResponse.status, 200);
  const mergedCart = await mergeResponse.json();
  assert.equal(
    mergedCart.find((item) => item.variant_id === standardVariant.public_id).quantity,
    3
  );

  const failedMerge = await fetch(`${baseUrl}/merge`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      items: [
        { productId, quantity: 1 },
        { productId, variantId: smallVariant.public_id, quantity: 2 },
      ],
    }),
  });
  assert.equal(failedMerge.status, 409);
  assert.equal((await (await fetch(baseUrl, { headers })).json()).find(
    (item) => item.id === baseItem.id
  ).quantity, 3);

  await pool.query("UPDATE product_variants SET active=false WHERE id=$1", [
    standardVariant.id,
  ]);
  const cartWithUnavailableVariant = await (await fetch(baseUrl, { headers })).json();
  const unavailableVariant = cartWithUnavailableVariant.find(
    (item) => item.id === standardItem.id
  );
  assert.equal(unavailableVariant.available, false);
  assert.equal(unavailableVariant.variant_name, "Standard");
  const unavailableMerge = await fetch(`${baseUrl}/merge`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      items: [
        { productId, quantity: 1 },
        { productId, variantId: standardVariant.public_id, quantity: 1 },
      ],
    }),
  });
  assert.equal(unavailableMerge.status, 404);
  assert.equal((await (await fetch(baseUrl, { headers })).json()).find(
    (item) => item.id === baseItem.id
  ).quantity, 3);

  const removeResponse = await fetch(`${baseUrl}/items/${standardItem.id}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(removeResponse.status, 204);
  await pool.query("UPDATE products SET active=false WHERE id=$1", [productInternalId]);
  const cartWithUnavailableProduct = await (await fetch(baseUrl, { headers })).json();
  assert.equal(cartWithUnavailableProduct.length, 2);
  assert.ok(cartWithUnavailableProduct.every((item) => item.available === false));
  const clearResponse = await fetch(baseUrl, { method: "DELETE", headers });
  assert.equal(clearResponse.status, 204);
  assert.deepEqual(await (await fetch(baseUrl, { headers })).json(), []);
});
