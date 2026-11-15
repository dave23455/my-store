import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, pool } from '../config/db.js';
import { sendVerificationOtpEmail } from '../services/email.service.js';

const r = Router();
const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100).optional(),
  phone: z.string().max(50).optional(),
});

const token = (u) => jwt.sign({ sub: u.public_id, role: u.role, email: u.email, name: u.name }, process.env.JWT_SECRET, { expiresIn: '7d' });

const formatUser = (u) => ({
  id: u.public_id,
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

async function issueEmailVerificationOtp(userId, publicId, email) {
  const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const client = await pool.connect();
  let expiresAt;
  try {
    await client.query('BEGIN');
    const user = await client.query('SELECT email_verified FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (!user.rowCount || user.rows[0].email_verified) {
      await client.query('ROLLBACK');
      return;
    }
    await client.query('DELETE FROM email_verification_otps WHERE user_id=$1', [userId]);
    const inserted = await client.query(
      "INSERT INTO email_verification_otps(user_id,otp_hash,expires_at) VALUES($1,$2,now() + interval '60 minutes') RETURNING expires_at",
      [userId, await bcrypt.hash(otp, 12)]
    );
    expiresAt = inserted.rows[0].expires_at;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (process.env.NODE_ENV === 'development') {
    console.info(`[email-verification] Development OTP for ${email}: ${otp} (expires ${new Date(expiresAt).toISOString()})`);
  }
  try {
    await sendVerificationOtpEmail({ to: email, otp, expiresAt: new Date(expiresAt) });
  } catch {
    const error = new Error('Your account was created, but the verification email could not be sent. Please request a new code.');
    error.status = 502;
    error.details = { userId: publicId };
    throw error;
  }
}

async function deleteExpiredOtps() {
  await query('DELETE FROM password_reset_otps WHERE expires_at <= now()');
  await query('DELETE FROM email_verification_otps WHERE expires_at <= now()');
}

r.post('/register', async (req, res, next) => {
  try {
    const v = credentials.parse(req.body);
    const hash = await bcrypt.hash(v.password, 12);
    const publicId = randomUUID();
    const x = await query(
      'INSERT INTO users(name, email, password_hash, phone, public_id, email_verified) VALUES($1, $2, $3, $4, $5, false) RETURNING id, public_id, name, email, role, phone, created_at',
      [v.name || 'Customer', v.email.toLowerCase(), hash, v.phone || null, publicId]
    );
    try {
      await issueEmailVerificationOtp(x.rows[0].id, publicId, x.rows[0].email);
    } catch (error) {
      return res.status(error.status || 502).json({ message: error.message, details: error.details });
    }
    const user = formatUser(x.rows[0]);
    res.status(201).json({
      user,
      userId: publicId,
      message: 'Check your email for the six-digit verification code, then verify your account before signing in.',
      nextStep: {
        action: 'verify_email',
        method: 'POST',
        endpoint: '/auth/verifyemail',
        body: { userId: publicId, otp: '<6-digit code from your email>' },
      },
    });
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
    if (!x.rows[0].email_verified) {
      return res.status(403).json({ message: 'Please verify your email before signing in.' });
    }
    const u = x.rows[0];
    const user = formatUser(u);
    res.json({ user, token: token(u) });
  } catch (e) {
    next(e);
  }
});

r.post('/verifyemail', async (req, res, next) => {
  try {
    const v = z.object({ userId: z.string().uuid(), otp: z.string().regex(/^\d{6}$/) }).parse(req.body);
    await deleteExpiredOtps();
    const client = await pool.connect();
    let invalidOtp = false;
    try {
      await client.query('BEGIN');
      const user = await client.query('SELECT id,email_verified FROM users WHERE public_id=$1 FOR UPDATE', [v.userId]);
      if (!user.rowCount || user.rows[0].email_verified) {
        invalidOtp = true;
      } else {
        const code = await client.query(
          "SELECT id,otp_hash,attempts FROM email_verification_otps WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
          [user.rows[0].id]
        );
        if (!code.rowCount) {
          invalidOtp = true;
        } else if (!await bcrypt.compare(v.otp, code.rows[0].otp_hash)) {
          if (code.rows[0].attempts + 1 >= 5) {
            await client.query('DELETE FROM email_verification_otps WHERE id=$1', [code.rows[0].id]);
          } else {
            await client.query('UPDATE email_verification_otps SET attempts=attempts+1 WHERE id=$1', [code.rows[0].id]);
          }
          invalidOtp = true;
        } else {
          await client.query('UPDATE users SET email_verified=true WHERE id=$1', [user.rows[0].id]);
          await client.query('DELETE FROM email_verification_otps WHERE id=$1', [code.rows[0].id]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (invalidOtp) return res.status(400).json({ message: 'This verification code is invalid or expired.' });
    res.json({ message: 'Email verified. You can now sign in.' });
  } catch (error) {
    next(error);
  }
});

r.post('/resendverification', async (req, res, next) => {
  try {
    const v = z.object({ userId: z.string().uuid() }).parse(req.body);
    await deleteExpiredOtps();
    const user = await query('SELECT id,public_id,email,email_verified FROM users WHERE public_id=$1', [v.userId]);
    if (user.rowCount && !user.rows[0].email_verified) {
      await issueEmailVerificationOtp(user.rows[0].id, user.rows[0].public_id, user.rows[0].email);
    }
    res.json({ message: 'If this account needs verification, a new code has been sent to its email address.' });
  } catch (error) {
    next(error);
  }
});

r.get('/me', async (req, res, next) => {
  try {
    const t = req.headers.authorization?.replace('Bearer ', '');
    if (!t) return res.status(401).end();
    const p = jwt.verify(t, process.env.JWT_SECRET);
    const x = await query('SELECT id, public_id, name, email, role, phone, created_at FROM users WHERE public_id=$1', [p.sub]);
    if (!x.rowCount) return res.status(404).json({ message: 'User not found' });
    const user = formatUser(x.rows[0]);

    const [ordersRes, addressesRes] = await Promise.all([
      query('SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total_spent FROM orders WHERE user_id=$1', [x.rows[0].id]),
      query('SELECT * FROM addresses WHERE user_id=$1', [x.rows[0].id]),
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
          id: p.sub,
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
    const user = await query('SELECT id FROM users WHERE public_id=$1', [p.sub]);
    if (!user.rowCount) return res.status(404).json({ message: 'User not found' });
    const v = z.object({
      name: z.string().min(2).max(100).optional(),
      phone: z.string().max(50).optional(),
    }).parse(req.body);

    const x = await query(
      'UPDATE users SET name=COALESCE($1, name), phone=COALESCE($2, phone) WHERE id=$3 RETURNING id, public_id, name, email, role, phone, created_at',
      [v.name ? v.name.trim() : null, v.phone || null, user.rows[0].id]
    );
    res.json({ user: formatUser(x.rows[0]) });
  } catch (e) {
    next(e);
  }
});

r.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    await query('DELETE FROM password_reset_otps WHERE expires_at <= now()');
    const user = await query('SELECT id FROM users WHERE lower(email)=$1', [email.toLowerCase()]);
    if (user.rowCount) {
      const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.rows[0].id]);
        await client.query('DELETE FROM password_reset_otps WHERE user_id=$1', [user.rows[0].id]);
        const inserted = await client.query(
          "INSERT INTO password_reset_otps(user_id,otp_hash,expires_at) VALUES($1,$2,now() + interval '60 minutes') RETURNING expires_at",
          [user.rows[0].id, await bcrypt.hash(otp, 12)]
        );
        await client.query('COMMIT');
        if (process.env.NODE_ENV === 'development') {
          console.info(`[password-reset] Development OTP for ${email.toLowerCase()}: ${otp} (expires ${new Date(inserted.rows[0].expires_at).toISOString()})`);
        }
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    res.json({ message: 'If an account exists for that email, a password-reset code has been generated.' });
  } catch (e) {
    next(e);
  }
});

r.post('/reset-password', async (req, res, next) => {
  try {
    const v = z.object({
      email: z.string().email(),
      otp: z.string().regex(/^\d{6}$/),
      password: z.string().min(8),
    }).parse(req.body);
    await query('DELETE FROM password_reset_otps WHERE expires_at <= now()');
    const client = await pool.connect();
    let invalidOtp = false;
    try {
      await client.query('BEGIN');
      const user = await client.query('SELECT id FROM users WHERE lower(email)=$1', [v.email.toLowerCase()]);
      if (!user.rowCount) {
        invalidOtp = true;
      } else {
        const result = await client.query(
          `SELECT id,otp_hash,attempts FROM password_reset_otps
           WHERE user_id=$1 AND expires_at>now()
           ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [user.rows[0].id]
        );
        if (!result.rowCount) {
          invalidOtp = true;
        } else {
          const record = result.rows[0];
          if (!await bcrypt.compare(v.otp, record.otp_hash)) {
            if (record.attempts + 1 >= 5) {
              await client.query('DELETE FROM password_reset_otps WHERE id=$1', [record.id]);
            } else {
              await client.query('UPDATE password_reset_otps SET attempts=attempts+1 WHERE id=$1', [record.id]);
            }
            invalidOtp = true;
          } else {
            await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [
              await bcrypt.hash(v.password, 12),
              user.rows[0].id,
            ]);
            await client.query('DELETE FROM password_reset_otps WHERE id=$1', [record.id]);
          }
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (invalidOtp) return res.status(400).json({ message: 'This OTP is invalid or expired.' });
    res.json({ message: 'Password updated. You can now sign in.' });
  } catch (e) {
    next(e);
  }
});

r.post('/logout', (req, res) => res.status(204).end());

export default r;
