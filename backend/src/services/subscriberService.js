import { getPool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { auditLog } from '../utils/audit.js';
import { parsePagination, parseMultiSort, sortClause } from '../utils/pagination.js';

const SUBSCRIBER_SORT = ['name', 'type', 'email', 'created_at'];

export async function listSubscribers(query) {
  const { page, pageSize, offset } = parsePagination(query);
  const conditions = ['1=1'];
  const params = {};

  if (query.type) {
    conditions.push('s.type = :type');
    params.type = query.type;
  }
  if (query.search) {
    conditions.push('(s.name LIKE :search OR s.email LIKE :search OR s.phone LIKE :search)');
    params.search = `%${query.search}%`;
  }
  if (query.status) {
    conditions.push(
      `EXISTS (SELECT 1 FROM connections c WHERE c.subscriber_id = s.id AND c.status = :status)`
    );
    params.status = query.status;
  }
  if (query.popId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM connections c WHERE c.subscriber_id = s.id AND c.pop_id = :popId)`
    );
    params.popId = Number(query.popId);
  }
  if (query.planId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM connections c WHERE c.subscriber_id = s.id AND c.plan_id = :planId)`
    );
    params.planId = Number(query.planId);
  }

  const sortParts = parseMultiSort(query.sortBy, query.sortDir, SUBSCRIBER_SORT, [
    { col: 'created_at', dir: 'DESC' },
  ]).map(({ col, dir }) => ({ col: `s.${col}`, dir }));

  const where = conditions.join(' AND ');
  const [[{ total }]] = await getPool().query(
    `SELECT COUNT(*) AS total FROM subscribers s WHERE ${where}`,
    params
  );

  const order = sortClause(sortParts);
  const [rows] = await getPool().query(
    `SELECT s.*,
       (SELECT COUNT(*) FROM connections c WHERE c.subscriber_id = s.id) AS connection_count,
       (SELECT c.status FROM connections c WHERE c.subscriber_id = s.id ORDER BY c.created_at DESC LIMIT 1) AS latest_connection_status,
       (SELECT p.name FROM connections c JOIN plans p ON p.id = c.plan_id WHERE c.subscriber_id = s.id ORDER BY c.created_at DESC LIMIT 1) AS latest_plan_name,
       (SELECT pop.code FROM connections c JOIN pops pop ON pop.id = c.pop_id WHERE c.subscriber_id = s.id ORDER BY c.created_at DESC LIMIT 1) AS latest_pop_code,
       (SELECT c.static_ip FROM connections c WHERE c.subscriber_id = s.id ORDER BY c.created_at DESC LIMIT 1) AS latest_static_ip
     FROM subscribers s
     WHERE ${where}
     ORDER BY ${order}
     LIMIT :limit OFFSET :offset`,
    { ...params, limit: pageSize, offset }
  );

  return { items: rows, meta: { page, pageSize, total: Number(total) } };
}

export async function createSubscriber(body, actor) {
  return withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `INSERT INTO subscribers (name, type, email, phone, address, company_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [body.name, body.type, body.email, body.phone, body.address, body.company_name ?? null]
    );
    const id = result.insertId;
    await auditLog(conn, {
      entityType: 'subscriber',
      entityId: id,
      action: 'SUBSCRIBER_CREATED',
      newValue: body,
      actorId: actor.id,
    });
    const [rows] = await conn.execute(`SELECT * FROM subscribers WHERE id = ?`, [id]);
    return rows[0];
  });
}

export async function getSubscriber(id) {
  const [rows] = await getPool().execute(`SELECT * FROM subscribers WHERE id = ?`, [id]);
  if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Subscriber not found');

  const [connections] = await getPool().execute(
    `SELECT c.*, p.name AS plan_name, pop.code AS pop_code, pop.name AS pop_name
     FROM connections c
     JOIN plans p ON p.id = c.plan_id
     JOIN pops pop ON pop.id = c.pop_id
     WHERE c.subscriber_id = ?
     ORDER BY c.created_at DESC`,
    [id]
  );

  return { ...rows[0], connections };
}

export async function updateSubscriber(id, body, actor) {
  return withTransaction(async (conn) => {
    const [existing] = await conn.execute(`SELECT * FROM subscribers WHERE id = ?`, [id]);
    if (!existing[0]) throw new ApiError(404, 'NOT_FOUND', 'Subscriber not found');

    const fields = [];
    const values = [];
    for (const key of ['name', 'type', 'email', 'phone', 'address', 'company_name']) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }
    if (!fields.length) return getSubscriber(id);

    values.push(id);
    await conn.execute(`UPDATE subscribers SET ${fields.join(', ')} WHERE id = ?`, values);

    await auditLog(conn, {
      entityType: 'subscriber',
      entityId: id,
      action: 'SUBSCRIBER_UPDATED',
      oldValue: existing[0],
      newValue: body,
      actorId: actor.id,
    });

    return getSubscriber(id);
  });
}
