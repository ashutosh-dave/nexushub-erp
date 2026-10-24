import { useQuery } from '@tanstack/react-query';
import { api } from './client.js';
import { queryKeys } from './queryKeys.js';

const pollWhenVisible = () => (document.hidden ? false : 10_000);

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: queryKeys.analytics.overview,
    queryFn: async () => {
      const { data } = await api.get('/analytics/overview');
      return data.data;
    },
    refetchInterval: pollWhenVisible,
    staleTime: 5_000,
  });
}

export function useConnectionsTrend(days = 30) {
  return useQuery({
    queryKey: queryKeys.analytics.connectionsTrend(days),
    queryFn: async () => {
      const { data } = await api.get('/analytics/connections-trend', { params: { days } });
      return data.data;
    },
    refetchInterval: pollWhenVisible,
    staleTime: 5_000,
  });
}

export function useTicketsTrend(days = 14) {
  return useQuery({
    queryKey: queryKeys.analytics.ticketsTrend(days),
    queryFn: async () => {
      const { data } = await api.get('/analytics/tickets-trend', { params: { days } });
      return data.data;
    },
    refetchInterval: pollWhenVisible,
    staleTime: 5_000,
  });
}
