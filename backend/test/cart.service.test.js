import test from "node:test";
import assert from "node:assert/strict";
import { newDb, DataType } from "pg-mem";
import { randomUUID } from "node:crypto";
import { CartService } from "../src/modules/cart/cart.service.ts";

async function createCartService() {
  const memoryDb = newDb();
  memoryDb.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: randomUUID,
    impure: true,
  });
  const { Pool } = memoryDb.adapters.createPg();
  const pool = new Pool();
  await pool.query(`
    CREATE TABLE carts(id SERIAL PRIMARY KEY,public_id UUID NOT NULL DEFAULT gen_random_uuid(),user_id INT UNIQUE NOT NULL);
    CREATE TABLE products(
      id SERIAL PRIMARY KEY,public_id UUID NOT NULL DEFAULT gen_random_uuid(),name TEXT NOT NULL,price NUMERIC NOT NULL,
      discount_price NUMERIC,stock INT NOT NULL,active BOOLEAN NOT NULL DEFAULT true,sku TEXT
    );
    CREATE TABLE product_images(
      id SERIAL PRIMARY KEY,public_id UUID NOT NULL DEFAULT gen_random_uuid(),product_id INT NOT NULL,url TEXT NOT NULL,position INT NOT NULL DEFAULT 0
    );
    CREATE TABLE product_variants(
      id SERIAL PRIMARY KEY,public_id UUID NOT NULL DEFAULT gen_random_uuid(),product_id INT NOT NULL,name TEXT NOT NULL,options JSONB NOT NULL DEFAULT '{}',
      price NUMERIC,stock INT,sku TEXT,active BOOLEAN NOT NULL DEFAULT true
    );
    CREATE TABLE cart_items(
      id SERIAL PRIMARY KEY,public_id UUID NOT NULL DEFAULT gen_random_uuid(),cart_id INT NOT NULL,product_id INT NOT NULL,variant_id INT,
      quantity INT NOT NULL,UNIQUE(cart_id,product_id,variant_id)
    );
    INSERT INTO products(id,public_id,name,price,discount_price,stock,active,sku) VALUES
      (1,'00000000-0000-4000-8000-000000000001','Lace Wig',100,NULL,5,true,'WIG-1'),
      (2,'00000000-0000-4000-8000-000000000002','Archived Item',50,NULL,4,false,'OLD-1');
    INSERT INTO product_images(product_id,url,position) VALUES(1,'https://example.test/wig.png',0);
    INSERT INTO product_variants(id,public_id,product_id,name,options,price,stock,sku,active) VALUES
      (11,'00000000-0000-4000-8000-000000000011',1,'Small','{"size":"Small"}',90,2,'WIG-S',true),
      (12,'00000000-0000-4000-8000-000000000012',1,'Standard','{"size":"Standard"}',NULL,NULL,'WIG-ST',true);
  `);
  return {
    pool,
    service: new CartService(pool),
    productId: "00000000-0000-4000-8000-000000000001",
    archivedProductId: "00000000-0000-4000-8000-000000000002",
    smallVariantId: "00000000-0000-4000-8000-000000000011",
    standardVariantId: "00000000-0000-4000-8000-000000000012",
  };
}

test("cart merge preserves product/variant identity, validates stock, and returns legacy mutation shapes", async (t) => {
  const { pool, service, productId, archivedProductId, smallVariantId, standardVariantId } = await createCartService();
  t.after(() => pool.end());

  const merged = await service.mergeItems(7, [
    { productId, variantId: smallVariantId, quantity: 1 },
    { productId, variantId: smallVariantId, quantity: 1 },
    { productId, quantity: 2 },
    { productId, variantId: standardVariantId, quantity: 3 },
  ]);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((item) => item.variant_id === smallVariantId).quantity, 2);
  assert.equal(merged.find((item) => item.variant_id === null).quantity, 2);
  assert.equal(merged.find((item) => item.variant_id === standardVariantId).stock, 5);
  assert.equal(merged.find((item) => item.variant_id === smallVariantId).price, 90);

  await assert.rejects(
    service.addItem(7, { productId, variantId: smallVariantId, quantity: 1 }),
    (error) => error.status_code === 409
  );
  await assert.rejects(
    service.addItem(7, { productId: archivedProductId, quantity: 1 }),
    (error) => error.status_code === 404
  );

  const item = await service.addItem(7, { productId, variantId: standardVariantId, quantity: 1 });
  assert.deepEqual(
    Object.keys(item).sort(),
    ["cart_id", "id", "product_id", "quantity", "variant_id"]
  );

  const updated = await service.updateItem(7, item.id, 4);
  assert.equal(updated.quantity, 4);
  await assert.rejects(
    service.updateItem(7, item.id, 6),
    (error) => error.status_code === 409
  );

  await service.removeItem(8, item.id);
  assert.equal((await service.getCart(7)).some((row) => row.id === item.id), true);
  await service.clearCart(7);
  assert.equal((await service.getCart(7)).length, 0);
});

test("cart merge rolls back all items when one requested quantity exceeds stock", async (t) => {
  const { pool, service, productId, smallVariantId } = await createCartService();
  t.after(() => pool.end());

  await assert.rejects(
    service.mergeItems(9, [
      { productId, quantity: 1 },
      { productId, variantId: smallVariantId, quantity: 3 },
    ]),
    (error) => error.status_code === 409
  );
  assert.equal((await service.getCart(9)).length, 0);
});
