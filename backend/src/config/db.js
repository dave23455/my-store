import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const memorySeedSql = `
  CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,name VARCHAR(100) NOT NULL,email VARCHAR(255) UNIQUE NOT NULL,password_hash TEXT NOT NULL,role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK(role IN('customer','employee','admin','owner')),phone VARCHAR(50),created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE IF NOT EXISTS password_reset_tokens(id SERIAL PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE IF NOT EXISTS store_settings(id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(id=1),data JSONB NOT NULL DEFAULT '{}'::jsonb,updated_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE IF NOT EXISTS categories(id SERIAL PRIMARY KEY,name VARCHAR(100) UNIQUE NOT NULL,slug VARCHAR(120) UNIQUE NOT NULL,active BOOLEAN DEFAULT true,created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE IF NOT EXISTS products(id SERIAL PRIMARY KEY,category_id INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,name VARCHAR(255) NOT NULL,description TEXT NOT NULL DEFAULT '',price NUMERIC(12,2) NOT NULL CHECK(price>=0),discount_price NUMERIC(12,2) CHECK(discount_price>=0),stock INT NOT NULL DEFAULT 0 CHECK(stock>=0),sku VARCHAR(100) UNIQUE NOT NULL,brand VARCHAR(100),featured BOOLEAN DEFAULT false,new_arrival BOOLEAN DEFAULT false,best_seller BOOLEAN DEFAULT false,active BOOLEAN DEFAULT true,rating NUMERIC(2,1) DEFAULT 0,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE IF NOT EXISTS product_images(id SERIAL PRIMARY KEY,product_id INT REFERENCES products(id) ON DELETE CASCADE,url TEXT NOT NULL,alt TEXT,position INT DEFAULT 0);
  CREATE TABLE IF NOT EXISTS product_variants(id SERIAL PRIMARY KEY,product_id INT REFERENCES products(id) ON DELETE CASCADE,name VARCHAR(100) NOT NULL,options JSONB NOT NULL DEFAULT '{}',price NUMERIC(12,2),stock INT CHECK(stock>=0),sku VARCHAR(100) UNIQUE);
  CREATE TABLE IF NOT EXISTS addresses(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,name TEXT,phone TEXT,country TEXT,region TEXT,city TEXT,address TEXT,postal_code TEXT);
  CREATE TABLE IF NOT EXISTS carts(id SERIAL PRIMARY KEY,user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE IF NOT EXISTS cart_items(id SERIAL PRIMARY KEY,cart_id INT REFERENCES carts(id) ON DELETE CASCADE,product_id INT REFERENCES products(id) ON DELETE CASCADE,variant_id INT REFERENCES product_variants(id) ON DELETE SET NULL,quantity INT CHECK(quantity>0),UNIQUE(cart_id,product_id,variant_id));
  CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE SET NULL,status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',subtotal NUMERIC(12,2) NOT NULL,shipping_cost NUMERIC(12,2) NOT NULL DEFAULT 0,total NUMERIC(12,2) NOT NULL,shipping_address JSONB NOT NULL,tracking_number TEXT,created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE IF NOT EXISTS payment_confirmations(id SERIAL PRIMARY KEY,order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE SET NULL,payer_name TEXT NOT NULL,amount NUMERIC(12,2) NOT NULL CHECK(amount>=0),reference TEXT,notes TEXT,status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),reviewed_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE IF NOT EXISTS order_items(id SERIAL PRIMARY KEY,order_id INT REFERENCES orders(id) ON DELETE CASCADE,product_id INT REFERENCES products(id) ON DELETE SET NULL,variant_id INT REFERENCES product_variants(id) ON DELETE SET NULL,name TEXT NOT NULL,unit_price NUMERIC(12,2) NOT NULL,quantity INT NOT NULL CHECK(quantity>0));
  CREATE TABLE IF NOT EXISTS payments(id SERIAL PRIMARY KEY,order_id INT REFERENCES orders(id) ON DELETE CASCADE,provider VARCHAR(30),reference VARCHAR(255) UNIQUE,status VARCHAR(30) DEFAULT 'pending',amount NUMERIC(12,2),created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE IF NOT EXISTS reviews(id SERIAL PRIMARY KEY,product_id INT REFERENCES products(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE SET NULL,rating INT CHECK(rating BETWEEN 1 AND 5),body TEXT,approved BOOLEAN DEFAULT false,created_at TIMESTAMPTZ DEFAULT now(),UNIQUE(product_id,user_id));
  CREATE TABLE IF NOT EXISTS comments(id SERIAL PRIMARY KEY,product_id INT REFERENCES products(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE SET NULL,body TEXT NOT NULL,parent_id INT REFERENCES comments(id) ON DELETE CASCADE,approved BOOLEAN DEFAULT true,created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE IF NOT EXISTS messages(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE SET NULL,name TEXT,email TEXT,body TEXT NOT NULL,reply TEXT,read BOOLEAN DEFAULT false,archived BOOLEAN DEFAULT false,created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE IF NOT EXISTS shipping_zones(id SERIAL PRIMARY KEY,name TEXT NOT NULL,active BOOLEAN DEFAULT true);
  CREATE TABLE IF NOT EXISTS shipping_rates(id SERIAL PRIMARY KEY,zone_id INT REFERENCES shipping_zones(id) ON DELETE CASCADE,country_code VARCHAR(2),amount NUMERIC(12,2) NOT NULL,free_shipping_threshold NUMERIC(12,2),estimated_days VARCHAR(50));

  INSERT INTO categories(name, slug) VALUES
    ('Hair', 'hair'), ('Wigs', 'wigs'), ('Bundles', 'bundles'), ('Closures', 'closures'), ('Frontals', 'frontals'),
    ('Clothing', 'clothing'), ('Shoes', 'shoes'), ('Bags', 'bags'), ('Beauty', 'beauty'), ('Accessories', 'accessories')
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO store_settings(id, data) VALUES (1, '{"store_name":"LinaStyledYou","tag_line":"Premium beauty, delivered worldwide","logo_url":"","contact_email":"kehindelina@gmail.com","phone":"+2348065205096","whatsapp_number":"2348065205096","instagram_url":"https://instagram.com/linachili_linastyledyou","tiktok_url":"https://www.tiktok.com/@linachili","whatsapp_message":"Hello! I would like to make an order.","currency":"NGN","shipping_message":"We ship worldwide","bank_name":"First Bank","bank_account_number":"3221851035","bank_account_name":"Arowosegbe Kehinde Lina"}') ON CONFLICT (id) DO NOTHING;

  INSERT INTO products(name, category_id, description, price, stock, sku, featured, new_arrival, best_seller, rating)
  VALUES
    ('Body Wave Lace Wig', 2, 'Silky, natural-looking 24 inch body wave wig.', 285000, 12, 'GW-WIG-24', true, true, true, 4.8),
    ('Raw Cambodian Bundles', 3, 'Luxurious 100% human hair bundles.', 135000, 20, 'GW-BUN-18', true, true, true, 4.8),
    ('Glow Essentials Bag', 8, 'A polished everyday bag made to go everywhere.', 48000, 8, 'GW-BAG-01', true, true, true, 4.8)
  ON CONFLICT (sku) DO NOTHING;

  INSERT INTO product_images(product_id, url, position)
  SELECT id, 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=80', 0
  FROM products WHERE sku='GW-WIG-24'
  ON CONFLICT DO NOTHING;

  INSERT INTO product_images(product_id, url, position)
  SELECT id, 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=900&q=80', 0
  FROM products WHERE sku='GW-BUN-18'
  ON CONFLICT DO NOTHING;

  INSERT INTO product_images(product_id, url, position)
  SELECT id, 'https://images.unsplash.com/photo-1584917865442-de8e4576afd3?auto=format&fit=crop&w=900&q=80', 0
  FROM products WHERE sku='GW-BAG-01'
  ON CONFLICT DO NOTHING;
`;

async function initMemoryDatabase(pool) {
  await pool.query(memorySeedSql);

  const ownerEmail = (process.env.OWNER_EMAIL || 'admin@linastyledyou.com').trim().toLowerCase();
  const ownerPassword = process.env.OWNER_PASSWORD || 'Password123!';
  const ownerName = process.env.OWNER_NAME || 'Store Owner';
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [ownerEmail]);
  if (!existing.rowCount) {
    const passwordHash = await bcrypt.hash(ownerPassword, 12);
    await pool.query(
      'INSERT INTO users(name, email, password_hash, role) VALUES($1, $2, $3, $4)',
      [ownerName, ownerEmail, passwordHash, 'owner'],
    );
  } else {
    await pool.query(
      'UPDATE users SET name=$1, password_hash=$2, role=$3 WHERE email=$4',
      [ownerName, await bcrypt.hash(ownerPassword, 12), 'owner', ownerEmail],
    );
  }
}

let pool;

async function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    const pgPool = new pg.Pool({ connectionString });
    try {
      await pgPool.query('SELECT 1');
      return pgPool;
    } catch {
      await pgPool.end().catch(() => {});
    }
  }

  const { newDb } = await import('pg-mem');
  const memoryDb = newDb();
  const adapter = memoryDb.adapters.createPg();
  const memoryPool = new adapter.Pool();
  await initMemoryDatabase(memoryPool);
  return memoryPool;
}

pool = await createPool();
export const query = (text, params) => pool.query(text, params);
export { pool };
