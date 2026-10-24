import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useSubscribersQuery } from '../api/subscribers.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { DataTable } from '../components/shared/DataTable.jsx';
import { StatusBadge } from '../components/shared/StatusBadge.jsx';
import { Loader } from '../components/shared/Loader.jsx';
import { ErrorState } from '../components/shared/ErrorState.jsx';
import { EmptyState } from '../components/shared/EmptyState.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Select } from '../components/ui/Select.jsx';
import { getApiError } from '../lib/utils.js';

function SortHeader({ column, label }) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-slate-900"
      onClick={(e) => column.toggleSorting(undefined, e.shiftKey)}
    >
      {label}
      {sorted === 'asc' ? <ChevronUp className="h-3 w-3" /> : null}
      {sorted === 'desc' ? <ChevronDown className="h-3 w-3" /> : null}
    </button>
  );
}

export default function Subscribers() {
  useDocumentTitle('Subscribers');
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [sorting, setSorting] = useState([{ id: 'created_at', desc: true }]);

  const sortBy = sorting.map((s) => s.id).join(',');
  const sortDir = sorting.map((s) => (s.desc ? 'desc' : 'asc')).join(',');

  const params = useMemo(
    () => ({
      page,
      pageSize: 20,
      search: search || undefined,
      status: status || undefined,
      type: type || undefined,
      sortBy: sortBy || undefined,
      sortDir: sortDir || undefined,
    }),
    [page, search, status, type, sortBy, sortDir]
  );

  const { data, isLoading, error, refetch, isFetching } = useSubscribersQuery(params);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <SortHeader column={column} label="Name" />,
      },
      {
        accessorKey: 'type',
        header: ({ column }) => <SortHeader column={column} label="Type" />,
      },
      {
        accessorKey: 'email',
        header: ({ column }) => <SortHeader column={column} label="Email" />,
      },
      {
        id: 'plan',
        header: 'Plan',
        cell: ({ row }) => row.original.latest_plan_name || '—',
      },
      {
        id: 'pop',
        header: 'POP',
        cell: ({ row }) => row.original.latest_pop_code || '—',
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.latest_connection_status ? (
            <StatusBadge status={row.original.latest_connection_status} />
          ) : (
            '—'
          ),
      },
      {
        id: 'ip',
        header: 'Static IP',
        cell: ({ row }) => row.original.latest_static_ip || '—',
      },
    ],
    []
  );

  if (isLoading) return <Loader />;
  if (error) {
    const e = getApiError(error);
    return <ErrorState message={e.message} onRetry={() => refetch()} />;
  }

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Subscribers</h1>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search name, email, phone…"
          className="max-w-xs"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-40"
        >
          <option value="">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
          <option value="Terminated">Terminated</option>
        </Select>
        <Select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          className="w-32"
        >
          <option value="">All types</option>
          <option value="B2C">B2C</option>
          <option value="B2B">B2B</option>
        </Select>
        {isFetching ? <span className="self-center text-xs text-slate-400">Updating…</span> : null}
      </div>

      {items.length === 0 ? (
        <EmptyState title="No subscribers found" description="Try adjusting filters." />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={items}
            sorting={sorting}
            onSortingChange={setSorting}
            onRowClick={(row) => navigate(`/subscribers/${row.id}`)}
          />
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
                disabled={page * (meta?.pageSize || 20) >= (meta?.total || 0)}
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
