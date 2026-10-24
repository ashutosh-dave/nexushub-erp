import { getPool } from '../config/db.js';
import { parsePagination } from '../utils/pagination.js';

export async function listAuditLogs(query) {
  const { page, pageSize, offset } = parsePagination(query);
  const conditions = ['1=1'];
  const params = {};

  if (query.entity_type) {
    conditions.push('al.entity_type = :entity_type');
    params.entity_type = query.entity_type;
  }
  if (query.entity_id) {
    conditions.push('al.entity_id = :entity_id');
    params.entity_id = Number(query.entity_id);
  }
  if (query.actor_id) {
    conditions.push('al.actor_id = :actor_id');
    params.actor_id = Number(query.actor_id);
  }
  if (query.from) {
    conditions.push('al.created_at >= :from');
    params.from = query.from;
  }
  if (query.to) {
    conditions.push('al.created_at <= :to');
    params.to = query.to;
  }

  const where = conditions.join(' AND ');
  const [[{ total }]] = await getPool().query(
    `SELECT COUNT(*) AS total FROM audit_logs al WHERE ${where}`,
    params
  );

  const [rows] = await getPool().query(
    `SELECT al.*, u.name AS actor_name, u.email AS actor_email
     FROM audit_logs al
     JOIN users u ON u.id = al.actor_id
     WHERE ${where}
     ORDER BY al.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { ...params, limit: pageSize, offset }
  );

  return {
    items: rows,
    meta: { page, pageSize, total: Number(total) },
  };
}
