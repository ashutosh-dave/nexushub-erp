import { z } from 'zod';
import * as authService from '../services/authService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().max(190),
  password: z.string().min(8).max(128),
  /** Public self-serve: buyer only. Omitted → buyer. */
  role: z.enum(['buyer']).optional().default('buyer'),
  /** Marketplace segment for the linked subscriber + starter connection. */
  segment: z.enum(['B2C', 'B2B']).default('B2C'),
});

export const login = asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const data = await authService.login(body.email, body.password);
  res.json({ data });
});

export const register = asyncHandler(async (req, res) => {
  if (req.body?.role && req.body.role !== 'buyer') {
    throw new ApiError(403, 'ROLE_FORBIDDEN', 'Public registration allows buyer accounts only');
  }
  const body = registerSchema.parse(req.body);
  const data = await authService.register({
    name: body.name,
    email: body.email,
    password: body.password,
    segment: body.segment,
  });
  res.status(201).json({ data });
});

export const me = asyncHandler(async (req, res) => {
  const data = await authService.getMe(req.user.id);
  res.json({ data });
});
