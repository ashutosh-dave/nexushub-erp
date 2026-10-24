import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPool, withTransaction } from '../config/db.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    subscriber_id: row.subscriber_id,
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

function padConnectionCode(n) {
  return `NX-${String(n).padStart(6, '0')}`;
}

async function nextConnectionCode(conn) {
  const [rows] = await conn.execute(`SELECT connection_code FROM connections ORDER BY id DESC LIMIT 1`);
  if (!rows[0]) return padConnectionCode(1);
  const num = Number.parseInt(String(rows[0].connection_code).replace('NX-', ''), 10) + 1;
  return padConnectionCode(Number.isFinite(num) ? num : 1);
}

export async function login(email, password) {
  const [rows] = await getPool().execute(
    `SELECT id, name, email, password_hash, role, subscriber_id, is_active FROM users WHERE email = ?`,
    [email]
  );
  const user = rows[0];
  if (!user || !user.is_active) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  return { token: signToken(user), user: publicUser(user) };
}

/**
 * Public self-serve signup. Role is always buyer (admin/support/tech cannot self-register).
 * Creates subscriber + Active starter connection so Marketplace works immediately.
 */
export async function register({ name, email, password, segment }) {
  return withTransaction(async (conn) => {
    const [existing] = await conn.execute(`SELECT id FROM users WHERE email = ?`, [email]);
    if (existing[0]) {
      throw new ApiError(409, 'EMAIL_EXISTS', 'Email already registered');
    }

    const companyName = segment === 'B2B' ? `${name} Co.` : null;
    const [subResult] = await conn.execute(
      `INSERT INTO subscribers (name, type, email, phone, address, company_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, segment, email, '0000000000', 'Self-registered (demo)', companyName]
    );
    const subscriberId = subResult.insertId;

    const [plans] = await conn.execute(
      `SELECT id FROM plans WHERE segment = ? AND is_active = 1 ORDER BY speed_mbps ASC, id ASC LIMIT 1`,
      [segment]
    );
    if (!plans[0]) {
      throw new ApiError(503, 'NO_PLAN', 'No active plan available for this segment');
    }

    const [pops] = await conn.execute(`SELECT id FROM pops ORDER BY id ASC LIMIT 1`);
    if (!pops[0]) {
      throw new ApiError(503, 'NO_POP', 'No POP configured');
    }

    const code = await nextConnectionCode(conn);
    const billingStart = new Date().toISOString().slice(0, 10);
    const activatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await conn.execute(
      `INSERT INTO connections
       (subscriber_id, plan_id, pop_id, status, static_ip, connection_code, activated_at, billing_cycle_start)
       VALUES (?, ?, ?, 'Active', NULL, ?, ?, ?)`,
      [subscriberId, plans[0].id, pops[0].id, code, activatedAt, billingStart]
    );

    const passwordHash = await bcrypt.hash(password, 10);
    const [userResult] = await conn.execute(
      `INSERT INTO users (name, email, password_hash, role, subscriber_id, is_active)
       VALUES (?, ?, ?, 'buyer', ?, 1)`,
      [name, email, passwordHash, subscriberId]
    );

    const user = {
      id: userResult.insertId,
      name,
      email,
      role: 'buyer',
      subscriber_id: subscriberId,
    };

    return { token: signToken(user), user };
  });
}

export async function getMe(userId) {
  const [rows] = await getPool().execute(
    `SELECT id, name, email, role, subscriber_id, is_active FROM users WHERE id = ?`,
    [userId]
  );
  const user = rows[0];
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  return publicUser(user);
}
