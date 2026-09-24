import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FilePlus2,
  FileText,
  Settings as SettingsIcon,
  FlaskConical,
  Users as UsersIcon,
  UserCog,
  BadgeDollarSign,
  ClipboardList,
  ChevronsLeft,
  ChevronsRight,
  History,
  Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useClinic } from '@/lib/clinic-context';
import type { Role } from '@/lib/types';

interface NavLinkDef {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
  // Omit to allow every role.
  roles?: Role[];
}

const links: NavLinkDef[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/new-report', label: 'New Report', icon: FilePlus2, end: true, roles: ['ADMIN', 'RECEPTION'] },
  { to: '/reports', label: 'Reports History', icon: FileText, end: false },
  { to: '/patients', label: 'Patients', icon: UsersIcon, end: false, roles: ['ADMIN', 'RECEPTION'] },
  { to: '/tests', label: 'Test Catalog', icon: ClipboardList, end: false, roles: ['ADMIN'] },
  { to: '/revenue', label: 'Revenue', icon: BadgeDollarSign, end: false, roles: ['ADMIN', 'RECEPTION'] },
  { to: '/test-report', label: 'Test Report', icon: Printer, end: false, roles: ['ADMIN', 'RECEPTION'] },
  { to: '/users', label: 'Users', icon: UserCog, end: false, roles: ['ADMIN'] },
  { to: '/audit', label: 'Audit Log', icon: History, end: false, roles: ['ADMIN'] },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false },
];

const COLLAPSE_KEY = 'labpro-sidebar-collapsed';

export default function Sidebar() {
  const { user } = useAuth();
  const { clinicName } = useClinic();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Non-fatal — collapse state just won't persist across restarts.
      }
      return next;
    });
  };

  // An existing report opens in the editor at /new-report/:id — that's part
  // of Reports History, not a new report, so highlight Reports History.
  const { pathname } = useLocation();
  const editingReport = /^\/new-report\/\d+/.test(pathname);

  const visibleLinks = links.filter((link) => !link.roles || (user && link.roles.includes(user.role)));

  return (
    <aside
      className={cn(
        'shrink-0 bg-primary text-primary-foreground flex flex-col no-print transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className={cn('relative px-4 py-5', collapsed && 'px-3')}>
        <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
          <div className="relative h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-white/25 via-white/10 to-transparent shadow-md shadow-black/20 ring-1 ring-white/25 flex items-center justify-center">
            <FlaskConical className="h-5 w-5 drop-shadow-sm" strokeWidth={2.25} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary-foreground/60">
                Laboratory System
              </div>
              <div className="text-[16px] font-bold leading-snug tracking-tight break-words">{clinicName || 'Loading…'}</div>
            </div>
          )}
        </div>
        <div className="absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      </div>

      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {visibleLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            title={collapsed ? link.label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                collapsed && 'justify-center px-0',
                isActive || (editingReport && link.to === '/reports') ? 'bg-white text-primary shadow-sm' : 'text-primary-foreground/80 hover:bg-white/10 hover:text-white'
              )
            }
          >
            <link.icon className="h-4 w-4 shrink-0" />
            {!collapsed && link.label}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={toggleCollapsed}
        className={cn(
          'flex items-center gap-2 px-4 py-3 text-xs font-medium text-primary-foreground/60 hover:bg-white/10 hover:text-white border-t border-white/10 transition-colors',
          collapsed && 'justify-center px-0'
        )}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        {!collapsed && 'Collapse'}
      </button>
    </aside>
  );
}
