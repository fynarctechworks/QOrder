import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CustomerInfoSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string, phone: string) => void;
  isPending: boolean;
  totalLabel: string;
}

const STORAGE_KEY = 'qorder_customer_info';

function getSavedInfo(): { name: string; phone: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { name: '', phone: '' };
}

function saveInfo(name: string, phone: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, phone }));
}

export default function CustomerInfoSheet({
  open,
  onClose,
  onConfirm,
  isPending,
  totalLabel,
}: CustomerInfoSheetProps) {
  const saved = getSavedInfo();
  const [name, setName] = useState(saved.name);
  const [phone, setPhone] = useState(saved.phone);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);

  // Auto-focus name field when sheet opens
  useEffect(() => {
    if (open) {
      const saved = getSavedInfo();
      setName(saved.name);
      setPhone(saved.phone);
      setErrors({});
      setTimeout(() => nameRef.current?.focus(), 300);
    }
  }, [open]);

  const validate = (): boolean => {
    const errs: { name?: string; phone?: string } = {};
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      errs.name = 'Name is required';
    } else if (trimmedName.length < 2) {
      errs.name = 'Name must be at least 2 characters';
    }

    if (!trimmedPhone) {
      errs.phone = 'Phone number is required';
    } else if (!/^[\d+\-\s()]{7,20}$/.test(trimmedPhone)) {
      errs.phone = 'Enter a valid phone number';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleConfirm = () => {
    if (!validate()) return;
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    saveInfo(trimmedName, trimmedPhone);
    onConfirm(trimmedName, trimmedPhone);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Bottom sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl shadow-2xl safe-bottom max-w-lg mx-auto"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            <div className="px-6 pb-8 pt-2">
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Almost there!</h2>
                  <p className="text-xs text-gray-500">We'll send your bill on WhatsApp</p>
                </div>
              </div>

              {/* Name */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  placeholder="Your name"
                  className={`w-full border ${
                    errors.name ? 'border-red-400 ring-1 ring-red-400' : 'border-gray-200'
                  } rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all`}
                  maxLength={100}
                  autoComplete="name"
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-500 font-medium">{errors.name}</p>
                )}
              </div>

              {/* Phone */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  WhatsApp Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  placeholder="+91 98765 43210"
                  className={`w-full border ${
                    errors.phone ? 'border-red-400 ring-1 ring-red-400' : 'border-gray-200'
                  } rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all`}
                  maxLength={20}
                  autoComplete="tel"
                />
                {errors.phone && (
                  <p className="mt-1 text-xs text-red-500 font-medium">{errors.phone}</p>
                )}
              </div>

              {/* Confirm button */}
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-bold text-base py-4 rounded-2xl transition-colors shadow-sm"
              >
                {isPending ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Placing Order...
                  </>
                ) : (
                  <>Confirm Order &middot; {totalLabel}</>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
