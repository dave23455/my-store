import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate, adminOnly);

const productSchema = z.object({
  name: z.string().min(2),
  categoryId: z.number().int().positive(),
  description: z.string().default(''),
  price: z.number().nonnegative(),
  discountPrice: z.number().nonnegative().nullable().optional(),
  stock: z.number().int().nonnegative(),
  sku: z.string().min(2),
  brand: z.string().optional(),
  image: z.string().url().optional(),
  sizes: z.array(z.object({
    name: z.string().min(1),
    stock: z.number().int().nonnegative(),
    price: z.number().nonnegative().nullable().optional(),
    sku: z.string().optional()
  })).optional()
});

router.get('/', async (req, res, next) => {
  try {
    const products = (await query(`
      SELECT p.*, c.name AS category_name,
        COALESCE((SELECT url FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1), '') AS image
      FROM products p JOIN categories c ON c.id = p.category_id ORDER BY p.created_at DESC
    `)).rows;
    for (const product of products) {
      product.sizes = (await query('SELECT id,name,price,stock,sku FROM product_variants WHERE product_id=$1 ORDER BY id', [product.id])).rows;
    }
    res.json(products);
  } catch (error) { next(error); }
});

router.get('/manage', async (req, res, next) => {
  try {
    const products = (await query(`SELECT p.*, c.name AS category_name,
      COALESCE((SELECT url FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1), '') AS image
      FROM products p JOIN categories c ON c.id=p.category_id ORDER BY p.created_at DESC`)).rows;
    for (const product of products) product.sizes = (await query('SELECT id,name,price,stock,sku FROM product_variants WHERE product_id=$1 ORDER BY id', [product.id])).rows;
    res.json(products);
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const value = productSchema.parse(req.body);
    const product = (await query(
      'INSERT INTO products(name,category_id,description,price,discount_price,stock,sku,brand) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [value.name, value.categoryId, value.description, value.price, value.discountPrice ?? null, value.stock, value.sku, value.brand || null]
    )).rows[0];
    if (value.image) await query('INSERT INTO product_images(product_id,url,position) VALUES($1,$2,0)', [product.id, value.image]);
    for (const size of value.sizes || []) {
      await query('INSERT INTO product_variants(product_id,name,options,price,stock,sku) VALUES($1,$2,$3,$4,$5,$6)', [product.id, size.name, JSON.stringify({ size: size.name }), size.price ?? null, size.stock, size.sku || null]);
    }
    product.image = value.image || '';
    res.status(201).json(product);
  } catch (error) { next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const value = productSchema.partial().omit({ categoryId: true, sizes: true }).extend({ categoryId: z.number().int().positive().optional() }).parse(req.body);
    const fields = { name: 'name', categoryId: 'category_id', description: 'description', price: 'price', discountPrice: 'discount_price', stock: 'stock', sku: 'sku', brand: 'brand' };
    const keys = Object.keys(value).filter(key => key !== 'image');
    if (!keys.length && value.image === undefined) return res.status(400).json({ message: 'No updates' });
    const sets = keys.map((key, index) => `${fields[key]}=$${index + 1}`).join(',');
    let result;
    if (keys.length) {
      result = await query(`UPDATE products SET ${sets}, updated_at=now() WHERE id=$${keys.length + 1} RETURNING *`, [...keys.map(key => value[key]), req.params.id]);
    } else {
      result = await query('SELECT * FROM products WHERE id=$1', [req.params.id]);
    }
    if (!result.rowCount) return res.status(404).json({ message: 'Product not found' });
    if (value.image !== undefined) {
      await query('DELETE FROM product_images WHERE product_id=$1', [req.params.id]);
      await query('INSERT INTO product_images(product_id,url,position) VALUES($1,$2,0)', [req.params.id, value.image]);
    }
    result.rows[0].image = (await query('SELECT url FROM product_images WHERE product_id=$1 ORDER BY position LIMIT 1', [req.params.id])).rows[0]?.url || '';
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('UPDATE products SET active=false,updated_at=now() WHERE id=$1 RETURNING id,active', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product removed', product: result.rows[0] });
  } catch (error) { next(error); }
});

router.post('/:id/sizes', async (req, res, next) => {
  try {
    const value = z.object({ name: z.string().min(1), stock: z.number().int().nonnegative(), price: z.number().nonnegative().nullable().optional(), sku: z.string().optional() }).parse(req.body);
    const result = await query('INSERT INTO product_variants(product_id,name,options,price,stock,sku) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [req.params.id, value.name, JSON.stringify({ size: value.name }), value.price ?? null, value.stock, value.sku || null]);
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

router.delete('/:id/sizes/:sizeId', async (req, res, next) => {
  try {
    await query('DELETE FROM product_variants WHERE id=$1 AND product_id=$2', [req.params.sizeId, req.params.id]);
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
