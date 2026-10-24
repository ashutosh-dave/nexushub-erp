import { Badge } from '../ui/Badge.jsx';

const map = {
  Pending: 'warning',
  Active: 'success',
  Suspended: 'warning',
  Terminated: 'outline',
  Open: 'primary',
  'In-Progress': 'primary',
  'Field Visit': 'warning',
  Resolved: 'success',
  Low: 'outline',
  Medium: 'default',
  High: 'warning',
  Critical: 'danger',
};

export function StatusBadge({ status }) {
  const variant = map[status] || 'default';
  return <Badge variant={variant}>{status}</Badge>;
}
