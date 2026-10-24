import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useSubscriberQuery } from '../api/subscribers.js';
import {
  useConnectionHistoryQuery,
  useConnectionStatusMutation,
  useCreateConnectionMutation,
  usePatchConnectionMutation,
} from '../api/connections.js';
import { usePopsQuery, usePlansQuery } from '../api/pops.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useAuth } from '../lib/auth.jsx';
import { connectionPatchSchema, connectionSchema } from '../lib/schemas.js';
import { formatDateTime, getApiError, formatCurrency } from '../lib/utils.js';
import { Loader } from '../components/shared/Loader.jsx';
import { ErrorState } from '../components/shared/ErrorState.jsx';
import { StatusBadge } from '../components/shared/StatusBadge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Label } from '../components/ui/Label.jsx';
import { Select } from '../components/ui/Select.jsx';
import { Dialog, DialogContent, DialogFooter } from '../components/ui/Dialog.jsx';

function ConnectionEditor({ connection, isAdmin }) {
  const patch = usePatchConnectionMutation(connection.id);
  const statusMut = useConnectionStatusMutation(connection.id);
  const { data: pops } = usePopsQuery();
  const { data: plans } = usePlansQuery();
  const [ipError, setIpError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(connectionPatchSchema),
    defaultValues: {
      pop_id: connection.pop_id,
      static_ip: connection.static_ip || '',
      plan_id: connection.plan_id,
    },
  });

  const onPatch = (values) => {
    setIpError('');
    const body = {
      pop_id: Number(values.pop_id),
      plan_id: Number(values.plan_id),
      static_ip: values.static_ip === '' ? null : values.static_ip,
    };
    patch.mutate(body, {
      onSuccess: () => toast.success('Connection updated'),
      onError: (err) => {
        const e = getApiError(err);
        if (err.response?.status === 409) setIpError(e.message);
        toast.error(e.message);
      },
    });
  };

  const onStatus = (status) => {
    statusMut.mutate(
      { status },
      {
        onSuccess: () => toast.success('Status updated'),
        onError: (err) => toast.error(getApiError(err).message),
      }
    );
  };

  const { data: history, isLoading: histLoading } = useConnectionHistoryQuery(connection.id);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>{connection.connection_code}</CardTitle>
          <p className="text-sm text-slate-500">
            {connection.plan_name} · {connection.pop_code}
          </p>
        </div>
        <StatusBadge status={connection.status} />
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Static IP</dt>
            <dd>{connection.static_ip || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Billing cycle start</dt>
            <dd>{connection.billing_cycle_start}</dd>
          </div>
        </dl>

        {isAdmin ? (
          <form className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2" onSubmit={handleSubmit(onPatch)}>
            <div>
              <Label>POP</Label>
              <Select {...register('pop_id')}>
                {(pops || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Plan</Label>
              <Select {...register('plan_id')}>
                {(plans || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Static IP</Label>
              <Input {...register('static_ip')} placeholder="Optional IPv4" />
              {errors.static_ip ? (
                <p className="text-xs text-red-600">{errors.static_ip.message}</p>
              ) : null}
              {ipError ? <p className="text-xs text-red-600">{ipError}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" size="sm" disabled={patch.isPending}>
                Save connection
              </Button>
              {['Pending', 'Active', 'Suspended', 'Terminated'].map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={connection.status === s || statusMut.isPending}
                  onClick={() => onStatus(s)}
                >
                  Mark {s}
                </Button>
              ))}
            </div>
          </form>
        ) : null}

        <div>
          <h4 className="mb-2 font-medium text-slate-900">History</h4>
          {histLoading ? (
            <Loader className="py-6" label="Loading history…" />
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {(history || []).length === 0 ? (
                <li className="text-slate-500">No history entries.</li>
              ) : (
                history.map((h, i) => (
                  <li key={i} className="rounded border border-slate-100 p-2">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{h.kind || h.action || h.entry_type}</span>
                      <span className="text-slate-500">{formatDateTime(h.created_at || h.period_start)}</span>
                    </div>
                    {h.description ? <p className="text-slate-600">{h.description}</p> : null}
                    {h.amount != null ? (
                      <p className="text-slate-600">{formatCurrency(h.amount)}</p>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SubscriberDetail() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const { data, isLoading, error, refetch } = useSubscriberQuery(id);
  const createConn = useCreateConnectionMutation();
  const { data: pops } = usePopsQuery();
  const { data: plans } = usePlansQuery();
  const [connOpen, setConnOpen] = useState(false);

  useDocumentTitle(data?.name ? `${data.name}` : 'Subscriber');

  const connForm = useForm({
    resolver: zodResolver(connectionSchema),
    defaultValues: {
      subscriber_id: Number(id),
      plan_id: '',
      pop_id: '',
      billing_cycle_start: new Date().toISOString().slice(0, 10),
    },
  });

  if (isLoading) return <Loader />;
  if (error) {
    return <ErrorState message={getApiError(error).message} onRetry={() => refetch()} />;
  }

  const onCreateConn = (values) => {
    createConn.mutate(
      { ...values, subscriber_id: Number(id) },
      {
        onSuccess: () => {
          toast.success('Connection created');
          setConnOpen(false);
          refetch();
        },
        onError: (err) => toast.error(getApiError(err).message),
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/subscribers" className="text-sm text-blue-600 hover:underline">
          ← Subscribers
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{data.name}</h1>
          <p className="text-sm text-slate-500">
            {data.type} · {data.email} · {data.phone}
          </p>
          {data.company_name ? (
            <p className="text-sm text-slate-600">{data.company_name}</p>
          ) : null}
        </div>
        {isAdmin ? (
          <Button type="button" size="sm" onClick={() => setConnOpen(true)}>
            Add connection
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4">
        {(data.connections || []).map((c) => (
          <ConnectionEditor key={c.id} connection={c} isAdmin={isAdmin} />
        ))}
        {(data.connections || []).length === 0 ? (
          <p className="text-sm text-slate-500">No connections yet.</p>
        ) : null}
      </div>

      <Dialog open={connOpen} onOpenChange={setConnOpen}>
        <DialogContent title="New connection">
          <form className="space-y-3" onSubmit={connForm.handleSubmit(onCreateConn)}>
            <div>
              <Label>Plan</Label>
              <Select {...connForm.register('plan_id')}>
                <option value="">Select plan</option>
                {(plans || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>POP</Label>
              <Select {...connForm.register('pop_id')}>
                <option value="">Select POP</option>
                {(pops || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Billing cycle start</Label>
              <Input type="date" {...connForm.register('billing_cycle_start')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConnOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createConn.isPending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
