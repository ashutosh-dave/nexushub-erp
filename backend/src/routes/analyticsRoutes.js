import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as analyticsController from '../controllers/analyticsController.js';

const router = Router();

router.use(authenticate);
router.get('/overview', authorize('admin', 'support_lead', 'support_agent'), analyticsController.overview);
router.get(
  '/connections-trend',
  authorize('admin', 'support_lead', 'support_agent'),
  analyticsController.connectionsTrend
);
router.get(
  '/tickets-trend',
  authorize('admin', 'support_lead', 'support_agent'),
  analyticsController.ticketsTrend
);

export default router;
