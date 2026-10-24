export const CONNECTION_TRANSITIONS = {
  Pending: ['Active', 'Terminated'],
  Active: ['Suspended', 'Terminated'],
  Suspended: ['Active', 'Terminated'],
  Terminated: [],
};

export const WORKFLOW_STATUSES = ['Open', 'In-Progress', 'Field Visit', 'Resolved'];

/** Plain-language labels for UI status transitions */
export const WORKFLOW_STATUS_LABELS = {
  Open: 'Open',
  'In-Progress': 'In progress',
  'Field Visit': 'Field visit',
  Resolved: 'Resolved',
};

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
 * Explain why a transition is blocked (for UI disabled states).
 * @param {string} from
 * @param {string} to
 * @param {{ allowBackward?: boolean, unresolvedTaskCount?: number }} opts
 */
export function workflowTransitionBlockReason(from, to, opts = {}) {
  if (from === to) return null;
  if (from === 'Resolved') return 'Resolved tickets stay closed';
  const fromIdx = WORKFLOW_STATUSES.indexOf(from);
  const toIdx = WORKFLOW_STATUSES.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return 'Unknown status';
  if (to === 'Resolved' && (opts.unresolvedTaskCount || 0) > 0) {
    return `Finish ${opts.unresolvedTaskCount} open sub-task${opts.unresolvedTaskCount === 1 ? '' : 's'} first`;
  }
  if (toIdx === fromIdx + 1) return null;
  if (toIdx === fromIdx - 1) {
    if (!opts.allowBackward) return 'Only leads/admins can move status backward';
    return null;
  }
  if (toIdx > fromIdx + 1) {
    return `Move one step at a time (next: ${WORKFLOW_STATUS_LABELS[WORKFLOW_STATUSES[fromIdx + 1]]})`;
  }
  return 'That status change is not allowed';
}

/**
 * @param {string} from
 * @param {{ allowBackward?: boolean, unresolvedTaskCount?: number }} opts
 */
export function listWorkflowMoves(from, opts = {}) {
  return WORKFLOW_STATUSES.map((to) => {
    if (to === from) {
      return { to, label: WORKFLOW_STATUS_LABELS[to], current: true, allowed: true, reason: null };
    }
    const allowed = canTransitionWorkflow(from, to, opts) && !(to === 'Resolved' && (opts.unresolvedTaskCount || 0) > 0);
    const reason = allowed ? null : workflowTransitionBlockReason(from, to, opts);
    let label = WORKFLOW_STATUS_LABELS[to];
    const fromIdx = WORKFLOW_STATUSES.indexOf(from);
    const toIdx = WORKFLOW_STATUSES.indexOf(to);
    if (toIdx === fromIdx + 1) {
      if (from === 'Open') label = 'Start working';
      else if (from === 'In-Progress') label = 'Send to field';
      else if (from === 'Field Visit') label = 'Mark resolved';
    } else if (toIdx === fromIdx - 1) {
      label = `Move back to ${WORKFLOW_STATUS_LABELS[to]}`;
    }
    return { to, label, current: false, allowed, reason };
  });
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
