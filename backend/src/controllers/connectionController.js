import { z } from 'zod';
import * as connectionService from '../services/connectionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const createSchema = z.object({
  subscriber_id: z.coerce.number().int().positive(),
  plan_id: z.coerce.number().int().positive(),
  pop_id: z.coerce.number().int().positive(),
  static_ip: z.string().nullable().optional(),
  connection_code: z.string().optional(),
  billing_cycle_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const updateSchema = z.object({
  pop_id: z.coerce.number().int().positive().optional(),
  plan_id: z.coerce.number().int().positive().optional(),
  static_ip: z.string().nullable().optional(),
});

const statusSchema = z.object({
  status: z.enum(['Pending', 'Active', 'Suspended', 'Terminated']),
});

export const list = asyncHandler(async (req, res) => {
  const result = await connectionService.listConnections(req.query);
  res.json({ data: result.items, meta: result.meta });
});

export const create = asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const data = await connectionService.createConnection(body, req.user);
  res.status(201).json({ data });
});

export const getById = asyncHandler(async (req, res) => {
  const data = await connectionService.getConnection(Number(req.params.id));
  res.json({ data });
});

export const update = asyncHandler(async (req, res) => {
  const body = updateSchema.parse(req.body);
  const data = await connectionService.updateConnection(Number(req.params.id), body, req.user);
  res.json({ data });
});

export const changeStatus = asyncHandler(async (req, res) => {
  const body = statusSchema.parse(req.body);
  const data = await connectionService.changeConnectionStatus(
    Number(req.params.id),
    body.status,
    req.user
  );
  res.json({ data });
});

export const history = asyncHandler(async (req, res) => {
  const data = await connectionService.connectionHistory(Number(req.params.id));
  res.json({ data });
});
