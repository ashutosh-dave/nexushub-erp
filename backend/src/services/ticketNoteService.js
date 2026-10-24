import { getPool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { auditLog } from '../utils/audit.js';

async function ticketExists(conn, ticketId) {
  const [rows] = await conn.execute(`SELECT id FROM tickets WHERE id = ?`, [ticketId]);
  return Boolean(rows[0]);
}

async function technicianAssignedToTicket(conn, ticketId, technicianId) {
  const [rows] = await conn.execute(
    `SELECT id FROM ticket_tasks WHERE ticket_id = ? AND technician_id = ? LIMIT 1`,
    [ticketId, technicianId]
  );
  return Boolean(rows[0]);
}

/**
 * Support roles + admin always; technicians only if assigned to a sub-task on the ticket.
 */
export async function assertCanAccessNotes(ticketId, actor) {
  const pool = getPool();
  if (!(await ticketExists(pool, ticketId))) {
    throw new ApiError(404, 'NOT_FOUND', 'Ticket not found');
  }
  if (['admin', 'support_lead', 'support_agent'].includes(actor.role)) return;
  if (actor.role === 'technician') {
    if (await technicianAssignedToTicket(pool, ticketId, actor.id)) return;
    throw new ApiError(403, 'FORBIDDEN', 'You can only note on tickets with your assigned tasks');
  }
  throw new ApiError(403, 'FORBIDDEN', 'Insufficient permissions');
}

export async function listTicketNotes(ticketId, actor) {
  await assertCanAccessNotes(ticketId, actor);
  const [rows] = await getPool().execute(
    `SELECT n.id, n.ticket_id, n.body, n.created_at, n.author_id, u.name AS author_name, u.role AS author_role
     FROM ticket_notes n
     JOIN users u ON u.id = n.author_id
     WHERE n.ticket_id = ?
     ORDER BY n.created_at ASC, n.id ASC`,
    [ticketId]
  );
  return rows;
}

export async function createTicketNote(ticketId, body, actor) {
  return withTransaction(async (conn) => {
    if (!(await ticketExists(conn, ticketId))) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found');
    }
    if (['admin', 'support_lead', 'support_agent'].includes(actor.role)) {
      // ok
    } else if (actor.role === 'technician') {
      if (!(await technicianAssignedToTicket(conn, ticketId, actor.id))) {
        throw new ApiError(403, 'FORBIDDEN', 'You can only note on tickets with your assigned tasks');
      }
    } else {
      throw new ApiError(403, 'FORBIDDEN', 'Insufficient permissions');
    }

    const text = String(body || '').trim();
    if (!text) throw new ApiError(422, 'VALIDATION_ERROR', 'Note body is required');
    if (text.length > 4000) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Note must be 4000 characters or fewer');
    }

    const [result] = await conn.execute(
      `INSERT INTO ticket_notes (ticket_id, author_id, body) VALUES (?, ?, ?)`,
      [ticketId, actor.id, text]
    );

    await auditLog(conn, {
      entityType: 'ticket',
      entityId: ticketId,
      action: 'NOTE_ADDED',
      newValue: { note_id: result.insertId },
      actorId: actor.id,
    });

    const [rows] = await conn.execute(
      `SELECT n.id, n.ticket_id, n.body, n.created_at, n.author_id, u.name AS author_name, u.role AS author_role
       FROM ticket_notes n
       JOIN users u ON u.id = n.author_id
       WHERE n.id = ?`,
      [result.insertId]
    );
    return rows[0];
  });
}
