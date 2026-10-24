import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import { queryKeys } from './queryKeys.js';
import { useAuth } from '../lib/auth.jsx';

export function useLoginMutation() {
  const { login } = useAuth();
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/auth/login', body);
      return data.data;
    },
    onSuccess: (data) => {
      login(data.token, data.user);
    },
  });
}

export function useMeQuery(enabled = true) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: async () => {
      const { data } = await api.get('/auth/me');
      return data.data;
    },
    enabled: enabled && isAuthenticated,
    staleTime: 60_000,
  });
}

export function useLogout() {
  const { logout } = useAuth();
  const qc = useQueryClient();
  return () => {
    logout();
    qc.clear();
  };
}
