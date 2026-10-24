import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as technicianController from '../controllers/technicianController.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize('admin', 'support_lead', 'support_agent'), technicianController.list);
router.get('/available', authorize('admin', 'support_lead'), technicianController.available);
router.get('/:id/schedule', authorize('admin', 'support_lead', 'technician'), technicianController.schedule);
router.post('/:id/shifts', authorize('admin', 'support_lead'), technicianController.createShift);

export default router;
