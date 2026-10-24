import { getPool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { auditLog } from '../utils/audit.js';
import { computeProration } from '../utils/proration.js';

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function listPackages(query, actor) {
  const conditions = ['1=1'];
  const params = {};
  if (actor.role === 'buyer') {
    conditions.push('is_active = 1');
  }
  if (query.segment) {
    conditions.push('segment = :segment');
    params.segment = query.segment;
  }
  if (query.minSpeed) {
    conditions.push('speed_mbps >= :minSpeed');
    params.minSpeed = Number(query.minSpeed);
  }
  if (query.maxSpeed) {
    conditions.push('speed_mbps <= :maxSpeed');
    params.maxSpeed = Number(query.maxSpeed);
  }

  const [rows] = await getPool().query(
    `SELECT * FROM plans WHERE ${conditions.join(' AND ')} ORDER BY segment, speed_mbps`,
    params
  );
  return rows;
}

export async function myConnections(buyer) {
  if (!buyer.subscriber_id) {
    throw new ApiError(422, 'NO_SUBSCRIBER', 'Buyer account is not linked to a subscriber');
  }
  const [rows] = await getPool().execute(
    `SELECT c.*, p.name AS plan_name, p.speed_mbps, p.monthly_price, p.segment,
            pop.code AS pop_code, pop.name AS pop_name
     FROM connections c
     JOIN plans p ON p.id = c.plan_id
     JOIN pops pop ON pop.id = c.pop_id
     WHERE c.subscriber_id = ?
     ORDER BY c.created_at DESC`,
    [buyer.subscriber_id]
  );
  return rows;
}

async function assertConnectionAccess(conn, connectionId, actor) {
  const [rows] = await conn.execute(
    `SELECT c.*, p.monthly_price, p.name AS plan_name, p.speed_mbps, p.segment
     FROM connections c
     JOIN plans p ON p.id = c.plan_id
     WHERE c.id = ?`,
    [connectionId]
  );
  const connection = rows[0];
  if (!connection) throw new ApiError(404, 'NOT_FOUND', 'Connection not found');

  if (actor.role === 'buyer') {
    if (!actor.subscriber_id || Number(connection.subscriber_id) !== Number(actor.subscriber_id)) {
      throw new ApiError(403, 'FORBIDDEN', 'Not your connection');
    }
  }
  return connection;
}

export async function prorationPreview(connectionId, planId, actor) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const connection = await assertConnectionAccess(conn, connectionId, actor);
    const [planRows] = await conn.execute(`SELECT * FROM plans WHERE id = ? AND is_active = 1`, [planId]);
    const newPlan = planRows[0];
    if (!newPlan) throw new ApiError(404, 'NOT_FOUND', 'Plan not found');

    if (Number(planId) === Number(connection.plan_id)) {
      throw new ApiError(422, 'SAME_PLAN', 'Connection is already on this plan');
    }
    if (connection.status !== 'Active') {
      throw new ApiError(422, 'CONNECTION_NOT_ACTIVE', 'Plan changes require an Active connection');
    }

    const effectiveDate = todayUtcDate();
    const calc = computeProration(
      connection.billing_cycle_start,
      effectiveDate,
      Number(connection.monthly_price),
      Number(newPlan.monthly_price)
    );

    const changeType =
      Number(newPlan.monthly_price) > Number(connection.monthly_price) ? 'upgrade' : 'downgrade';

    return {
      connection_id: connectionId,
      from_plan_id: connection.plan_id,
      to_plan_id: planId,
      change_type: changeType,
      effective_date: effectiveDate,
      ...calc,
    };
  } finally {
    conn.release();
  }
}

export async function changePlan(connectionId, planId, actor) {
  return withTransaction(async (conn) => {
    const connection = await assertConnectionAccess(conn, connectionId, actor);
    const [planRows] = await conn.execute(`SELECT * FROM plans WHERE id = ? AND is_active = 1`, [planId]);
    const newPlan = planRows[0];
    if (!newPlan) throw new ApiError(404, 'NOT_FOUND', 'Plan not found');

    if (Number(planId) === Number(connection.plan_id)) {
      throw new ApiError(422, 'SAME_PLAN', 'Connection is already on this plan');
    }
    if (connection.status !== 'Active') {
      throw new ApiError(422, 'CONNECTION_NOT_ACTIVE', 'Plan changes require an Active connection');
    }

    const effectiveDate = todayUtcDate();
    const calc = computeProration(
      connection.billing_cycle_start,
      effectiveDate,
      Number(connection.monthly_price),
      Number(newPlan.monthly_price)
    );
    const changeType =
      Number(newPlan.monthly_price) > Number(connection.monthly_price) ? 'upgrade' : 'downgrade';

    const [pcResult] = await conn.execute(
      `INSERT INTO plan_changes
       (connection_id, from_plan_id, to_plan_id, change_type, effective_date, requested_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [connectionId, connection.plan_id, planId, changeType, effectiveDate, actor.id]
    );
    const planChangeId = pcResult.insertId;

    await conn.execute(
      `INSERT INTO billing_logs
       (connection_id, plan_change_id, entry_type, description, amount, period_start, period_end, days_used, days_in_cycle)
       VALUES (?, ?, 'proration', ?, ?, ?, ?, ?, ?)`,
      [
        connectionId,
        planChangeId,
        `Credit remaining on ${connection.plan_name}`,
        calc.oldCredit,
        calc.periodStart,
        calc.periodEnd,
        calc.daysUsed,
        calc.daysInCycle,
      ]
    );

    await conn.execute(
      `INSERT INTO billing_logs
       (connection_id, plan_change_id, entry_type, description, amount, period_start, period_end, days_used, days_in_cycle)
       VALUES (?, ?, 'proration', ?, ?, ?, ?, ?, ?)`,
      [
        connectionId,
        planChangeId,
        `Charge remaining on ${newPlan.name}`,
        calc.newCharge,
        calc.periodStart,
        calc.periodEnd,
        calc.daysUsed,
        calc.daysInCycle,
      ]
    );

    await conn.execute(`UPDATE connections SET plan_id = ? WHERE id = ?`, [planId, connectionId]);

    await auditLog(conn, {
      entityType: 'plan_change',
      entityId: planChangeId,
      action: 'PLAN_CHANGED',
      oldValue: { plan_id: connection.plan_id, monthly_price: connection.monthly_price },
      newValue: { plan_id: planId, monthly_price: newPlan.monthly_price, net: calc.net },
      actorId: actor.id,
    });

    const [updated] = await conn.execute(
      `SELECT c.*, p.name AS plan_name FROM connections c JOIN plans p ON p.id = c.plan_id WHERE c.id = ?`,
      [connectionId]
    );

    return {
      connection: updated[0],
      plan_change_id: planChangeId,
      proration: calc,
    };
  });
}

export async function billingLogs(connectionId, actor) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await assertConnectionAccess(conn, connectionId, actor);
    const [rows] = await conn.execute(
      `SELECT * FROM billing_logs WHERE connection_id = ? ORDER BY created_at DESC`,
      [connectionId]
    );
    return rows;
  } finally {
    conn.release();
  }
}
