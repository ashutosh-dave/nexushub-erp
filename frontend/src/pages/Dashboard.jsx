import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import {
  useAnalyticsOverview,
  useConnectionsTrend,
  useTicketsTrend,
} from '../api/analytics.js';
import { useTicketsQuery } from '../api/tickets.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card.jsx';
import { Loader } from '../components/shared/Loader.jsx';
import { ErrorState } from '../components/shared/ErrorState.jsx';
import { StatusBadge } from '../components/shared/StatusBadge.jsx';
import { formatDateTime, getApiError } from '../lib/utils.js';

const STATUS_COLORS = {
  Pending: '#f59e0b',
  Active: '#10b981',
  Suspended: '#f97316',
  Terminated: '#94a3b8',
  Open: '#3b82f6',
  'In-Progress': '#6366f1',
  'Field Visit': '#f59e0b',
  Resolved: '#10b981',
};

function Kpi({ label, value, accent }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-sm text-slate-500">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${accent || 'text-slate-900'}`}>{value ?? '—'}</p>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const qc = useQueryClient();
  const overview = useAnalyticsOverview();
  const connTrend = useConnectionsTrend(30);
  const ticketTrend = useTicketsTrend(14);
  const slaTickets = useTicketsQuery({ page: 1, pageSize: 50 }, { poll: true });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['analytics'] });
    qc.invalidateQueries({ queryKey: ['tickets'] });
  };

  const loading = overview.isLoading;
  const error = overview.error;

  if (loading) return <Loader label="Loading dashboard…" />;
  if (error) {
    const e = getApiError(error);
    return <ErrorState message={e.message} onRetry={() => overview.refetch()} />;
  }

  const d = overview.data;
  const connDonut = (d.connections_by_status || []).map((r) => ({
    name: r.status,
    value: Number(r.count),
  }));
  const planBars = (d.bandwidth_by_plan || []).map((r) => ({
    name: r.name,
    mbps: Number(r.total_mbps || 0),
  }));
  const popBars = (d.bandwidth_by_pop || []).map((r) => ({
    name: r.code,
    mbps: Number(r.total_mbps || 0),
  }));
  const ticketBars = (d.tickets_by_status || []).map((r) => ({
    name: r.status,
    count: Number(r.count),
  }));

  const createdMap = new Map((connTrend.data?.created || []).map((r) => [r.day, Number(r.created)]));
  const activatedMap = new Map(
    (connTrend.data?.activated || []).map((r) => [r.day, Number(r.activated)])
  );
  const days = [...new Set([...createdMap.keys(), ...activatedMap.keys()])].sort();
  const connLine = days.map((day) => ({
    day,
    created: createdMap.get(day) || 0,
    activated: activatedMap.get(day) || 0,
  }));

  const openedMap = new Map((ticketTrend.data?.opened || []).map((r) => [r.day, Number(r.opened)]));
  const resolvedMap = new Map(
    (ticketTrend.data?.resolved || []).map((r) => [r.day, Number(r.resolved)])
  );
  const tDays = [...new Set([...openedMap.keys(), ...resolvedMap.keys()])].sort();
  const ticketLine = tDays.map((day) => ({
    day,
    opened: openedMap.get(day) || 0,
    resolved: resolvedMap.get(day) || 0,
  }));

  const slaList = (slaTickets.data?.items || []).filter(
    (t) => t.sla_state === 'breached' || t.sla_state === 'at_risk'
  );

  const activeConn =
    d.connections_by_status?.find((c) => c.status === 'Active')?.count ?? 0;
  const suspendedConn =
    d.connections_by_status?.find((c) => c.status === 'Suspended')?.count ?? 0;

  const updatedAt = overview.dataUpdatedAt
    ? formatDateTime(overview.dataUpdatedAt)
    : '—';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operations dashboard</h1>
          <p className="text-sm text-slate-500">Last updated {updatedAt}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Active connections" value={activeConn} />
        <Kpi label="Suspended" value={suspendedConn} accent="text-orange-600" />
        <Kpi label="Open tickets" value={d.open_tickets} />
        <Kpi label="SLA breached" value={d.sla_breached} accent="text-red-600" />
        <Kpi
          label="Tech hours today"
          value={Number(d.technician_assigned_hours_today || 0).toFixed(1)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Connections by status</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={connDonut} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                  {connDonut.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tickets by status</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ticketBars}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bandwidth by plan (Mbps)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planBars} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="mbps" fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bandwidth by POP (Mbps)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={popBars}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="mbps" fill="#0284c7" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Connections trend (30 days)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={connLine}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="created" stroke="#3b82f6" dot={false} />
                <Line type="monotone" dataKey="activated" stroke="#10b981" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tickets opened vs resolved (14 days)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ticketLine}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="opened" stroke="#ef4444" dot={false} />
                <Line type="monotone" dataKey="resolved" stroke="#22c55e" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SLA warnings</CardTitle>
        </CardHeader>
        <CardContent>
          {slaList.length === 0 ? (
            <p className="text-sm text-slate-500">No breached or at-risk tickets right now.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {slaList.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <Link to="/dispatch" className="font-medium text-blue-600 hover:underline">
                      {t.ticket_no}
                    </Link>
                    <span className="ml-2 text-sm text-slate-600">{t.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <StatusBadge status={t.priority} />
                    <span
                      className={
                        t.sla_state === 'breached' ? 'text-red-600 font-medium' : 'text-amber-600'
                      }
                    >
                      {t.sla_state === 'breached' ? 'Breached' : 'At risk'} · due{' '}
                      {formatDateTime(t.sla_due_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
