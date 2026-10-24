import { z } from 'zod';
import * as ticketService from '../services/ticketService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const priorityEnum = z.enum(['Low', 'Medium', 'High', 'Critical']);
const statusEnum = z.enum(['Open', 'In-Progress', 'Field Visit', 'Resolved']);

const createSchema = z.object({
  connection_id: z.coerce.number().int().positive(),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  priority: priorityEnum.default('Medium'),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  priority: priorityEnum.optional(),
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
  const result = await ticketService.listTickets(req.query);
  res.json({ data: result.items, meta: result.meta });
});

export const create = asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const data = await ticketService.createTicket(body, req.user);
  res.status(201).json({ data });
});

export const getById = asyncHandler(async (req, res) => {
  const data = await ticketService.getTicket(Number(req.params.id), req.user);
  res.json({ data });
});

export const update = asyncHandler(async (req, res) => {
  const body = updateSchema.parse(req.body);
  const data = await ticketService.updateTicket(Number(req.params.id), body, req.user);
  res.json({ data });
});

export const changeStatus = asyncHandler(async (req, res) => {
  const body = statusSchema.parse(req.body);
  const result = await ticketService.changeTicketStatus(Number(req.params.id), body.status, req.user);
  res.json({ data: result.ticket, meta: { all_tasks_resolved: result.all_tasks_resolved } });
});

export const reorder = asyncHandler(async (req, res) => {
  const body = reorderSchema.parse(req.body);
  const data = await ticketService.reorderTickets(body, req.user);
  res.json({ data });
});
