import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import { queryKeys } from './queryKeys.js';

const pollWhenVisible = () => (document.hidden ? false : 10_000);

export function useTicketsQuery(params, options = {}) {
  return useQuery({
    queryKey: queryKeys.tickets.list(params),
    queryFn: async () => {
      const { data } = await api.get('/tickets', { params });
      return { items: data.data, meta: data.meta };
    },
    refetchInterval: options.poll ? pollWhenVisible : false,
    placeholderData: (prev) => prev,
    ...options,
  });
}

export function useTicketQuery(id) {
  return useQuery({
    queryKey: queryKeys.tickets.detail(id),
    queryFn: async () => {
      const { data } = await api.get(`/tickets/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateTicketMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/tickets', body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useUpdateTicketMutation(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.patch(`/tickets/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useTicketStatusMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const { data } = await api.patch(`/tickets/${id}/status`, { status });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useTicketReorderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.patch('/tickets/reorder', body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useCreateTasksMutation(ticketId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tasks) => {
      const { data } = await api.post(`/tickets/${ticketId}/tasks`, tasks);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useTicketNotesQuery(ticketId) {
  return useQuery({
    queryKey: [...queryKeys.tickets.detail(ticketId), 'notes'],
    queryFn: async () => {
      const { data } = await api.get(`/tickets/${ticketId}/notes`);
      return data.data;
    },
    enabled: Boolean(ticketId),
  });
}

export function useCreateTicketNoteMutation(ticketId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post(`/tickets/${ticketId}/notes`, { body });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tickets.detail(ticketId) });
      qc.invalidateQueries({ queryKey: [...queryKeys.tickets.detail(ticketId), 'notes'] });
    },
  });
}
