import { useState, useEffect } from 'react';
import type { Table } from '../types';

export interface TableFormData {
  number: string;
  name: string;
  capacity: number;
}

interface TableFormProps {
  initial?: Table | null;
  isLoading: boolean;
  onSubmit: (data: TableFormData) => void;
  onCancel: () => void;
}

export default function TableForm({ initial, isLoading, onSubmit, onCancel }: TableFormProps) {
  const [number, setNumber] = useState(initial?.number ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [capacity, setCapacity] = useState(initial?.capacity ?? 4);

  useEffect(() => {
    setNumber(initial?.number ?? '');
    setName(initial?.name ?? '');
    setCapacity(initial?.capacity ?? 4);
  }, [initial]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!number.trim() || !name.trim()) return;
    onSubmit({ number: number.trim(), name: name.trim(), capacity });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Display Name */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1.5">
          Display Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Table 1, Window Seat, Patio A"
          required
          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
        />
      </div>

      {/* Table Number */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1.5">
          Table Number <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="e.g. 1, A1, VIP-1"
          required
          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
        />
      </div>

      {/* Capacity */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1.5">
          Seating Capacity
        </label>
        <input
          type="number"
          min={1}
          max={50}
          value={capacity}
          onChange={(e) => setCapacity(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="px-5 py-2.5 text-sm font-medium text-text-secondary bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || !number.trim() || !name.trim()}
          className="btn-primary rounded-xl text-sm px-5 py-2.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving…
            </span>
          ) : initial ? (
            'Update Table'
          ) : (
            'Create Table'
          )}
        </button>
      </div>
    </form>
  );
}
