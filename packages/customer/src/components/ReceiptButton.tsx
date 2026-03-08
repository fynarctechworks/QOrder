import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { featureService } from '../services/featureService';

export default function ReceiptButton({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const [showInput, setShowInput] = useState(false);
  const [email, setEmail] = useState('');

  const mutation = useMutation({
    mutationFn: () => featureService.requestReceipt(orderId, 'EMAIL', email.trim()),
    onSuccess: () => {
      toast.success(t('receiptBtn.sentSuccess'));
      setShowInput(false);
      setEmail('');
    },
    onError: () => toast.error(t('receiptBtn.sendFailed')),
  });

  return (
    <div>
      <button
        onClick={() => setShowInput(!showInput)}
        className="flex items-center gap-2 text-sm text-primary font-medium hover:underline"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        {t('receiptBtn.getReceipt')}
      </button>

      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('receiptBtn.emailPlaceholder')}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !email.trim()}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl disabled:opacity-50"
              >
                {mutation.isPending ? '...' : t('receiptBtn.send')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
