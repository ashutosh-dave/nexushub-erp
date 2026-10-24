import { z } from 'zod';
import * as technicianService from '../services/technicianService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

const shiftSchema = z.object({
  shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
});

export const list = asyncHandler(async (req, res) => {
  const data = await technicianService.listTechnicians();
  res.json({ data });
});

export const available = asyncHandler(async (req, res) => {
  const schema = z.object({
    start: z.string().min(1),
    end: z.string().min(1),
  });
  const q = schema.parse(req.query);
  const data = await technicianService.listAvailable(q.start, q.end);
  res.json({ data });
});

export const mySchedule = asyncHandler(async (req, res) => {
  const schema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  });
  const q = schema.parse(req.query);
  const data = await technicianService.getSchedule(Number(req.user.id), q.from, q.to);
  res.json({ data });
});

export const schedule = asyncHandler(async (req, res) => {
  const schema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  });
  const q = schema.parse(req.query);
  let technicianId = Number(req.params.id);
  // Technicians may only read their own schedule
  if (req.user.role === 'technician') {
    if (technicianId !== Number(req.user.id)) {
      throw new ApiError(403, 'FORBIDDEN', 'Technicians may only view their own schedule');
    }
    technicianId = Number(req.user.id);
  }
  const data = await technicianService.getSchedule(technicianId, q.from, q.to);
  res.json({ data });
});

export const createShift = asyncHandler(async (req, res) => {
  const body = shiftSchema.parse(req.body);
  const data = await technicianService.createShift(Number(req.params.id), body);
  res.status(201).json({ data });
});

export const deleteShift = asyncHandler(async (req, res) => {
  const data = await technicianService.deleteShift(Number(req.params.id));
  res.json({ data });
});
