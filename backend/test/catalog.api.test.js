import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL = "";
process.env.JWT_SECRET = "catalog-test-secret";

const [{ createApp }, { pool }] = await Promise.all([
  import("../src/app.ts"),
  import("../src/config/db.ts"),
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("admin and catalog routes expose protected management and public browsing workflows", async (t) => {
  const owner = await pool.query(
    "SELECT public_id,email,name,role FROM users WHERE role='owner' LIMIT 1"
  );
  assert.equal(owner.rowCount, 1, "memory database should be seeded with an owner");
  const token = jwt.sign(
    {
      sub: owner.rows[0].public_id,
      email: owner.rows[0].email,
      name: owner.rows[0].name,
      role: owner.rows[0].role,
    },
    process.env.JWT_SECRET
  );
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const server = createApp().listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  const unauthorizedAdmin = await fetch(`${baseUrl}/admin/products/manage`);
  assert.equal(unauthorizedAdmin.status, 401);

  for (const endpoint of ["/admin/dashboard", "/admin/orders", "/admin/customers"]) {
    const response = await fetch(`${baseUrl}${endpoint}`, { headers });
    const body = await response.text();
    assert.equal(
      response.status,
      200,
      `${endpoint} should be available to the owner: ${body}`,
    );
  }

  for (const endpoint of [
    "/admin/staff",
    "/admin/payment-confirmations",
    "/admin/settings",
  ]) {
    const response = await fetch(`${baseUrl}${endpoint}`, { headers });
    assert.equal(response.status, 200, `${endpoint} should be available to the owner`);
  }

  const staffResponse = await fetch(`${baseUrl}/admin/staff`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Catalog Test Admin",
      email: `catalog-admin-${Date.now()}@example.test`,
      password: "catalog-test-password",
      role: "admin",
    }),
  });
  assert.equal(staffResponse.status, 201);
  const staff = await staffResponse.json();
  const staffToken = jwt.sign({ sub: staff.id, role: "admin" }, process.env.JWT_SECRET);
  const ownerOnlyResponse = await fetch(`${baseUrl}/admin/staff`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Second Test Admin",
      email: `catalog-admin-2-${Date.now()}@example.test`,
      password: "catalog-test-password",
      role: "admin",
    }),
  });
  assert.equal(ownerOnlyResponse.status, 403);
  const removeStaff = await fetch(`${baseUrl}/admin/staff/${staff.id}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(removeStaff.status, 204);

  const customerPublicId = randomUUID();
  const customer = await pool.query(
    `INSERT INTO users(public_id,name,email,password_hash,role)
     VALUES($1,'Admin Route Test Customer',$2,'unused','customer') RETURNING id`,
    [customerPublicId, `admin-customer-${Date.now()}@example.test`]
  );
  const customerOrder = await pool.query(
    `INSERT INTO orders(user_id,status,payment_status,subtotal,shipping_cost,total,shipping_address)
     VALUES($1,'pending_payment','pending',100,0,100,'{}') RETURNING id`,
    [customer.rows[0].id]
  );
  const customerOrders = await fetch(
    `${baseUrl}/admin/customers/${customerPublicId}/orders`,
    { headers },
  );
  assert.equal(customerOrders.status, 200);
  assert.equal((await customerOrders.json()).length, 1);

  const updatedOrder = await fetch(
    `${baseUrl}/admin/orders/${customerOrder.rows[0].id}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "shipped", trackingNumber: "TEST-TRACK" }),
    },
  );
  assert.equal(updatedOrder.status, 200);
  assert.equal((await updatedOrder.json()).tracking_number, "TEST-TRACK");

  const confirmation = await pool.query(
    `INSERT INTO payment_confirmations(order_id,user_id,payer_name,amount)
     VALUES($1,$2,'Test Payer',100) RETURNING id`,
    [customerOrder.rows[0].id, customer.rows[0].id]
  );
  const reviewedConfirmation = await fetch(
    `${baseUrl}/admin/payment-confirmations/${confirmation.rows[0].id}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "approved" }),
    },
  );
  assert.equal(reviewedConfirmation.status, 200);
  assert.equal((await pool.query(
    "SELECT status,payment_status FROM orders WHERE id=$1",
    [customerOrder.rows[0].id]
  )).rows[0].payment_status, "paid");

  const categoriesResponse = await fetch(`${baseUrl}/categories`);
  assert.equal(categoriesResponse.status, 200);
  const categories = await categoriesResponse.json();
  assert.ok(categories.length > 0);
  assert.ok(categories.every((category) => UUID_PATTERN.test(category.id)));

  const productsResponse = await fetch(`${baseUrl}/products?sort=price_asc`);
  const productsBody = await productsResponse.text();
  assert.equal(productsResponse.status, 200, productsBody);
  const publicProducts = JSON.parse(productsBody);
  assert.ok(publicProducts.length > 0);
  assert.ok(
    publicProducts.every((product, index) =>
      index === 0 || Number(publicProducts[index - 1].price) <= Number(product.price)
    )
  );
  for (const sort of ["newest", "price_desc", "popular", "rating"]) {
    const response = await fetch(`${baseUrl}/products?sort=${sort}`);
    assert.equal(response.status, 200, `sort=${sort} should be supported`);
  }

  const categoryResponse = await fetch(`${baseUrl}/admin/categories`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Catalog Test Category", slug: `catalog-test-${Date.now()}` }),
  });
  assert.equal(categoryResponse.status, 201);
  const category = await categoryResponse.json();
  assert.ok(UUID_PATTERN.test(category.id));
  const duplicateCategoryResponse = await fetch(`${baseUrl}/admin/categories`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Another Catalog Test", slug: category.slug }),
  });
  assert.equal(duplicateCategoryResponse.status, 409);
  const secondCategoryResponse = await fetch(`${baseUrl}/admin/categories`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Second Catalog Test Category",
      slug: `catalog-test-second-${Date.now()}`,
    }),
  });
  assert.equal(secondCategoryResponse.status, 201);
  const secondCategory = await secondCategoryResponse.json();
  const duplicateNameUpdate = await fetch(
    `${baseUrl}/admin/categories/${secondCategory.id}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: category.name }),
    }
  );
  assert.equal(duplicateNameUpdate.status, 409);

  const productPayload = {
    name: "Catalog Test Product",
    categoryId: category.id,
    description: "Product used to verify catalog routes.",
    price: 1800,
    stock: 8,
    sku: `CAT-${Date.now()}`,
    image: "https://example.com/catalog-test.jpg",
    images: [
      "https://example.com/catalog-test.jpg",
      "https://example.com/catalog-test-detail.jpg",
    ],
    sizeGuide: "Small: 36-38 cm\nLarge: 42-44 cm",
    sizes: [
      { name: "Small", stock: 2, price: 1800 },
      { name: "Large", stock: 6, price: 1950 },
    ],
  };
  const createResponse = await fetch(`${baseUrl}/admin/products`, {
    method: "POST",
    headers,
    body: JSON.stringify(productPayload),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.ok(UUID_PATTERN.test(created.id));
  assert.equal(created.category_id, category.id);
  assert.equal(created.image, productPayload.image);
  assert.deepEqual(created.images, productPayload.images);
  assert.equal(created.size_guide, productPayload.sizeGuide);
  assert.equal(created.sizes.length, 2);
  assert.deepEqual(created.sizes.map((size) => size.name), ["Small", "Large"]);
  const categoryProducts = await (await fetch(
    `${baseUrl}/products?category=${encodeURIComponent(category.slug)}&search=Catalog%20Test`
  )).json();
  assert.equal(categoryProducts.length, 1);
  assert.equal(categoryProducts[0].image, productPayload.image);
  assert.equal(categoryProducts[0].size_guide, productPayload.sizeGuide);

  const duplicateVariantNames = await fetch(`${baseUrl}/admin/products`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...productPayload,
      sku: `CAT-DUP-${Date.now()}`,
      sizes: [
        { name: "Small", stock: 1 },
        { name: " small ", stock: 2 },
      ],
    }),
  });
  assert.equal(duplicateVariantNames.status, 422);
  const duplicateSku = await fetch(`${baseUrl}/admin/products`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...productPayload, name: "Duplicate SKU Product" }),
  });
  assert.equal(duplicateSku.status, 409);

  const adminListResponse = await fetch(`${baseUrl}/admin/products/manage`, { headers });
  assert.equal(adminListResponse.status, 200);
  const adminProducts = await adminListResponse.json();
  assert.equal(
    adminProducts.find((product) => product.id === created.id).sizes.length,
    2
  );

  const updateResponse = await fetch(`${baseUrl}/admin/products/${created.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      name: "Updated Catalog Test Product",
      image: "https://example.com/catalog-test-updated.jpg",
      images: ["https://example.com/catalog-test-updated.jpg"],
      sizeGuide: "Updated sizing notes",
    }),
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.image, "https://example.com/catalog-test-updated.jpg");
  assert.deepEqual(updated.images, ["https://example.com/catalog-test-updated.jpg"]);
  assert.equal(updated.size_guide, "Updated sizing notes");
  assert.equal(updated.sizes.length, 2, "partial product update must preserve variants");

  const variantUpdate = await fetch(
    `${baseUrl}/admin/products/${created.id}/sizes/${updated.sizes[0].id}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ stock: 5, price: null }),
    }
  );
  assert.equal(variantUpdate.status, 200);
  const updatedVariant = await variantUpdate.json();
  assert.equal(Number(updatedVariant.stock), 5);
  assert.equal(updatedVariant.price, null);

  const detailResponse = await fetch(`${baseUrl}/products/${created.id}`);
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  assert.ok(UUID_PATTERN.test(detail.images[0].id));
  assert.equal(detail.images[0].product_id, created.id);
  assert.ok(detail.variants.every((variant) => UUID_PATTERN.test(variant.id)));
  assert.ok(detail.variants.every((variant) => variant.product_id === created.id));
  assert.equal(detail.variants.length, 2);
  assert.equal(Number(detail.variants[0].stock), 5);

  const newVariantResponse = await fetch(`${baseUrl}/admin/products/${created.id}/sizes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Medium", stock: 3, price: 1850 }),
  });
  assert.equal(newVariantResponse.status, 201);
  const newVariant = await newVariantResponse.json();
  assert.deepEqual(newVariant.options, { size: "Medium" });
  const duplicateVariantResponse = await fetch(
    `${baseUrl}/admin/products/${created.id}/sizes`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ name: " medium ", stock: 1 }),
    }
  );
  assert.equal(duplicateVariantResponse.status, 409);
  const removeVariantResponse = await fetch(
    `${baseUrl}/admin/products/${created.id}/sizes/${newVariant.id}`,
    { method: "DELETE", headers }
  );
  assert.equal(removeVariantResponse.status, 204);
  const detailAfterVariantRemoval = await (await fetch(
    `${baseUrl}/products/${created.id}`
  )).json();
  assert.equal(detailAfterVariantRemoval.variants.length, 2);

  const notFoundResponse = await fetch(`${baseUrl}/products/not-a-number`);
  assert.equal(notFoundResponse.status, 400);

  const removeProductResponse = await fetch(`${baseUrl}/admin/products/${created.id}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(removeProductResponse.status, 204);
  const removedProductResponse = await fetch(`${baseUrl}/products/${created.id}`);
  assert.equal(removedProductResponse.status, 404);

  const deactivateCategoryResponse = await fetch(`${baseUrl}/admin/categories/${category.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ active: false }),
  });
  assert.equal(deactivateCategoryResponse.status, 200);
  const publicCategoriesAfterDeactivate = await (await fetch(`${baseUrl}/categories`)).json();
  assert.ok(!publicCategoriesAfterDeactivate.some((item) => item.id === category.id));
  const inactiveCategoryProduct = await fetch(`${baseUrl}/admin/products`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...productPayload,
      sku: `CAT-INACTIVE-${Date.now()}`,
      categoryId: category.id,
    }),
  });
  assert.equal(inactiveCategoryProduct.status, 400);
  const deactivateSecondCategory = await fetch(
    `${baseUrl}/admin/categories/${secondCategory.id}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ active: false }),
    }
  );
  assert.equal(deactivateSecondCategory.status, 200);
});
