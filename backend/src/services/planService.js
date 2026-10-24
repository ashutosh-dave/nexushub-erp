import { getPool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';

export async function listPlans(query, actor) {
  const conditions = ['1=1'];
  const params = {};
  if (actor?.role === 'buyer') {
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

export async function createPlan(body) {
  return withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `INSERT INTO plans (name, segment, speed_mbps, data_cap_gb, monthly_price, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.segment,
        body.speed_mbps,
        body.data_cap_gb ?? null,
        body.monthly_price,
        body.is_active ?? 1,
      ]
    );
    const [rows] = await conn.execute(`SELECT * FROM plans WHERE id = ?`, [result.insertId]);
    return rows[0];
  });
}

export async function updatePlan(id, body) {
  return withTransaction(async (conn) => {
    const [existing] = await conn.execute(`SELECT * FROM plans WHERE id = ?`, [id]);
    if (!existing[0]) throw new ApiError(404, 'NOT_FOUND', 'Plan not found');

    const fields = [];
    const values = [];
    for (const key of ['name', 'segment', 'speed_mbps', 'data_cap_gb', 'monthly_price', 'is_active']) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }
    if (!fields.length) return existing[0];

    values.push(id);
    await conn.execute(`UPDATE plans SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await conn.execute(`SELECT * FROM plans WHERE id = ?`, [id]);
    return rows[0];
  });
}
