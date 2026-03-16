import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onboardingService, type OnboardingStatus } from '../services/onboardingService';

const STEPS: { key: keyof OnboardingStatus; label: string; icon: string }[] = [
  { key: 'businessProfile', label: 'Business Profile', icon: '🏪' },
  { key: 'branchSetup', label: 'Branch Setup', icon: '🏢' },
  { key: 'taxCurrency', label: 'Tax & Currency', icon: '💰' },
  { key: 'menuSetup', label: 'Menu Setup', icon: '📋' },
  { key: 'tableSetup', label: 'Table Setup', icon: '🪑' },
  { key: 'planSelection', label: 'Choose Plan', icon: '⭐' },
];

export default function SetupChecklist() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [completed, setCompleted] = useState(true);

  useEffect(() => {
    onboardingService.getStatus().then((result) => {
      setStatus(result.status);
      setCompleted(result.completed);
    }).catch(() => {});
  }, []);

  if (completed || !status) return null;

  const completedCount = Object.values(status).filter(
    (v) => v === 'completed' || v === 'skipped'
  ).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-text-primary">Setup Checklist</h3>
        <span className="text-xs text-text-muted">{completedCount}/{STEPS.length}</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${(completedCount / STEPS.length) * 100}%` }}
        />
      </div>

      <div className="space-y-2">
        {STEPS.map((step) => {
          const stepStatus = status[step.key];
          const isDone = stepStatus === 'completed';
          const isSkipped = stepStatus === 'skipped';

          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
                isDone
                  ? 'bg-green-50'
                  : isSkipped
                  ? 'bg-gray-50'
                  : 'bg-amber-50 cursor-pointer hover:bg-amber-100'
              }`}
              onClick={!isDone && !isSkipped ? () => navigate('/onboarding') : undefined}
            >
              <span className="text-lg">{step.icon}</span>
              <span className={`flex-1 text-sm font-medium ${
                isDone
                  ? 'text-green-700 line-through'
                  : isSkipped
                  ? 'text-gray-500'
                  : 'text-amber-800'
              }`}>
                {step.label}
              </span>
              {isDone && (
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {isSkipped && (
                <span className="text-xs text-gray-400">Skipped</span>
              )}
              {!isDone && !isSkipped && (
                <span className="text-xs text-amber-600 font-medium">Pending</span>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => navigate('/onboarding')}
        className="w-full mt-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-colors"
      >
        Continue Setup
      </button>
    </div>
  );
}
