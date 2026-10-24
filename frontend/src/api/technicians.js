import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import { queryKeys } from './queryKeys.js';

export function useTechniciansQuery(options = {}) {
  return useQuery({
    queryKey: queryKeys.technicians.list,
    queryFn: async () => {
      const { data } = await api.get('/technicians');
      return data.data;
    },
    staleTime: 30_000,
    ...options,
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

/**
 * Own schedule for the logged-in technician.
 * Prefers GET /technicians/me/schedule (server uses req.user.id); falls back to
 * /technicians/:id/schedule when the me route is not deployed yet.
 */
export function useMyScheduleQuery(from, to, options = {}) {
  const { userId, enabled, ...rest } = options;
  return useQuery({
    queryKey: queryKeys.technicians.schedule(userId ? `me:${userId}` : 'me', from, to),
    queryFn: async () => {
      try {
        const { data } = await api.get('/technicians/me/schedule', { params: { from, to } });
        return data.data;
      } catch (err) {
        if (userId && err.response?.status === 404) {
          const { data } = await api.get(`/technicians/${userId}/schedule`, { params: { from, to } });
          return data.data;
        }
        throw err;
      }
    },
    enabled: Boolean(from && to) && enabled !== false,
    ...rest,
  });
}

export function useCreateShiftMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ technicianId, ...body }) => {
      const { data } = await api.post(`/technicians/${technicianId}/shifts`, body);
      return data.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['technicians'] });
      if (vars?.technicianId) {
        qc.invalidateQueries({
          queryKey: ['technicians', 'schedule', vars.technicianId],
        });
      }
    },
  });
}

export function useDeleteShiftMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (shiftId) => {
      const { data } = await api.delete(`/technician-shifts/${shiftId}`);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['technicians'] });
    },
  });
}
