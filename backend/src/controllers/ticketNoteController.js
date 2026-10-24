import { z } from 'zod';
import * as ticketNoteService from '../services/ticketNoteService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const createSchema = z.object({
  body: z.string().min(1, 'Note is required').max(4000),
});

export const list = asyncHandler(async (req, res) => {
  const ticketId = Number(req.params.id);
  const data = await ticketNoteService.listTicketNotes(ticketId, req.user);
  res.json({ data });
});

export const create = asyncHandler(async (req, res) => {
  const ticketId = Number(req.params.id);
  const parsed = createSchema.parse(req.body);
  const data = await ticketNoteService.createTicketNote(ticketId, parsed.body, req.user);
  res.status(201).json({ data });
});
