import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useTasksQuery, useTaskStatusMutation } from '../api/tasks.js';
import { useCreateTicketNoteMutation } from '../api/tickets.js';
import {
  useCreateShiftMutation,
  useDeleteShiftMutation,
  useMyScheduleQuery,
  useTechnicianScheduleQuery,
  useTechniciansQuery,
} from '../api/technicians.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { formatDateTime, getApiError } from '../lib/utils.js';
import { Loader } from '../components/shared/Loader.jsx';
import { ErrorState } from '../components/shared/ErrorState.jsx';
import { EmptyState } from '../components/shared/EmptyState.jsx';
import { StatusBadge } from '../components/shared/StatusBadge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card.jsx';
import { Dialog, DialogContent, DialogFooter } from '../components/ui/Dialog.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Label } from '../components/ui/Label.jsx';
import { Textarea } from '../components/ui/Textarea.jsx';

const NEXT_STATUS = {
  Open: 'In-Progress',
  'In-Progress': 'Field Visit',
  'Field Visit': 'Resolved',
};

const NEXT_LABEL = {
  Open: 'Start working',
  'In-Progress': 'On site / field visit',
  'Field Visit': 'Mark resolved',
};

function localISODate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function weekRange() {
  const from = localISODate();
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 7);
  const to = localISODate(toDate);
  return { from, to };
}

function taskDayKey(task) {
  if (!task?.window_start) return null;
  try {
    return localISODate(new Date(task.window_start));
  } catch {
    return String(task.window_start).slice(0, 10);
  }
}

function statusErrorMessage(err) {
  const api = getApiError(err);
  if (api.code === 'INVALID_STATUS_TRANSITION') return api.message;
  if (api.code === 'TASK_UNASSIGNED') return api.message;
  if (api.code === 'FORBIDDEN') return 'You can only update tasks assigned to you.';
  return api.message || 'Could not update status';
}

function formatShiftDate(value) {
  if (!value) return '—';
  if (typeof value === 'string') return value.slice(0, 10);
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return String(value);
  }
}

function AdminTechniciansView() {
  const { from, to } = useMemo(() => weekRange(), []);
  const listQuery = useTechniciansQuery();
  const [selectedId, setSelectedId] = useState(null);
  const [shiftOpen, setShiftOpen] = useState(false);

  const technicians = listQuery.data || [];

  useEffect(() => {
    if (!selectedId && technicians.length) {
      setSelectedId(technicians[0].id);
    }
  }, [technicians, selectedId]);

  const scheduleQuery = useTechnicianScheduleQuery(selectedId, from, to);
  const createShift = useCreateShiftMutation();
  const deleteShift = useDeleteShiftMutation();

  const shiftForm = useForm({
    defaultValues: {
      shift_date: from,
      start_time: '09:00',
      end_time: '17:00',
    },
  });

  const selected = technicians.find((t) => t.id === selectedId);

  const onCreateShift = shiftForm.handleSubmit((values) => {
    if (!selectedId) return;
    createShift.mutate(
      {
        technicianId: selectedId,
        shift_date: values.shift_date,
        start_time: values.start_time.length === 5 ? `${values.start_time}:00` : values.start_time,
        end_time: values.end_time.length === 5 ? `${values.end_time}:00` : values.end_time,
      },
      {
        onSuccess: () => {
          toast.success('Shift added');
          setShiftOpen(false);
          shiftForm.reset({
            shift_date: from,
            start_time: '09:00',
            end_time: '17:00',
          });
        },
        onError: (err) => toast.error(getApiError(err).message),
      }
    );
  });

  const onDeleteShift = (shiftId) => {
    deleteShift.mutate(shiftId, {
      onSuccess: () => toast.success('Shift removed'),
      onError: (err) => toast.error(getApiError(err).message),
    });
  };

  if (listQuery.isLoading) return <Loader />;
  if (listQuery.error) {
    return (
      <ErrorState message={getApiError(listQuery.error).message} onRetry={() => listQuery.refetch()} />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Field roster</h1>
        <p className="text-sm text-slate-600">
          Assign work to techs from Dispatch. Manage shifts and load for the next 7 days.
        </p>
      </div>

      {technicians.length === 0 ? (
        <EmptyState title="No technicians" description="Seed or activate technician users to manage shifts." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Roster &amp; load</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-slate-100">
                {technicians.map((tech) => {
                  const active = tech.id === selectedId;
                  return (
                    <li key={tech.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(tech.id)}
                        className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors ${
                          active ? 'bg-blue-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className={`font-medium ${active ? 'text-blue-800' : 'text-slate-900'}`}>
                            {tech.name}
                          </p>
                          <p className="text-xs text-slate-500">{tech.email}</p>
                        </div>
                        <div className="text-right text-xs text-slate-600">
                          <p>
                            <span className="font-semibold text-slate-900">{tech.open_tasks ?? 0}</span>{' '}
                            open
                          </p>
                          <p>
                            <span className="font-semibold text-slate-900">{tech.tasks_today ?? 0}</span>{' '}
                            today
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle>{selected ? selected.name : 'Schedule'}</CardTitle>
                <p className="mt-1 text-xs text-slate-500">
                  {from} → {to}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!selectedId}
                onClick={() => setShiftOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add shift
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {scheduleQuery.isLoading ? (
                <Loader className="py-4" />
              ) : scheduleQuery.error ? (
                <ErrorState
                  message={getApiError(scheduleQuery.error).message}
                  onRetry={() => scheduleQuery.refetch()}
                />
              ) : (
                <>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-800">Shifts</h3>
                    {(scheduleQuery.data?.shifts || []).length === 0 ? (
                      <p className="text-sm text-slate-500">No shifts in this window.</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {scheduleQuery.data.shifts.map((s) => (
                          <li
                            key={s.id}
                            className="flex items-center justify-between gap-2 rounded border border-slate-100 px-3 py-2"
                          >
                            <span>
                              {formatShiftDate(s.shift_date)}:{' '}
                              {String(s.start_time).slice(0, 5)} – {String(s.end_time).slice(0, 5)}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Delete shift"
                              disabled={deleteShift.isPending}
                              onClick={() => onDeleteShift(s.id)}
                            >
                              <Trash2 className="h-4 w-4 text-slate-500" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-800">Assigned windows</h3>
                    {(scheduleQuery.data?.tasks || []).length === 0 ? (
                      <p className="text-sm text-slate-500">No scheduled assignments.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100 text-sm">
                        {scheduleQuery.data.tasks.map((task) => (
                          <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <div>
                              <p className="font-medium text-slate-900">{task.title}</p>
                              <p className="text-xs text-slate-500">
                                {task.ticket_no}
                                {task.window_start
                                  ? ` · ${formatDateTime(task.window_start)} – ${formatDateTime(task.window_end)}`
                                  : null}
                              </p>
                            </div>
                            <StatusBadge status={task.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
        <DialogContent
          title="Add shift"
          description={selected ? `For ${selected.name}` : undefined}
        >
          <form className="space-y-4" onSubmit={onCreateShift}>
            <div className="space-y-1.5">
              <Label htmlFor="shift_date">Date</Label>
              <Input id="shift_date" type="date" {...shiftForm.register('shift_date', { required: true })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start_time">Start</Label>
                <Input
                  id="start_time"
                  type="time"
                  {...shiftForm.register('start_time', { required: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end_time">End</Label>
                <Input id="end_time" type="time" {...shiftForm.register('end_time', { required: true })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShiftOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createShift.isPending}>
                {createShift.isPending ? 'Saving…' : 'Save shift'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TechTaskNote({ ticketId }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const createNote = useCreateTicketNoteMutation(ticketId);

  if (!ticketId) return null;

  const submit = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    createNote.mutate(body, {
      onSuccess: () => {
        toast.success('Note added to ticket');
        setText('');
        setOpen(false);
      },
      onError: (err) => toast.error(getApiError(err).message),
    });
  };

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Add note
      </Button>
    );
  }

  return (
    <form className="mt-2 w-full space-y-2" onSubmit={submit}>
      <Textarea
        rows={2}
        placeholder="Site access, findings, parts needed…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={createNote.isPending || !text.trim()}>
          Save note
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function TaskRow({ task, onAdvance, advancing }) {
  const next = NEXT_STATUS[task.status];
  const label = NEXT_LABEL[task.status];

  return (
    <li className="space-y-2 border-b border-slate-100 py-4 last:border-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-900">{task.title}</p>
            <StatusBadge status={task.status} />
          </div>
          <p className="text-sm text-slate-500">
            {task.ticket_no} · {task.task_type}
          </p>
          {task.window_start ? (
            <p className="text-xs font-medium text-slate-600">
              Window: {formatDateTime(task.window_start)} – {formatDateTime(task.window_end)}
            </p>
          ) : (
            <p className="text-xs text-amber-700">No time window yet — wait for a lead to assign one.</p>
          )}
        </div>
        {next ? (
          <Button
            type="button"
            size="sm"
            className="shrink-0 self-start"
            disabled={advancing}
            onClick={() => onAdvance(task)}
          >
            {advancing ? 'Updating…' : label}
          </Button>
        ) : null}
      </div>
      <TechTaskNote ticketId={task.ticket_id} />
    </li>
  );
}

function TechnicianSelfView() {
  const { user } = useAuth();
  const { from, to } = useMemo(() => weekRange(), []);
  const today = from;

  // Backend scopes GET /tasks to req.user.id for technicians — do not filter by client id
  const tasksQuery = useTasksQuery({ page: 1, pageSize: 100 });
  const scheduleQuery = useMyScheduleQuery(from, to, { userId: user?.id });
  const statusMut = useTaskStatusMutation();
  const [pendingId, setPendingId] = useState(null);

  const openTasks = useMemo(
    () => (tasksQuery.data?.items || []).filter((t) => t.status !== 'Resolved'),
    [tasksQuery.data]
  );

  const { todayTasks, upcomingTasks, unscheduledTasks } = useMemo(() => {
    const todayList = [];
    const upcoming = [];
    const unscheduled = [];
    for (const task of openTasks) {
      const day = taskDayKey(task);
      if (!day) unscheduled.push(task);
      else if (day === today) todayList.push(task);
      else upcoming.push(task);
    }
    const byWindow = (a, b) =>
      new Date(a.window_start || 0).getTime() - new Date(b.window_start || 0).getTime();
    todayList.sort(byWindow);
    upcoming.sort(byWindow);
    return { todayTasks: todayList, upcomingTasks: upcoming, unscheduledTasks: unscheduled };
  }, [openTasks, today]);

  const shifts = scheduleQuery.data?.shifts || [];
  const windowTasks = (scheduleQuery.data?.tasks || []).filter((t) => t.status !== 'Resolved');

  if (tasksQuery.isLoading) return <Loader />;
  if (tasksQuery.error) {
    return (
      <ErrorState message={getApiError(tasksQuery.error).message} onRetry={() => tasksQuery.refetch()} />
    );
  }

  const advanceStatus = (task) => {
    const next = NEXT_STATUS[task.status];
    if (!next) return;
    setPendingId(task.id);
    statusMut.mutate(
      { id: task.id, status: next },
      {
        onSuccess: () => toast.success(`Marked ${next}`),
        onError: (err) => toast.error(statusErrorMessage(err)),
        onSettled: () => setPendingId(null),
      }
    );
  };

  const renderTaskList = (tasks, empty) =>
    tasks.length === 0 ? (
      <p className="py-2 text-sm text-slate-500">{empty}</p>
    ) : (
      <ul>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onAdvance={advanceStatus}
            advancing={pendingId === task.id}
          />
        ))}
      </ul>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Field workbench</h1>
        <p className="text-sm text-slate-600">
          Your assigned jobs, time windows, and shifts. Advance status as you work; leave a note when
          support needs context on site.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Open jobs</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{openTasks.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Due today</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{todayTasks.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Shifts this week</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{shifts.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s jobs</CardTitle>
          <p className="text-xs text-slate-500">{today}</p>
        </CardHeader>
        <CardContent>
          {renderTaskList(todayTasks, 'Nothing scheduled for today. Check upcoming jobs below.')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming &amp; other open work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderTaskList(
            [...upcomingTasks, ...unscheduledTasks],
            'No other open assignments. When a lead assigns you, it appears here.'
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My shifts</CardTitle>
            <p className="text-xs text-slate-500">
              {from} → {to}
            </p>
          </CardHeader>
          <CardContent>
            {scheduleQuery.isLoading ? (
              <Loader className="py-4" />
            ) : scheduleQuery.error ? (
              <ErrorState
                message={getApiError(scheduleQuery.error).message}
                onRetry={() => scheduleQuery.refetch()}
              />
            ) : shifts.length === 0 ? (
              <p className="text-sm text-slate-500">No shifts on the roster for this week.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {shifts.map((s) => {
                  const day = formatShiftDate(s.shift_date);
                  const isToday = day === today;
                  return (
                    <li
                      key={s.id}
                      className={`rounded border px-3 py-2 ${
                        isToday ? 'border-blue-200 bg-blue-50 text-blue-950' : 'border-slate-100'
                      }`}
                    >
                      <span className="font-medium">{day}</span>
                      {isToday ? <span className="ml-2 text-xs font-semibold uppercase">Today</span> : null}
                      <span className="ml-2 text-slate-600">
                        {String(s.start_time).slice(0, 5)} – {String(s.end_time).slice(0, 5)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assigned time windows</CardTitle>
            <p className="text-xs text-slate-500">Jobs with a scheduled visit window this week</p>
          </CardHeader>
          <CardContent>
            {scheduleQuery.isLoading ? (
              <Loader className="py-4" />
            ) : windowTasks.length === 0 ? (
              <p className="text-sm text-slate-500">No scheduled windows in this range.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {windowTasks.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium text-slate-900">{task.title}</p>
                      <p className="text-xs text-slate-500">
                        {task.ticket_no}
                        {task.window_start
                          ? ` · ${formatDateTime(task.window_start)} – ${formatDateTime(task.window_end)}`
                          : null}
                      </p>
                    </div>
                    <StatusBadge status={task.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Technicians() {
  const { hasRole } = useAuth();
  const isTech = hasRole('technician');
  useDocumentTitle(isTech ? 'Field workbench' : 'Field roster');

  if (isTech) {
    return <TechnicianSelfView />;
  }

  if (hasRole('admin', 'support_lead')) {
    return <AdminTechniciansView />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Technicians</h1>
      <p className="text-sm text-slate-600">You do not have access to this page.</p>
    </div>
  );
}
