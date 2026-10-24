const TABLE_MAP = {
  tickets: { table: 'tickets', statusCol: 'status', idCol: 'id' },
  ticket_tasks: { table: 'ticket_tasks', statusCol: 'status', idCol: 'id' },
};

/**
 * Pure: map ordered ids to contiguous rank_index starting at 0.
 * @param {Array<number|string>} orderedIds
 * @returns {Array<{ id: number, rank_index: number }>}
 */
export function compactRankAssignments(orderedIds) {
  return orderedIds.map((id, rank_index) => ({ id: Number(id), rank_index }));
}

/**
 * Pure: remove id from order, insert at toIndex (clamped), return new order.
 * @param {Array<number|string>} orderedIds
 * @param {number|string} movedId
 * @param {number} toIndex
 */
export function insertAtRank(orderedIds, movedId, toIndex) {
  const mid = Number(movedId);
  const rest = orderedIds.map(Number).filter((id) => id !== mid);
  const idx = Math.max(0, Math.min(toIndex, rest.length));
  rest.splice(idx, 0, mid);
  return rest;
}

/**
 * Pure: after removing one id, compact remaining order (identity if already contiguous).
 * @param {Array<number|string>} orderedIds
 * @param {number|string} removedId
 */
export function orderAfterRemoval(orderedIds, removedId) {
  return orderedIds.map(Number).filter((id) => id !== Number(removedId));
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {'tickets'|'ticket_tasks'} entityType
 * @param {string} status
 */
export async function getOrderedIdsForStatus(conn, entityType, status) {
  const { table, statusCol, idCol } = TABLE_MAP[entityType];
  const [rows] = await conn.execute(
    `SELECT ${idCol} AS id FROM ${table} WHERE ${statusCol} = ? ORDER BY rank_index ASC, id ASC`,
    [status]
  );
  return rows.map((r) => r.id);
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {'tickets'|'ticket_tasks'} entityType
 * @param {string} status
 */
export async function recompactStatusColumn(conn, entityType, status) {
  const ids = await getOrderedIdsForStatus(conn, entityType, status);
  const assignments = compactRankAssignments(ids);
  const { table, idCol } = TABLE_MAP[entityType];
  for (const { id, rank_index } of assignments) {
    await conn.execute(`UPDATE ${table} SET rank_index = ? WHERE ${idCol} = ?`, [rank_index, id]);
  }
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {'tickets'|'ticket_tasks'} entityType
 * @param {number} itemId
 * @param {string} toStatus
 */
export async function appendToStatusColumn(conn, entityType, itemId, toStatus) {
  const ids = await getOrderedIdsForStatus(conn, entityType, toStatus);
  const newRank = ids.filter((id) => Number(id) !== Number(itemId)).length;
  const { table, statusCol, idCol } = TABLE_MAP[entityType];
  await conn.execute(`UPDATE ${table} SET ${statusCol} = ?, rank_index = ? WHERE ${idCol} = ?`, [
    toStatus,
    newRank,
    itemId,
  ]);
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {'tickets'|'ticket_tasks'} entityType
 * @param {number} itemId
 * @param {string} fromStatus
 * @param {string} toStatus
 */
export async function moveItemStatusRank(conn, entityType, itemId, fromStatus, toStatus) {
  if (fromStatus === toStatus) return;
  await appendToStatusColumn(conn, entityType, itemId, toStatus);
  await recompactStatusColumn(conn, entityType, fromStatus);
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {'tickets'|'ticket_tasks'} entityType
 * @param {string} status
 * @param {Array<number|string>} orderedIds
 */
export async function reorderWithinStatus(conn, entityType, status, orderedIds) {
  const assignments = compactRankAssignments(orderedIds);
  const { table, idCol, statusCol } = TABLE_MAP[entityType];
  for (const { id, rank_index } of assignments) {
    await conn.execute(
      `UPDATE ${table} SET rank_index = ? WHERE ${idCol} = ? AND ${statusCol} = ?`,
      [rank_index, id, status]
    );
  }
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {'tickets'|'ticket_tasks'} entityType
 * @param {number} itemId
 * @param {string} toStatus
 * @param {number} toIndex
 * @returns {{ fromStatus: string, statusChanged: boolean }}
 */
export async function reorderCrossStatus(conn, entityType, itemId, toStatus, toIndex) {
  const { table, statusCol, idCol } = TABLE_MAP[entityType];
  const [rows] = await conn.execute(`SELECT ${statusCol} AS status FROM ${table} WHERE ${idCol} = ?`, [
    itemId,
  ]);
  const row = rows[0];
  if (!row) throw new Error('Item not found for reorder');
  const fromStatus = row.status;
  const destIds = await getOrderedIdsForStatus(conn, entityType, toStatus);
  const without = destIds.map(Number).filter((id) => id !== Number(itemId));
  const newOrder = insertAtRank(without, itemId, toIndex);
  await conn.execute(`UPDATE ${table} SET ${statusCol} = ? WHERE ${idCol} = ?`, [toStatus, itemId]);
  await reorderWithinStatus(conn, entityType, toStatus, newOrder);
  if (fromStatus !== toStatus) {
    await recompactStatusColumn(conn, entityType, fromStatus);
  }
  return { fromStatus, statusChanged: fromStatus !== toStatus };
}
