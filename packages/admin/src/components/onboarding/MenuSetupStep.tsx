import { useState } from 'react';
import toast from 'react-hot-toast';
import { onboardingService } from '../../services/onboardingService';

interface Props {
  onNext: () => void;
}

export default function MenuSetupStep({ onNext }: Props) {
  const [categoryName, setCategoryName] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // If user entered something, validate it
    if (categoryName || itemName) {
      if (!categoryName.trim()) {
        toast.error('Category name is required');
        return;
      }
      if (!itemName.trim()) {
        toast.error('Item name is required');
        return;
      }
      if (!itemPrice || parseFloat(itemPrice) <= 0) {
        toast.error('Please enter a valid price');
        return;
      }
    }

    setSaving(true);
    try {
      await onboardingService.completeMenuSetup();
      toast.success('Menu setup noted! You can add more items from the Menu page.');
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
        <h2 className="text-2xl font-bold text-text-primary">Set up your menu</h2>
        <p className="text-text-muted mt-1">
          Add your first item or skip for now — you can build your full menu later
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-sm text-blue-800 font-medium mb-1">💡 Quick start</p>
          <p className="text-xs text-blue-700">
            Add one category and item to get started quickly. You can import your full
            menu via CSV or add items manually from the Menu page.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Category Name
          </label>
          <input
            type="text"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="e.g., Starters, Main Course, Beverages"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Item Name
          </label>
          <input
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="e.g., Paneer Tikka, Margherita Pizza"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Price
          </label>
          <input
            type="number"
            value={itemPrice}
            onChange={(e) => setItemPrice(e.target.value)}
            min="0"
            step="0.01"
            placeholder="e.g., 250"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : categoryName ? 'Save & Continue' : 'Continue without menu'}
        </button>
      </form>
    </div>
  );
}
