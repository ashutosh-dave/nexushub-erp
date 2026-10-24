import { getPool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { auditLog } from '../utils/audit.js';
import {
  canTransitionWorkflow,
  listWorkflowMoves,
  SLA_HOURS,
  WORKFLOW_STATUSES,
} from '../utils/statusMachines.js';
import { listTicketNotes } from './ticketNoteService.js';
import { parsePagination } from '../utils/pagination.js';
import {
  moveItemStatusRank,
  reorderCrossStatus,
  reorderWithinStatus,
  getOrderedIdsForStatus,
} from './rankService.js';

function padTicketNo(n) {
  return `TK-${String(n).padStart(6, '0')}`;
}

async function nextTicketNo(conn) {
  const [rows] = await conn.execute(`SELECT ticket_no FROM tickets ORDER BY id DESC LIMIT 1`);
  if (!rows[0]) return padTicketNo(1);
  const num = Number.parseInt(String(rows[0].ticket_no).replace('TK-', ''), 10) + 1;
  return padTicketNo(num);
}

function slaDueFromPriority(priority) {
  const hours = SLA_HOURS[priority] ?? 24;
  return new Date(Date.now() + hours * 3600 * 1000);
}

function mapTicketRow(row, extras = {}) {
  const now = Date.now();
  const slaDue = row.sla_due_at ? new Date(row.sla_due_at).getTime() : null;
  let sla_state = 'ok';
  if (row.status !== 'Resolved' && slaDue != null) {
    if (slaDue < now) sla_state = 'breached';
    else if (slaDue - now <= 3600 * 1000) sla_state = 'at_risk';
  }
  return {
    ...row,
    sla_state,
    ...extras,
  };
}

async function countOpenRank(conn) {
  const [[{ c }]] = await conn.query(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'Open'`);
  return Number(c);
}

async function fetchTicketById(conn, id) {
  const [rows] = await conn.execute(
    `SELECT t.*, c.connection_code, c.subscriber_id, c.status AS connection_status,
            s.name AS subscriber_name, p.name AS plan_name, pop.code AS pop_code
     FROM tickets t
     JOIN connections c ON c.id = t.connection_id
     JOIN subscribers s ON s.id = c.subscriber_id
     JOIN plans p ON p.id = c.plan_id
     JOIN pops pop ON pop.id = c.pop_id
     WHERE t.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function fetchTasksForTicket(conn, ticketId) {
  const [rows] = await conn.execute(
    `SELECT tt.*, u.name AS technician_name, tk.ticket_no
     FROM ticket_tasks tt
     LEFT JOIN users u ON u.id = tt.technician_id
     JOIN tickets tk ON tk.id = tt.ticket_id
     WHERE tt.ticket_id = ?
     ORDER BY tt.status, tt.rank_index ASC, tt.id ASC`,
    [ticketId]
  );
  return rows;
}

async function unresolvedTaskBlockers(conn, ticketId) {
  const [rows] = await conn.execute(
    `SELECT id, title, status FROM ticket_tasks WHERE ticket_id = ? AND status != 'Resolved'`,
    [ticketId]
  );
  return rows;
}

export async function listTickets(query) {
  const { page, pageSize, offset } = parsePagination(query);
  const conditions = ['1=1'];
  const params = {};

  if (query.status) {
    conditions.push('t.status = :status');
    params.status = query.status;
  }
  if (query.priority) {
    conditions.push('t.priority = :priority');
    params.priority = query.priority;
  }
  if (query.connectionId) {
    conditions.push('t.connection_id = :connectionId');
    params.connectionId = Number(query.connectionId);
  }
  if (query.slaBreached === 'true' || query.slaBreached === true) {
    conditions.push(`t.status != 'Resolved' AND t.sla_due_at < UTC_TIMESTAMP()`);
  }

  const where = conditions.join(' AND ');
  const [[{ total }]] = await getPool().query(
    `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`,
    params
  );

  const [rows] = await getPool().query(
    `SELECT t.*, c.connection_code, s.name AS subscriber_name,
      (SELECT COUNT(*) FROM ticket_tasks tt WHERE tt.ticket_id = t.id) AS task_count,
      (SELECT COUNT(*) FROM ticket_tasks tt WHERE tt.ticket_id = t.id AND tt.status != 'Resolved') AS open_task_count,
      (SELECT COUNT(*) FROM ticket_tasks tt WHERE tt.ticket_id = t.id AND tt.technician_id IS NULL AND tt.status != 'Resolved') AS unassigned_task_count
     FROM tickets t
     JOIN connections c ON c.id = t.connection_id
     JOIN subscribers s ON s.id = c.subscriber_id
     WHERE ${where}
     ORDER BY t.status, t.rank_index ASC, t.id ASC
     LIMIT :limit OFFSET :offset`,
    { ...params, limit: pageSize, offset }
  );

  return {
    items: rows.map((r) => mapTicketRow(r)),
    meta: { page, pageSize, total: Number(total) },
  };
}

export async function createTicket(payload, actor) {
  return withTransaction(async (conn) => {
    const [connRows] = await conn.execute(`SELECT id, status FROM connections WHERE id = ?`, [
      payload.connection_id,
    ]);
    const connection = connRows[0];
    if (!connection) throw new ApiError(404, 'NOT_FOUND', 'Connection not found');
    if (connection.status === 'Terminated') {
      throw new ApiError(422, 'CONNECTION_TERMINATED', 'Cannot create ticket for terminated connection');
    }

    const ticketNo = await nextTicketNo(conn);
    const rankIndex = await countOpenRank(conn);
    const slaDue = slaDueFromPriority(payload.priority);

    const [result] = await conn.execute(
      `INSERT INTO tickets
       (ticket_no, connection_id, title, description, priority, status, rank_index, created_by, sla_due_at)
       VALUES (?, ?, ?, ?, ?, 'Open', ?, ?, ?)`,
      [
        ticketNo,
        payload.connection_id,
        payload.title,
        payload.description,
        payload.priority,
        rankIndex,
        actor.id,
        slaDue.toISOString().slice(0, 19).replace('T', ' '),
      ]
    );

    const ticketId = result.insertId;
    await auditLog(conn, {
      entityType: 'ticket',
      entityId: ticketId,
      action: 'TICKET_CREATED',
      newValue: { ticket_no: ticketNo, priority: payload.priority },
      actorId: actor.id,
    });

    const ticket = await fetchTicketById(conn, ticketId);
    return mapTicketRow(ticket, { tasks: [], all_tasks_resolved: true });
  });
}

export async function getTicket(id, actor = null) {
  const pool = getPool();
  const ticket = await fetchTicketById(pool, id);
  if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found');
  const tasks = await fetchTasksForTicket(pool, id);
  const openCount = tasks.filter((t) => t.status !== 'Resolved').length;
  const unassignedCount = tasks.filter((t) => !t.technician_id && t.status !== 'Resolved').length;
  const allowBackward = actor ? ['admin', 'support_lead'].includes(actor.role) : true;
  const status_moves = listWorkflowMoves(ticket.status, {
    allowBackward,
    unresolvedTaskCount: openCount,
  });

  let notes = [];
  if (actor) {
    try {
      notes = await listTicketNotes(id, actor);
    } catch {
      notes = [];
    }
  }

  return mapTicketRow(ticket, {
    tasks,
    notes,
    all_tasks_resolved: openCount === 0,
    unassigned_task_count: unassignedCount,
    status_moves,
  });
}

export async function updateTicket(id, payload, actor) {
  return withTransaction(async (conn) => {
    const existing = await fetchTicketById(conn, id);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found');

    const fields = [];
    const values = [];
    if (payload.title !== undefined) {
      fields.push('title = ?');
      values.push(payload.title);
    }
    if (payload.description !== undefined) {
      fields.push('description = ?');
      values.push(payload.description);
    }
    if (payload.priority !== undefined) {
      fields.push('priority = ?');
      values.push(payload.priority);
    }
    if (!fields.length) return getTicket(id);

    values.push(id);
    await conn.execute(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`, values);

    await auditLog(conn, {
      entityType: 'ticket',
      entityId: id,
      action: 'TICKET_UPDATED',
      oldValue: { title: existing.title, priority: existing.priority },
      newValue: payload,
      actorId: actor.id,
    });

    return getTicket(id);
  });
}

export async function changeTicketStatus(id, newStatus, actor) {
  return withTransaction(async (conn) => {
    const ticket = await fetchTicketById(conn, id);
    if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found');

    const from = ticket.status;
    if (from === newStatus) {
      const blockers = await unresolvedTaskBlockers(conn, id);
      return {
        ticket: mapTicketRow(ticket, {
          all_tasks_resolved: blockers.length === 0,
        }),
        all_tasks_resolved: blockers.length === 0,
      };
    }

    const allowBackward = ['admin', 'support_lead'].includes(actor.role);
    if (!canTransitionWorkflow(from, newStatus, { allowBackward })) {
      throw new ApiError(422, 'INVALID_STATUS_TRANSITION', `Cannot transition from ${from} to ${newStatus}`, {
        allowed: WORKFLOW_STATUSES,
        from,
        to: newStatus,
      });
    }

    const blockers = await unresolvedTaskBlockers(conn, id);
    const allTasksResolved = blockers.length === 0;
    if (newStatus === 'Resolved' && !allTasksResolved) {
      throw new ApiError(422, 'TASKS_NOT_RESOLVED', 'Cannot resolve ticket while sub-tasks are open', {
        blockers,
      });
    }

    const resolvedAt =
      newStatus === 'Resolved'
        ? new Date().toISOString().slice(0, 19).replace('T', ' ')
        : null;

    if (newStatus === 'Resolved') {
      await conn.execute(`UPDATE tickets SET resolved_at = ? WHERE id = ?`, [resolvedAt, id]);
    } else if (from === 'Resolved') {
      await conn.execute(`UPDATE tickets SET resolved_at = NULL WHERE id = ?`, [id]);
    }

    await moveItemStatusRank(conn, 'tickets', id, from, newStatus);

    await auditLog(conn, {
      entityType: 'ticket',
      entityId: id,
      action: 'STATUS_CHANGED',
      oldValue: { status: from },
      newValue: { status: newStatus },
      actorId: actor.id,
    });

    const updated = await fetchTicketById(conn, id);
    return {
      ticket: mapTicketRow(updated, { all_tasks_resolved: allTasksResolved }),
      all_tasks_resolved: allTasksResolved,
    };
  });
}

export async function reorderTickets(body, actor) {
  return withTransaction(async (conn) => {
    if (body.status && body.ordered_ids) {
      const ids = body.ordered_ids.map(Number);
      const existing = await getOrderedIdsForStatus(conn, 'tickets', body.status);
      const existingSet = new Set(existing.map(Number));
      if (
        ids.length !== existing.length ||
        new Set(ids).size !== ids.length ||
        !ids.every((id) => existingSet.has(id))
      ) {
        throw new ApiError(422, 'INVALID_REORDER', 'ordered_ids must match all tickets in status');
      }
      await reorderWithinStatus(conn, 'tickets', body.status, ids);
      return { ok: true };
    }

    if (body.id != null && body.to_status != null && body.to_index != null) {
      const ticket = await fetchTicketById(conn, body.id);
      if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found');

      const allowBackward = ['admin', 'support_lead'].includes(actor.role);
      if (ticket.status !== body.to_status) {
        if (!canTransitionWorkflow(ticket.status, body.to_status, { allowBackward })) {
          throw new ApiError(422, 'INVALID_STATUS_TRANSITION', 'Invalid status change via reorder');
        }
        if (body.to_status === 'Resolved') {
          const blockers = await unresolvedTaskBlockers(conn, body.id);
          if (blockers.length) {
            throw new ApiError(422, 'TASKS_NOT_RESOLVED', 'Cannot resolve ticket while sub-tasks are open', {
              blockers,
            });
          }
        }
      }

      const { fromStatus, statusChanged } = await reorderCrossStatus(
        conn,
        'tickets',
        body.id,
        body.to_status,
        body.to_index
      );

      if (body.to_status === 'Resolved') {
        await conn.execute(
          `UPDATE tickets SET resolved_at = UTC_TIMESTAMP() WHERE id = ?`,
          [body.id]
        );
      }

      if (statusChanged) {
        await auditLog(conn, {
          entityType: 'ticket',
          entityId: body.id,
          action: 'RANK_CHANGED',
          oldValue: { status: fromStatus },
          newValue: { status: body.to_status, to_index: body.to_index },
          actorId: actor.id,
        });
        await auditLog(conn, {
          entityType: 'ticket',
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
