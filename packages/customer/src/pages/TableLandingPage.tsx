import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useRestaurant } from '../context/RestaurantContext';
import Logo from '../components/Logo';

export default function TableLandingPage() {
  const { t } = useTranslation();
  const { restaurant, table, isLoading, error } = useRestaurant();
  const { restaurantSlug, tableId } = useParams<{ restaurantSlug: string; tableId: string }>();
  const navigate = useNavigate();

  const handleStartOrdering = useCallback(() => {
    navigate(`/r/${restaurantSlug}/t/${tableId}/menu`);
  }, [navigate, restaurantSlug, tableId]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 rounded-full border-3 border-primary/20 border-t-primary animate-spin" />
          <p className="text-sm text-text-muted">{t('common.loading')}</p>
        </motion.div>
      </div>
    );
  }

  if (error || !restaurant || !table) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-surface-elevated rounded-2xl shadow-lg border border-surface-border/50 p-8 max-w-sm w-full text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">{t('common.error')}</h2>
          <p className="text-sm text-text-muted">
            {error?.message || 'Table not found'}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/landing_bg.jpg')" }}
    >
      <div className="w-full max-w-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden backdrop-blur-xl bg-white/30">
        {/* Hero */}
        <div className="flex flex-col items-center text-center px-6 pt-14 pb-10">
          {/* Logo with animation */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <Logo size={48} className="rounded-2xl sm:h-14 md:h-16" />
          </motion.div>

          {/* Restaurant Name */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
            className="mt-5 text-[1.75rem] font-extrabold text-primary tracking-tight leading-none"
            style={{ fontFamily: "'Modern Negra', serif" }}
          >
            {restaurant.name}
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full flex flex-col items-center"
          >
            {/* Subtitle */}
            <p className="mt-4 text-sm text-white leading-relaxed max-w-xs">
              {t('landing.welcome')}
            </p>

            {/* CTA Button */}
            <div className="mt-7 w-full max-w-[280px]">
              <button
                onClick={handleStartOrdering}
                className="group flex items-center justify-center gap-2 w-full py-3.5 px-6 bg-primary text-white font-bold rounded-xl text-base transition-all duration-200 shadow-lg shadow-primary/20 hover:shadow-xl hover:bg-primary-hover active:scale-[0.97]"
              >
                {t('landing.startOrdering')}
                <svg
                  className="w-5 h-5 transition-transform group-hover:translate-x-0.5"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <div className="border-t border-surface-border/40 py-4 px-6 flex flex-col items-center justify-center gap-1.5">
          <span className="text-[11px] text-white tracking-wide">{t('common.poweredBy')}</span>
          <img src="/FYN ARC TECHWORKS BLACK.png" alt="FYN ARC Techworks" className="h-7 object-contain" />
        </div>
      </div>
    </div>
  );
}
