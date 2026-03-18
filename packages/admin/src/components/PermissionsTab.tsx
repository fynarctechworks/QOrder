import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { settingsService } from '../services/settingsService';
import Toggle from './Toggle';

/* ═══════════════════════ Types ══════════════════════════ */

export type PageKey = 'dashboard' | 'create-order' | 'qsr' | 'pan-corner' | 'orders' | 'menu' | 'tables' | 'analytics' | 'inventory' | 'kitchen' | 'crm' | 'credit' | 'reports' | 'staff-management' | 'tv-menu';

/** Base roles always present + optional custom roleTitle keys */
export interface RolePermissions {
  ADMIN: PageKey[];
  MANAGER: PageKey[];
  STAFF: PageKey[];
  [roleTitle: string]: PageKey[];
}

export const ALL_PAGES: { key: PageKey; label: string; description: string; icon: string }[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Overview stats and running tables',
    icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z',
  },
  {
    key: 'create-order',
    label: 'Create Order',
    description: 'Create new orders from the POS',
    icon: 'M12 4v16m8-8H4',
  },
  {
    key: 'qsr',
    label: 'QSR',
    description: 'Quick service restaurant cashier order entry',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    key: 'pan-corner',
    label: 'Pan Corner',
    description: 'Counter billing for paan, tobacco, mukhwas and beverages',
    icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    key: 'orders',
    label: 'Orders',
    description: 'View and manage incoming orders',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    key: 'menu',
    label: 'Menu',
    description: 'View and edit menu items',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  {
    key: 'tables',
    label: 'Tables',
    description: 'Manage table layout and QR codes',
    icon: 'M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    description: 'Revenue reports and order history',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2z',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    description: 'Track ingredients, suppliers, and stock levels',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  },
  {
    key: 'kitchen',
    label: 'Kitchen Display',
    description: 'Full-screen kitchen order display for cooks',
    icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z',
  },
  {
    key: 'crm',
    label: 'CRM',
    description: 'Customer relationship management and insights',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    key: 'credit',
    label: 'Credit',
    description: 'Manage credit accounts and track outstanding balances',
    icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  },
  {
    key: 'reports',
    label: 'Reports',
    description: 'Comprehensive business reports and analytics',
    icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    key: 'staff-management',
    label: 'Staff Management',
    description: 'Manage shifts, attendance, leave, and payroll',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  },
  {
    key: 'tv-menu',
    label: 'TV Menu',
    description: 'Full-screen digital menu display for restaurant TVs',
    icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
];

/** Default permissions for each role */
export const DEFAULT_PERMISSIONS: RolePermissions = {
  ADMIN: ['dashboard', 'create-order', 'qsr', 'pan-corner', 'orders', 'menu', 'tables', 'analytics', 'inventory', 'kitchen', 'crm', 'credit', 'reports', 'staff-management', 'tv-menu'],
  MANAGER: ['dashboard', 'create-order', 'qsr', 'pan-corner', 'orders', 'menu', 'tables', 'analytics', 'inventory', 'kitchen', 'crm', 'credit', 'reports', 'tv-menu'],
  STAFF: ['create-order', 'qsr', 'pan-corner', 'orders', 'tables', 'kitchen'],
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  STAFF: 'Cashier',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: 'Full access to operations. Cannot manage other staff.',
  MANAGER: 'Manage day-to-day operations and view reports.',
  STAFF: 'Basic access for taking and managing orders.',
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-blue-50 border-blue-200',
  MANAGER: 'bg-amber-50 border-amber-200',
  STAFF: 'bg-gray-50 border-gray-200',
};

/* ═══════════════════ Component ═══════════════════════════ */

const BASE_ROLES = ['ADMIN', 'MANAGER', 'STAFF'] as const;

export default function PermissionsTab() {
  const queryClient = useQueryClient();

  const { data: restaurant } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 0,
  });

  const [permissions, setPermissions] = useState<RolePermissions>(DEFAULT_PERMISSIONS);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');

  /** Only custom role keys (exclude base roles) */
  const allRoleKeys = useMemo(() => {
    return Object.keys(permissions).filter(
      (k) => !BASE_ROLES.includes(k as any)
    );
  }, [permissions]);

  // Sync from server settings
  useEffect(() => {
    if (!restaurant) return;
    const s = (restaurant.settings ?? {}) as Record<string, unknown>;
    const saved = s.rolePermissions as RolePermissions | undefined;
    if (saved) {
      const merged: RolePermissions = {
        ADMIN: saved.ADMIN || DEFAULT_PERMISSIONS.ADMIN,
        MANAGER: saved.MANAGER || DEFAULT_PERMISSIONS.MANAGER,
        STAFF: saved.STAFF || DEFAULT_PERMISSIONS.STAFF,
      };
      // Load custom roleTitle permissions
      for (const key of Object.keys(saved)) {
        if (key !== 'ADMIN' && key !== 'MANAGER' && key !== 'STAFF') {
          merged[key] = saved[key] || [];
        }
      }
      setPermissions(merged);
    }
  }, [restaurant]);

  const initial = useMemo<RolePermissions>(() => {
    if (!restaurant) return DEFAULT_PERMISSIONS;
    const s = (restaurant.settings ?? {}) as Record<string, unknown>;
    const saved = s.rolePermissions as RolePermissions | undefined;
    if (saved) {
      const merged: RolePermissions = {
        ADMIN: saved.ADMIN || DEFAULT_PERMISSIONS.ADMIN,
        MANAGER: saved.MANAGER || DEFAULT_PERMISSIONS.MANAGER,
        STAFF: saved.STAFF || DEFAULT_PERMISSIONS.STAFF,
      };
      for (const key of Object.keys(saved)) {
        if (key !== 'ADMIN' && key !== 'MANAGER' && key !== 'STAFF') {
          merged[key] = saved[key] || [];
        }
      }
      return merged;
    }
    return DEFAULT_PERMISSIONS;
  }, [restaurant]);

  const isDirty = useMemo(
    () => JSON.stringify(permissions) !== JSON.stringify(initial),
    [permissions, initial]
  );

  const mutation = useMutation({
    mutationFn: () =>
      settingsService.update({
        settings: { rolePermissions: permissions } as any,
      }),
    retry: false,
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Permissions saved');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save permissions'),
  });

  const togglePermission = (role: string, page: PageKey) => {
    setPermissions((prev) => {
      const current = prev[role] || [];
      const has = current.includes(page);
      return {
        ...prev,
        [role]: has ? current.filter((p) => p !== page) : [...current, page],
      };
    });
  };

  const toggleAll = (role: string, checked: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [role]: checked ? ALL_PAGES.map((p) => p.key) : [],
    }));
  };

  const toggleExpanded = (role: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const isCustomRole = (key: string) => !BASE_ROLES.includes(key as any);

  const addCustomRole = () => {
    const name = newRoleName.trim();
    if (!name) return;
    if (permissions[name]) {
      toast.error('A role with this name already exists');
      return;
    }
    setPermissions((prev) => ({ ...prev, [name]: [] }));
    setExpandedRoles((prev) => new Set(prev).add(name));
    setNewRoleName('');
    setIsAddingRole(false);
    toast.success(`Role "${name}" created`);
  };

  const deleteCustomRole = (key: string) => {
    setPermissions((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    toast.success(`Role "${key}" removed`);
  };

  /** Render a permission card section for any role key */
  const renderRoleSection = (key: string) => {
    const rolePerms = permissions[key] || [];
    const allChecked = ALL_PAGES.every((p) => rolePerms.includes(p.key));
    const isExpanded = expandedRoles.has(key);
    const label = ROLE_LABELS[key] ?? key;
    const description = ROLE_DESCRIPTIONS[key] ?? (isCustomRole(key) ? `Custom role permissions` : '');
    const colorClass = ROLE_COLORS[key] ?? 'bg-purple-50 border-purple-200';
    const enabledCount = rolePerms.length;

    return (
      <div
        key={key}
        className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${colorClass}`}
      >
        {/* Role header — clickable to expand/collapse */}
        <button
          type="button"
          onClick={() => toggleExpanded(key)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-black/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Chevron */}
            <svg
              className={`w-4 h-4 text-text-muted shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
              <p className="text-xs text-text-muted mt-0.5">
                {description}
                {!isExpanded && <span className="ml-1 text-text-muted/70">· {enabledCount}/{ALL_PAGES.length} pages</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isCustomRole(key) && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); deleteCustomRole(key); }}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
              >
                Delete
              </span>
            )}
          </div>
        </button>

        {/* Collapsible body */}
        {isExpanded && (
          <div className="border-t border-gray-100">
            {/* All toggle */}
            <div className="px-5 py-3 flex items-center justify-end border-b border-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">All</span>
                <Toggle
                  checked={allChecked}
                  onChange={() => toggleAll(key, !allChecked)}
                  size="sm"
                />
              </div>
            </div>

            {/* Page toggles */}
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_PAGES.map((page) => {
                const isEnabled = rolePerms.includes(page.key);
                return (
                  <button
                    key={page.key}
                    onClick={() => togglePermission(key, page.key)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      isEnabled
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isEnabled ? 'bg-primary/10' : 'bg-gray-100'
                    }`}>
                      <svg className={`w-4 h-4 ${isEnabled ? 'text-primary' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={page.icon} />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${isEnabled ? 'text-text-primary' : 'text-text-muted'}`}>
                        {page.label}
                      </p>
                      <p className="text-[10px] text-text-muted truncate">{page.description}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                      isEnabled ? 'bg-primary text-white' : 'bg-gray-200'
                    }`}>
                      {isEnabled && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div
      key="permissions"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15 }}
      className="space-y-5"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">Role Permissions</h2>
        <p className="text-xs text-text-muted mt-0.5">
          Create custom roles and control which pages each role can access.
        </p>
      </div>

      {allRoleKeys.length === 0 && !isAddingRole && (
        <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
          <h3 className="text-sm font-semibold text-text-primary mb-1">No custom roles yet</h3>
          <p className="text-xs text-text-muted mb-4">Add a role to start assigning page permissions</p>
        </div>
      )}

      {allRoleKeys.map((key) => renderRoleSection(key))}

      {/* Add custom role */}
      {isAddingRole ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-4 flex items-center gap-3">
          <input
            autoFocus
            type="text"
            placeholder="Enter role name…"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCustomRole(); if (e.key === 'Escape') { setIsAddingRole(false); setNewRoleName(''); } }}
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <button
            onClick={addCustomRole}
            disabled={!newRoleName.trim()}
            className="btn-primary rounded-xl text-sm px-4 py-2 disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => { setIsAddingRole(false); setNewRoleName(''); }}
            className="px-3 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsAddingRole(true)}
          className="w-full bg-white rounded-2xl border-2 border-dashed border-gray-300 hover:border-primary/40 hover:bg-primary/5 transition-all py-4 flex items-center justify-center gap-2 text-sm font-medium text-text-muted hover:text-primary"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Role
        </button>
      )}

      {/* Save bar */}
      {isDirty && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky bottom-4 z-20"
        >
          <div className="bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-lg px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <p className="text-sm text-text-secondary truncate">Permission changes are unsaved</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setPermissions(initial)}
                className="px-4 py-2 bg-gray-100 text-text-secondary rounded-xl text-sm font-medium hover:bg-gray-200 transition-all"
              >
                Discard
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="btn-primary rounded-xl text-sm px-5 py-2 shadow-sm active:scale-[0.97] disabled:opacity-60"
              >
                {mutation.isPending ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
