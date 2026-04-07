import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { settingsService } from '../services/settingsService';
import { DEFAULT_PERMISSIONS, type PageKey, type RolePermissions } from './PermissionsTab';

/** Maps page keys to their route paths */
const PAGE_TO_PATH: Record<PageKey, string> = {
  dashboard: '/dashboard',
  qsr: '/qsr',
  'pan-corner': '/pan-corner',
  orders: '/orders',
  menu: '/menu',
  tables: '/tables',
  analytics: '/analytics',
  inventory: '/inventory',
  kitchen: '/kitchen',
  crm: '/crm',
  credit: '/credit',
  reports: '/reports',
  'staff-management': '/staff-management',
  'tv-menu': '/tv-menu',
};

/**
 * Smart redirect that sends users to their first permitted page.
 * OWNER always goes to dashboard.
 */
export default function RoleRedirect() {
  const { user } = useAuth();

  const { data: restaurant, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
    enabled: !!user,
  });

  if (!user) return <Navigate to="/login" replace />;

  // OWNER always goes to dashboard
  if (user.role === 'OWNER') return <Navigate to="/dashboard" replace />;

  // Wait for settings to load before redirecting to avoid wrong landing page
  if (isLoading) return null;

  // Determine allowed pages
  const settings = (restaurant?.settings ?? {}) as Record<string, unknown>;
  const savedPerms = settings.rolePermissions as RolePermissions | undefined;
  const roleKey = user.role as keyof RolePermissions;

  let allowedPages: PageKey[];
  if (user.roleTitle && savedPerms?.[user.roleTitle]) {
    allowedPages = savedPerms[user.roleTitle] || [];
  } else {
    allowedPages = savedPerms?.[roleKey] || DEFAULT_PERMISSIONS[roleKey] || [];
  }

  // Navigate to the first allowed page, fallback to dashboard
  const landingPage = allowedPages[0] || 'dashboard';

  return <Navigate to={PAGE_TO_PATH[landingPage] || '/dashboard'} replace />;
}
