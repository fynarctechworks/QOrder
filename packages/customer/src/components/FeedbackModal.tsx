import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { featureService } from '../services/featureService';
import { useRestaurant } from '../context/RestaurantContext';
import { useTranslation } from 'react-i18next';

export default function FeedbackModal({ orderId, onClose }: { orderId?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { restaurant } = useRestaurant();
  const [overall, setOverall] = useState(0);
  const [food, setFood] = useState(0);
  const [service, setService] = useState(0);
  const [ambience, setAmbience] = useState(0);
  const [comment, setComment] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      if (!restaurant?.id) throw new Error('Missing restaurant');
      return featureService.submitFeedback(restaurant.id, {
        overallRating: overall,
        foodRating: food || undefined,
        serviceRating: service || undefined,
        ambienceRating: ambience || undefined,
        comment: comment.trim() || undefined,
        orderId,
      });
    },
    onSuccess: () => {
      toast.success(t('feedback.thankYou'));
      onClose();
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Failed to submit';
      toast.error(msg);
    },
  });

  function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">{label}</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(i => (
            <button key={i} type="button" onClick={() => onChange(i)} className="focus:outline-none">
              <svg className={`w-7 h-7 transition-colors ${i <= value ? 'text-yellow-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-6 space-y-5"
        >
          <div className="text-center">
            <h2 className="text-lg font-bold text-gray-900">{t('feedback.title')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('feedback.subtitle')}</p>
          </div>

          <div className="space-y-4">
            <StarInput label={t('feedback.overall')} value={overall} onChange={setOverall} />
            <StarInput label={t('feedback.food')} value={food} onChange={setFood} />
            <StarInput label={t('feedback.service')} value={service} onChange={setService} />
            <StarInput label={t('feedback.ambience')} value={ambience} onChange={setAmbience} />
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('feedback.commentPlaceholder')}
            maxLength={500}
            rows={3}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          />

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
              {t('feedback.skip')}
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={overall === 0 || mutation.isPending}
              className="flex-1 py-3 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? t('feedback.submitting') : t('feedback.submit')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
