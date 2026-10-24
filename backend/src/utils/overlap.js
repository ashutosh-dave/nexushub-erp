/**
 * Touching boundaries allowed: overlap iff new.start < existing.end AND new.end > existing.start
 * @param {{ start: Date|string, end: Date|string }} a
 * @param {{ start: Date|string, end: Date|string }} b
 */
export function windowsOverlap(a, b) {
  const aStart = new Date(a.start).getTime();
  const aEnd = new Date(a.end).getTime();
  const bStart = new Date(b.start).getTime();
  const bEnd = new Date(b.end).getTime();
  return aStart < bEnd && aEnd > bStart;
}

/**
 * @param {string|Date} windowStart
 * @param {string|Date} windowEnd
 * @param {{ shift_date: string, start_time: string, end_time: string }} shift
 */
/**
 * Normalize MySQL DATE / Date / ISO string to YYYY-MM-DD.
 * mysql2 returns DATE as a JS Date at *local* midnight for that calendar day
 * (e.g. IST → previous-day 18:30Z). Use local Y/M/D, not toISOString().
 */
function toSqlDateStr(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

export function windowContainedInShift(windowStart, windowEnd, shift) {
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  const dateStr = start.toISOString().slice(0, 10);
  if (dateStr !== toSqlDateStr(shift.shift_date)) return false;
  if (end.toISOString().slice(0, 10) !== dateStr) return false;

  const [sh, sm, ss = '0'] = String(shift.start_time).split(':');
  const [eh, em, es = '0'] = String(shift.end_time).split(':');
  const shiftStart = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
    Number(sh),
    Number(sm),
    Number(ss)
  );
  const shiftEnd = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
    Number(eh),
    Number(em),
    Number(es)
  );
  const wStart = start.getTime();
  const wEnd = end.getTime();
  return wStart >= shiftStart && wEnd <= shiftEnd;
}

/**
 * @param {Array<{ id: number, status: string, window_start: string|Date, window_end: string|Date, ticket_no?: string }>} existingTasks
 * @param {{ start: string|Date, end: string|Date }} newWindow
 * @param {number|null} excludeTaskId
 */
export function findOverlappingTasks(existingTasks, newWindow, excludeTaskId = null) {
  return existingTasks.filter((t) => {
    if (excludeTaskId != null && Number(t.id) === Number(excludeTaskId)) return false;
    if (t.status === 'Resolved') return false;
    if (!t.window_start || !t.window_end) return false;
    return windowsOverlap(newWindow, { start: t.window_start, end: t.window_end });
  });
}
