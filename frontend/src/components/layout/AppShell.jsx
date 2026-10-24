import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Store,
  Kanban,
  Wrench,
  ScrollText,
  LogOut,
  Menu,
} from 'lucide-react';
import { useState } from 'react';
import { useLogout } from '../../api/auth.js';
import { useAuth } from '../../lib/auth.jsx';
import { Button } from '../ui/Button.jsx';
import { Sheet } from '../ui/Sheet.jsx';
import { cn } from '../../lib/utils.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'support_lead', 'support_agent'] },
  { to: '/subscribers', label: 'Subscribers', icon: Users, roles: ['admin', 'support_lead', 'support_agent'] },
  { to: '/dispatch', label: 'Dispatch', icon: Kanban, roles: ['admin', 'support_lead', 'support_agent'] },
  { to: '/marketplace', label: 'Marketplace', icon: Store, roles: ['admin', 'buyer'] },
  { to: '/technicians', label: 'Technicians', icon: Wrench, roles: ['admin', 'support_lead', 'technician'] },
  { to: '/audit', label: 'Audit log', icon: ScrollText, roles: ['admin', 'support_lead'] },
];

function NavItems({ onNavigate }) {
  const { user } = useAuth();
  const items = NAV.filter((n) => n.roles.includes(user?.role));

  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              isActive && 'bg-blue-50 text-blue-700'
            )
          }
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
        <div className="border-b border-slate-200 px-4 py-4">
          <span className="text-lg font-bold text-slate-900">NexusHub</span>
          <p className="text-xs text-slate-500">ISP Operations</p>
        </div>
        <div className="flex-1 p-3">
          <NavItems />
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen} title="Menu">
        <NavItems onNavigate={() => setMobileOpen(false)} />
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="font-semibold text-slate-800 md:hidden">NexusHub</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden text-right sm:block">
              <p className="font-medium text-slate-900">{user?.name}</p>
              <p className="text-xs capitalize text-slate-500">{user?.role?.replace('_', ' ')}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
