import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onboardingService, type OnboardingStatus } from '../services/onboardingService';

const STEP_LABELS: Record<keyof OnboardingStatus, string> = {
  businessProfile: 'Business Profile',
  branchSetup: 'Branch Setup',
  taxCurrency: 'Tax & Currency',
  menuSetup: 'Menu Setup',
  tableSetup: 'Table Setup',
  planSelection: 'Choose Plan',
};

export default function OnboardingBanner() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [completed, setCompleted] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    onboardingService.getStatus().then((result) => {
      setStatus(result.status);
      setCompleted(result.completed);
    }).catch(() => {});
  }, []);

  if (completed || dismissed || !status) return null;

  const pendingSteps = Object.entries(status)
    .filter(([, v]) => v === 'pending')
    .map(([k]) => STEP_LABELS[k as keyof OnboardingStatus]);

  const skippedSteps = Object.entries(status)
    .filter(([, v]) => v === 'skipped')
    .map(([k]) => STEP_LABELS[k as keyof OnboardingStatus]);

  const incompleteSteps = [...pendingSteps, ...skippedSteps];
  if (incompleteSteps.length === 0) return null;

  const completedCount = Object.values(status).filter((v) => v === 'completed').length;
  const totalSteps = Object.keys(status).length;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-600 text-lg">⚠️</span>
            <h3 className="text-sm font-semibold text-amber-800">
              Complete your setup ({completedCount}/{totalSteps} steps done)
            </h3>
          </div>
          <p className="text-xs text-amber-700 mb-2">
            Remaining: {incompleteSteps.join(', ')}
          </p>
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-amber-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all"
              style={{ width: `${(completedCount / totalSteps) * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/onboarding')}
            className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition-colors"
          >
            Complete Setup
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-amber-400 hover:text-amber-600 transition-colors"
            title="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
