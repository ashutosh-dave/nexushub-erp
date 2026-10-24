import { Router } from 'express';
import { getPool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let db = 'ok';
    try {
      await getPool().query('SELECT 1');
    } catch {
      db = 'error';
    }
    res.json({ data: { status: 'ok', db, time: new Date().toISOString() } });
  })
);

export default router;
