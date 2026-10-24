import { z } from 'zod';
import * as subscriberService from '../services/subscriberService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const subscriberSchema = z.object({
  name: z.string().min(1).max(160),
  type: z.enum(['B2C', 'B2B']),
  email: z.string().email(),
  phone: z.string().min(1).max(40),
  address: z.string().min(1).max(255),
  company_name: z.string().max(160).nullable().optional(),
});

export const list = asyncHandler(async (req, res) => {
  const result = await subscriberService.listSubscribers(req.query);
  res.json({ data: result.items, meta: result.meta });
});

export const create = asyncHandler(async (req, res) => {
  const body = subscriberSchema.parse(req.body);
  const data = await subscriberService.createSubscriber(body, req.user);
  res.status(201).json({ data });
});

export const getById = asyncHandler(async (req, res) => {
  const data = await subscriberService.getSubscriber(Number(req.params.id));
  res.json({ data });
});

export const update = asyncHandler(async (req, res) => {
  const body = subscriberSchema.partial().parse(req.body);
  const data = await subscriberService.updateSubscriber(Number(req.params.id), body, req.user);
  res.json({ data });
});
