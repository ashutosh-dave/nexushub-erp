import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { AppShell } from './components/layout/AppShell.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Subscribers from './pages/Subscribers.jsx';
import SubscriberDetail from './pages/SubscriberDetail.jsx';
import Marketplace from './pages/Marketplace.jsx';
import Dispatch from './pages/Dispatch.jsx';
import Technicians from './pages/Technicians.jsx';
import AuditLog from './pages/AuditLog.jsx';
function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (user?.role === 'buyer') return <Navigate to="/marketplace" replace />;
  if (user?.role === 'technician') return <Navigate to="/technicians" replace />;
  return <Dashboard />;
}

export default function App() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route
          path="/subscribers"
          element={
            <ProtectedRoute roles={['admin', 'support_lead', 'support_agent']}>
              <Subscribers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/subscribers/:id"
          element={
            <ProtectedRoute roles={['admin', 'support_lead', 'support_agent']}>
              <SubscriberDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/marketplace"
          element={
            <ProtectedRoute roles={['admin', 'buyer']}>
              <Marketplace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch"
          element={
            <ProtectedRoute roles={['admin', 'support_lead', 'support_agent']}>
              <Dispatch />
            </ProtectedRoute>
          }
        />
        <Route
          path="/technicians"
          element={
            <ProtectedRoute roles={['admin', 'support_lead', 'technician']}>
              <Technicians />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <ProtectedRoute roles={['admin', 'support_lead']}>
              <AuditLog />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
