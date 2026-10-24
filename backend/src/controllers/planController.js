import { z } from 'zod';
import * as planService from '../services/planService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const planSchema = z.object({
  name: z.string().min(1).max(120),
  segment: z.enum(['B2C', 'B2B']),
  speed_mbps: z.coerce.number().int().positive(),
  data_cap_gb: z.coerce.number().int().positive().nullable().optional(),
  monthly_price: z.coerce.number().positive(),
  is_active: z.coerce.number().int().min(0).max(1).optional(),
});

export const list = asyncHandler(async (req, res) => {
  const data = await planService.listPlans(req.query, req.user);
  res.json({ data });
});

export const create = asyncHandler(async (req, res) => {
  const body = planSchema.parse(req.body);
  const data = await planService.createPlan(body);
  res.status(201).json({ data });
});

export const update = asyncHandler(async (req, res) => {
  const body = planSchema.partial().parse(req.body);
  const data = await planService.updatePlan(Number(req.params.id), body);
  res.json({ data });
});
