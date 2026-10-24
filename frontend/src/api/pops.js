import { useQuery } from '@tanstack/react-query';
import { api } from './client.js';
import { queryKeys } from './queryKeys.js';

export function usePopsQuery() {
  return useQuery({
    queryKey: queryKeys.pops.list,
    queryFn: async () => {
      const { data } = await api.get('/pops');
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function usePlansQuery(params = {}) {
  return useQuery({
    queryKey: queryKeys.plans.list(params),
    queryFn: async () => {
      const { data } = await api.get('/plans', { params });
      return data.data;
    },
    staleTime: 60_000,
  });
}
