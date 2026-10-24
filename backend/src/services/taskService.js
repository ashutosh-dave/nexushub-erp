import { getPool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { auditLog } from '../utils/audit.js';
import { canTransitionWorkflow, WORKFLOW_STATUSES } from '../utils/statusMachines.js';
import { findOverlappingTasks, windowContainedInShift } from '../utils/overlap.js';
import { parsePagination } from '../utils/pagination.js';
import {
  moveItemStatusRank,
  reorderCrossStatus,
  reorderWithinStatus,
  getOrderedIdsForStatus,
} from './rankService.js';

async function fetchTask(conn, id) {
  const [rows] = await conn.execute(
    `SELECT tt.*, tk.ticket_no, u.name AS technician_name
     FROM ticket_tasks tt
     JOIN tickets tk ON tk.id = tt.ticket_id
     LEFT JOIN users u ON u.id = tt.technician_id
     WHERE tt.id = ?`,
    [id]
  );
  return rows[0] || null;
}

function assertFutureWindow(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (!(e > s)) {
    throw new ApiError(422, 'INVALID_WINDOW', 'window_end must be after window_start');
  }
  if (e.getTime() < Date.now()) {
    throw new ApiError(422, 'INVALID_WINDOW', 'Assignment window cannot be in the past');
  }
}

async function lockTechnician(conn, technicianId) {
  const [rows] = await conn.execute(
    `SELECT id, role, is_active FROM users WHERE id = ? FOR UPDATE`,
    [technicianId]
  );
  const user = rows[0];
  if (!user || user.role !== 'technician' || !user.is_active) {
    throw new ApiError(422, 'INVALID_TECHNICIAN', 'Technician not found or inactive');
  }
  return user;
}

async function loadTechnicianTasks(conn, technicianId, excludeTaskId = null) {
  const [rows] = await conn.execute(
    `SELECT tt.id, tt.status, tt.window_start, tt.window_end, tk.ticket_no
     FROM ticket_tasks tt
     JOIN tickets tk ON tk.id = tt.ticket_id
     WHERE tt.technician_id = ?`,
    [technicianId]
  );
  return excludeTaskId != null
    ? rows.filter((r) => Number(r.id) !== Number(excludeTaskId))
    : rows;
}

async function loadShiftsForDate(conn, technicianId, dateStr) {
  const [rows] = await conn.execute(
    `SELECT id, shift_date, start_time, end_time FROM technician_shifts
     WHERE technician_id = ? AND shift_date = ?`,
    [technicianId, dateStr]
  );
  return rows;
}

async function validateAssignment(conn, taskId, technicianId, windowStart, windowEnd) {
  assertFutureWindow(windowStart, windowEnd);
  await lockTechnician(conn, technicianId);

  const existing = await loadTechnicianTasks(conn, technicianId, taskId);
  const conflicts = findOverlappingTasks(existing, { start: windowStart, end: windowEnd }, taskId);
  if (conflicts.length) {
    throw new ApiError(409, 'SCHEDULE_OVERLAP', 'Technician has overlapping tasks', {
      conflicts: conflicts.map((c) => ({
        task_id: c.id,
        ticket_no: c.ticket_no,
        window_start: c.window_start,
        window_end: c.window_end,
      })),
    });
  }

  const dateStr = new Date(windowStart).toISOString().slice(0, 10);
  const shifts = await loadShiftsForDate(conn, technicianId, dateStr);
  const contained = shifts.some((sh) => windowContainedInShift(windowStart, windowEnd, sh));
  if (!contained) {
    throw new ApiError(409, 'SHIFT_VIOLATION', 'Window is not contained in technician shift', {
      shift_date: dateStr,
      shifts,
    });
  }
}

function sameWindow(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return new Date(aStart).getTime() === new Date(bStart).getTime() &&
    new Date(aEnd).getTime() === new Date(bEnd).getTime();
}

export async function listTasks(query, actor) {
  const { page, pageSize, offset } = parsePagination(query);
  const conditions = ['1=1'];
  const params = {};

  if (actor.role === 'technician') {
    conditions.push('tt.technician_id = :technicianId');
    params.technicianId = actor.id;
  } else if (query.technicianId) {
    conditions.push('tt.technician_id = :technicianId');
    params.technicianId = Number(query.technicianId);
  }
  if (query.status) {
    conditions.push('tt.status = :status');
    params.status = query.status;
  }
  if (query.ticketId) {
    conditions.push('tt.ticket_id = :ticketId');
    params.ticketId = Number(query.ticketId);
  }
  if (query.from) {
    conditions.push('tt.window_start >= :from');
    params.from = query.from;
  }
  if (query.to) {
    conditions.push('tt.window_end <= :to');
    params.to = query.to;
  }

  const where = conditions.join(' AND ');
  const [[{ total }]] = await getPool().query(
    `SELECT COUNT(*) AS total FROM ticket_tasks tt WHERE ${where}`,
    params
  );

  const [rows] = await getPool().query(
    `SELECT tt.*, tk.ticket_no, u.name AS technician_name
     FROM ticket_tasks tt
     JOIN tickets tk ON tk.id = tt.ticket_id
     LEFT JOIN users u ON u.id = tt.technician_id
     WHERE ${where}
     ORDER BY tt.status, tt.rank_index ASC, tt.id ASC
     LIMIT :limit OFFSET :offset`,
    { ...params, limit: pageSize, offset }
  );

  return {
    items: rows,
    meta: { page, pageSize, total: Number(total) },
  };
}

export async function createTasks(ticketId, payload, actor) {
  const items = Array.isArray(payload) ? payload : [payload];
  return withTransaction(async (conn) => {
    const [tickets] = await conn.execute(`SELECT id FROM tickets WHERE id = ?`, [ticketId]);
    if (!tickets[0]) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found');

    const created = [];
    for (const item of items) {
      const [[{ c }]] = await conn.query(
        `SELECT COUNT(*) AS c FROM ticket_tasks WHERE status = 'Open'`
      );
      const rankIndex = Number(c);
      const [r] = await conn.execute(
        `INSERT INTO ticket_tasks
         (ticket_id, title, task_type, description, status, rank_index)
         VALUES (?, ?, ?, ?, 'Open', ?)`,
        [ticketId, item.title, item.task_type, item.description ?? null, rankIndex]
      );
      created.push(await fetchTask(conn, r.insertId));
      await auditLog(conn, {
        entityType: 'ticket_task',
        entityId: r.insertId,
        action: 'TASK_CREATED',
        newValue: { ticket_id: ticketId, title: item.title },
        actorId: actor.id,
      });
    }
    return created;
  });
}

export async function updateTask(id, payload, actor) {
  return withTransaction(async (conn) => {
    const task = await fetchTask(conn, id);
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'Task not found');

    const fields = [];
    const values = [];
    if (payload.title !== undefined) {
      fields.push('title = ?');
      values.push(payload.title);
    }
    if (payload.task_type !== undefined) {
      fields.push('task_type = ?');
      values.push(payload.task_type);
    }
    if (payload.description !== undefined) {
      fields.push('description = ?');
      values.push(payload.description);
    }
    if (!fields.length) return task;

    values.push(id);
    await conn.execute(`UPDATE ticket_tasks SET ${fields.join(', ')} WHERE id = ?`, values);

    await auditLog(conn, {
      entityType: 'ticket_task',
      entityId: id,
      action: 'TASK_UPDATED',
      oldValue: { title: task.title, task_type: task.task_type },
      newValue: payload,
      actorId: actor.id,
    });

    return fetchTask(conn, id);
  });
}

export async function assignTask(id, body, actor) {
  return withTransaction(async (conn) => {
    const task = await fetchTask(conn, id);
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'Task not found');

    const newTechId = body.technician_id ?? null;
    const newStart = body.window_start ?? null;
    const newEnd = body.window_end ?? null;

    if (newTechId == null) {
      const hadAssignment = task.technician_id != null;
      await conn.execute(
        `UPDATE ticket_tasks SET technician_id = NULL, window_start = NULL, window_end = NULL WHERE id = ?`,
        [id]
      );
      if (hadAssignment) {
        await auditLog(conn, {
          entityType: 'ticket_task',
          entityId: id,
          action: 'TECH_UNASSIGNED',
          oldValue: {
            technician_id: task.technician_id,
            window_start: task.window_start,
            window_end: task.window_end,
          },
          newValue: null,
          actorId: actor.id,
        });
      }
      return fetchTask(conn, id);
    }

    if (!newStart || !newEnd) {
      throw new ApiError(422, 'INVALID_WINDOW', 'window_start and window_end required when assigning');
    }

    if (
      Number(task.technician_id) === Number(newTechId) &&
      sameWindow(task.window_start, task.window_end, newStart, newEnd)
    ) {
      return task;
    }

    await validateAssignment(conn, id, newTechId, newStart, newEnd);

    const isReschedule =
      task.technician_id != null &&
      Number(task.technician_id) === Number(newTechId) &&
      !sameWindow(task.window_start, task.window_end, newStart, newEnd);
    const isReassign = task.technician_id != null && Number(task.technician_id) !== Number(newTechId);
    const isAssign = task.technician_id == null;

    await conn.execute(
      `UPDATE ticket_tasks SET technician_id = ?, window_start = ?, window_end = ? WHERE id = ?`,
      [
        newTechId,
        new Date(newStart).toISOString().slice(0, 19).replace('T', ' '),
        new Date(newEnd).toISOString().slice(0, 19).replace('T', ' '),
        id,
      ]
    );

    let action = 'TECH_ASSIGNED';
    if (isReschedule) action = 'TASK_RESCHEDULED';
    else if (isReassign) action = 'TECH_REASSIGNED';

    await auditLog(conn, {
      entityType: 'ticket_task',
      entityId: id,
      action,
      oldValue: {
        technician_id: task.technician_id,
        window_start: task.window_start,
        window_end: task.window_end,
      },
      newValue: { technician_id: newTechId, window_start: newStart, window_end: newEnd },
      actorId: actor.id,
    });

    return fetchTask(conn, id);
  });
}

export async function changeTaskStatus(id, newStatus, actor) {
  return withTransaction(async (conn) => {
    const task = await fetchTask(conn, id);
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'Task not found');

    if (actor.role === 'technician' && Number(task.technician_id) !== Number(actor.id)) {
      throw new ApiError(403, 'FORBIDDEN', 'Technicians may only update their own tasks');
    }

    const from = task.status;
    if (from === newStatus) return task;

    const allowBackward = ['admin', 'support_lead'].includes(actor.role);
    if (!canTransitionWorkflow(from, newStatus, { allowBackward })) {
      throw new ApiError(
        422,
        'INVALID_STATUS_TRANSITION',
        `Cannot move from ${from} to ${newStatus}. Advance one step at a time: Open → In-Progress → Field Visit → Resolved.`,
        { allowed: WORKFLOW_STATUSES, from, to: newStatus }
      );
    }

    if (from === 'Open' && newStatus !== 'Open') {
      if (!task.technician_id || !task.window_start || !task.window_end) {
        throw new ApiError(
          422,
          'TASK_UNASSIGNED',
          'This task still needs a technician and time window before you can start it. Ask a lead to assign it on Dispatch.'
        );
      }
    }

    if (newStatus === 'Resolved') {
      await conn.execute(
        `UPDATE ticket_tasks SET resolved_at = UTC_TIMESTAMP() WHERE id = ?`,
        [id]
      );
    } else if (from === 'Resolved') {
      await conn.execute(`UPDATE ticket_tasks SET resolved_at = NULL WHERE id = ?`, [id]);
    }

    await moveItemStatusRank(conn, 'ticket_tasks', id, from, newStatus);

    await auditLog(conn, {
      entityType: 'ticket_task',
      entityId: id,
      action: 'STATUS_CHANGED',
      oldValue: { status: from },
      newValue: { status: newStatus },
      actorId: actor.id,
    });

    return fetchTask(conn, id);
  });
}

export async function reorderTasks(body, actor) {
  return withTransaction(async (conn) => {
    if (body.status && body.ordered_ids) {
      const ids = body.ordered_ids.map(Number);
      const existing = await getOrderedIdsForStatus(conn, 'ticket_tasks', body.status);
      const existingSet = new Set(existing.map(Number));
      if (
        ids.length !== existing.length ||
        new Set(ids).size !== ids.length ||
        !ids.every((id) => existingSet.has(id))
      ) {
        throw new ApiError(422, 'INVALID_REORDER', 'ordered_ids must match all tasks in status');
      }
      await reorderWithinStatus(conn, 'ticket_tasks', body.status, ids);
      return { ok: true };
    }

    if (body.id != null && body.to_status != null && body.to_index != null) {
      const task = await fetchTask(conn, body.id);
      if (!task) throw new ApiError(404, 'NOT_FOUND', 'Task not found');

      const allowBackward = ['admin', 'support_lead'].includes(actor.role);
      if (task.status !== body.to_status) {
        if (!canTransitionWorkflow(task.status, body.to_status, { allowBackward })) {
          throw new ApiError(422, 'INVALID_STATUS_TRANSITION', 'Invalid status change via reorder');
        }
        if (task.status === 'Open' && body.to_status !== 'Open') {
          if (!task.technician_id || !task.window_start || !task.window_end) {
            throw new ApiError(422, 'TASK_UNASSIGNED', 'Task must have technician and window before leaving Open');
          }
        }
      }

      const { fromStatus, statusChanged } = await reorderCrossStatus(
        conn,
        'ticket_tasks',
        body.id,
        body.to_status,
        body.to_index
      );

      if (body.to_status === 'Resolved') {
        await conn.execute(`UPDATE ticket_tasks SET resolved_at = UTC_TIMESTAMP() WHERE id = ?`, [body.id]);
      }

      if (statusChanged) {
        await auditLog(conn, {
          entityType: 'ticket_task',
          entityId: body.id,
          action: 'RANK_CHANGED',
          oldValue: { status: fromStatus },
          newValue: { status: body.to_status, to_index: body.to_index },
          actorId: actor.id,
        });
        await auditLog(conn, {
          entityType: 'ticket_task',
          entityId: body.id,
          action: 'STATUS_CHANGED',
          oldValue: { status: fromStatus },
          newValue: { status: body.to_status },
          actorId: actor.id,
        });
      }

      return { ok: true };
    }

    throw new ApiError(422, 'VALIDATION_ERROR', 'Provide { status, ordered_ids } or { id, to_status, to_index }');
  });
}
