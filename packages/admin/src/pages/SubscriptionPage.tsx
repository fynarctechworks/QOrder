import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  subscriptionService,
  type Plan,
} from '../services/subscriptionService';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export default function SubscriptionPage() {
  const queryClient = useQueryClient();
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: subscriptionService.getPlans,
  });

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: subscriptionService.getCurrentSubscription,
  });

  const trialMutation = useMutation({
    mutationFn: subscriptionService.startTrial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      toast.success('14-day free trial started!');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to start trial'),
  });

  async function handleUpgrade(plan: Plan) {
    if (plan.monthlyPrice === 0) {
      trialMutation.mutate();
      return;
    }

    try {
      const order = await subscriptionService.createPaymentOrder(plan.id, billingCycle);
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'QR Order',
        description: `${order.planName} — ${billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly'}`,
        order_id: order.orderId,
        handler: async function (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
          try {
            await subscriptionService.verifyPayment({
              planId: plan.id,
              billingCycle,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            queryClient.invalidateQueries({ queryKey: ['subscription'] });
            toast.success('Subscription activated!');
          } catch {
            toast.error('Payment verification failed');
          }
        },
        theme: { color: '#6366f1' },
      });
      rzp.open();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create order');
    }
  }

  const isLoading = plansLoading || subLoading;

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-72 bg-gray-100 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    TRIAL: 'bg-blue-100 text-blue-700',
    PAST_DUE: 'bg-amber-100 text-amber-700',
    CANCELLED: 'bg-red-100 text-red-700',
    EXPIRED: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Subscription & Billing</h1>
        <p className="text-sm text-text-muted mt-1">
          Manage your plan and billing settings
        </p>
      </div>

      {/* Current subscription */}
      {subscription && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-100 p-5"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                {subscription.plan.name} Plan
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[subscription.status] || 'bg-gray-100 text-gray-600'}`}>
                  {subscription.status}
                </span>
                <span className="text-xs text-text-muted">
                  {subscription.billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-text-primary">
                {subscription.amount > 0 ? `₹${subscription.amount}` : 'Free'}
              </p>
              {subscription.currentPeriodEnd && (
                <p className="text-xs text-text-muted">
                  Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
              {subscription.trialEndsAt && subscription.status === 'TRIAL' && (
                <p className="text-xs text-amber-600">
                  Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Billing cycle toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm font-medium ${billingCycle === 'MONTHLY' ? 'text-text-primary' : 'text-text-muted'}`}>
          Monthly
        </span>
        <button
          onClick={() => setBillingCycle(billingCycle === 'MONTHLY' ? 'YEARLY' : 'MONTHLY')}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            billingCycle === 'YEARLY' ? 'bg-primary' : 'bg-gray-300'
          }`}
        >
          <div
            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
              billingCycle === 'YEARLY' ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
        <span className={`text-sm font-medium ${billingCycle === 'YEARLY' ? 'text-text-primary' : 'text-text-muted'}`}>
          Yearly
          <span className="ml-1 text-xs text-green-600 font-medium">Save 20%</span>
        </span>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((plan, idx) => {
            const isCurrentPlan = subscription?.plan.id === plan.id;
            const price = billingCycle === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;
            const isPopular = idx === 2; // Pro plan

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
                className={`relative bg-white rounded-2xl border p-5 flex flex-col ${
                  isPopular ? 'border-primary shadow-lg shadow-primary/10' : 'border-gray-100'
                } ${isCurrentPlan ? 'ring-2 ring-primary/30' : ''}`}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-primary text-white text-xs font-medium rounded-full">
                    Most Popular
                  </span>
                )}

                <h3 className="text-base font-semibold text-text-primary">{plan.name}</h3>
                <p className="text-xs text-text-muted mt-1">{plan.description}</p>

                <div className="mt-4 mb-5">
                  <span className="text-3xl font-bold text-text-primary">
                    {price > 0 ? `₹${price}` : 'Free'}
                  </span>
                  {price > 0 && (
                    <span className="text-sm text-text-muted">
                      /{billingCycle === 'YEARLY' ? 'yr' : 'mo'}
                    </span>
                  )}
                </div>

                <ul className="space-y-2 flex-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                      <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                  <li className="flex items-start gap-2 text-sm text-text-muted">
                    <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Up to {plan.maxBranches} branches, {plan.maxStaff} staff, {plan.maxTables} tables
                  </li>
                </ul>

                <button
                  onClick={() => handleUpgrade(plan)}
                  disabled={isCurrentPlan}
                  className={`mt-5 w-full py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isCurrentPlan
                      ? 'bg-gray-100 text-text-muted cursor-default'
                      : isPopular
                      ? 'bg-primary text-white hover:bg-primary-hover'
                      : 'bg-gray-100 text-text-primary hover:bg-gray-200'
                  }`}
                >
                  {isCurrentPlan ? 'Current Plan' : price === 0 ? 'Start Free Trial' : 'Upgrade'}
                </button>
              </motion.div>
            );
          })}
      </div>
    </div>
  );
}
