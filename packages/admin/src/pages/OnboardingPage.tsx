import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import Logo from '../components/Logo';
import { onboardingService, type OnboardingStatus } from '../services/onboardingService';
import {
  BusinessProfileStep,
  BranchSetupStep,
  TaxCurrencyStep,
  MenuSetupStep,
  TableSetupStep,
  PlanSelectionStep,
} from '../components/onboarding';

const STEPS = [
  { key: 'businessProfile' as const, label: 'Business Profile', icon: '🏪' },
  { key: 'branchSetup' as const, label: 'Branch Setup', icon: '🏢' },
  { key: 'taxCurrency' as const, label: 'Tax & Currency', icon: '💰' },
  { key: 'menuSetup' as const, label: 'Menu Setup', icon: '📋' },
  { key: 'tableSetup' as const, label: 'Table Setup', icon: '🪑' },
  { key: 'planSelection' as const, label: 'Choose Plan', icon: '⭐' },
];

const SKIPPABLE_STEPS = new Set(['menuSetup', 'tableSetup']);

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const result = await onboardingService.getStatus();
      setStatus(result.status);

      if (result.completed) {
        navigate('/dashboard', { replace: true });
        return;
      }

      // Find first incomplete step
      const firstIncomplete = STEPS.findIndex(
        (s) => result.status[s.key] === 'pending'
      );
      if (firstIncomplete !== -1) {
        setCurrentStep(firstIncomplete);
      }
    } catch {
      toast.error('Failed to load onboarding status');
    } finally {
      setLoading(false);
    }
  }

  async function handleNext() {
    // Refresh status and advance
    try {
      const result = await onboardingService.getStatus();
      setStatus(result.status);

      if (result.completed) {
        toast.success('Setup complete! Welcome to your dashboard.');
        navigate('/dashboard', { replace: true });
        return;
      }

      if (currentStep < STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
      }
    } catch {
      // Just advance optimistically
      if (currentStep < STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
      }
    }
  }

  async function handleSkip() {
    const step = STEPS[currentStep];
    if (!step || !SKIPPABLE_STEPS.has(step.key)) return;

    try {
      await onboardingService.skipStep(step.key);
      toast('Step skipped — you can complete it later from the dashboard', { icon: 'ℹ️' });
      handleNext();
    } catch {
      toast.error('Failed to skip step');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const step = STEPS[currentStep];
  const canSkip = step && SKIPPABLE_STEPS.has(step.key);
  const completedCount = status
    ? Object.values(status).filter((v) => v === 'completed' || v === 'skipped').length
    : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={32} className="rounded-lg" />
            <span className="text-lg font-semibold text-text-primary">Setup your restaurant</span>
          </div>
          <span className="text-sm text-text-muted">
            {completedCount}/{STEPS.length} steps
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white border-b border-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-1">
            {STEPS.map((s, idx) => {
              const stepStatus = status?.[s.key] || 'pending';
              const isActive = idx === currentStep;
              const isDone = stepStatus === 'completed' || stepStatus === 'skipped';

              return (
                <div key={s.key} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex items-center">
                    <div
                      className={`flex-1 h-1 rounded-full transition-colors ${
                        isDone ? 'bg-primary' : isActive ? 'bg-primary/40' : 'bg-gray-200'
                      }`}
                    />
                  </div>
                  <button
                    onClick={() => isDone || idx <= currentStep ? setCurrentStep(idx) : null}
                    className={`text-xs font-medium transition-colors ${
                      isActive
                        ? 'text-primary'
                        : isDone
                        ? 'text-green-600'
                        : 'text-text-muted'
                    } ${isDone || idx <= currentStep ? 'cursor-pointer hover:text-primary' : 'cursor-default'}`}
                  >
                    <span className="hidden sm:inline">{s.icon} {s.label}</span>
                    <span className="sm:hidden">{s.icon}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {currentStep === 0 && <BusinessProfileStep onNext={handleNext} />}
            {currentStep === 1 && <BranchSetupStep onNext={handleNext} />}
            {currentStep === 2 && <TaxCurrencyStep onNext={handleNext} />}
            {currentStep === 3 && <MenuSetupStep onNext={handleNext} />}
            {currentStep === 4 && <TableSetupStep onNext={handleNext} />}
            {currentStep === 5 && <PlanSelectionStep onNext={handleNext} />}
          </motion.div>
        </AnimatePresence>

        {/* Skip button */}
        {canSkip && (
          <div className="text-center mt-4">
            <button
              onClick={handleSkip}
              className="text-sm text-text-muted hover:text-text-primary transition-colors underline"
            >
              Skip this step for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
