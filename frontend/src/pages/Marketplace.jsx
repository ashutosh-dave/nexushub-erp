import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  useBillingLogsQuery,
  useChangePlanMutation,
  useMarketplacePackages,
  useMyConnectionsQuery,
  useProrationPreviewQuery,
} from '../api/marketplace.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { formatCurrency, getApiError } from '../lib/utils.js';
import { Loader } from '../components/shared/Loader.jsx';
import { ErrorState } from '../components/shared/ErrorState.jsx';
import { StatusBadge } from '../components/shared/StatusBadge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card.jsx';
import { Select } from '../components/ui/Select.jsx';
import { Dialog, DialogContent, DialogFooter } from '../components/ui/Dialog.jsx';
import { DataTable } from '../components/shared/DataTable.jsx';

export default function Marketplace() {
  useDocumentTitle('Marketplace');
  const [segment, setSegment] = useState('');
  const [minSpeed, setMinSpeed] = useState('');
  const [selectedConn, setSelectedConn] = useState(null);
  const [pendingPlan, setPendingPlan] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const pkgParams = useMemo(
    () => ({
      segment: segment || undefined,
      minSpeed: minSpeed || undefined,
    }),
    [segment, minSpeed]
  );

  const billingColumns = useMemo(
    () => [
      { accessorKey: 'entry_type', header: 'Type' },
      { accessorKey: 'description', header: 'Description' },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ getValue }) => formatCurrency(getValue()),
      },
      { accessorKey: 'period_start', header: 'Period start' },
      { accessorKey: 'period_end', header: 'Period end' },
    ],
    []
  );

  const packages = useMarketplacePackages(pkgParams);
  const connections = useMyConnectionsQuery();
  const activeConn = selectedConn || connections.data?.[0];
  const connId = activeConn?.id;

  const preview = useProrationPreviewQuery(connId, pendingPlan?.id, previewOpen);
  const changePlan = useChangePlanMutation(connId);
  const billing = useBillingLogsQuery(connId);

  const loading = packages.isLoading || connections.isLoading;
  const error = packages.error || connections.error;

  if (loading) return <Loader />;
  if (error) {
    return (
      <ErrorState
        message={getApiError(error).message}
        onRetry={() => {
          packages.refetch();
          connections.refetch();
        }}
      />
    );
  }

  const currentPlanId = activeConn?.plan_id;

  const confirmChange = () => {
    if (!pendingPlan) return;
    changePlan.mutate(pendingPlan.id, {
      onSuccess: () => {
        toast.success('Plan changed');
        setPreviewOpen(false);
        connections.refetch();
        billing.refetch();
      },
      onError: (err) => toast.error(getApiError(err).message),
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Marketplace</h1>

      {(connections.data || []).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Your connection</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Select
              value={connId || ''}
              onChange={(e) => {
                const c = connections.data.find((x) => String(x.id) === e.target.value);
                setSelectedConn(c);
              }}
              className="max-w-md"
            >
              {(connections.data || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.connection_code} — {c.plan_name} ({c.status})
                </option>
              ))}
            </Select>
            {activeConn ? <StatusBadge status={activeConn.status} /> : null}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-slate-500">No connections linked to your account.</p>
      )}

      <div className="flex flex-wrap gap-3">
        <Select value={segment} onChange={(e) => setSegment(e.target.value)} className="w-36">
          <option value="">All segments</option>
          <option value="B2C">B2C</option>
          <option value="B2B">B2B</option>
        </Select>
        <Select value={minSpeed} onChange={(e) => setMinSpeed(e.target.value)} className="w-40">
          <option value="">Any speed</option>
          <option value="100">100+ Mbps</option>
          <option value="500">500+ Mbps</option>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(packages.data || []).map((pkg) => {
          const isCurrent = pkg.id === currentPlanId;
          const isActiveConn = activeConn?.status === 'Active';
          return (
            <Card key={pkg.id} className={isCurrent ? 'ring-2 ring-blue-500' : ''}>
              <CardHeader>
                <CardTitle>{pkg.name}</CardTitle>
                <p className="text-sm text-slate-500">
                  {pkg.segment} · {pkg.speed_mbps} Mbps
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-bold">{formatCurrency(pkg.monthly_price)}/mo</p>
                {isCurrent ? (
                  <span className="text-sm font-medium text-blue-600">Current plan</span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!isActiveConn || !connId}
                    onClick={() => {
                      setPendingPlan(pkg);
                      setPreviewOpen(true);
                    }}
                  >
                    {Number(pkg.monthly_price) > Number(activeConn?.monthly_price || 0)
                      ? 'Upgrade'
                      : 'Change plan'}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {connId ? (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Billing log</h2>
          {billing.isLoading ? (
            <Loader className="py-6" />
          ) : (
            <DataTable columns={billingColumns} data={billing.data || []} />
          )}
        </div>
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent title="Proration preview" description={pendingPlan?.name}>
          {preview.isLoading ? (
            <Loader className="py-6" label="Calculating…" />
          ) : preview.error ? (
            <p className="text-sm text-red-600">{getApiError(preview.error).message}</p>
          ) : preview.data ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt>Old plan credit</dt>
                <dd>{formatCurrency(preview.data.oldCredit)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>New plan charge</dt>
                <dd>{formatCurrency(preview.data.newCharge)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <dt>Net amount</dt>
                <dd>{formatCurrency(preview.data.net)}</dd>
              </div>
              {preview.data.daysRemaining != null ? (
                <p className="text-slate-500">{preview.data.daysRemaining} days remaining in cycle</p>
              ) : null}
            </dl>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmChange} disabled={changePlan.isPending}>
              Confirm change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
