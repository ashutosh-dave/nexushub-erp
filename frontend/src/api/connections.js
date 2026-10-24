import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import { queryKeys } from './queryKeys.js';

export function useConnectionsQuery(params = {}) {
  return useQuery({
    queryKey: queryKeys.connections.list(params),
    queryFn: async () => {
      const { data } = await api.get('/connections', { params });
      return { items: data.data, meta: data.meta };
    },
    placeholderData: (prev) => prev,
  });
}

export function useConnectionHistoryQuery(id) {
  return useQuery({
    queryKey: queryKeys.connections.history(id),
    queryFn: async () => {
      const { data } = await api.get(`/connections/${id}/history`);
      return data.data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateConnectionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/connections', body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscribers'] }),
  });
}

export function usePatchConnectionMutation(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.patch(`/connections/${id}`, body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscribers'] });
      qc.invalidateQueries({ queryKey: queryKeys.connections.history(id) });
    },
  });
}

export function useConnectionStatusMutation(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.patch(`/connections/${id}/status`, body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscribers'] });
      qc.invalidateQueries({ queryKey: queryKeys.connections.history(id) });
    },
  });
}
