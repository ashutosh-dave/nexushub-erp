import { getPool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';

export async function listPops() {
  const [rows] = await getPool().query(
    `SELECT pop.*,
       COALESCE(SUM(CASE WHEN c.status = 'Active' THEN pl.speed_mbps ELSE 0 END), 0) AS allocated_mbps,
       CASE WHEN pop.capacity_mbps > 0
         THEN ROUND(COALESCE(SUM(CASE WHEN c.status = 'Active' THEN pl.speed_mbps ELSE 0 END), 0) / pop.capacity_mbps * 100, 1)
         ELSE 0 END AS utilisation_pct
     FROM pops pop
     LEFT JOIN connections c ON c.pop_id = pop.id
     LEFT JOIN plans pl ON pl.id = c.plan_id
     GROUP BY pop.id
     ORDER BY pop.code`
  );
  return rows.map((r) => ({
    ...r,
    over_capacity: Number(r.allocated_mbps) > Number(r.capacity_mbps),
  }));
}

export async function createPop(body) {
  return withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `INSERT INTO pops (code, name, city, capacity_mbps) VALUES (?, ?, ?, ?)`,
      [body.code, body.name, body.city, body.capacity_mbps]
    );
    const [rows] = await conn.execute(`SELECT * FROM pops WHERE id = ?`, [result.insertId]);
    return rows[0];
  });
}

export async function updatePop(id, body) {
  return withTransaction(async (conn) => {
    const [existing] = await conn.execute(`SELECT * FROM pops WHERE id = ?`, [id]);
    if (!existing[0]) throw new ApiError(404, 'NOT_FOUND', 'POP not found');

    const fields = [];
    const values = [];
    for (const key of ['code', 'name', 'city', 'capacity_mbps']) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }
    if (!fields.length) return existing[0];

    values.push(id);
    await conn.execute(`UPDATE pops SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await conn.execute(`SELECT * FROM pops WHERE id = ?`, [id]);
    return rows[0];
  });
}
