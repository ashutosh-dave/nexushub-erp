import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as subscriberController from '../controllers/subscriberController.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('admin', 'support_lead', 'support_agent'), subscriberController.list);
router.post('/', authorize('admin'), subscriberController.create);
router.get('/:id', authorize('admin', 'support_lead', 'support_agent'), subscriberController.getById);
router.patch('/:id', authorize('admin'), subscriberController.update);

export default router;
