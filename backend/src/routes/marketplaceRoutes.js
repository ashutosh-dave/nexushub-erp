import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as marketplaceController from '../controllers/marketplaceController.js';

const router = Router();

router.use(authenticate);

router.get('/packages', authorize('admin', 'buyer'), marketplaceController.packages);
router.get('/my-connections', authorize('buyer'), marketplaceController.myConnections);
router.get('/proration-preview', authorize('admin', 'buyer'), marketplaceController.prorationPreview);
router.post(
  '/connections/:id/change-plan',
  authorize('admin', 'buyer'),
  marketplaceController.changePlan
);
router.get(
  '/connections/:id/billing-logs',
  authorize('admin', 'buyer'),
  marketplaceController.billingLogs
);

export default router;
