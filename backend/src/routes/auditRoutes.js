import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as auditController from '../controllers/auditController.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('admin', 'support_lead'), auditController.list);

export default router;
