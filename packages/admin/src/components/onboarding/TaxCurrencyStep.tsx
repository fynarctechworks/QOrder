import { useState } from 'react';
import toast from 'react-hot-toast';
import { onboardingService } from '../../services/onboardingService';

const CURRENCIES = [
  { value: 'INR', label: '₹ Indian Rupee (INR)' },
  { value: 'USD', label: '$ US Dollar (USD)' },
  { value: 'EUR', label: '€ Euro (EUR)' },
  { value: 'GBP', label: '£ British Pound (GBP)' },
  { value: 'AED', label: 'د.إ UAE Dirham (AED)' },
  { value: 'SAR', label: '﷼ Saudi Riyal (SAR)' },
  { value: 'SGD', label: 'S$ Singapore Dollar (SGD)' },
  { value: 'AUD', label: 'A$ Australian Dollar (AUD)' },
];

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (IST, UTC+5:30)' },
  { value: 'America/New_York', label: 'US Eastern (EST)' },
  { value: 'America/Chicago', label: 'US Central (CST)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (PST)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Berlin', label: 'Central Europe (CET)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST, UTC+4)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT, UTC+8)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST, UTC+10)' },
  { value: 'UTC', label: 'UTC' },
];

interface Props {
  onNext: () => void;
}

export default function TaxCurrencyStep({ onNext }: Props) {
  const [currency, setCurrency] = useState('INR');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [taxRate, setTaxRate] = useState('5');
  const [gstNumber, setGstNumber] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rate = parseFloat(taxRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast.error('Tax rate must be between 0 and 100');
      return;
    }

    setSaving(true);
    try {
      await onboardingService.updateTaxCurrency({
        currency,
        timezone,
        taxRate: rate,
        gstNumber: gstNumber || undefined,
      });
      toast.success('Tax & currency settings saved!');
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
        <h2 className="text-2xl font-bold text-text-primary">Tax & Currency</h2>
        <p className="text-text-muted mt-1">Configure your financial settings</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Currency *
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm bg-white"
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Timezone *
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm bg-white"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Tax Rate (%) *
          </label>
          <input
            type="number"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            min="0"
            max="100"
            step="0.01"
            placeholder="e.g., 5"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm"
          />
          <p className="text-xs text-text-muted mt-1">
            Applied automatically to all orders (GST, VAT, etc.)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            GST / Tax Registration Number
          </label>
          <input
            type="text"
            value={gstNumber}
            onChange={(e) => setGstNumber(e.target.value)}
            placeholder="e.g., 22AAAAA0000A1Z5"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm"
          />
        </div>

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
