import { z } from 'zod';
import * as popService from '../services/popService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const popSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  city: z.string().min(1).max(80),
  capacity_mbps: z.coerce.number().int().positive(),
});

export const list = asyncHandler(async (req, res) => {
  const data = await popService.listPops();
  res.json({ data });
});

export const create = asyncHandler(async (req, res) => {
  const body = popSchema.parse(req.body);
  const data = await popService.createPop(body);
  res.status(201).json({ data });
});

export const update = asyncHandler(async (req, res) => {
  const body = popSchema.partial().parse(req.body);
  const data = await popService.updatePop(Number(req.params.id), body);
  res.json({ data });
});
