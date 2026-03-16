import { useState } from 'react';
import toast from 'react-hot-toast';
import { onboardingService } from '../../services/onboardingService';

const BUSINESS_TYPES = [
  { value: 'RESTAURANT', label: 'Restaurant', icon: '🍽️' },
  { value: 'CAFE', label: 'Café', icon: '☕' },
  { value: 'BAR', label: 'Bar / Pub', icon: '🍺' },
  { value: 'CLOUD_KITCHEN', label: 'Cloud Kitchen', icon: '🏭' },
  { value: 'FOOD_TRUCK', label: 'Food Truck', icon: '🚚' },
  { value: 'BAKERY', label: 'Bakery', icon: '🧁' },
];

interface Props {
  onNext: () => void;
}

export default function BusinessProfileStep({ onNext }: Props) {
  const [businessType, setBusinessType] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessType) {
      toast.error('Please select your business type');
      return;
    }

    setSaving(true);
    try {
      await onboardingService.updateBusinessProfile({
        businessType,
        phone: phone || undefined,
        address: address || undefined,
        description: description || undefined,
      });
      toast.success('Business profile saved!');
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
        <h2 className="text-2xl font-bold text-text-primary">Tell us about your business</h2>
        <p className="text-text-muted mt-1">This helps us customize your experience</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business Type Selection */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-3">
            What type of business do you run? *
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {BUSINESS_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setBusinessType(type.value)}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  businessType === type.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-1">{type.icon}</div>
                <div className="text-sm font-medium text-text-primary">{type.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Phone Number
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 9876543210"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm"
          />
        </div>

        {/* Address */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Address
          </label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Full address of your business"
            rows={2}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm resize-none"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Short Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A brief description of your business"
            rows={2}
            maxLength={500}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={saving || !businessType}
          className="w-full py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
