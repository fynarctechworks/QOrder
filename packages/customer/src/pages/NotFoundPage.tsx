import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        {/* 404 illustration */}
        <div className="w-32 h-32 mx-auto mb-8 rounded-full bg-surface flex items-center justify-center">
          <span className="text-5xl font-bold text-primary">404</span>
        </div>

        <h1 className="text-2xl font-bold text-text-primary mb-3">
          {t('notFound.title')}
        </h1>

        <p className="text-text-secondary mb-8">
          {t('notFound.description')}
        </p>

        <div className="space-y-3">
          <button
            onClick={() => navigate(-1)}
            className="w-full btn-secondary"
          >
            {t('common.goBack')}
          </button>
          <p className="text-sm text-text-muted">
            {t('notFound.scanQR')}
          </p>
        </div>
      </div>
    </div>
  );
}
