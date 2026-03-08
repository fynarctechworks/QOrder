import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from './LoadingScreen';
import { settingsService } from '../services/settingsService';
import { DEFAULT_PERMISSIONS, type PageKey, type RolePermissions } from './PermissionsTab';
import type { UserRole } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If provided, only these roles may access the route. All authenticated users pass when omitted. */
  allowedRoles?: UserRole[];
  /** If provided, checks the user's role permissions for this page key */
  pageKey?: PageKey;
}

export default function ProtectedRoute({ children, allowedRoles, pageKey }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  const { data: restaurant } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
    enabled: isAuthenticated,
  });

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role gate — redirect unauthorized roles to their landing page
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  // Permission gate — check page-level permissions for non-OWNER roles
  if (pageKey && user && user.role !== 'OWNER') {
    const settings = (restaurant?.settings ?? {}) as Record<string, unknown>;
    const savedPerms = settings.rolePermissions as RolePermissions | undefined;
    const roleKey = user.role as keyof RolePermissions;

    // Check roleTitle-specific permissions first, then fall back to base role
    let allowedPages: PageKey[];
    if (user.roleTitle && savedPerms?.[user.roleTitle]) {
      allowedPages = savedPerms[user.roleTitle] ?? [];
    } else {
      allowedPages = savedPerms?.[roleKey] ?? DEFAULT_PERMISSIONS[roleKey] ?? [];
    }

    if (!allowedPages.includes(pageKey)) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
