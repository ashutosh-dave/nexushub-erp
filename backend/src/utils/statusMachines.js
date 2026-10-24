export const CONNECTION_TRANSITIONS = {
  Pending: ['Active', 'Terminated'],
  Active: ['Suspended', 'Terminated'],
  Suspended: ['Active', 'Terminated'],
  Terminated: [],
};

export const WORKFLOW_STATUSES = ['Open', 'In-Progress', 'Field Visit', 'Resolved'];

/**
 * @param {string} from
 * @param {string} to
 * @param {{ allowBackward?: boolean }} opts
 */
export function canTransitionWorkflow(from, to, opts = {}) {
  const fromIdx = WORKFLOW_STATUSES.indexOf(from);
  const toIdx = WORKFLOW_STATUSES.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return false;
  if (from === 'Resolved') return false;
  if (toIdx === fromIdx + 1) return true;
  if (opts.allowBackward && toIdx === fromIdx - 1) return true;
  return false;
}

/**
 * @param {string} from
 * @param {string} to
 */
export function canTransitionConnection(from, to) {
  return (CONNECTION_TRANSITIONS[from] || []).includes(to);
}

export const SLA_HOURS = {
  Critical: 4,
  High: 8,
  Medium: 24,
  Low: 72,
};
