import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import { query } from './config/db.js';
import auth from './routes/auth.js';
import catalog from './routes/catalog.js';
import orders from './routes/orders.js';
import cart from './routes/cart.js';
import support from './routes/support.js';
import admin from './routes/admin.js';
import adminProducts from './routes/admin-products.js';
import payments from './routes/payments.js';
import { paymentService } from './services/payment.service.js';

const app = express();
const allowedOrigins = (process.env.CLIENT_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(helmet());
app.use(cors({ origin: (origin, callback) => !origin || allowedOrigins.includes(origin) ? callback(null, true) : callback(new Error('Origin is not allowed by CORS')), credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!paymentService.validWebhook(req.headers['x-paystack-signature'], req.body)) return res.sendStatus(401);
    const event = JSON.parse(req.body.toString());
    if (event.event === 'charge.success') await paymentService.verifyPayment(event.data.reference);
    res.sendStatus(200);
  } catch { res.sendStatus(400); }
});
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/settings', async (req, res, next) => {
  try { const result = await query('SELECT data FROM store_settings WHERE id=1'); res.json(result.rowCount ? result.rows[0].data : {}); }
  catch (error) { next(error); }
});
app.use('/api/auth', auth); app.use('/api', catalog); app.use('/api/cart', cart); app.use('/api/orders', orders); app.use('/api', support); app.use('/api/admin', admin); app.use('/api/admin/products', adminProducts); app.use('/api/payments', payments);
app.use((error, req, res, next) => { console.error(error.message); res.status(error.status || 400).json({ message: error.message || 'Request failed' }); });
app.listen(process.env.PORT || 4000, () => console.log('API running'));
