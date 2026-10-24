import { z } from 'zod';
import * as taskService from '../services/taskService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const taskTypeEnum = z.enum([
  'Feeder Line Audit',
  'ONU Configuration',
  'Splicing',
  'Fiber Repair',
  'Router Replacement',
  'Other',
]);
const statusEnum = z.enum(['Open', 'In-Progress', 'Field Visit', 'Resolved']);

const taskBodySchema = z.object({
  title: z.string().min(1).max(200),
  task_type: taskTypeEnum,
  description: z.string().optional().nullable(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  task_type: taskTypeEnum.optional(),
  description: z.string().optional().nullable(),
});

const assignSchema = z.object({
  technician_id: z.coerce.number().int().positive().nullable().optional(),
  window_start: z.string().min(1).optional().nullable(),
  window_end: z.string().min(1).optional().nullable(),
});

const statusSchema = z.object({ status: statusEnum });

const reorderSchema = z.union([
  z.object({ status: statusEnum, ordered_ids: z.array(z.coerce.number().int().positive()).min(1) }),
  z.object({
    id: z.coerce.number().int().positive(),
    to_status: statusEnum,
    to_index: z.coerce.number().int().min(0),
  }),
]);

export const list = asyncHandler(async (req, res) => {
  const result = await taskService.listTasks(req.query, req.user);
  res.json({ data: result.items, meta: result.meta });
});

export const createForTicket = asyncHandler(async (req, res) => {
  const ticketId = Number(req.params.id);
  const raw = req.body;
  const payload = Array.isArray(raw)
    ? z.array(taskBodySchema).min(1).parse(raw)
    : taskBodySchema.parse(raw);
  const data = await taskService.createTasks(ticketId, payload, req.user);
  res.status(201).json({ data });
});

export const update = asyncHandler(async (req, res) => {
  const body = updateSchema.parse(req.body);
  const data = await taskService.updateTask(Number(req.params.id), body, req.user);
  res.json({ data });
});

export const assign = asyncHandler(async (req, res) => {
  const body = assignSchema.parse(req.body);
  const data = await taskService.assignTask(Number(req.params.id), body, req.user);
  res.json({ data });
});

export const changeStatus = asyncHandler(async (req, res) => {
  const body = statusSchema.parse(req.body);
  const data = await taskService.changeTaskStatus(Number(req.params.id), body.status, req.user);
  res.json({ data });
});

export const reorder = asyncHandler(async (req, res) => {
  const body = reorderSchema.parse(req.body);
  const data = await taskService.reorderTasks(body, req.user);
  res.json({ data });
});
