import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as planController from '../controllers/planController.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('admin', 'support_lead', 'support_agent', 'buyer'), planController.list);
router.post('/', authorize('admin'), planController.create);
router.patch('/:id', authorize('admin'), planController.update);

export default router;
