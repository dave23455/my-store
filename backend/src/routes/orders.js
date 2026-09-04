import { Router } from 'express';
import { query, pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();
const schema = z.object({ items: z.array(z.object({ productId: z.number(), quantity: z.number().int().positive(), variantId: z.number().nullable().optional() })).min(1), shippingAddress: z.object({ name: z.string(), email: z.string().email(), phone: z.string(), country: z.string(), city: z.string(), address: z.string(), postalCode: z.string().optional() }) });

router.post('/', authenticate, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const value = schema.parse(req.body);
    await client.query('BEGIN');
    let total = 0;
    const items = [];
    for (const item of value.items) {
      const productResult = await client.query('SELECT id,name,price,discount_price,stock FROM products WHERE id=$1 AND active=true FOR UPDATE', [item.productId]);
      if (!productResult.rowCount) throw Object.assign(new Error('One or more items are unavailable'), { status: 409 });
      const product = productResult.rows[0];
      let stock = product.stock;
      let price = product.discount_price || product.price;
      if (item.variantId) {
        const variantResult = await client.query('SELECT id,price,stock FROM product_variants WHERE id=$1 AND product_id=$2 FOR UPDATE', [item.variantId, item.productId]);
        if (!variantResult.rowCount) throw Object.assign(new Error('One or more items are unavailable'), { status: 409 });
        const variant = variantResult.rows[0]; stock = variant.stock; price = variant.price ?? price;
      }
      if (stock < item.quantity) throw Object.assign(new Error('One or more items are unavailable'), { status: 409 });
      total += Number(price) * item.quantity; items.push({ ...item, product, price });
    }
    const order = (await client.query("INSERT INTO orders(user_id,status,payment_status,subtotal,shipping_cost,total,shipping_address) VALUES($1,'pending_payment','pending',$2,0,$2,$3) RETURNING *", [req.user.id, total, JSON.stringify(value.shippingAddress)])).rows[0];
    for (const item of items) {
      await client.query('INSERT INTO order_items(order_id,product_id,variant_id,name,unit_price,quantity) VALUES($1,$2,$3,$4,$5,$6)', [order.id, item.productId, item.variantId || null, item.product.name, item.price, item.quantity]);
      if (item.variantId) await client.query('UPDATE product_variants SET stock=stock-$1 WHERE id=$2', [item.quantity, item.variantId]);
      else await client.query('UPDATE products SET stock=stock-$1 WHERE id=$2', [item.quantity, item.productId]);
    }
    await client.query('COMMIT'); res.status(201).json(order);
  } catch (error) { await client.query('ROLLBACK'); next(error); }
  finally { client.release(); }
});
router.get('/', authenticate, async (req, res, next) => { try { res.json((await query('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id])).rows); } catch (error) { next(error); } });
router.patch('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const result = await query("UPDATE orders SET status='cancelled' WHERE id=$1 AND user_id=$2 AND payment_status='pending' AND status='pending_payment' RETURNING id", [req.params.id, req.user.id]);
    if (!result.rowCount) return res.status(409).json({ message: 'Only unpaid pending orders can be cancelled.' });
    await query('UPDATE products p SET stock=p.stock+oi.quantity FROM order_items oi WHERE oi.order_id=$1 AND oi.product_id=p.id AND oi.variant_id IS NULL', [req.params.id]);
    await query('UPDATE product_variants v SET stock=v.stock+oi.quantity FROM order_items oi WHERE oi.order_id=$1 AND oi.variant_id=v.id', [req.params.id]);
    res.json({ message: 'Order cancelled.', orderId: result.rows[0].id });
  } catch (error) { next(error); }
});
export default router;
