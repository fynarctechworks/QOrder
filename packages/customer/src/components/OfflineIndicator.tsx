import { useTranslation } from 'react-i18next';
import { useOfflineStatus } from '../hooks/useOfflineStatus';

export default function OfflineIndicator() {
  const { t } = useTranslation();
  const { isOnline, isSyncing, pendingCount } = useOfflineStatus();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className={`fixed top-0 left-0 right-0 z-[100] px-4 py-2 text-center text-xs font-medium transition-colors ${
      !isOnline
        ? 'bg-red-500 text-white'
        : isSyncing
          ? 'bg-amber-500 text-white'
          : 'bg-amber-100 text-amber-800'
    }`}>
      {!isOnline ? (
        <>
          {t('offline.youreOffline')}
          {pendingCount > 0 && <span className="ml-1">({pendingCount} {t('offline.pendingSync')})</span>}
        </>
      ) : isSyncing ? (
        t('offline.syncing')
      ) : (
        `${pendingCount} order${pendingCount !== 1 ? 's' : ''} ${t('offline.pendingSync')}`
      )}
    </div>
  );
}
