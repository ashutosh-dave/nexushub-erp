import { getPool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { findOverlappingTasks, windowContainedInShift } from '../utils/overlap.js';

export async function listTechnicians() {
  const [rows] = await getPool().query(
    `SELECT u.id, u.name, u.email,
      (SELECT COUNT(*) FROM ticket_tasks tt WHERE tt.technician_id = u.id AND tt.status != 'Resolved') AS open_tasks,
      (SELECT COUNT(*) FROM ticket_tasks tt WHERE tt.technician_id = u.id AND tt.status != 'Resolved'
        AND tt.window_start IS NOT NULL AND DATE(tt.window_start) = UTC_DATE()) AS tasks_today
     FROM users u
     WHERE u.role = 'technician' AND u.is_active = 1
     ORDER BY u.name`
  );
  return rows;
}

export async function listAvailable(start, end) {
  assertFutureWindow(start, end);
  const dateStr = new Date(start).toISOString().slice(0, 10);
  const [techs] = await getPool().query(
    `SELECT u.id, u.name, u.email FROM users u WHERE u.role = 'technician' AND u.is_active = 1`
  );

  const available = [];
  for (const tech of techs) {
    const [shifts] = await getPool().execute(
      `SELECT * FROM technician_shifts WHERE technician_id = ? AND shift_date = ?`,
      [tech.id, dateStr]
    );
    const onShift = shifts.some((sh) => windowContainedInShift(start, end, sh));
    if (!onShift) continue;

    const [tasks] = await getPool().execute(
      `SELECT tt.id, tt.status, tt.window_start, tt.window_end, tk.ticket_no
       FROM ticket_tasks tt
       JOIN tickets tk ON tk.id = tt.ticket_id
       WHERE tt.technician_id = ?`,
      [tech.id]
    );
    const conflicts = findOverlappingTasks(tasks, { start, end });
    if (!conflicts.length) {
      available.push(tech);
    }
  }
  return available;
}

function assertFutureWindow(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (!(e > s)) {
    throw new ApiError(422, 'INVALID_WINDOW', 'end must be after start');
  }
}

export async function getSchedule(technicianId, from, to) {
  const [userRows] = await getPool().execute(
    `SELECT id, name FROM users WHERE id = ? AND role = 'technician'`,
    [technicianId]
  );
  if (!userRows[0]) throw new ApiError(404, 'NOT_FOUND', 'Technician not found');

  const [shifts] = await getPool().execute(
    `SELECT * FROM technician_shifts
     WHERE technician_id = ? AND shift_date >= ? AND shift_date <= ?
     ORDER BY shift_date, start_time`,
    [technicianId, from, to]
  );

  const [tasks] = await getPool().execute(
    `SELECT tt.*, tk.ticket_no
     FROM ticket_tasks tt
     JOIN tickets tk ON tk.id = tt.ticket_id
     WHERE tt.technician_id = ?
       AND tt.window_start IS NOT NULL
       AND DATE(tt.window_start) >= ?
       AND DATE(tt.window_start) <= ?
     ORDER BY tt.window_start`,
    [technicianId, from, to]
  );

  return { technician: userRows[0], shifts, tasks };
}

export async function createShift(technicianId, body) {
  return withTransaction(async (conn) => {
    const [users] = await conn.execute(
      `SELECT id FROM users WHERE id = ? AND role = 'technician' AND is_active = 1`,
      [technicianId]
    );
    if (!users[0]) throw new ApiError(404, 'NOT_FOUND', 'Technician not found');

    const start = String(body.start_time);
    const end = String(body.end_time);
    if (start >= end) {
      throw new ApiError(422, 'INVALID_SHIFT', 'Shift end must be after start (shifts do not cross midnight)');
    }

    const [result] = await conn.execute(
      `INSERT INTO technician_shifts (technician_id, shift_date, start_time, end_time)
       VALUES (?, ?, ?, ?)`,
      [technicianId, body.shift_date, start, end]
    );

    const [rows] = await conn.execute(`SELECT * FROM technician_shifts WHERE id = ?`, [result.insertId]);
    return rows[0];
  });
}

export async function deleteShift(shiftId) {
  return withTransaction(async (conn) => {
    const [shifts] = await conn.execute(`SELECT * FROM technician_shifts WHERE id = ?`, [shiftId]);
    const shift = shifts[0];
    if (!shift) throw new ApiError(404, 'NOT_FOUND', 'Shift not found');

    const [assignedDuringShift] = await conn.execute(
      `SELECT tt.id, tt.title, tt.window_start, tt.window_end
       FROM ticket_tasks tt
       WHERE tt.technician_id = ?
         AND tt.status != 'Resolved'
         AND tt.window_start IS NOT NULL
         AND DATE(tt.window_start) = ?
         AND TIME(tt.window_start) >= ?
         AND TIME(tt.window_end) <= ?`,
      [shift.technician_id, shift.shift_date, shift.start_time, shift.end_time]
    );

    if (assignedDuringShift.length) {
      throw new ApiError(409, 'SHIFT_HAS_TASKS', 'Cannot delete shift with assigned tasks in this window', {
        tasks: assignedDuringShift,
      });
    }

    await conn.execute(`DELETE FROM technician_shifts WHERE id = ?`, [shiftId]);
    return { deleted: true };
  });
}
