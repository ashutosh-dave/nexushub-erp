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

function weekRange() {
  const from = new Date().toISOString().slice(0, 10);
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 7);
  const to = toDate.toISOString().slice(0, 10);
  return { from, to };
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

function TechnicianSelfView() {
  const { user } = useAuth();
  const techId = user?.id;
  const { from, to } = useMemo(() => weekRange(), []);

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

  if (tasksQuery.isLoading) return <Loader />;
  if (tasksQuery.error) {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Your field tasks</h1>
        <p className="text-sm text-slate-600">
          Advance status as you work. Add a short note when support needs context.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assigned tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {myTasks.length === 0 ? (
            <EmptyState
              title="No open tasks"
              description="When a lead assigns you work, it will show up here."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {myTasks.map((task) => (
                <li key={task.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
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
                  </div>
                  <TechTaskNote ticketId={task.ticket_id} />
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
                    {formatShiftDate(s.shift_date)}: {String(s.start_time).slice(0, 5)} –{' '}
                    {String(s.end_time).slice(0, 5)}
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

export default function Technicians() {
  useDocumentTitle('Technicians');
  const { hasRole } = useAuth();

  if (hasRole('technician')) {
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
