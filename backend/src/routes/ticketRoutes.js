import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as ticketController from '../controllers/ticketController.js';
import * as taskController from '../controllers/taskController.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize('admin', 'support_lead', 'support_agent'), ticketController.list);
router.post('/', authorize('admin', 'support_lead', 'support_agent'), ticketController.create);
router.patch('/reorder', authorize('admin', 'support_lead'), ticketController.reorder);
router.get('/:id', authorize('admin', 'support_lead', 'support_agent'), ticketController.getById);
router.patch('/:id', authorize('admin', 'support_lead', 'support_agent'), ticketController.update);
router.patch('/:id/status', authorize('admin', 'support_lead', 'support_agent'), ticketController.changeStatus);
router.post('/:id/tasks', authorize('admin', 'support_lead'), taskController.createForTicket);

export default router;
