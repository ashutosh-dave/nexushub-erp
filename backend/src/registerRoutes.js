import authRoutes from './routes/authRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import popRoutes from './routes/popRoutes.js';
import planRoutes from './routes/planRoutes.js';
import subscriberRoutes from './routes/subscriberRoutes.js';
import connectionRoutes from './routes/connectionRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import technicianRoutes from './routes/technicianRoutes.js';
import technicianShiftRoutes from './routes/technicianShiftRoutes.js';
import marketplaceRoutes from './routes/marketplaceRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import auditRoutes from './routes/auditRoutes.js';

/**
 * Mount all API routers on the Express app.
 * @param {import('express').Express} app
 */
export function registerRoutes(app) {
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/pops', popRoutes);
  app.use('/api/plans', planRoutes);
  app.use('/api/subscribers', subscriberRoutes);
  app.use('/api/connections', connectionRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/technicians', technicianRoutes);
  app.use('/api/technician-shifts', technicianShiftRoutes);
  app.use('/api/marketplace', marketplaceRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/audit-logs', auditRoutes);
}
