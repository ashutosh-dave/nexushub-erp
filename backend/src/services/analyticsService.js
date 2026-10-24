import { getPool } from '../config/db.js';

export async function overview() {
  const pool = getPool();

  const [connStatus] = await pool.query(
    `SELECT status, COUNT(*) AS count FROM connections GROUP BY status`
  );
  const [[subStats]] = await pool.query(
    `SELECT COUNT(DISTINCT s.id) AS total_subscribers,
            COUNT(DISTINCT CASE WHEN c.status = 'Active' THEN s.id END) AS active_subscribers
     FROM subscribers s
     LEFT JOIN connections c ON c.subscriber_id = s.id`
  );

  const [bandwidthByPlan] = await pool.query(
    `SELECT p.name, p.speed_mbps, COUNT(c.id) AS connections, SUM(p.speed_mbps) AS total_mbps
     FROM plans p
     LEFT JOIN connections c ON c.plan_id = p.id AND c.status = 'Active'
     GROUP BY p.id
     ORDER BY p.speed_mbps`
  );

  const [bandwidthByPop] = await pool.query(
    `SELECT pop.code, pop.name, COUNT(c.id) AS connections, SUM(pl.speed_mbps) AS total_mbps
     FROM pops pop
     LEFT JOIN connections c ON c.pop_id = pop.id AND c.status = 'Active'
     LEFT JOIN plans pl ON pl.id = c.plan_id
     GROUP BY pop.id`
  );

  const [ticketsByStatus] = await pool.query(
    `SELECT status, COUNT(*) AS count FROM tickets GROUP BY status`
  );

  const [[ticketSla]] = await pool.query(
    `SELECT
       SUM(CASE WHEN status != 'Resolved' THEN 1 ELSE 0 END) AS open_tickets,
       SUM(CASE WHEN status != 'Resolved' AND sla_due_at < UTC_TIMESTAMP() THEN 1 ELSE 0 END) AS sla_breached,
       SUM(CASE WHEN status != 'Resolved' AND sla_due_at >= UTC_TIMESTAMP()
         AND sla_due_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR) THEN 1 ELSE 0 END) AS sla_at_risk
     FROM tickets`
  );

  const [[util]] = await pool.query(
    `SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE, window_start, window_end)), 0) / 60.0 AS assigned_hours_today
     FROM ticket_tasks
     WHERE status != 'Resolved'
       AND window_start IS NOT NULL
       AND DATE(window_start) = UTC_DATE()`
  );

  return {
    connections_by_status: connStatus,
    subscribers: subStats,
    bandwidth_by_plan: bandwidthByPlan,
    bandwidth_by_pop: bandwidthByPop,
    tickets_by_status: ticketsByStatus,
    open_tickets: Number(ticketSla.open_tickets),
    sla_breached: Number(ticketSla.sla_breached),
    sla_at_risk: Number(ticketSla.sla_at_risk),
    technician_assigned_hours_today: Number(util.assigned_hours_today),
  };
}

export async function connectionsTrend(days = 30) {
  const d = Math.min(365, Math.max(1, Number(days) || 30));
  const [rows] = await getPool().query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS created
     FROM connections
     WHERE created_at >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
     GROUP BY DATE(created_at)
     ORDER BY day`,
    [d]
  );
  const [activated] = await getPool().query(
    `SELECT DATE(activated_at) AS day, COUNT(*) AS activated
     FROM connections
     WHERE activated_at IS NOT NULL
       AND activated_at >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
     GROUP BY DATE(activated_at)
     ORDER BY day`,
    [d]
  );
  return { created: rows, activated };
}

export async function ticketsTrend(days = 14) {
  const d = Math.min(365, Math.max(1, Number(days) || 14));
  const [opened] = await getPool().query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS opened
     FROM tickets
     WHERE created_at >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
     GROUP BY DATE(created_at)
     ORDER BY day`,
    [d]
  );
  const [resolved] = await getPool().query(
    `SELECT DATE(resolved_at) AS day, COUNT(*) AS resolved
     FROM tickets
     WHERE resolved_at IS NOT NULL
       AND resolved_at >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
     GROUP BY DATE(resolved_at)
     ORDER BY day`,
    [d]
  );
  return { opened, resolved };
}
