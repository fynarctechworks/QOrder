import { useState } from 'react';
import toast from 'react-hot-toast';
import { onboardingService } from '../../services/onboardingService';

interface Props {
  onNext: () => void;
}

export default function TableSetupStep({ onNext }: Props) {
  const [tableCount, setTableCount] = useState('10');
  const [hasDineIn, setHasDineIn] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setSaving(true);
    try {
      await onboardingService.completeTableSetup();
      if (hasDineIn) {
        toast.success(`Table setup noted! You can manage ${tableCount} tables from the Tables page.`);
      } else {
        toast.success('Takeaway-only mode noted!');
      }
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-text-primary">Table Setup</h2>
        <p className="text-text-muted mt-1">
          Configure your dining area or set up for takeaway
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Dine-in toggle */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setHasDineIn(true)}
            className={`flex-1 p-5 rounded-xl border-2 text-center transition-all ${
              hasDineIn
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-3xl mb-2">🪑</div>
            <div className="text-sm font-medium text-text-primary">Dine-In</div>
            <div className="text-xs text-text-muted mt-1">QR codes on tables</div>
          </button>

          <button
            type="button"
            onClick={() => setHasDineIn(false)}
            className={`flex-1 p-5 rounded-xl border-2 text-center transition-all ${
              !hasDineIn
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-3xl mb-2">🥡</div>
            <div className="text-sm font-medium text-text-primary">Takeaway Only</div>
            <div className="text-xs text-text-muted mt-1">No table setup needed</div>
          </button>
        </div>

        {hasDineIn && (
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Number of Tables
            </label>
            <input
              type="number"
              value={tableCount}
              onChange={(e) => setTableCount(e.target.value)}
              min="1"
              max="999"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm"
            />
            <p className="text-xs text-text-muted mt-1">
              You can add/remove tables and sections later from the Tables page
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
