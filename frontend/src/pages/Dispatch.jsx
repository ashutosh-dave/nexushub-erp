import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, ChevronRight, GripVertical, Plus } from 'lucide-react';
import {
  useCreateTasksMutation,
  useCreateTicketMutation,
  useCreateTicketNoteMutation,
  useTicketQuery,
  useTicketReorderMutation,
  useTicketStatusMutation,
  useTicketsQuery,
} from '../api/tickets.js';
import {
  useTaskAssignMutation,
  useTaskReorderMutation,
  useTasksQuery,
} from '../api/tasks.js';
import { useAvailableTechniciansQuery } from '../api/technicians.js';
import { useConnectionsQuery } from '../api/connections.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useAuth } from '../lib/auth.jsx';
import { assignTaskSchema, ticketCreateSchema, taskCreateSchema } from '../lib/schemas.js';
import {
  formatDateTime,
  fromLocalInputValue,
  getApiError,
  toLocalInputValue,
} from '../lib/utils.js';
import { Loader } from '../components/shared/Loader.jsx';
import { ErrorState } from '../components/shared/ErrorState.jsx';
import { EmptyState } from '../components/shared/EmptyState.jsx';
import { PageHeader } from '../components/shared/PageHeader.jsx';
import { StatusBadge } from '../components/shared/StatusBadge.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Label } from '../components/ui/Label.jsx';
import { Select } from '../components/ui/Select.jsx';
import { Textarea } from '../components/ui/Textarea.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs.jsx';
import { Dialog, DialogContent, DialogFooter } from '../components/ui/Dialog.jsx';
import { Sheet } from '../components/ui/Sheet.jsx';

const STATUSES = ['Open', 'In-Progress', 'Field Visit', 'Resolved'];
const STATUS_COLUMN_LABELS = {
  Open: 'Open',
  'In-Progress': 'In progress',
  'Field Visit': 'Field visit',
  Resolved: 'Resolved',
};
const TASK_TYPES = [
  'Feeder Line Audit',
  'ONU Configuration',
  'Splicing',
  'Fiber Repair',
  'Router Replacement',
  'Other',
];

function defaultTaskTitle(taskType) {
  if (!taskType || taskType === 'Other') return '';
  return `${taskType} — site visit`;
}

function slaLabel(ticket) {
  if (ticket.status === 'Resolved') return null;
  if (ticket.sla_state === 'breached') return { text: 'SLA breached', variant: 'danger' };
  if (ticket.sla_state === 'at_risk') return { text: 'SLA at risk', variant: 'warning' };
  return { text: `Due ${formatDateTime(ticket.sla_due_at)}`, variant: 'outline' };
}

function groupByStatus(items) {
  const map = Object.fromEntries(STATUSES.map((s) => [s, []]));
  for (const item of items) {
    if (map[item.status]) map[item.status].push(item);
  }
  for (const s of STATUSES) {
    map[s].sort((a, b) => (a.rank_index ?? 0) - (b.rank_index ?? 0));
  }
  return map;
}

function SortableCard({ id, children, data }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <button type="button" className="mb-2 cursor-grab text-slate-400" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

function TicketCard({ ticket, onOpen }) {
  const sla = slaLabel(ticket);
  const unassigned = Number(ticket.unassigned_task_count) > 0;
  return (
    <div className="space-y-1.5 text-sm">
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onOpen(ticket)}
      >
        <p className="font-semibold text-slate-900 line-clamp-2 hover:text-blue-700">{ticket.title}</p>
        <p className="mt-0.5 font-mono text-xs text-slate-500">{ticket.ticket_no}</p>
      </button>
      <p className="truncate text-xs text-slate-500">
        {ticket.subscriber_name || 'Subscriber'} · {ticket.connection_code}
      </p>
      <div className="flex flex-wrap gap-1">
        <StatusBadge status={ticket.priority} />
        {sla ? <Badge variant={sla.variant}>{sla.text}</Badge> : null}
        {unassigned ? (
          <Badge variant="warning">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            Unassigned work
          </Badge>
        ) : Number(ticket.open_task_count) > 0 ? (
          <Badge variant="outline">{ticket.open_task_count} open tasks</Badge>
        ) : null}
      </div>
    </div>
  );
}

function StatusColumn({ status, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}`, data: { status } });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[200px] flex-col rounded-lg p-2 ${isOver ? 'bg-blue-50' : 'bg-slate-50'}`}
    >
      {children}
    </div>
  );
}

function KanbanBoard({ items, type, onOpenTicket, onDragEnd, optimistic, onAssignTask }) {
  const grouped = useMemo(() => groupByStatus(optimistic ?? items), [optimistic, items]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = useState(null);
  const empty = (optimistic ?? items).length === 0;

  const handleDragEnd = (event) => {
    setActiveId(null);
    onDragEnd(event, grouped);
  };

  if (empty) {
    return (
      <EmptyState
        title={type === 'ticket' ? 'No tickets yet' : 'No sub-tasks yet'}
        description={
          type === 'ticket'
            ? 'Create a master ticket against a live connection to start dispatch.'
            : 'Open a ticket and add field sub-tasks, then assign a technician.'
        }
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e) => setActiveId(e.active.id)}
      onDragEnd={handleDragEnd}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((status) => (
          <StatusColumn key={status} status={status}>
            <h3 className="mb-2 px-1 text-sm font-semibold text-slate-700">
              {STATUS_COLUMN_LABELS[status]}{' '}
              <span className="text-slate-400">({grouped[status].length})</span>
            </h3>
            <SortableContext items={grouped[status].map((t) => String(t.id))} strategy={verticalListSortingStrategy}>
              <div className="flex flex-1 flex-col gap-2">
                {grouped[status].map((item) => (
                  <SortableCard key={item.id} id={String(item.id)} data={{ status, type, item }}>
                    {type === 'ticket' ? (
                      <TicketCard ticket={item} onOpen={onOpenTicket} />
                    ) : (
                      <div className="space-y-1 text-sm">
                        <p className="font-medium text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-500">
                          {item.task_type} · {item.ticket_no}
                        </p>
                        {!item.technician_id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="warning">Unassigned</Badge>
                            {onAssignTask ? (
                              <Button type="button" size="sm" variant="outline" onClick={() => onAssignTask(item)}>
                                Assign
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-600">{item.technician_name}</p>
                        )}
                      </div>
                    )}
                  </SortableCard>
                ))}
              </div>
            </SortableContext>
          </StatusColumn>
        ))}
      </div>
      <DragOverlay>
        {activeId ? (
          <div className="rounded-md border bg-white p-3 shadow-lg opacity-90">Dragging…</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function TimelineView({ tasks }) {
  const techs = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      const key = t.technician_name || 'Unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return [...map.entries()];
  }, [tasks]);

  const startHour = 8;
  const endHour = 20;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  if (!tasks.length) {
    return (
      <EmptyState
        title="No scheduled windows"
        description="Assign a technician with a time window to see work on the timeline."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <div
        className="grid min-w-[800px] text-xs"
        style={{ gridTemplateColumns: `8rem repeat(${hours.length}, 1fr)` }}
      >
        <div className="border-b bg-slate-50 p-2 font-medium">Technician</div>
        {hours.map((h) => (
          <div key={h} className="border-b border-l bg-slate-50 p-2 text-center">
            {h}:00
          </div>
        ))}
        {techs.map(([name, rows]) => (
          <div key={name} className="contents">
            <div className="border-b p-2 font-medium">{name}</div>
            <div
              className="relative border-b"
              style={{
                gridColumn: `2 / span ${hours.length}`,
                minHeight: '3rem',
              }}
            >
              {rows.map((task) => {
                if (!task.window_start || !task.window_end) return null;
                const ws = new Date(task.window_start);
                const we = new Date(task.window_end);
                const startCol = Math.max(0, ws.getHours() + ws.getMinutes() / 60 - startHour);
                const endCol = Math.min(hours.length, we.getHours() + we.getMinutes() / 60 - startHour);
                const span = Math.max(0.5, endCol - startCol);
                return (
                  <div
                    key={task.id}
                    className="absolute top-1 rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-900"
                    style={{
                      left: `${(startCol / hours.length) * 100}%`,
                      width: `${(span / hours.length) * 100}%`,
                    }}
                    title={`${task.title} (${formatDateTime(task.window_start)})`}
                  >
                    {task.title}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TicketNotes({ ticketId, notes }) {
  const [text, setText] = useState('');
  const createNote = useCreateTicketNoteMutation(ticketId);

  const submit = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    createNote.mutate(body, {
      onSuccess: () => {
        setText('');
        toast.success('Note added');
      },
      onError: (err) => toast.error(getApiError(err).message),
    });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-800">Notes</h3>
      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {(notes || []).length === 0 ? (
          <li className="text-sm text-slate-500">No notes yet — add context for the next person.</li>
        ) : (
          (notes || []).map((n) => (
            <li key={n.id} className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-sm">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{n.author_name}</span>
                <span>{formatDateTime(n.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-slate-800">{n.body}</p>
            </li>
          ))
        )}
      </ul>
      <form className="space-y-2" onSubmit={submit}>
        <Textarea
          rows={2}
          placeholder="Add a note (what you tried, customer callback, site access…)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={createNote.isPending || !text.trim()}>
          Add note
        </Button>
      </form>
    </div>
  );
}

export default function Dispatch() {
  useDocumentTitle('Dispatch');
  const { hasRole, user } = useAuth();
  const canCreate = hasRole('admin', 'support_lead', 'support_agent');
  const canLead = hasRole('admin', 'support_lead');
  const isAgent = user?.role === 'support_agent';

  const [view, setView] = useState('tickets');
  const [ticketDrawer, setTicketDrawer] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignTask, setAssignTask] = useState(null);
  const [conflictMsg, setConflictMsg] = useState('');
  const [optimisticTickets, setOptimisticTickets] = useState(null);
  const [optimisticTasks, setOptimisticTasks] = useState(null);
  const [splitRows, setSplitRows] = useState([
    { title: defaultTaskTitle('Fiber Repair'), task_type: 'Fiber Repair', description: '' },
  ]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const ticketsQuery = useTicketsQuery({ page: 1, pageSize: 300 }, { poll: true });
  const tasksQuery = useTasksQuery({ page: 1, pageSize: 500 }, { poll: true });
  const ticketDetail = useTicketQuery(ticketDrawer?.id);
  const connectionsQuery = useConnectionsQuery({ page: 1, pageSize: 200, status: 'Active' });
  const reorderTicket = useTicketReorderMutation();
  const reorderTask = useTaskReorderMutation();
  const createTicket = useCreateTicketMutation();
  const createTasks = useCreateTasksMutation(ticketDrawer?.id);
  const statusMut = useTicketStatusMutation();
  const assignMut = useTaskAssignMutation();

  const tickets = ticketsQuery.data?.items ?? [];
  const tasks = tasksQuery.data?.items ?? [];
  const activeConnections = (connectionsQuery.data?.items || []).filter(
    (c) => c.status !== 'Terminated'
  );

  useEffect(() => {
    setOptimisticTickets(null);
  }, [ticketsQuery.dataUpdatedAt]);

  useEffect(() => {
    setOptimisticTasks(null);
  }, [tasksQuery.dataUpdatedAt]);

  useEffect(() => {
    setDetailsOpen(false);
    setSplitRows([{ title: defaultTaskTitle('Fiber Repair'), task_type: 'Fiber Repair', description: '' }]);
  }, [ticketDrawer?.id]);

  const createForm = useForm({
    resolver: zodResolver(ticketCreateSchema),
    defaultValues: {
      connection_id: '',
      title: '',
      description: '',
      priority: 'Medium',
    },
  });

  const assignForm = useForm({
    resolver: zodResolver(assignTaskSchema),
    defaultValues: { technician_id: '', window_start: '', window_end: '' },
  });

  const openAssign = (task) => {
    setConflictMsg('');
    setAssignTask(task);
    assignForm.reset({
      technician_id: task.technician_id || '',
      window_start: toLocalInputValue(task.window_start),
      window_end: toLocalInputValue(task.window_end),
    });
  };

  const winStart = assignForm.watch('window_start');
  const winEnd = assignForm.watch('window_end');
  const available = useAvailableTechniciansQuery(
    fromLocalInputValue(winStart),
    fromLocalInputValue(winEnd),
    Boolean(assignTask && winStart && winEnd)
  );

  const onTicketDragEnd = useCallback(
    (event, grouped) => {
      const { active, over } = event;
      if (!over) return;
      const activeId = Number(active.id);
      const fromStatus = active.data.current?.status;
      let toStatus = over.data.current?.status;
      if (String(over.id).startsWith('col-')) {
        toStatus = String(over.id).replace('col-', '');
      }
      let toIndex = grouped[toStatus]?.findIndex((t) => String(t.id) === String(over.id));
      if (toIndex == null || toIndex < 0) {
        toIndex = grouped[toStatus]?.length ?? 0;
      }
      if (!fromStatus || !toStatus) return;

      const flat = STATUSES.flatMap((s) => grouped[s]);
      const item = flat.find((t) => t.id === activeId);
      if (!item) return;

      const nextGrouped = { ...grouped };
      nextGrouped[fromStatus] = nextGrouped[fromStatus].filter((t) => t.id !== activeId);
      const dest = [...nextGrouped[toStatus]];
      const insertAt = toIndex >= 0 ? toIndex : dest.length;
      dest.splice(insertAt, 0, { ...item, status: toStatus });
      nextGrouped[toStatus] = dest;
      setOptimisticTickets(STATUSES.flatMap((s) => nextGrouped[s]));

      const rollback = () => setOptimisticTickets(null);

      if (fromStatus !== toStatus) {
        reorderTicket.mutate(
          { id: activeId, to_status: toStatus, to_index: insertAt },
          {
            onError: (err) => {
              rollback();
              toast.error(getApiError(err).message);
            },
          }
        );
      } else {
        reorderTicket.mutate(
          { status: fromStatus, ordered_ids: nextGrouped[fromStatus].map((t) => t.id) },
          {
            onError: (err) => {
              rollback();
              toast.error(getApiError(err).message);
            },
          }
        );
      }
    },
    [reorderTicket]
  );

  const onTaskDragEnd = useCallback(
    (event, grouped) => {
      const { active, over } = event;
      if (!over) return;
      const activeId = Number(active.id);
      const fromStatus = active.data.current?.status;
      let toStatus = over.data.current?.status;
      if (String(over.id).startsWith('col-')) {
        toStatus = String(over.id).replace('col-', '');
      }
      if (!toStatus) toStatus = fromStatus;
      if (!fromStatus || !toStatus) return;

      const item = grouped[fromStatus].find((t) => t.id === activeId);
      if (!item) return;
      if (!item.technician_id && toStatus !== 'Open') {
        toast.error('Assign a technician before moving this task forward');
        return;
      }

      const nextGrouped = { ...grouped };
      nextGrouped[fromStatus] = nextGrouped[fromStatus].filter((t) => t.id !== activeId);
      const dest = [...nextGrouped[toStatus]];
      const overIndex = dest.findIndex((t) => t.id === Number(over.id));
      dest.splice(overIndex >= 0 ? overIndex : dest.length, 0, { ...item, status: toStatus });
      nextGrouped[toStatus] = dest;
      setOptimisticTasks(STATUSES.flatMap((s) => nextGrouped[s]));

      const rollback = () => setOptimisticTasks(null);

      if (fromStatus !== toStatus) {
        reorderTask.mutate(
          { id: activeId, to_status: toStatus, to_index: overIndex >= 0 ? overIndex : dest.length - 1 },
          {
            onError: (err) => {
              rollback();
              toast.error(getApiError(err).message);
            },
          }
        );
      } else {
        reorderTask.mutate(
          { status: fromStatus, ordered_ids: nextGrouped[fromStatus].map((t) => t.id) },
          {
            onError: (err) => {
              rollback();
              toast.error(getApiError(err).message);
            },
          }
        );
      }
    },
    [reorderTask]
  );

  if (ticketsQuery.isLoading && tasksQuery.isLoading) return <Loader label="Loading board…" />;
  if (ticketsQuery.error) {
    return (
      <ErrorState message={getApiError(ticketsQuery.error).message} onRetry={() => ticketsQuery.refetch()} />
    );
  }

  const submitTicket = (values) => {
    createTicket.mutate(values, {
      onSuccess: (ticket) => {
        toast.success('Ticket created');
        setCreateOpen(false);
        createForm.reset({
          connection_id: '',
          title: '',
          description: '',
          priority: 'Medium',
        });
        setTicketDrawer(ticket);
      },
      onError: (err) => toast.error(getApiError(err).message),
    });
  };

  const submitTasks = () => {
    try {
      const parsed = splitRows.map((r) => taskCreateSchema.parse(r));
      createTasks.mutate(parsed.length === 1 ? parsed[0] : parsed, {
        onSuccess: () => {
          toast.success('Sub-tasks added');
          setSplitRows([{ title: defaultTaskTitle('Fiber Repair'), task_type: 'Fiber Repair', description: '' }]);
          ticketDetail.refetch();
        },
        onError: (err) => toast.error(getApiError(err).message),
      });
    } catch (err) {
      toast.error(err.errors?.[0]?.message || 'Check sub-task fields');
    }
  };

  const submitAssign = (values) => {
    setConflictMsg('');
    assignMut.mutate(
      {
        id: assignTask.id,
        technician_id: values.technician_id ? Number(values.technician_id) : null,
        window_start: fromLocalInputValue(values.window_start),
        window_end: fromLocalInputValue(values.window_end),
      },
      {
        onSuccess: () => {
          toast.success('Assignment saved');
          setAssignTask(null);
          ticketDetail.refetch();
          tasksQuery.refetch();
        },
        onError: (err) => {
          const e = getApiError(err);
          if (err.response?.status === 409) {
            const details = err.response?.data?.error?.details;
            setConflictMsg(
              details?.conflicts
                ? details.conflicts
                    .map(
                      (c) =>
                        `#${c.task_id} ${c.ticket_no}: ${formatDateTime(c.window_start)} – ${formatDateTime(c.window_end)}`
                    )
                    .join('; ')
                : e.message
            );
          }
          toast.error(e.message);
        },
      }
    );
  };

  const detail = ticketDetail.data;
  const sla = detail ? slaLabel(detail) : null;
  const subtitle = isAgent
    ? 'Log clear master tickets. Leads assign field work from here.'
    : 'Triage tickets, split field work, and assign technicians.';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dispatch"
        subtitle={subtitle}
        actions={
          canCreate ? (
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New ticket
            </Button>
          ) : null
        }
      />

      <Tabs defaultValue="tickets" value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="tasks">Field tasks</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="tickets">
          <KanbanBoard
            type="ticket"
            items={tickets}
            optimistic={optimisticTickets}
            onOpenTicket={setTicketDrawer}
            onDragEnd={onTicketDragEnd}
          />
        </TabsContent>
        <TabsContent value="tasks">
          <KanbanBoard
            type="task"
            items={tasks}
            optimistic={optimisticTasks}
            onOpenTicket={() => {}}
            onDragEnd={onTaskDragEnd}
            onAssignTask={canLead ? openAssign : undefined}
          />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineView tasks={tasks.filter((t) => t.window_start)} />
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent title="New support ticket">
          <form className="space-y-3" onSubmit={createForm.handleSubmit(submitTicket)}>
            <div>
              <Label>Connection</Label>
              <Select {...createForm.register('connection_id')}>
                <option value="">Select a connection…</option>
                {activeConnections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.connection_code} — {c.subscriber_name} ({c.status})
                  </option>
                ))}
              </Select>
              {createForm.formState.errors.connection_id ? (
                <p className="text-xs text-red-600">Pick a connection</p>
              ) : null}
            </div>
            <div>
              <Label>Title</Label>
              <Input
                placeholder="e.g. No link light on ONU after power cut"
                {...createForm.register('title')}
              />
            </div>
            <div>
              <Label>What happened?</Label>
              <Textarea
                rows={3}
                placeholder="Symptoms, when it started, anything the customer already tried…"
                {...createForm.register('description')}
              />
            </div>
            <div>
              <Label>Priority</Label>
              <Select {...createForm.register('priority')}>
                {['Low', 'Medium', 'High', 'Critical'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTicket.isPending}>
                Create ticket
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet
        open={Boolean(ticketDrawer)}
        onOpenChange={(o) => !o && setTicketDrawer(null)}
        side="right"
        title={detail?.ticket_no || ticketDrawer?.ticket_no || 'Ticket'}
      >
        {ticketDetail.isLoading ? (
          <Loader className="py-6" />
        ) : detail ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-900">{detail.title}</h2>
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge status={detail.status} />
                <StatusBadge status={detail.priority} />
                {sla ? <Badge variant={sla.variant}>{sla.text}</Badge> : null}
              </div>
              <p className="text-sm text-slate-600">
                {detail.subscriber_name} · {detail.connection_code}
                {detail.plan_name ? ` · ${detail.plan_name}` : ''}
                {detail.pop_code ? ` · POP ${detail.pop_code}` : ''}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
              <div className="flex flex-col gap-1.5">
                {(detail.status_moves || []).map((move) => {
                  if (move.current) {
                    return (
                      <div
                        key={move.to}
                        className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900"
                      >
                        Current: {STATUS_COLUMN_LABELS[move.to] || move.to}
                      </div>
                    );
                  }
                  return (
                    <div key={move.to}>
                      <Button
                        type="button"
                        size="sm"
                        variant={move.allowed ? 'outline' : 'ghost'}
                        className="w-full justify-start"
                        disabled={!move.allowed || statusMut.isPending}
                        title={move.reason || undefined}
                        onClick={() => {
                          statusMut.mutate(
                            { id: detail.id, status: move.to },
                            {
                              onSuccess: () => {
                                toast.success(`Status → ${move.to}`);
                                ticketDetail.refetch();
                                ticketsQuery.refetch();
                              },
                              onError: (err) => toast.error(getApiError(err).message),
                            }
                          );
                        }}
                      >
                        {move.label}
                      </Button>
                      {!move.allowed && move.reason ? (
                        <p className="mt-0.5 px-1 text-xs text-slate-500">{move.reason}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-medium text-slate-700"
                onClick={() => setDetailsOpen((v) => !v)}
              >
                {detailsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Details
              </button>
              {detailsOpen ? (
                <p className="mt-2 whitespace-pre-wrap rounded-md border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                  {detail.description}
                </p>
              ) : null}
            </div>

            <TicketNotes ticketId={detail.id} notes={detail.notes} />

            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Sub-tasks</h3>
                {Number(detail.unassigned_task_count) > 0 ? (
                  <Badge variant="warning">
                    <AlertTriangle className="mr-1 inline h-3 w-3" />
                    {detail.unassigned_task_count} unassigned
                  </Badge>
                ) : null}
              </div>

              {(detail.tasks || []).length === 0 ? (
                <EmptyState
                  title="No field work yet"
                  description={
                    canLead
                      ? 'Add a sub-task so a technician can be assigned.'
                      : 'A lead will split this ticket into field tasks.'
                  }
                />
              ) : (
                <ul className="space-y-2">
                  {(detail.tasks || []).map((task) => (
                    <li key={task.id} className="rounded-md border border-slate-100 p-2.5 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{task.title}</p>
                          <p className="text-xs text-slate-500">{task.task_type}</p>
                        </div>
                        <StatusBadge status={task.status} />
                      </div>
                      {!task.technician_id ? (
                        <Badge variant="warning" className="mt-2">
                          Unassigned
                        </Badge>
                      ) : (
                        <p className="mt-1 text-xs text-slate-600">
                          {task.technician_name}
                          {task.window_start
                            ? ` · ${formatDateTime(task.window_start)} – ${formatDateTime(task.window_end)}`
                            : ''}
                        </p>
                      )}
                      {canLead ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => openAssign(task)}
                        >
                          {task.technician_id ? 'Reschedule' : 'Assign technician'}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {canLead ? (
                <div className="space-y-2 rounded-md border border-dashed border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-800">Add sub-tasks</p>
                  {splitRows.map((row, idx) => (
                    <div key={idx} className="grid gap-2">
                      <Select
                        value={row.task_type}
                        onChange={(e) => {
                          const task_type = e.target.value;
                          const next = [...splitRows];
                          next[idx] = {
                            ...next[idx],
                            task_type,
                            title: next[idx].title?.startsWith(next[idx].task_type) || !next[idx].title
                              ? defaultTaskTitle(task_type)
                              : next[idx].title,
                          };
                          setSplitRows(next);
                        }}
                      >
                        {TASK_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </Select>
                      <Input
                        placeholder="Task title"
                        value={row.title}
                        onChange={(e) => {
                          const next = [...splitRows];
                          next[idx].title = e.target.value;
                          setSplitRows(next);
                        }}
                      />
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSplitRows([
                          ...splitRows,
                          {
                            title: defaultTaskTitle('Other'),
                            task_type: 'Other',
                            description: '',
                          },
                        ])
                      }
                    >
                      Add another
                    </Button>
                    <Button type="button" size="sm" onClick={submitTasks} disabled={createTasks.isPending}>
                      Save sub-tasks
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Sheet>

      <Dialog open={Boolean(assignTask)} onOpenChange={(o) => !o && setAssignTask(null)}>
        <DialogContent title="Assign technician">
          <form className="space-y-3" onSubmit={assignForm.handleSubmit(submitAssign)}>
            {assignTask ? (
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-900">{assignTask.title}</span>
                <span className="text-slate-500"> · {assignTask.task_type}</span>
              </p>
            ) : null}
            <div>
              <Label>Window start</Label>
              <Input type="datetime-local" {...assignForm.register('window_start')} />
            </div>
            <div>
              <Label>Window end</Label>
              <Input type="datetime-local" {...assignForm.register('window_end')} />
              {assignForm.formState.errors.window_end ? (
                <p className="text-xs text-red-600">{assignForm.formState.errors.window_end.message}</p>
              ) : null}
            </div>
            <div>
              <Label>Technician</Label>
              <Select {...assignForm.register('technician_id')}>
                <option value="">Select…</option>
                {(available.data || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-500">
                {winStart && winEnd
                  ? available.isLoading
                    ? 'Checking availability…'
                    : `${(available.data || []).length} available for this window`
                  : 'Pick a time window to see who is free'}
              </p>
            </div>
            {conflictMsg ? (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{conflictMsg}</div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignTask(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={assignMut.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
