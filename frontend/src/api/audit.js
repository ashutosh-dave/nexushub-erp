import { useQuery } from '@tanstack/react-query';
import { api } from './client.js';
import { queryKeys } from './queryKeys.js';

export function useAuditLogsQuery(params) {
  return useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: async () => {
      const { data } = await api.get('/audit-logs', { params });
      return { items: data.data, meta: data.meta };
    },
    placeholderData: (prev) => prev,
  });
}
