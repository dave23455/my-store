import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '../config/db.js';
import { sendPasswordResetEmail } from '../services/email.service.js';

const r = Router();
const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100).optional(),
  phone: z.string().max(50).optional(),
});

const token = (u) => jwt.sign({ id: u.id, role: u.role, email: u.email, name: u.name }, process.env.JWT_SECRET, { expiresIn: '7d' });

const formatUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  phone: u.phone || null,
  created_at: u.created_at,
  permissions: u.role === 'owner'
    ? ['all', 'manage_staff', 'manage_store', 'manage_products', 'manage_orders', 'view_analytics']
    : u.role === 'admin'
    ? ['manage_store', 'manage_products', 'manage_orders', 'view_analytics']
    : ['browse', 'buy', 'review', 'comment'],
});

r.post('/register', async (req, res, next) => {
  try {
    const v = credentials.parse(req.body);
    const hash = await bcrypt.hash(v.password, 12);
    const x = await query(
      'INSERT INTO users(name, email, password_hash, phone) VALUES($1, $2, $3, $4) RETURNING id, name, email, role, phone, created_at',
      [v.name || 'Customer', v.email.toLowerCase(), hash, v.phone || null]
    );
    const user = formatUser(x.rows[0]);
    res.status(201).json({ user, token: token(user) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ message: 'An account with this email already exists. Please sign in instead.' });
    next(e);
  }
});

r.post('/login', async (req, res, next) => {
  try {
    const v = credentials.pick({ email: true, password: true }).parse(req.body);
    const x = await query('SELECT * FROM users WHERE email=$1', [v.email.toLowerCase()]);
    if (!x.rowCount || !await bcrypt.compare(v.password, x.rows[0].password_hash)) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const u = x.rows[0];
    const user = formatUser(u);
    res.json({ user, token: token(user) });
  } catch (e) {
    next(e);
  }
});

r.get('/me', async (req, res, next) => {
  try {
    const t = req.headers.authorization?.replace('Bearer ', '');
    if (!t) return res.status(401).end();
    const p = jwt.verify(t, process.env.JWT_SECRET);
    const x = await query('SELECT id, name, email, role, phone, created_at FROM users WHERE id=$1', [p.id]);
    if (!x.rowCount) return res.status(404).json({ message: 'User not found' });
    const user = formatUser(x.rows[0]);

    const [ordersRes, addressesRes] = await Promise.all([
      query('SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total_spent FROM orders WHERE user_id=$1', [p.id]),
      query('SELECT * FROM addresses WHERE user_id=$1', [p.id]),
    ]);

    res.json({
      user: {
        ...user,
        stats: {
          orders_count: Number(ordersRes.rows[0]?.count || 0),
          total_spent: Number(ordersRes.rows[0]?.total_spent || 0),
        },
        addresses: addressesRes.rows,
        token_payload: {
          id: p.id,
          role: p.role,
          email: p.email,
          name: p.name,
          iat: p.iat,
          exp: p.exp,
        },
      },
    });
  } catch (e) {
    next(e);
  }
});

r.patch('/me', async (req, res, next) => {
  try {
    const t = req.headers.authorization?.replace('Bearer ', '');
    if (!t) return res.status(401).end();
    const p = jwt.verify(t, process.env.JWT_SECRET);
    const v = z.object({
      name: z.string().min(2).max(100).optional(),
      phone: z.string().max(50).optional(),
    }).parse(req.body);

    const x = await query(
      'UPDATE users SET name=COALESCE($1, name), phone=COALESCE($2, phone) WHERE id=$3 RETURNING id, name, email, role, phone, created_at',
      [v.name ? v.name.trim() : null, v.phone || null, p.id]
    );
    res.json({ user: formatUser(x.rows[0]) });
  } catch (e) {
    next(e);
  }
});

r.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const u = await query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (!u.rowCount) return res.json({ message: 'If that email exists, a reset link will be sent.' });
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await query("INSERT INTO password_reset_tokens(user_id, token_hash, expires_at) VALUES($1, $2, now() + interval '30 minutes')", [u.rows[0].id, hash]);
    await sendPasswordResetEmail({ to: email, link: `${process.env.CLIENT_URL}/reset-password?token=${raw}` });
    res.json({ message: 'If that email exists, a reset link will be sent.' });
  } catch (e) {
    next(e);
  }
});

r.post('/reset-password', async (req, res, next) => {
  try {
    const v = z.object({ token: z.string().min(20), password: z.string().min(8) }).parse(req.body);
    const hash = crypto.createHash('sha256').update(v.token).digest('hex');
    const x = await query('SELECT * FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now()', [hash]);
    if (!x.rowCount) return res.status(400).json({ message: 'This reset link is invalid or expired' });
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(v.password, 12), x.rows[0].user_id]);
    await query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1', [x.rows[0].id]);
    res.json({ message: 'Password updated. You can now sign in.' });
  } catch (e) {
    next(e);
  }
});

r.post('/logout', (req, res) => res.status(204).end());

export default r;
