import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import { queryKeys } from './queryKeys.js';

export function useSubscribersQuery(params) {
  return useQuery({
    queryKey: queryKeys.subscribers.list(params),
    queryFn: async () => {
      const { data } = await api.get('/subscribers', { params });
      return { items: data.data, meta: data.meta };
    },
    placeholderData: (prev) => prev,
  });
}

export function useSubscriberQuery(id) {
  return useQuery({
    queryKey: queryKeys.subscribers.detail(id),
    queryFn: async () => {
      const { data } = await api.get(`/subscribers/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateSubscriberMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/subscribers', body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscribers'] }),
  });
}

export function useUpdateSubscriberMutation(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.patch(`/subscribers/${id}`, body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscribers'] });
      qc.invalidateQueries({ queryKey: queryKeys.subscribers.detail(id) });
    },
  });
}
