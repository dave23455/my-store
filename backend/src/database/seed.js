import { pool } from '../config/db.js';

const categories = ['Hair', 'Wigs', 'Bundles', 'Closures', 'Frontals', 'Clothing', 'Shoes', 'Bags', 'Beauty', 'Accessories'];
for (const name of categories) {
  await pool.query('INSERT INTO categories(name,slug) VALUES($1,$2) ON CONFLICT(slug) DO NOTHING', [name, name.toLowerCase()]);
}

await pool.query('INSERT INTO store_settings(id,data) VALUES(1,$1) ON CONFLICT(id) DO NOTHING', [JSON.stringify({
  store_name: 'LinaStyledYou',
  tag_line: 'Premium beauty, delivered worldwide',
  logo_url: '',
  contact_email: 'kehindelina@gmail.com',
  phone: '+2348065205096',
  whatsapp_number: '2348065205096',
  instagram_url: 'https://instagram.com/linachili_linastyledyou',
  tiktok_url: 'https://www.tiktok.com/@linachili',
  whatsapp_message: 'Hello! I would like to make an order.',
  currency: 'NGN',
  shipping_message: 'We ship worldwide',
  bank_name: 'First Bank',
  bank_account_number: '3221851035',
  bank_account_name: 'Arowosegbe Kehinde Lina'
})]);
await pool.query("UPDATE store_settings SET data=jsonb_set(data, '{tiktok_url}', to_jsonb($1::text)) WHERE id=1", ['https://www.tiktok.com/@linachili']);

const products = [
  ['Body Wave Lace Wig', 'wigs', 'Silky, natural-looking 24 inch body wave wig.', 285000, 12, 'GW-WIG-24', 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=80'],
  ['Raw Cambodian Bundles', 'bundles', 'Luxurious 100% human hair bundles.', 135000, 20, 'GW-BUN-18', 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=900&q=80'],
  ['Glow Essentials Bag', 'bags', 'A polished everyday bag made to go everywhere.', 48000, 8, 'GW-BAG-01', 'https://images.unsplash.com/photo-1584917865442-de8e4576afd3?auto=format&fit=crop&w=900&q=80']
];
for (const product of products) {
  const category = (await pool.query('SELECT id FROM categories WHERE slug=$1', [product[1]])).rows[0];
  const created = await pool.query('INSERT INTO products(name,category_id,description,price,stock,sku,featured,new_arrival,best_seller,rating) VALUES($1,$2,$3,$4,$5,$6,true,true,true,4.8) ON CONFLICT(sku) DO NOTHING RETURNING id', [product[0], category.id, product[2], product[3], product[4], product[5]]);
  if (created.rowCount) await pool.query('INSERT INTO product_images(product_id,url,position) VALUES($1,$2,0)', [created.rows[0].id, product[6]]);
}
console.log('Seeded demo catalog');
await pool.end();


