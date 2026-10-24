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
import { AlertTriangle, GripVertical, Plus } from 'lucide-react';
import {
  useCreateTasksMutation,
  useCreateTicketMutation,
  useTicketQuery,
  useTicketReorderMutation,
  useTicketsQuery,
} from '../api/tickets.js';
import {
  useTaskAssignMutation,
  useTaskReorderMutation,
  useTasksQuery,
} from '../api/tasks.js';
import { useAvailableTechniciansQuery } from '../api/technicians.js';
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
import { StatusBadge } from '../components/shared/StatusBadge.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Label } from '../components/ui/Label.jsx';
import { Select } from '../components/ui/Select.jsx';
import { Textarea } from '../components/ui/Textarea.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs.jsx';
import { Dialog, DialogContent, DialogFooter } from '../components/ui/Dialog.jsx';
import { Sheet } from '../components/ui/Sheet.jsx';

const STATUSES = ['Open', 'In-Progress', 'Field Visit', 'Resolved'];
const TASK_TYPES = [
  'Feeder Line Audit',
  'ONU Configuration',
  'Splicing',
  'Fiber Repair',
  'Router Replacement',
  'Other',
];

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
  const unassigned = Number(ticket.open_task_count) > 0;
  return (
    <div className="space-y-1 text-sm">
      <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => onOpen(ticket)}>
        {ticket.ticket_no}
      </button>
      <p className="line-clamp-2 text-slate-700">{ticket.title}</p>
      <div className="flex flex-wrap gap-1">
        <StatusBadge status={ticket.priority} />
        {ticket.sla_state === 'breached' ? <Badge variant="danger">SLA breached</Badge> : null}
        {unassigned ? (
          <Badge variant="warning">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            {ticket.open_task_count} open tasks
          </Badge>
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

function KanbanBoard({ items, type, onOpenTicket, onDragEnd, optimistic }) {
  const grouped = useMemo(() => groupByStatus(optimistic ?? items), [optimistic, items]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = useState(null);

  const handleDragEnd = (event) => {
    setActiveId(null);
    onDragEnd(event, grouped);
  };

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
              {status}{' '}
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
                        <p className="font-medium">{item.title}</p>
                        <p className="text-xs text-slate-500">{item.ticket_no}</p>
                        {!item.technician_id ? (
                          <Badge variant="warning">Unassigned</Badge>
                        ) : (
                          <p className="text-xs">{item.technician_name}</p>
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
                gridTemplateColumns: `repeat(${hours.length}, 1fr)`,
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

export default function Dispatch() {
  useDocumentTitle('Dispatch');
  const { hasRole } = useAuth();
  const canCreate = hasRole('admin', 'support_lead', 'support_agent');

  const [view, setView] = useState('tickets');
  const [ticketDrawer, setTicketDrawer] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignTask, setAssignTask] = useState(null);
  const [conflictMsg, setConflictMsg] = useState('');
  const [optimisticTickets, setOptimisticTickets] = useState(null);
  const [optimisticTasks, setOptimisticTasks] = useState(null);
  const [splitRows, setSplitRows] = useState([{ title: '', task_type: 'Other', description: '' }]);

  const ticketsQuery = useTicketsQuery({ page: 1, pageSize: 300 }, { poll: true });
  const tasksQuery = useTasksQuery({ page: 1, pageSize: 500 }, { poll: true });
  const ticketDetail = useTicketQuery(ticketDrawer?.id);
  const reorderTicket = useTicketReorderMutation();
  const reorderTask = useTaskReorderMutation();
  const createTicket = useCreateTicketMutation();
  const createTasks = useCreateTasksMutation(ticketDrawer?.id);
  const assignMut = useTaskAssignMutation();

  const tickets = ticketsQuery.data?.items ?? [];
  const tasks = tasksQuery.data?.items ?? [];

  useEffect(() => {
    setOptimisticTickets(null);
  }, [ticketsQuery.dataUpdatedAt]);

  useEffect(() => {
    setOptimisticTasks(null);
  }, [tasksQuery.dataUpdatedAt]);

  const createForm = useForm({
    resolver: zodResolver(ticketCreateSchema),
    defaultValues: { connection_id: '', title: '', description: '', priority: 'Medium' },
  });

  const assignForm = useForm({
    resolver: zodResolver(assignTaskSchema),
    defaultValues: { technician_id: '', window_start: '', window_end: '' },
  });

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
      onSuccess: () => {
        toast.success('Ticket created');
        setCreateOpen(false);
        createForm.reset();
      },
      onError: (err) => toast.error(getApiError(err).message),
    });
  };

  const submitTasks = () => {
    const parsed = splitRows.map((r) => taskCreateSchema.parse(r));
    createTasks.mutate(parsed.length === 1 ? parsed[0] : parsed, {
      onSuccess: () => {
        toast.success('Sub-tasks added');
        setSplitRows([{ title: '', task_type: 'Other', description: '' }]);
        ticketDetail.refetch();
      },
      onError: (err) => toast.error(getApiError(err).message),
    });
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Dispatch board</h1>
        {canCreate ? (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create ticket
          </Button>
        ) : null}
      </div>

      <Tabs defaultValue="tickets" value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
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
          />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineView tasks={tasks.filter((t) => t.window_start)} />
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent title="Create master ticket">
          <form className="space-y-3" onSubmit={createForm.handleSubmit(submitTicket)}>
            <div>
              <Label>Connection ID</Label>
              <Input type="number" {...createForm.register('connection_id')} />
            </div>
            <div>
              <Label>Title</Label>
              <Input {...createForm.register('title')} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea {...createForm.register('description')} />
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
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet
        open={Boolean(ticketDrawer)}
        onOpenChange={(o) => !o && setTicketDrawer(null)}
        side="right"
        title={ticketDrawer?.ticket_no || 'Ticket'}
      >
        {ticketDetail.isLoading ? (
          <Loader className="py-6" />
        ) : ticketDetail.data ? (
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold">{ticketDetail.data.title}</h2>
              <p className="text-sm text-slate-600">{ticketDetail.data.description}</p>
              <StatusBadge status={ticketDetail.data.status} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sub-tasks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(ticketDetail.data.tasks || []).map((task) => (
                  <div key={task.id} className="rounded border border-slate-100 p-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{task.title}</span>
                      <StatusBadge status={task.status} />
                    </div>
                    {!task.technician_id ? <Badge variant="warning">Unassigned</Badge> : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setAssignTask(task);
                        assignForm.reset({
                          technician_id: task.technician_id || '',
                          window_start: toLocalInputValue(task.window_start),
                          window_end: toLocalInputValue(task.window_end),
                        });
                      }}
                    >
                      Assign / schedule
                    </Button>
                  </div>
                ))}
                {hasRole('admin', 'support_lead') ? (
                  <div className="border-t pt-3">
                    <p className="mb-2 text-sm font-medium">Split into sub-tasks</p>
                    {splitRows.map((row, idx) => (
                      <div key={idx} className="mb-2 grid gap-2">
                        <Input
                          placeholder="Title"
                          value={row.title}
                          onChange={(e) => {
                            const next = [...splitRows];
                            next[idx].title = e.target.value;
                            setSplitRows(next);
                          }}
                        />
                        <Select
                          value={row.task_type}
                          onChange={(e) => {
                            const next = [...splitRows];
                            next[idx].task_type = e.target.value;
                            setSplitRows(next);
                          }}
                        >
                          {TASK_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSplitRows([...splitRows, { title: '', task_type: 'Other', description: '' }])
                        }
                      >
                        Add row
                      </Button>
                      <Button type="button" size="sm" onClick={submitTasks} disabled={createTasks.isPending}>
                        Save tasks
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </Sheet>

      <Dialog open={Boolean(assignTask)} onOpenChange={(o) => !o && setAssignTask(null)}>
        <DialogContent title="Assign technician">
          <form className="space-y-3" onSubmit={assignForm.handleSubmit(submitAssign)}>
            <div>
              <Label>Technician</Label>
              <Select {...assignForm.register('technician_id')}>
                <option value="">Unassigned</option>
                {(available.data || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-500">Filtered by availability for the selected window</p>
            </div>
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
            {conflictMsg ? (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{conflictMsg}</div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignTask(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={assignMut.isPending}>
                Save assignment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
