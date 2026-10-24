-- NexusHub ERP seed (optional SQL entrypoint)
-- Prefer the idempotent Node seeder for the full demo dataset:
--   cd backend && npm run db:seed
-- That script creates 40+ subscribers, tickets, shifts, billing, and audit rows
-- with password Password@123 for all test users listed in README.md.
--
-- This file is kept so the database/ folder has a clear seed entrypoint.
-- Do not run blank DML here to avoid conflicting with the Node seeder.
SELECT 'Use backend npm run db:seed for demo data' AS notice;
