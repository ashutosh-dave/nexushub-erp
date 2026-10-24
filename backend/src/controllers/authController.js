import { z } from 'zod';
import * as authService from '../services/authService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const login = asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const data = await authService.login(body.email, body.password);
  res.json({ data });
});

export const me = asyncHandler(async (req, res) => {
  const data = await authService.getMe(req.user.id);
  res.json({ data });
});
