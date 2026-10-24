/**
 * Append-only audit writer. Must be called inside an open transaction.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{ entityType: string, entityId: number|string, action: string, oldValue?: unknown, newValue?: unknown, actorId: number }} payload
 */
export async function auditLog(conn, payload) {
  const { entityType, entityId, action, oldValue = null, newValue = null, actorId } = payload;
  await conn.execute(
    `INSERT INTO audit_logs (entity_type, entity_id, action, old_value, new_value, actor_id)
     VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)`,
    [
      entityType,
      entityId,
      action,
      oldValue == null ? null : JSON.stringify(oldValue),
      newValue == null ? null : JSON.stringify(newValue),
      actorId,
    ]
  );
}
