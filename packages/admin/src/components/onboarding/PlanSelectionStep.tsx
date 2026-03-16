import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { subscriptionService, type Plan } from '../../services/subscriptionService';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

interface Props {
  onNext: () => void;
}

export default function PlanSelectionStep({ onNext }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadPlans();
    loadRazorpayScript();
  }, []);

  async function loadPlans() {
    try {
      const data = await subscriptionService.getPlans();
      setPlans(data);
      // Auto-select first free plan
      const freePlan = data.find((p) => Number(p.monthlyPrice) === 0);
      if (freePlan) setSelectedPlan(freePlan.id);
    } catch {
      toast.error('Failed to load plans');
    } finally {
      setLoading(false);
    }
  }

  function loadRazorpayScript() {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }

  async function handleSelectPlan() {
    if (!selectedPlan) {
      toast.error('Please select a plan');
      return;
    }

    const plan = plans.find((p) => p.id === selectedPlan);
    if (!plan) return;

    const price = billingCycle === 'YEARLY' ? Number(plan.yearlyPrice) : Number(plan.monthlyPrice);

    // Free plan = start trial directly
    if (price === 0) {
      setProcessing(true);
      try {
        await subscriptionService.startTrial();
        toast.success('Free trial started! You have 14 days to explore all features.');
        onNext();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to start trial');
      } finally {
        setProcessing(false);
      }
      return;
    }

    // Paid plan = Razorpay checkout
    setProcessing(true);
    try {
      const order = await subscriptionService.createPaymentOrder(selectedPlan, billingCycle);

      if (!window.Razorpay) {
        toast.error('Payment system is loading. Please try again.');
        setProcessing(false);
        return;
      }

      const razorpay = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'QR Order',
        description: `${order.planName} - ${billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly'}`,
        order_id: order.orderId,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await subscriptionService.verifyPayment({
              planId: selectedPlan,
              billingCycle,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            toast.success('Payment successful! Subscription activated.');
            onNext();
          } catch {
            toast.error('Payment verification failed. Please contact support.');
          }
          setProcessing(false);
        },
        modal: {
          ondismiss: () => setProcessing(false),
        },
        theme: { color: '#6366f1' },
      });

      razorpay.open();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create payment');
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        <p className="text-text-muted mt-3 text-sm">Loading plans...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-text-primary">Choose your plan</h2>
        <p className="text-text-muted mt-1">Start free, upgrade when you're ready</p>
      </div>

      {/* Billing cycle toggle */}
      <div className="flex justify-center mb-8">
        <div className="bg-gray-100 p-1 rounded-xl flex">
          <button
            onClick={() => setBillingCycle('MONTHLY')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              billingCycle === 'MONTHLY'
                ? 'bg-white shadow-sm text-text-primary'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('YEARLY')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              billingCycle === 'YEARLY'
                ? 'bg-white shadow-sm text-text-primary'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Yearly <span className="text-green-600 text-xs ml-1">Save 17%</span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan) => {
          const price = billingCycle === 'YEARLY' ? Number(plan.yearlyPrice) : Number(plan.monthlyPrice);
          const monthly = billingCycle === 'YEARLY' ? Math.round(price / 12) : price;
          const isSelected = selectedPlan === plan.id;
          const isFree = price === 0;
          const features = typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features;

          return (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`p-5 rounded-2xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-lg font-bold text-text-primary">{plan.name}</div>
              <div className="mt-2">
                {isFree ? (
                  <div>
                    <span className="text-2xl font-bold text-text-primary">Free</span>
                    <span className="text-xs text-text-muted ml-1">14-day trial</span>
                  </div>
                ) : (
                  <div>
                    <span className="text-2xl font-bold text-text-primary">₹{monthly}</span>
                    <span className="text-xs text-text-muted">/mo</span>
                    {billingCycle === 'YEARLY' && (
                      <div className="text-xs text-text-muted">₹{price}/year</div>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-text-muted mt-2 mb-3">{plan.description}</p>
              <ul className="space-y-1.5">
                {(features as string[]).map((f: string, i: number) => (
                  <li key={i} className="text-xs text-text-primary flex items-start gap-1.5">
                    <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* Action button */}
      <div className="mt-8 text-center">
        <button
          onClick={handleSelectPlan}
          disabled={processing || !selectedPlan}
          className="px-8 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {processing ? 'Processing...' : plans.find((p) => p.id === selectedPlan && Number(p.monthlyPrice) === 0) ? 'Start Free Trial' : 'Subscribe & Pay'}
        </button>
      </div>
    </div>
  );
}
