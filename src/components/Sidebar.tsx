import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
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
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
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
  { to: '/new-report', label: 'New Report', icon: FilePlus2, end: false, roles: ['ADMIN', 'RECEPTION'] },
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
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    api.settings.get().then((s) => setClinicName(s.clinic_name));
  }, []);

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

  const visibleLinks = links.filter((link) => !link.roles || (user && link.roles.includes(user.role)));

  return (
    <aside
      className={cn(
        'shrink-0 bg-primary text-primary-foreground flex flex-col no-print transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className={cn('px-4 py-5 border-b border-white/10', collapsed && 'px-3')}>
        <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
          <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
            <FlaskConical className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[10px] font-semibold tracking-[0.15em] uppercase text-primary-foreground/55">LabPro</div>
              <div className="text-[15px] font-bold leading-snug break-words">{clinicName || 'Loading…'}</div>
            </div>
          )}
        </div>
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
                isActive ? 'bg-white text-primary shadow-sm' : 'text-primary-foreground/80 hover:bg-white/10 hover:text-white'
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
