import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPool } from '../config/db.js';
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
  const token = jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
  return { token, user: publicUser(user) };
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
