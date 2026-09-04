import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { paymentService } from '../services/payment.service.js';
import { z } from 'zod';

const router = Router();
router.post('/confirm', authenticate, async (req, res, next) => {
	try {
		const value = z.object({ orderId: z.number(), payerName: z.string().min(2).max(150), amount: z.number().positive(), reference: z.string().max(150).optional(), notes: z.string().max(1000).optional() }).parse(req.body);
		const order = (await query("SELECT id FROM orders WHERE id=$1 AND user_id=$2 AND payment_status <> 'paid'", [value.orderId, req.user.id])).rows[0];
		if (!order) return res.status(404).json({ message: 'Order not found or already paid' });
		const confirmation = await query('INSERT INTO payment_confirmations(order_id,user_id,payer_name,amount,reference,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [order.id, req.user.id, value.payerName, value.amount, value.reference || null, value.notes || null]);
		res.status(201).json({ message: 'Payment confirmation sent for review.', confirmation: confirmation.rows[0] });
	} catch (error) { next(error); }
});
async function cancelAndRelease(orderId) {
	const cancelled = await query("UPDATE orders SET status='cancelled' WHERE id=$1 AND status='pending_payment' RETURNING id", [orderId]);
	if (!cancelled.rowCount) return;
	await query('UPDATE products p SET stock=p.stock+oi.quantity FROM order_items oi WHERE oi.order_id=$1 AND oi.product_id=p.id AND oi.variant_id IS NULL', [orderId]);
	await query('UPDATE product_variants v SET stock=v.stock+oi.quantity FROM order_items oi WHERE oi.order_id=$1 AND oi.variant_id=v.id', [orderId]);
}

router.post('/initialize', authenticate, async (req, res, next) => {
	try {
		const order = (await query('SELECT * FROM orders WHERE id=$1 AND user_id=$2', [req.body.orderId, req.user.id])).rows[0];
		if (!order) return res.status(404).json({ message: 'Order not found' });
		if (order.payment_status === 'paid') return res.status(409).json({ message: 'This order is already paid' });
		const user = (await query('SELECT email FROM users WHERE id=$1', [req.user.id])).rows[0];
		res.json(await paymentService.initializePayment(order, user.email));
	} catch (error) {
		next(error);
	}
});

router.get('/:reference/verify', authenticate, async (req, res, next) => {
	try {
		const payment = (await query('SELECT p.* FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.reference=$1 AND o.user_id=$2', [req.params.reference, req.user.id])).rows[0];
		if (!payment) return res.status(404).json({ message: 'Payment not found' });
		const result = await paymentService.verifyPayment(req.params.reference);
		if (!result.paid) await cancelAndRelease(result.orderId);
		res.json(result);
	} catch (error) { next(error); }
});

export default router;

