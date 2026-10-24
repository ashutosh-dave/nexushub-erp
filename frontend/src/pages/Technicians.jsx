import { useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../lib/auth.jsx';
import { useTasksQuery, useTaskStatusMutation } from '../api/tasks.js';
import { useTechnicianScheduleQuery } from '../api/technicians.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { formatDateTime, getApiError } from '../lib/utils.js';
import { Loader } from '../components/shared/Loader.jsx';
import { ErrorState } from '../components/shared/ErrorState.jsx';
import { EmptyState } from '../components/shared/EmptyState.jsx';
import { StatusBadge } from '../components/shared/StatusBadge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card.jsx';

const NEXT_STATUS = {
  Open: 'In-Progress',
  'In-Progress': 'Field Visit',
  'Field Visit': 'Resolved',
};

export default function Technicians() {
  useDocumentTitle('Technicians');
  const { user, hasRole } = useAuth();
  const isTech = hasRole('technician');
  const techId = isTech ? user?.id : undefined;

  const from = new Date().toISOString().slice(0, 10);
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 7);
  const to = toDate.toISOString().slice(0, 10);

  const tasksQuery = useTasksQuery(
    { technicianId: techId, page: 1, pageSize: 100 },
    { enabled: Boolean(techId) }
  );
  const scheduleQuery = useTechnicianScheduleQuery(techId, from, to);
  const statusMut = useTaskStatusMutation();

  const myTasks = useMemo(
    () => (tasksQuery.data?.items || []).filter((t) => t.status !== 'Resolved'),
    [tasksQuery.data]
  );

  if (isTech && tasksQuery.isLoading) return <Loader />;
  if (isTech && tasksQuery.error) {
    return (
      <ErrorState message={getApiError(tasksQuery.error).message} onRetry={() => tasksQuery.refetch()} />
    );
  }

  const advanceStatus = (task) => {
    const next = NEXT_STATUS[task.status];
    if (!next) return;
    statusMut.mutate(
      { id: task.id, status: next },
      {
        onSuccess: () => toast.success(`Task marked ${next}`),
        onError: (err) => toast.error(getApiError(err).message),
      }
    );
  };

  if (!isTech) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Technicians</h1>
        <p className="text-sm text-slate-600">
          Field technicians use this page to manage assigned tasks and view shifts. Sign in as a
          technician to see the task board.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">My tasks &amp; shifts</h1>

      <Card>
        <CardHeader>
          <CardTitle>Assigned tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {myTasks.length === 0 ? (
            <EmptyState title="No open tasks" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {myTasks.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-sm text-slate-500">
                      {task.ticket_no} · {task.task_type}
                    </p>
                    {task.window_start ? (
                      <p className="text-xs text-slate-500">
                        {formatDateTime(task.window_start)} – {formatDateTime(task.window_end)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={task.status} />
                    {NEXT_STATUS[task.status] ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={statusMut.isPending}
                        onClick={() => advanceStatus(task)}
                      >
                        → {NEXT_STATUS[task.status]}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shifts (next 7 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {scheduleQuery.isLoading ? (
            <Loader className="py-4" />
          ) : scheduleQuery.error ? (
            <p className="text-sm text-red-600">{getApiError(scheduleQuery.error).message}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(scheduleQuery.data?.shifts || []).length === 0 ? (
                <li className="text-slate-500">No shifts scheduled.</li>
              ) : (
                scheduleQuery.data.shifts.map((s) => (
                  <li key={s.id} className="rounded border border-slate-100 px-3 py-2">
                    {s.shift_date}: {String(s.start_time).slice(0, 5)} – {String(s.end_time).slice(0, 5)}
                  </li>
                ))
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
