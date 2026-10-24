import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import { queryKeys } from './queryKeys.js';

export function useMarketplacePackages(params) {
  return useQuery({
    queryKey: queryKeys.marketplace.packages(params),
    queryFn: async () => {
      const { data } = await api.get('/marketplace/packages', { params });
      return data.data;
    },
  });
}

export function useMyConnectionsQuery() {
  return useQuery({
    queryKey: queryKeys.marketplace.myConnections,
    queryFn: async () => {
      const { data } = await api.get('/marketplace/my-connections');
      return data.data;
    },
  });
}

export function useBillingLogsQuery(connectionId) {
  return useQuery({
    queryKey: queryKeys.marketplace.billingLogs(connectionId),
    queryFn: async () => {
      const { data } = await api.get(`/marketplace/connections/${connectionId}/billing-logs`);
      return data.data;
    },
    enabled: Boolean(connectionId),
  });
}

export function useProrationPreviewQuery(connectionId, planId, enabled) {
  return useQuery({
    queryKey: queryKeys.marketplace.proration(connectionId, planId),
    queryFn: async () => {
      const { data } = await api.get('/marketplace/proration-preview', {
        params: { connectionId, planId },
      });
      return data.data;
    },
    enabled: Boolean(connectionId && planId && enabled),
  });
}

export function useChangePlanMutation(connectionId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan_id) => {
      const { data } = await api.post(`/marketplace/connections/${connectionId}/change-plan`, {
        plan_id,
      });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
}
