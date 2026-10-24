import * as auditService from '../services/auditService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const list = asyncHandler(async (req, res) => {
  const result = await auditService.listAuditLogs(req.query);
  res.json({ data: result.items, meta: result.meta });
});
