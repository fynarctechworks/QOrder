import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Logo from '../components/Logo';
import ServiceRequestsPanel from '../components/ServiceRequestsPanel';
import LockScreen from '../components/LockScreen';
import { settingsService } from '../services/settingsService';
import { DEFAULT_PERMISSIONS, type PageKey, type RolePermissions } from '../components/PermissionsTab';
import { useIdleLock } from '../hooks/useIdleLock';
import { useNotificationSound } from '../hooks/useNotificationSound';
import NotificationOverlay, { useNotificationOverlay } from '../components/NotificationOverlay';
import Chatbot from '../components/Chatbot';

const navigation = [
  {
    name: 'Dashboard',
    path: '/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    name: 'Create Order',
    path: '/create-order',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    name: 'QSR',
    path: '/qsr',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    name: 'Orders',
    path: '/orders',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    name: 'Menu',
    path: '/menu',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    name: 'Tables',
    path: '/tables',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    name: 'Analytics',
    path: '/analytics',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    name: 'Inventory',
    path: '/inventory',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    name: 'Discounts',
    path: '/discounts',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
  },
  {
    name: 'Feedback',
    path: '/feedback',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
  {
    name: 'Kitchen Display',
    path: '/kitchen',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
      </svg>
    ),
  },
  {
    name: 'CRM',
    path: '/crm',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    name: 'Credit',
    path: '/credit',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    name: 'Reports',
    path: '/reports',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    name: 'Staff Management',
    path: '/staff-management',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    name: 'Branches',
    path: '/branches',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    name: 'TV Menu',
    path: '/tv-menu',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    name: 'Settings',
    path: '/settings',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function DashboardLayout() {
  return (
      <DashboardLayoutInner />
  );
}

function DashboardLayoutInner() {
  const [isSidebarCollapsed, _setIsSidebarCollapsed] = useState(false);
  const [isSidebarHidden, setIsSidebarHidden] = useState(() => window.innerWidth < 768);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  // Auto-hide sidebar on resize
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
      if (e.matches) setIsSidebarHidden(true);
    };
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const [isServicePanelOpen, setIsServicePanelOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { user, logout } = useAuth();
  const { isConnected, onNewOrder, onServiceRequest, onItemKitchenReady, onLeaveRequest, onStockLow, onStaffLate, onStaffEarlyCheckout, triggerSync, kdsCount, kdsUsers } = useSocket();
  const { play: playSound } = useNotificationSound();
  const { notifications, push: pushNotification, dismiss: dismissNotification, dismissAll: dismissAllNotifications } = useNotificationOverlay();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isKdsDropdownOpen, setIsKdsDropdownOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const kdsDropdownRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Scroll to top on route change
  useEffect(() => {
    mainContentRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  // Fetch restaurant settings for role permissions
  const { data: restaurant, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
  });

  // Auto-lock on idle
  const settings = (restaurant?.settings ?? {}) as Record<string, unknown>;
  const autoLockEnabled = (settings.autoLockEnabled as boolean) ?? false;
  const autoLockTimeout = (settings.autoLockTimeout as number) ?? 2;
  const hasLockPin = (settings.hasLockPin as boolean) ?? false;
  const { isLocked, unlock, lock } = useIdleLock({
    enabled: autoLockEnabled,
    timeoutMinutes: autoLockTimeout,
  });

  // ── Global notification sounds + overlay popups ──
  useEffect(() => {
    const SERVICE_LABELS: Record<string, string> = {
      CALL_WAITER: 'Call Waiter',
      WATER: 'Water Refill',
      BILL: 'Request Bill',
      CUSTOM: 'Custom Request',
      call_waiter: 'Call Waiter',
      water_refill: 'Water Refill',
      request_bill: 'Request Bill',
    };

    const fmtTable = (name?: string, number?: string) => {
      if (name && number && name !== number) return `${name} (${number})`;
      return name || number || 'Unknown';
    };

    const u1 = onNewOrder((order: any) => {
      playSound('newOrder');
      const table = fmtTable(order.tableName, order.tableNumber);
      const items = order.items?.map((i: any) => `${i.quantity}× ${i.name}`).join(', ');
      pushNotification('newOrder', 'New Order', `Table ${table}  ·  Order #${order.orderNumber}`, items);
    });
    const u3 = onServiceRequest((data: any) => {
      playSound('serviceRequest');
      const label = SERVICE_LABELS[data.type] || data.type.replace(/_/g, ' ');
      const table = fmtTable(data.tableName, data.tableNumber);
      pushNotification('serviceRequest', label, `Table ${table}`, data.message || undefined);
      queryClient.invalidateQueries({ queryKey: ['serviceRequests'] });
    });
    const u4 = onItemKitchenReady((data) => {
      playSound('kitchenReady');
      pushNotification('kitchenReady', 'Kitchen Ready', `Table ${data.tableName}  ·  Order #${data.orderNumber}`, data.itemName);
    });
    const u5 = onLeaveRequest((data) => {
      playSound('leaveRequest');
      const period = `${new Date(data.startDate).toLocaleDateString()} – ${new Date(data.endDate).toLocaleDateString()}`;
      pushNotification('leaveRequest', 'Leave Request', `${data.userName}  ·  ${data.leaveType}`, `${period}${data.reason ? ` — ${data.reason}` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
    });
    const u6 = onStockLow((data) => {
      playSound('stockLow');
      const names = data.items.slice(0, 3).map(i => i.name).join(', ');
      const more = data.count > 3 ? ` +${data.count - 3} more` : '';
      pushNotification('stockLow', 'Low Stock Alert', `${data.count} ingredient(s) running low`, `${names}${more}`);
    });
    const u7 = onStaffLate((data) => {
      playSound('staffLate');
      const names = data.staff.slice(0, 3).map(s => s.name).join(', ');
      const more = data.count > 3 ? ` +${data.count - 3} more` : '';
      pushNotification('staffLate', 'Staff Late', `${data.count} staff not checked in`, `${names}${more}`);
    });
    const u8 = onStaffEarlyCheckout((data) => {
      playSound('staffEarlyCheckout');
      const names = data.staff.slice(0, 3).map(s => s.name).join(', ');
      const more = data.count > 3 ? ` +${data.count - 3} more` : '';
      pushNotification('staffEarlyCheckout', 'Early Checkout', `${data.count} staff left early`, `${names}${more}`);
    });
    return () => { u1(); u3(); u4(); u5(); u6(); u7(); u8(); };
  }, [onNewOrder, onServiceRequest, onItemKitchenReady, onLeaveRequest, onStockLow, onStaffLate, onStaffEarlyCheckout, playSound, pushNotification, queryClient]);

  // Map nav paths to permission page keys
  const pathToPageKey: Record<string, PageKey> = {
    '/dashboard': 'dashboard',
    '/create-order': 'create-order',
    '/qsr': 'qsr',
    '/orders': 'orders',
    '/menu': 'menu',
    '/tables': 'tables',
    '/analytics': 'analytics',
    '/inventory': 'inventory',
    '/kitchen': 'kitchen',
    '/crm': 'crm',
    '/credit': 'credit',
    '/reports': 'reports',
    '/staff-management': 'staff-management',
    '/tv-menu': 'tv-menu',
  };

  // Determine which pages the user has access to
  const allowedPageSet = useMemo(() => {
    if (!user) return new Set<string>();
    if (user.role === 'OWNER') return new Set<string>(['__all__']);

    // Don't show default permissions while settings are still loading
    // to avoid a flash of wrong nav items
    if (isSettingsLoading) return new Set<string>();

    const settings = (restaurant?.settings ?? {}) as Record<string, unknown>;
    const savedPerms = settings.rolePermissions as RolePermissions | undefined;
    const roleKey = user.role as keyof RolePermissions;

    let allowedPages: PageKey[];
    if (user.roleTitle && savedPerms?.[user.roleTitle]) {
      allowedPages = savedPerms[user.roleTitle] || [];
    } else {
      allowedPages = savedPerms?.[roleKey] || DEFAULT_PERMISSIONS[roleKey] || [];
    }

    return new Set<string>(allowedPages);
  }, [user, restaurant, isSettingsLoading]);

  // Filter navigation visibility (hide Settings for non-OWNER, Branches for non-OWNER/ADMIN)
  const visibleNavigation = useMemo(() => {
    if (!user) return navigation;
    const role = user.role;

    return navigation.filter((item) => {
      if (item.path === '/settings' && role !== 'OWNER') return false;
      if (item.path === '/branches' && role !== 'OWNER' && role !== 'ADMIN') return false;
      return true;
    });
  }, [user]);

  // Check if a nav item is allowed
  const isNavAllowed = useCallback((path: string) => {
    if (allowedPageSet.has('__all__')) return true;
    const pageKey = pathToPageKey[path];
    // If no pageKey mapping exists, only OWNER can access (e.g. Discounts, Feedback)
    if (!pageKey) return false;
    return allowedPageSet.has(pageKey);
  }, [allowedPageSet]);

  const handleSync = useCallback(() => {
    setIsSyncing(true);
    // Invalidate all admin queries
    queryClient.invalidateQueries();
    // Trigger customer refresh via socket
    triggerSync();
    setTimeout(() => setIsSyncing(false), 1500);
  }, [queryClient, triggerSync]);

  // Derive page title from current route
  const pageTitle = navigation.find((n) => location.pathname.startsWith(n.path))?.name ?? '';

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    navigate('/login');
  };

  const confirmLogout = () => setShowLogoutConfirm(true);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {isMobile && !isSidebarHidden && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setIsSidebarHidden(true)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar border-r border-border transition-all duration-300 ${
          isSidebarHidden ? '-translate-x-full' : isSidebarCollapsed ? 'w-[72px]' : 'w-64'
        } ${isSidebarHidden ? 'w-0 overflow-hidden' : ''}`}
      >
        {/* Logo */}
        <div className={`flex items-center h-16 border-b border-border overflow-hidden ${
          isSidebarCollapsed ? 'flex-col justify-center gap-0 px-2 h-auto py-3' : 'justify-between px-4 gap-2'
        }`}>
          <div className={isSidebarCollapsed ? 'w-full flex justify-center' : 'flex-1 min-w-0'}>
            <AnimatePresence mode="wait" initial={false}>
              {!isSidebarCollapsed ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center"
                >
                  <Logo size={26} className="max-w-[130px]" />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex justify-center"
                >
                  <Logo size={18} className="max-w-[56px]" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={() => setIsSidebarHidden(true)}
            className="btn-icon shrink-0"
            aria-label="Toggle sidebar"
          >
            <svg
              className={`w-5 h-5 text-text-secondary transition-transform ${
                isSidebarCollapsed ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {visibleNavigation.filter((item) => isNavAllowed(item.path)).map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  onClick={() => {
                    if (isMobile || item.path === '/create-order' || item.path === '/qsr') {
                      setIsSidebarHidden(true);
                    }
                  }}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
                    }`
                  }
                >
                  {item.icon}
                  <AnimatePresence initial={false}>
                    {!isSidebarCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="font-medium whitespace-nowrap"
                      >
                        {item.name}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* User section */}
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3">
            <AnimatePresence initial={false}>
              {!isSidebarCollapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 min-w-0"
                >
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {user?.username || user?.name || 'Admin'}
                    </p>
                    {user?.role && user.role !== 'OWNER' && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary shrink-0">
                        {user.roleTitle || (user.role === 'STAFF' ? 'Cashier' : user.role.charAt(0) + user.role.slice(1).toLowerCase())}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted truncate">
                    {user?.email}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Lock Screen */}
            {(user?.role === 'OWNER' || user?.role === 'ADMIN') && (
              <button
                onClick={lock}
                className="btn-icon text-text-muted hover:text-red-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Lock screen"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </button>
            )}
            {/* Logout */}
            <button
              onClick={confirmLogout}
              className="btn-icon text-text-muted hover:text-error min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Logout"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div
        ref={mainContentRef}
        className={`flex-1 h-screen overflow-y-auto transition-all duration-300 ${
          isMobile ? 'ml-0' : isSidebarHidden ? 'ml-0' : isSidebarCollapsed ? 'ml-[72px]' : 'ml-64'
        }`}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-40 h-14 md:h-16 bg-background border-b border-border flex items-center justify-between px-3 md:px-6">
          <div className="flex items-center gap-3">
            {(isSidebarHidden || isMobile) && (
              <button
                onClick={() => setIsSidebarHidden(false)}
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-surface-elevated transition-colors"
                title="Show sidebar"
              >
                <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <h1 className="text-base md:text-lg font-semibold text-text-primary truncate">
              {pageTitle}
            </h1>
          </div>
          {/* Desktop header nav items */}
          <div className="hidden md:flex items-center gap-2 md:gap-4">
            {(user?.role === 'OWNER' || user?.role === 'ADMIN') && (<>
            {/* Sync Button */}
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-sm disabled:opacity-60"
              title="Sync admin & customer data"
            >
              <svg
                className={`w-4 h-4 text-text-secondary transition-transform duration-500 ${isSyncing ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-text-secondary font-medium">{isSyncing ? 'Syncing...' : 'Sync'}</span>
            </button>

            {/* Service Requests */}
            <button
              onClick={() => setIsServicePanelOpen(!isServicePanelOpen)}
              className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-sm"
            >
              <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="text-text-secondary font-medium">Requests</span>
            </button>
            </>)}

            {/* Connection status */}
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-success' : 'bg-error'
                }`}
              />
              <span className="text-text-secondary">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {/* KDS status */}
            <div className="relative" ref={kdsDropdownRef}>
              <button
                onClick={() => kdsCount > 0 && setIsKdsDropdownOpen(!isKdsDropdownOpen)}
                className={`flex items-center gap-2 text-sm px-2 py-1 rounded-lg transition-colors ${
                  kdsCount > 0 ? 'hover:bg-surface-elevated cursor-pointer' : 'cursor-default'
                }`}
                title={kdsCount > 0 ? `${kdsCount} kitchen display(s) online — click to see users` : 'No kitchen display connected'}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    kdsCount > 0 ? 'bg-success' : 'bg-gray-300'
                  }`}
                />
                <span className="text-text-secondary">
                  KDS {kdsCount > 0 ? `(${kdsCount})` : 'Off'}
                </span>
              </button>
              {isKdsDropdownOpen && kdsUsers.length > 0 && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsKdsDropdownOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-lg border border-border py-2 min-w-[200px]">
                    <div className="px-3 py-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider border-b border-border mb-1">KDS Users Online</div>
                    {kdsUsers.map((u) => {
                      const displayRole = u.roleTitle || (u.role === 'STAFF' ? 'Cashier' : u.role.charAt(0) + u.role.slice(1).toLowerCase());
                      return (
                      <div key={u.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-elevated">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-semibold text-primary">{u.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">{u.name}</p>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary">
                          {displayRole}
                        </span>
                        <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                      </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Browser Fullscreen Toggle */}
            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen();
                } else {
                  document.exitFullscreen();
                }
              }}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-surface-elevated transition-colors"
              title={document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            </button>
          </div>

          {/* Mobile hamburger menu */}
          <div className="md:hidden relative" ref={headerMenuRef}>
            {/* Connection dot indicator — always visible */}
            <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${isConnected ? 'bg-success' : 'bg-error'}`} />
            <button
              onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
              className="flex items-center justify-center w-10 h-10 min-h-[44px] rounded-lg hover:bg-surface-elevated transition-colors"
              title="Menu"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
              </svg>
            </button>

            {isHeaderMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsHeaderMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-lg border border-border py-2 w-56">
                  {(user?.role === 'OWNER' || user?.role === 'ADMIN') && (
                    <>
                      {/* Sync */}
                      <button
                        onClick={() => { handleSync(); setIsHeaderMenuOpen(false); }}
                        disabled={isSyncing}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-elevated transition-colors text-sm disabled:opacity-60"
                      >
                        <svg
                          className={`w-4 h-4 text-text-secondary ${isSyncing ? 'animate-spin' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span className="text-text-primary font-medium">{isSyncing ? 'Syncing...' : 'Sync'}</span>
                      </button>

                      {/* Service Requests */}
                      <button
                        onClick={() => { setIsServicePanelOpen(!isServicePanelOpen); setIsHeaderMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-elevated transition-colors text-sm"
                      >
                        <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        <span className="text-text-primary font-medium">Requests</span>
                      </button>

                      <div className="border-t border-border my-1" />
                    </>
                  )}

                  {/* Connection status */}
                  <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-success' : 'bg-error'}`} />
                    <span className="text-text-primary font-medium">{isConnected ? 'Connected' : 'Disconnected'}</span>
                  </div>

                  {/* KDS status */}
                  <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className={`w-2.5 h-2.5 rounded-full ${kdsCount > 0 ? 'bg-success' : 'bg-gray-300'}`} />
                    <span className="text-text-primary font-medium">KDS {kdsCount > 0 ? `(${kdsCount})` : 'Off'}</span>
                  </div>

                  {kdsCount > 0 && kdsUsers.length > 0 && (
                    <>
                      <div className="border-t border-border my-1" />
                      <div className="px-3 py-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider">KDS Users</div>
                      {kdsUsers.map((u) => {
                        const displayRole = u.roleTitle || (u.role === 'STAFF' ? 'Cashier' : u.role.charAt(0) + u.role.slice(1).toLowerCase());
                        return (
                        <div key={u.id} className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-elevated">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-[10px] font-semibold text-primary">{u.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <p className="text-sm text-text-primary truncate flex-1">{u.name}</p>
                          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">{displayRole}</span>
                        </div>
                        );
                      })}
                    </>
                  )}

                  <div className="border-t border-border my-1" />

                  {/* Fullscreen */}
                  <button
                    onClick={() => {
                      if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen();
                      } else {
                        document.exitFullscreen();
                      }
                      setIsHeaderMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-elevated transition-colors text-sm"
                  >
                    <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                    <span className="text-text-primary font-medium">Fullscreen</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Service Requests Panel */}
          <AnimatePresence>
            {isServicePanelOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-14 md:top-16 right-2 md:right-4 w-[calc(100vw-1rem)] sm:w-96 bg-white rounded-2xl shadow-xl border border-border z-50 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-text-primary">Service Requests</h3>
                  <button onClick={() => setIsServicePanelOpen(false)} className="text-text-muted hover:text-text-primary">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <ServiceRequestsPanel onClose={() => setIsServicePanelOpen(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* Page content */}
        <main className="p-3 md:p-6">
          <Outlet />
        </main>
      </div>

      {/* Notification overlay */}
      <NotificationOverlay
        notifications={notifications}
        onDismiss={dismissNotification}
        onDismissAll={dismissAllNotifications}
      />

      {/* Auto-lock overlay */}
      <AnimatePresence>
        {isLocked && <LockScreen hasPin={hasLockPin} onUnlock={unlock} />}
      </AnimatePresence>

      {/* AI Chatbot — only on dashboard */}
      {location.pathname === '/dashboard' && <Chatbot />}

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
            onClick={() => setShowLogoutConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl p-5 sm:p-6 w-[calc(100vw-2rem)] sm:w-80"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-text-primary mb-2">Confirm Logout</h3>
              <p className="text-sm text-text-secondary mb-6">Are you sure you want to logout?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowLogoutConfirm(false); handleLogout(); }}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  Logout
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
