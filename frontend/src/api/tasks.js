import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import { queryKeys } from './queryKeys.js';

const pollWhenVisible = () => (document.hidden ? false : 10_000);

export function useTasksQuery(params, options = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.list(params),
    queryFn: async () => {
      const { data } = await api.get('/tasks', { params });
      return { items: data.data, meta: data.meta };
    },
    refetchInterval: options.poll ? pollWhenVisible : false,
    placeholderData: (prev) => prev,
    ...options,
  });
}

export function useTaskStatusMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const { data } = await api.patch(`/tasks/${id}/status`, { status });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['technicians'] });
    },
  });
}

export function useTaskAssignMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }) => {
      const { data } = await api.patch(`/tasks/${id}/assign`, body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useTaskReorderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.patch('/tasks/reorder', body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
