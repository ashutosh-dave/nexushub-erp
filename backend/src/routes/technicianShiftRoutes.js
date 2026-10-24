import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as technicianController from '../controllers/technicianController.js';

const router = Router();

router.use(authenticate);
router.delete('/:id', authorize('admin', 'support_lead'), technicianController.deleteShift);

export default router;
