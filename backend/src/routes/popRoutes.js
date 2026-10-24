import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as popController from '../controllers/popController.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('admin', 'support_lead', 'support_agent', 'buyer'), popController.list);
router.post('/', authorize('admin'), popController.create);
router.patch('/:id', authorize('admin'), popController.update);

export default router;
