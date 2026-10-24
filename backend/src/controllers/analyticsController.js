import { z } from 'zod';
import * as analyticsService from '../services/analyticsService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const overview = asyncHandler(async (req, res) => {
  const data = await analyticsService.overview();
  res.json({ data });
});

export const connectionsTrend = asyncHandler(async (req, res) => {
  const q = z.object({ days: z.coerce.number().int().positive().optional() }).parse(req.query);
  const data = await analyticsService.connectionsTrend(q.days);
  res.json({ data });
});

export const ticketsTrend = asyncHandler(async (req, res) => {
  const q = z.object({ days: z.coerce.number().int().positive().optional() }).parse(req.query);
  const data = await analyticsService.ticketsTrend(q.days);
  res.json({ data });
});
