import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPool } from '../config/db.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Missing or invalid Authorization header');
  }
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
  }
  const [rows] = await getPool().execute(
    `SELECT id, name, email, role, subscriber_id, is_active FROM users WHERE id = ?`,
    [payload.sub]
  );
  const user = rows[0];
  if (!user || !user.is_active) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'User inactive or not found');
  }
  req.user = user;
  next();
});

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'UNAUTHENTICATED', 'Not authenticated'));
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return next(new ApiError(403, 'FORBIDDEN', 'Insufficient permissions'));
    }
    next();
  };
}
