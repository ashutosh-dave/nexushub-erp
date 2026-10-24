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
export function windowContainedInShift(windowStart, windowEnd, shift) {
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  const dateStr = start.toISOString().slice(0, 10);
  if (dateStr !== String(shift.shift_date).slice(0, 10)) return false;
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
