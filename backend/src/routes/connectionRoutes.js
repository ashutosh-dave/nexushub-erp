import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as connectionController from '../controllers/connectionController.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('admin', 'support_lead', 'support_agent'), connectionController.list);
router.post('/', authorize('admin'), connectionController.create);
router.get('/:id', authorize('admin', 'support_lead', 'support_agent'), connectionController.getById);
router.patch('/:id', authorize('admin'), connectionController.update);
router.patch('/:id/status', authorize('admin'), connectionController.changeStatus);
router.get('/:id/history', authorize('admin', 'support_lead', 'support_agent'), connectionController.history);

export default router;
