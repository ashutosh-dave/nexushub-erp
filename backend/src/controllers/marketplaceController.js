import { z } from 'zod';
import * as marketplaceService from '../services/marketplaceService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const packages = asyncHandler(async (req, res) => {
  const data = await marketplaceService.listPackages(req.query, req.user);
  res.json({ data });
});

export const myConnections = asyncHandler(async (req, res) => {
  const data = await marketplaceService.myConnections(req.user);
  res.json({ data });
});

export const changePlan = asyncHandler(async (req, res) => {
  const body = z.object({ plan_id: z.coerce.number().int().positive() }).parse(req.body);
  const data = await marketplaceService.changePlan(Number(req.params.id), body.plan_id, req.user);
  res.json({ data });
});

export const billingLogs = asyncHandler(async (req, res) => {
  const data = await marketplaceService.billingLogs(Number(req.params.id), req.user);
  res.json({ data });
});

export const prorationPreview = asyncHandler(async (req, res) => {
  const q = z
    .object({
      connectionId: z.coerce.number().int().positive(),
      planId: z.coerce.number().int().positive(),
    })
    .parse(req.query);
  const data = await marketplaceService.prorationPreview(q.connectionId, q.planId, req.user);
  res.json({ data });
});
