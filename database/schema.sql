-- NexusHub ERP — MySQL 8 schema (InnoDB, utf8mb4)
-- Organised: database → reference → core → workflow → audit → indexes
-- Re-runnable on a fresh database.

CREATE DATABASE IF NOT EXISTS nexushub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE nexushub;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS ticket_notes;
DROP TABLE IF EXISTS ticket_tasks;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS technician_shifts;
DROP TABLE IF EXISTS billing_logs;
DROP TABLE IF EXISTS plan_changes;
DROP TABLE IF EXISTS connections;
DROP TABLE IF EXISTS subscribers;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS pops;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Reference tables
-- ---------------------------------------------------------------------------

CREATE TABLE pops (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(120) NOT NULL,
  city VARCHAR(80) NOT NULL,
  capacity_mbps INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pops_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  segment ENUM('B2C', 'B2B') NOT NULL,
  speed_mbps INT UNSIGNED NOT NULL,
  data_cap_gb INT UNSIGNED NULL,
  monthly_price DECIMAL(10,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_plans_segment (segment),
  KEY idx_plans_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscribers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  type ENUM('B2C', 'B2B') NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  address VARCHAR(255) NOT NULL,
  company_name VARCHAR(160) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_subscribers_type (type),
  KEY idx_subscribers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'support_lead', 'support_agent', 'technician', 'buyer') NOT NULL,
  subscriber_id BIGINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_subscriber (subscriber_id),
  CONSTRAINT fk_users_subscriber FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

CREATE TABLE connections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  subscriber_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  pop_id BIGINT UNSIGNED NOT NULL,
  status ENUM('Pending', 'Active', 'Suspended', 'Terminated') NOT NULL DEFAULT 'Pending',
  static_ip VARCHAR(15) NULL,
  connection_code VARCHAR(32) NOT NULL,
  activated_at DATETIME NULL,
  terminated_at DATETIME NULL,
  billing_cycle_start DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_connections_code (connection_code),
  UNIQUE KEY uq_connections_static_ip (static_ip),
  KEY idx_connections_status (status),
  KEY idx_connections_pop (pop_id),
  KEY idx_connections_plan (plan_id),
  KEY idx_connections_subscriber (subscriber_id),
  CONSTRAINT fk_connections_subscriber FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_connections_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_connections_pop FOREIGN KEY (pop_id) REFERENCES pops(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE plan_changes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  connection_id BIGINT UNSIGNED NOT NULL,
  from_plan_id BIGINT UNSIGNED NOT NULL,
  to_plan_id BIGINT UNSIGNED NOT NULL,
  change_type ENUM('upgrade', 'downgrade') NOT NULL,
  effective_date DATE NOT NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_plan_changes_connection (connection_id),
  CONSTRAINT fk_plan_changes_connection FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE RESTRICT,
  CONSTRAINT fk_plan_changes_from FOREIGN KEY (from_plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_plan_changes_to FOREIGN KEY (to_plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_plan_changes_user FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE billing_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  connection_id BIGINT UNSIGNED NOT NULL,
  plan_change_id BIGINT UNSIGNED NULL,
  entry_type ENUM('charge', 'credit', 'proration') NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  days_used INT NOT NULL,
  days_in_cycle INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_billing_connection (connection_id),
  KEY idx_billing_plan_change (plan_change_id),
  CONSTRAINT fk_billing_connection FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE RESTRICT,
  CONSTRAINT fk_billing_plan_change FOREIGN KEY (plan_change_id) REFERENCES plan_changes(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE technician_shifts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  technician_id BIGINT UNSIGNED NOT NULL,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_shifts_tech_date (technician_id, shift_date),
  CONSTRAINT fk_shifts_technician FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Workflow tables
-- ---------------------------------------------------------------------------

CREATE TABLE tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_no VARCHAR(32) NOT NULL,
  connection_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  priority ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL DEFAULT 'Medium',
  status ENUM('Open', 'In-Progress', 'Field Visit', 'Resolved') NOT NULL DEFAULT 'Open',
  rank_index INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NOT NULL,
  sla_due_at DATETIME NOT NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tickets_no (ticket_no),
  KEY idx_tickets_status (status),
  KEY idx_tickets_priority (priority),
  KEY idx_tickets_connection (connection_id),
  KEY idx_tickets_sla (sla_due_at),
  KEY idx_tickets_rank (status, rank_index),
  CONSTRAINT fk_tickets_connection FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tickets_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  task_type ENUM('Feeder Line Audit', 'ONU Configuration', 'Splicing', 'Fiber Repair', 'Router Replacement', 'Other') NOT NULL,
  description TEXT NULL,
  status ENUM('Open', 'In-Progress', 'Field Visit', 'Resolved') NOT NULL DEFAULT 'Open',
  rank_index INT NOT NULL DEFAULT 0,
  technician_id BIGINT UNSIGNED NULL,
  window_start DATETIME NULL,
  window_end DATETIME NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tasks_ticket (ticket_id),
  KEY idx_tasks_status (status),
  KEY idx_tasks_technician (technician_id),
  KEY idx_tasks_window (window_start, window_end),
  KEY idx_tasks_rank (status, rank_index),
  CONSTRAINT fk_tasks_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tasks_technician FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_tasks_window CHECK (window_end IS NULL OR window_start IS NULL OR window_end > window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ticket_notes_ticket (ticket_id, created_at),
  KEY idx_ticket_notes_author (author_id),
  CONSTRAINT fk_ticket_notes_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ticket_notes_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Audit (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entity_type ENUM('connection', 'plan_change', 'ticket', 'ticket_task', 'subscriber') NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(64) NOT NULL,
  old_value JSON NULL,
  new_value JSON NULL,
  actor_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_actor (actor_id),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
