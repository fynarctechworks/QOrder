import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type NotificationType = 'newOrder' | 'payment' | 'serviceRequest' | 'kitchenReady' | 'leaveRequest' | 'stockLow' | 'stockOut' | 'staffLate' | 'staffEarlyCheckout';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  /** Primary detail line, e.g. table name + number */
  detail: string;
  /** Secondary info line, e.g. order items or amount */
  info?: string;
  timestamp: number;
}

const TYPE_CONFIG: Record<NotificationType, { icon: string; accent: string; bg: string; border: string }> = {
  newOrder: {
    icon: '🛒',
    accent: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-l-blue-500',
  },
  payment: {
    icon: '💳',
    accent: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-l-green-500',
  },
  serviceRequest: {
    icon: '🔔',
    accent: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-l-orange-500',
  },
  kitchenReady: {
    icon: '✅',
    accent: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-l-emerald-500',
  },
  leaveRequest: {
    icon: '📋',
    accent: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-l-purple-500',
  },
  stockLow: {
    icon: '⚠️',
    accent: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-l-red-500',
  },
  stockOut: {
    icon: '🚫',
    accent: 'text-red-800',
    bg: 'bg-red-100',
    border: 'border-l-red-600',
  },
  staffLate: {
    icon: '⏰',
    accent: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-l-amber-500',
  },
  staffEarlyCheckout: {
    icon: '🚪',
    accent: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-l-violet-500',
  },
};

let notifyId = 0;

export function useNotificationOverlay() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const push = useCallback((type: NotificationType, title: string, detail: string, info?: string) => {
    const id = `notif-${++notifyId}`;
    const item: NotificationItem = { id, type, title, detail, info, timestamp: Date.now() };
    setNotifications((prev) => [...prev, item]);
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 3000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return { notifications, push, dismiss, dismissAll };
}

interface NotificationOverlayProps {
  notifications: NotificationItem[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}

export default function NotificationOverlay({ notifications, onDismiss, onDismissAll }: NotificationOverlayProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-2 sm:right-4 z-[100] flex flex-col items-end gap-2.5 max-h-[85vh] overflow-y-auto pointer-events-none w-[calc(100vw-1rem)] sm:w-96"
    >
      <AnimatePresence mode="popLayout">
        {notifications.map((notif) => {
          const config = TYPE_CONFIG[notif.type];
          return (
            <motion.div
              key={notif.id}
              layout
              initial={{ opacity: 0, x: 120, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              className={`w-full rounded-lg border border-gray-200 border-l-4 ${config.border} ${config.bg} shadow-xl pointer-events-auto`}
            >
              <div className="flex items-start gap-3 px-4 py-3">
                <span className="text-xl flex-shrink-0 mt-0.5">{config.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm ${config.accent}`}>{notif.title}</p>
                  <p className="text-sm text-gray-800 mt-0.5 font-medium">{notif.detail}</p>
                  {notif.info && (
                    <p className="text-xs text-gray-500 mt-0.5">{notif.info}</p>
                  )}
                </div>
                <button
                  onClick={() => onDismiss(notif.id)}
                  className="flex-shrink-0 p-1 rounded hover:bg-black/10 transition-colors -mt-0.5 -mr-1"
                >
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Auto-dismiss progress bar (3s) */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 3, ease: 'linear' }}
                className={`h-[2px] rounded-b origin-left ${config.accent.replace('text-', 'bg-')} opacity-25`}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>

      {notifications.length > 1 && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={onDismissAll}
          className="pointer-events-auto px-3 py-1.5 text-xs font-medium text-gray-600 bg-white rounded-lg hover:bg-gray-100 transition-colors shadow-md border border-gray-200"
        >
          Dismiss all ({notifications.length})
        </motion.button>
      )}
    </div>
  );
}
