import { getPool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { auditLog } from '../utils/audit.js';
import { canTransitionConnection } from '../utils/statusMachines.js';
import { isValidIpv4 } from '../utils/validators.js';
import { parsePagination } from '../utils/pagination.js';

function padCode(n) {
  return `NX-${String(n).padStart(6, '0')}`;
}

async function nextConnectionCode(conn) {
  const [rows] = await conn.execute(`SELECT connection_code FROM connections ORDER BY id DESC LIMIT 1`);
  if (!rows[0]) return padCode(1);
  const num = Number.parseInt(String(rows[0].connection_code).replace('NX-', ''), 10) + 1;
  return padCode(num);
}

async function fetchConnection(conn, id) {
  const [rows] = await conn.execute(
    `SELECT c.*, p.name AS plan_name, p.monthly_price, pop.code AS pop_code, s.name AS subscriber_name
     FROM connections c
     JOIN plans p ON p.id = c.plan_id
     JOIN pops pop ON pop.id = c.pop_id
     JOIN subscribers s ON s.id = c.subscriber_id
     WHERE c.id = ?`,
    [id]
  );
  return rows[0] || null;
}

export async function listConnections(query) {
  const { page, pageSize, offset } = parsePagination(query);
  const conditions = ['1=1'];
  const params = {};

  if (query.status) {
    conditions.push('c.status = :status');
    params.status = query.status;
  }
  if (query.subscriberId) {
    conditions.push('c.subscriber_id = :subscriberId');
    params.subscriberId = Number(query.subscriberId);
  }

  const where = conditions.join(' AND ');
  const [[{ total }]] = await getPool().query(
    `SELECT COUNT(*) AS total FROM connections c WHERE ${where}`,
    params
  );

  const [rows] = await getPool().query(
    `SELECT c.*, p.name AS plan_name, pop.code AS pop_code, s.name AS subscriber_name
     FROM connections c
     JOIN plans p ON p.id = c.plan_id
     JOIN pops pop ON pop.id = c.pop_id
     JOIN subscribers s ON s.id = c.subscriber_id
     WHERE ${where}
     ORDER BY c.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { ...params, limit: pageSize, offset }
  );

  return { items: rows, meta: { page, pageSize, total: Number(total) } };
}

export async function createConnection(body, actor) {
  return withTransaction(async (conn) => {
    const [subs] = await conn.execute(`SELECT id FROM subscribers WHERE id = ?`, [body.subscriber_id]);
    if (!subs[0]) throw new ApiError(404, 'NOT_FOUND', 'Subscriber not found');

    const [plans] = await conn.execute(`SELECT id, is_active FROM plans WHERE id = ?`, [body.plan_id]);
    if (!plans[0] || !plans[0].is_active) {
      throw new ApiError(422, 'INVALID_PLAN', 'Plan must exist and be active');
    }

    const [pops] = await conn.execute(`SELECT id FROM pops WHERE id = ?`, [body.pop_id]);
    if (!pops[0]) throw new ApiError(404, 'NOT_FOUND', 'POP not found');

    if (body.static_ip != null && body.static_ip !== '' && !isValidIpv4(body.static_ip)) {
      throw new ApiError(422, 'INVALID_IP', 'static_ip must be valid IPv4');
    }

    const code = body.connection_code || (await nextConnectionCode(conn));
    const billingStart = body.billing_cycle_start || new Date().toISOString().slice(0, 10);

    const [result] = await conn.execute(
      `INSERT INTO connections
       (subscriber_id, plan_id, pop_id, status, static_ip, connection_code, billing_cycle_start)
       VALUES (?, ?, ?, 'Pending', ?, ?, ?)`,
      [body.subscriber_id, body.plan_id, body.pop_id, body.static_ip ?? null, code, billingStart]
    );

    const id = result.insertId;
    await auditLog(conn, {
      entityType: 'connection',
      entityId: id,
      action: 'CONNECTION_CREATED',
      newValue: { connection_code: code, subscriber_id: body.subscriber_id },
      actorId: actor.id,
    });

    if (body.static_ip) {
      await auditLog(conn, {
        entityType: 'connection',
        entityId: id,
        action: 'IP_ALLOCATED',
        newValue: { static_ip: body.static_ip },
        actorId: actor.id,
      });
    }

    return fetchConnection(conn, id);
  });
}

export async function getConnection(id) {
  const row = await fetchConnection(getPool(), id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Connection not found');
  return row;
}

export async function updateConnection(id, body, actor) {
  return withTransaction(async (conn) => {
    const existing = await fetchConnection(conn, id);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Connection not found');

    if (body.static_ip !== undefined && body.static_ip !== null && body.static_ip !== '') {
      if (!isValidIpv4(body.static_ip)) {
        throw new ApiError(422, 'INVALID_IP', 'static_ip must be valid IPv4');
      }
    }

    const fields = [];
    const values = [];
    for (const key of ['pop_id', 'plan_id', 'static_ip']) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }
    if (!fields.length) return existing;

    values.push(id);
    try {
      await conn.execute(`UPDATE connections SET ${fields.join(', ')} WHERE id = ?`, values);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        throw new ApiError(409, 'DUPLICATE_IP', 'Static IP already in use');
      }
      throw err;
    }

    if (body.static_ip !== undefined && body.static_ip !== existing.static_ip) {
      await auditLog(conn, {
        entityType: 'connection',
        entityId: id,
        action: body.static_ip ? 'IP_ALLOCATED' : 'IP_RELEASED',
        oldValue: { static_ip: existing.static_ip },
        newValue: { static_ip: body.static_ip },
        actorId: actor.id,
      });
    }

    return fetchConnection(conn, id);
  });
}

export async function changeConnectionStatus(id, status, actor) {
  return withTransaction(async (conn) => {
    const existing = await fetchConnection(conn, id);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Connection not found');

    const from = existing.status;
    if (from === status) return existing;

    if (!canTransitionConnection(from, status)) {
      throw new ApiError(422, 'INVALID_STATUS_TRANSITION', `Cannot transition from ${from} to ${status}`, {
        allowed: from,
      });
    }

    const updates = ['status = ?'];
    const values = [status];

    if (status === 'Active' && !existing.activated_at) {
      updates.push('activated_at = UTC_TIMESTAMP()');
    }
    if (status === 'Terminated') {
      updates.push('terminated_at = UTC_TIMESTAMP()');
      updates.push('static_ip = NULL');
    }

    values.push(id);
    await conn.execute(`UPDATE connections SET ${updates.join(', ')} WHERE id = ?`, values);

    await auditLog(conn, {
      entityType: 'connection',
      entityId: id,
      action: 'STATUS_CHANGED',
      oldValue: { status: from },
      newValue: { status },
      actorId: actor.id,
    });

    if (status === 'Terminated' && existing.static_ip) {
      await auditLog(conn, {
        entityType: 'connection',
        entityId: id,
        action: 'IP_RELEASED',
        oldValue: { static_ip: existing.static_ip },
        newValue: { static_ip: null },
        actorId: actor.id,
      });
    }

    return fetchConnection(conn, id);
  });
}

export async function connectionHistory(id) {
  const connection = await getConnection(id);

  const [audits] = await getPool().execute(
    `SELECT al.*, u.name AS actor_name FROM audit_logs al
     JOIN users u ON u.id = al.actor_id
     WHERE (entity_type = 'connection' AND entity_id = ?)
        OR (entity_type = 'plan_change' AND entity_id IN (SELECT id FROM plan_changes WHERE connection_id = ?))
     ORDER BY al.created_at DESC`,
    [id, id]
  );

  const [billing] = await getPool().execute(
    `SELECT * FROM billing_logs WHERE connection_id = ? ORDER BY created_at DESC`,
    [id]
  );

  const [planChanges] = await getPool().execute(
    `SELECT pc.*, fp.name AS from_plan_name, tp.name AS to_plan_name
     FROM plan_changes pc
     JOIN plans fp ON fp.id = pc.from_plan_id
     JOIN plans tp ON tp.id = pc.to_plan_id
     WHERE pc.connection_id = ?
     ORDER BY pc.created_at DESC`,
    [id]
  );

  const timeline = [
    ...audits.map((a) => ({ kind: 'audit', at: a.created_at, data: a })),
    ...billing.map((b) => ({ kind: 'billing', at: b.created_at, data: b })),
    ...planChanges.map((p) => ({ kind: 'plan_change', at: p.created_at, data: p })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return { connection, timeline, billing, plan_changes: planChanges, audits };
}
