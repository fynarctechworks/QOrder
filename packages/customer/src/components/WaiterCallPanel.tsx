import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { featureService } from '../services/featureService';
import { useRestaurant } from '../context/RestaurantContext';
import { useTranslation } from 'react-i18next';

const SERVICE_TYPES = [
  { type: 'CALL_WAITER', icon: '🔔', labelKey: 'waiterCall.callWaiter' },
  { type: 'WATER', icon: '💧', labelKey: 'waiterCall.waterRefill' },
  { type: 'BILL', icon: '🧾', labelKey: 'waiterCall.requestBill' },
] as const;

export default function WaiterCallPanel() {
  const { t } = useTranslation();
  const { restaurant, table } = useRestaurant();
  const [showCustom, setShowCustom] = useState(false);
  const [customMessage, setCustomMessage] = useState('');

  const mutation = useMutation({
    mutationFn: ({ type, message }: { type: string; message?: string }) => {
      if (!restaurant?.id || !table?.id) throw new Error('Missing context');
      return featureService.createServiceRequest(restaurant.id, table.id, type, message);
    },
    onSuccess: () => {
      toast.success(t('waiterCall.requestSent'));
      setShowCustom(false);
      setCustomMessage('');
    },
    onError: () => toast.error(t('waiterCall.requestFailed')),
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3.5">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('waiterCall.needAssistance')}</h3>
        <div className="grid grid-cols-3 gap-2">
          {SERVICE_TYPES.map(({ type, icon, labelKey }) => (
            <button
              key={type}
              onClick={() => mutation.mutate({ type })}
              disabled={mutation.isPending}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-gray-50 hover:bg-primary/5 hover:border-primary/20 border border-transparent transition-colors text-center"
            >
              <span className="text-2xl">{icon}</span>
              <span className="text-xs font-medium text-gray-700">{t(labelKey)}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowCustom(!showCustom)}
          className="mt-2 w-full text-xs text-primary font-medium hover:underline"
        >
          {showCustom ? t('common.cancel') : t('waiterCall.customRequest')}
        </button>

        <AnimatePresence>
          {showCustom && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder={t('waiterCall.typePlaceholder')}
                  maxLength={200}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={() => mutation.mutate({ type: 'CUSTOM', message: customMessage.trim() })}
                  disabled={mutation.isPending || !customMessage.trim()}
                  className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover disabled:opacity-50"
                >
                  {t('waiterCall.send')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
