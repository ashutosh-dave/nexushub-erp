export const queryKeys = {
  auth: {
    me: ['auth', 'me'],
  },
  analytics: {
    overview: ['analytics', 'overview'],
    connectionsTrend: (days) => ['analytics', 'connections-trend', days],
    ticketsTrend: (days) => ['analytics', 'tickets-trend', days],
  },
  subscribers: {
    list: (params) => ['subscribers', 'list', params],
    detail: (id) => ['subscribers', 'detail', id],
  },
  connections: {
    list: (params) => ['connections', 'list', params],
    history: (id) => ['connections', 'history', id],
  },
  pops: {
    list: ['pops', 'list'],
  },
  plans: {
    list: (params) => ['plans', 'list', params],
  },
  marketplace: {
    packages: (params) => ['marketplace', 'packages', params],
    myConnections: ['marketplace', 'my-connections'],
    billingLogs: (id) => ['marketplace', 'billing-logs', id],
    proration: (connectionId, planId) => ['marketplace', 'proration', connectionId, planId],
  },
  tickets: {
    list: (params) => ['tickets', 'list', params],
    detail: (id) => ['tickets', 'detail', id],
  },
  tasks: {
    list: (params) => ['tasks', 'list', params],
  },
  technicians: {
    list: ['technicians', 'list'],
    available: (start, end) => ['technicians', 'available', start, end],
    schedule: (id, from, to) => ['technicians', 'schedule', id, from, to],
    myTasks: (params) => ['technicians', 'my-tasks', params],
  },
  audit: {
    list: (params) => ['audit', 'list', params],
  },
};
