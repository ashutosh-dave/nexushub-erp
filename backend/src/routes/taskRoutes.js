import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as taskController from '../controllers/taskController.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('admin', 'support_lead', 'support_agent', 'technician'),
  taskController.list
);
router.patch('/reorder', authorize('admin', 'support_lead'), taskController.reorder);
router.patch(
  '/:id',
  authorize('admin', 'support_lead', 'support_agent'),
  taskController.update
);
router.patch('/:id/assign', authorize('admin', 'support_lead'), taskController.assign);
router.patch(
  '/:id/status',
  authorize('admin', 'support_lead', 'technician'),
  taskController.changeStatus
);

export default router;
