import { useQuery } from '@tanstack/react-query';
import { api } from './client.js';
import { queryKeys } from './queryKeys.js';

export function useTechniciansQuery() {
  return useQuery({
    queryKey: queryKeys.technicians.list,
    queryFn: async () => {
      const { data } = await api.get('/technicians');
      return data.data;
    },
    staleTime: 30_000,
  });
}

export function useAvailableTechniciansQuery(start, end, enabled) {
  return useQuery({
    queryKey: queryKeys.technicians.available(start, end),
    queryFn: async () => {
      const { data } = await api.get('/technicians/available', { params: { start, end } });
      return data.data;
    },
    enabled: Boolean(start && end && enabled),
  });
}

export function useTechnicianScheduleQuery(id, from, to) {
  return useQuery({
    queryKey: queryKeys.technicians.schedule(id, from, to),
    queryFn: async () => {
      const { data } = await api.get(`/technicians/${id}/schedule`, { params: { from, to } });
      return data.data;
    },
    enabled: Boolean(id && from && to),
  });
}
