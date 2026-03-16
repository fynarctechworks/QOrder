import { prisma, AppError, logger } from '../lib/index.js';
import { getRazorpay, verifyPaymentSignature } from '../lib/razorpay.js';
import { config } from '../config/index.js';

const db = prisma as any;

const TRIAL_DAYS = 14;

export const subscriptionService = {
  /** Get all active plans */
  async getPlans() {
    return db.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  },

  /** Get current subscription for a restaurant */
  async getSubscription(restaurantId: string) {
    return db.subscription.findFirst({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });
  },

  /** Start free trial for a new restaurant */
  async startTrial(restaurantId: string) {
    // Find the free/trial plan (lowest price)
    let trialPlan = await db.plan.findFirst({
      where: { isActive: true },
      orderBy: { monthlyPrice: 'asc' },
    });

    // If no plans exist, seed them
    if (!trialPlan) {
      await this.seedPlans();
      trialPlan = await db.plan.findFirst({
        where: { isActive: true },
        orderBy: { monthlyPrice: 'asc' },
      });
    }

    if (!trialPlan) {
      throw AppError.internal('No subscription plans available');
    }

    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    return db.subscription.create({
      data: {
        status: 'TRIAL',
        billingCycle: 'MONTHLY',
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        trialEndsAt: trialEnd,
        amount: 0,
        planId: trialPlan.id,
        restaurantId,
      },
      include: { plan: true },
    });
  },

  /** Create a Razorpay order for subscription payment */
  async createPaymentOrder(restaurantId: string, planId: string, billingCycle: 'MONTHLY' | 'YEARLY') {
    const plan = await db.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw AppError.notFound('Plan');

    const amount = billingCycle === 'YEARLY'
      ? Number(plan.yearlyPrice)
      : Number(plan.monthlyPrice);

    const amountInPaise = Math.round(amount * 100);

    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `sub_${restaurantId}_${Date.now()}`,
      notes: {
        restaurantId,
        planId,
        billingCycle,
      },
    });

    return {
      orderId: order.id,
      amount: amountInPaise,
      currency: 'INR',
      keyId: config.razorpay.keyId,
      planName: plan.name,
    };
  },

  /** Verify payment and activate subscription */
  async verifyAndActivate(
    restaurantId: string,
    planId: string,
    billingCycle: 'MONTHLY' | 'YEARLY',
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ) {
    // Verify signature
    const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) throw AppError.badRequest('Invalid payment signature');

    const plan = await db.plan.findUnique({ where: { id: planId } });
    if (!plan) throw AppError.notFound('Plan');

    const amount = billingCycle === 'YEARLY'
      ? Number(plan.yearlyPrice)
      : Number(plan.monthlyPrice);

    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'YEARLY') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // Deactivate any existing subscription
    await db.subscription.updateMany({
      where: { restaurantId, status: { in: ['TRIAL', 'ACTIVE'] } },
      data: { status: 'EXPIRED' },
    });

    // Create new active subscription
    const subscription = await db.subscription.create({
      data: {
        status: 'ACTIVE',
        billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        razorpayPaymentId,
        amount,
        planId,
        restaurantId,
      },
      include: { plan: true },
    });

    return subscription;
  },

  /** Seed default plans */
  async seedPlans() {
    const plans = [
      {
        name: 'Starter',
        description: 'Perfect for small restaurants getting started',
        monthlyPrice: 0,
        yearlyPrice: 0,
        features: JSON.stringify([
          'Up to 1 branch',
          'Up to 5 staff',
          'Up to 20 tables',
          'Basic menu management',
          'QR code ordering',
          'Basic analytics',
        ]),
        maxBranches: 1,
        maxStaff: 5,
        maxTables: 20,
        sortOrder: 0,
      },
      {
        name: 'Basic',
        description: 'For growing restaurants',
        monthlyPrice: 999,
        yearlyPrice: 9990,
        features: JSON.stringify([
          'Up to 2 branches',
          'Up to 15 staff',
          'Up to 50 tables',
          'Full menu management',
          'QR code ordering',
          'Advanced analytics',
          'Inventory management',
          'Customer CRM',
        ]),
        maxBranches: 2,
        maxStaff: 15,
        maxTables: 50,
        sortOrder: 1,
      },
      {
        name: 'Pro',
        description: 'For multi-location restaurants',
        monthlyPrice: 2499,
        yearlyPrice: 24990,
        features: JSON.stringify([
          'Up to 5 branches',
          'Up to 50 staff',
          'Unlimited tables',
          'Full menu management',
          'QR code ordering',
          'Advanced analytics & reports',
          'Inventory management',
          'Customer CRM',
          'Discount management',
          'Kitchen display system',
          'TV menu display',
          'Priority support',
        ]),
        maxBranches: 5,
        maxStaff: 50,
        maxTables: 999,
        sortOrder: 2,
      },
      {
        name: 'Enterprise',
        description: 'For restaurant chains',
        monthlyPrice: 4999,
        yearlyPrice: 49990,
        features: JSON.stringify([
          'Unlimited branches',
          'Unlimited staff',
          'Unlimited tables',
          'Everything in Pro',
          'Custom integrations',
          'Dedicated account manager',
          'SLA guarantee',
          'White-label option',
        ]),
        maxBranches: 999,
        maxStaff: 999,
        maxTables: 9999,
        sortOrder: 3,
      },
    ];

    for (const plan of plans) {
      await db.plan.upsert({
        where: { name: plan.name },
        create: plan,
        update: plan,
      });
    }

    logger.info('Subscription plans seeded');
  },
};
