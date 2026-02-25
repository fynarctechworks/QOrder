import { memo } from 'react';
import { motion } from 'framer-motion';
import type { OrderStatus } from '../types';

interface OrderStatusStepperProps {
  currentStatus: OrderStatus;
}

interface Step {
  key: OrderStatus;
  label: string;
  description: string;
}

const steps: Step[] = [
  { key: 'preparing', label: 'Preparing', description: 'Your food is being prepared' },
  { key: 'payment_pending', label: 'Payment Pending', description: 'Awaiting payment' },
];

const statusOrder: OrderStatus[] = [
  'pending',
  'preparing',
  'payment_pending',
  'completed',
];

function OrderStatusStepperComponent({ currentStatus }: OrderStatusStepperProps) {
  const currentIndex = statusOrder.indexOf(currentStatus);

  const getStepState = (stepKey: OrderStatus): 'completed' | 'current' | 'upcoming' => {
    const stepIndex = statusOrder.indexOf(stepKey);
    if (stepIndex < currentIndex || currentStatus === 'completed') return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  if (currentStatus === 'cancelled') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
        <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-primary">Order Cancelled</h3>
        <p className="mt-1 text-sm text-gray-400">This order has been cancelled.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-5">
        Order Progress
      </h3>

      <div className="relative">
        {/* Steps */}
        <div className="space-y-0">
          {steps.map((step, idx) => {
            const state = getStepState(step.key);
            const isLast = idx === steps.length - 1;

            return (
              <div key={step.key} className="relative flex gap-3">
                {/* Timeline column */}
                <div className="flex flex-col items-center">
                  {/* Dot / check */}
                  <motion.div
                    initial={false}
                    animate={{
                      backgroundColor:
                        state === 'completed' ? '#22C55E'
                        : state === 'current' ? '#1F3D36'
                        : '#E5E7EB',
                    }}
                    className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  >
                    {state === 'completed' ? (
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : state === 'current' ? (
                      <>
                        <motion.div
                          animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="absolute inset-0 rounded-full bg-orange-400"
                        />
                        <div className="w-2.5 h-2.5 bg-white rounded-full relative z-10" />
                      </>
                    ) : (
                      <div className="w-2.5 h-2.5 bg-gray-300 rounded-full" />
                    )}
                  </motion.div>

                  {/* Connecting line */}
                  {!isLast && (
                    <div className="w-0.5 flex-1 min-h-[28px] relative">
                      <div className="absolute inset-0 bg-gray-200 rounded-full" />
                      {(state === 'completed' || state === 'current') && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: state === 'completed' ? '100%' : '50%' }}
                          transition={{ duration: 0.5, delay: idx * 0.15 }}
                          className="absolute top-0 left-0 right-0 bg-green-500 rounded-full"
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className={`pb-5 ${isLast ? 'pb-0' : ''}`}>
                  <p className={`text-sm font-semibold leading-tight ${
                    state === 'completed' ? 'text-green-600'
                    : state === 'current' ? 'text-orange-600'
                    : 'text-gray-300'
                  }`}>
                    {step.label}
                  </p>
                  <p className={`text-xs mt-0.5 ${
                    state === 'upcoming' ? 'text-gray-300' : 'text-gray-400'
                  }`}>
                    {state === 'current' ? 'In progress...' : step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const OrderStatusStepper = memo(OrderStatusStepperComponent);
