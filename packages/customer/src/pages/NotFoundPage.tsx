import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        {/* 404 illustration */}
        <div className="w-32 h-32 mx-auto mb-8 rounded-full bg-surface flex items-center justify-center">
          <span className="text-5xl font-bold text-primary">404</span>
        </div>

        <h1 className="text-2xl font-bold text-text-primary mb-3">
          Page Not Found
        </h1>

        <p className="text-text-secondary mb-8">
          Oops! The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => navigate(-1)}
            className="w-full btn-secondary"
          >
            Go Back
          </button>
          <p className="text-sm text-text-muted">
            Scan a QR code at your table to start ordering
          </p>
        </div>
      </div>
    </div>
  );
}
