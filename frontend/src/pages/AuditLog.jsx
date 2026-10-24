import { useMemo, useState } from 'react';
import { useAuditLogsQuery } from '../api/audit.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { formatDateTime, getApiError } from '../lib/utils.js';
import { DataTable } from '../components/shared/DataTable.jsx';
import { Loader } from '../components/shared/Loader.jsx';
import { ErrorState } from '../components/shared/ErrorState.jsx';
import { EmptyState } from '../components/shared/EmptyState.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Label } from '../components/ui/Label.jsx';
import { Select } from '../components/ui/Select.jsx';

export default function AuditLog() {
  useDocumentTitle('Audit log');
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = useMemo(
    () => ({
      page,
      pageSize: 25,
      entity_type: entityType || undefined,
      entity_id: entityId || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [page, entityType, entityId, from, to]
  );

  const { data, isLoading, error, refetch } = useAuditLogsQuery(params);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'created_at',
        header: 'When',
        cell: ({ getValue }) => formatDateTime(getValue()),
      },
      { accessorKey: 'entity_type', header: 'Entity' },
      { accessorKey: 'entity_id', header: 'ID' },
      { accessorKey: 'action', header: 'Action' },
      {
        id: 'change',
        header: 'Change',
        cell: ({ row }) => {
          const o = row.original.old_value;
          const n = row.original.new_value;
          if (!o && !n) return '—';
          return (
            <span className="text-xs text-slate-600">
              {o ? JSON.stringify(o) : '∅'} → {n ? JSON.stringify(n) : '∅'}
            </span>
          );
        },
      },
      { accessorKey: 'actor_name', header: 'Actor' },
    ],
    []
  );

  if (isLoading) return <Loader />;
  if (error) {
    return <ErrorState message={getApiError(error).message} onRetry={() => refetch()} />;
  }

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Audit log</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label>Entity type</Label>
          <Select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="connection">connection</option>
            <option value="subscriber">subscriber</option>
            <option value="ticket">ticket</option>
            <option value="ticket_task">ticket_task</option>
            <option value="plan_change">plan_change</option>
          </Select>
        </div>
        <div>
          <Label>Entity ID</Label>
          <Input
            value={entityId}
            onChange={(e) => {
              setEntityId(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No audit entries" />
      ) : (
        <>
          <DataTable columns={columns} data={items} />
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">
              Page {meta?.page} · {meta?.total} total
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page * (meta?.pageSize || 25) >= (meta?.total || 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
