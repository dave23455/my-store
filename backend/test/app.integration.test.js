import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "";

const { createApp } = await import("../src/app.ts");

test("TypeScript app retains core legacy routes and mounts cart and orders modules", async (t) => {
  const server = createApp().listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { ok: true });

  const categoriesResponse = await fetch(`${baseUrl}/api/categories`);
  const categoriesBody = await categoriesResponse.text();
  assert.equal(categoriesResponse.status, 200, categoriesBody);
  assert.ok(Array.isArray(JSON.parse(categoriesBody)));

  const settingsResponse = await fetch(`${baseUrl}/api/settings`);
  assert.equal(settingsResponse.status, 200);
  assert.equal((await settingsResponse.json()).store_name, "LinaStyledYou");

  const cartResponse = await fetch(`${baseUrl}/api/cart`);
  assert.equal(cartResponse.status, 401);

  const ordersResponse = await fetch(`${baseUrl}/api/orders`);
  assert.equal(ordersResponse.status, 401);

  const webhookResponse = await fetch(`${baseUrl}/api/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(webhookResponse.status, 401);
});
