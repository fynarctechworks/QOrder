import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export const creditService = {
  // ─── Accounts ─────────────────────────────────────────

  async getAccounts(restaurantId: string, { search, activeOnly }: { search?: string; activeOnly?: boolean } = {}) {
    return prisma.creditAccount.findMany({
      where: {
        restaurantId,
        ...(activeOnly !== undefined ? { isActive: activeOnly } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { phone: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: {
        _count: { select: { transactions: true } },
      },
      orderBy: { name: 'asc' },
    });
  },

  async getAccountById(id: string, restaurantId: string) {
    const account = await prisma.creditAccount.findFirst({
      where: { id, restaurantId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        _count: { select: { transactions: true } },
      },
    });
    if (!account) throw AppError.notFound('Credit account');
    return account;
  },

  async createAccount(restaurantId: string, data: {
    name: string;
    phone?: string;
    email?: string;
    creditLimit?: number;
    notes?: string;
    customerId?: string;
  }) {
    return prisma.creditAccount.create({
      data: {
        restaurantId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        creditLimit: data.creditLimit != null ? new Decimal(data.creditLimit) : null,
        notes: data.notes,
        customerId: data.customerId,
      },
      include: { _count: { select: { transactions: true } } },
    });
  },

  async updateAccount(id: string, restaurantId: string, data: {
    name?: string;
    phone?: string;
    email?: string;
    creditLimit?: number | null;
    notes?: string;
    isActive?: boolean;
  }) {
    const account = await prisma.creditAccount.findFirst({ where: { id, restaurantId } });
    if (!account) throw AppError.notFound('Credit account');

    return prisma.creditAccount.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.creditLimit !== undefined
          ? { creditLimit: data.creditLimit != null ? new Decimal(data.creditLimit) : null }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: { _count: { select: { transactions: true } } },
    });
  },

  async deleteAccount(id: string, restaurantId: string) {
    const account = await prisma.creditAccount.findFirst({ where: { id, restaurantId } });
    if (!account) throw AppError.notFound('Credit account');
    if (Number(account.balance) > 0) {
      throw AppError.badRequest('Cannot delete account with outstanding balance. Clear the balance first.');
    }
    await prisma.creditAccount.delete({ where: { id } });
  },

  // ─── Transactions ─────────────────────────────────────

  async chargeToAccount(accountId: string, restaurantId: string, data: {
    amount: number;
    orderId?: string;
    sessionId?: string;
    notes?: string;
    createdBy?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const account = await tx.creditAccount.findFirst({ where: { id: accountId, restaurantId } });
      if (!account) throw AppError.notFound('Credit account');
      if (!account.isActive) throw AppError.badRequest('Credit account is inactive');

      const chargeAmount = new Decimal(data.amount);
      const newBalance = new Decimal(account.balance.toString()).add(chargeAmount);

      // Check credit limit
      if (account.creditLimit && newBalance.gt(new Decimal(account.creditLimit.toString()))) {
        throw AppError.badRequest(
          `Charge exceeds credit limit. Limit: ${account.creditLimit}, Current: ${account.balance}, Charge: ${data.amount}`
        );
      }

      // Create transaction
      const transaction = await tx.creditTransaction.create({
        data: {
          accountId,
          restaurantId,
          amount: chargeAmount,
          type: 'CHARGE',
          orderId: data.orderId,
          sessionId: data.sessionId,
          notes: data.notes,
          createdBy: data.createdBy,
        },
      });

      // Update balance
      await tx.creditAccount.update({
        where: { id: accountId },
        data: { balance: newBalance },
      });

      return transaction;
    });
  },

  async recordRepayment(accountId: string, restaurantId: string, data: {
    amount: number;
    method?: string;
    reference?: string;
    notes?: string;
    createdBy?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const account = await tx.creditAccount.findFirst({ where: { id: accountId, restaurantId } });
      if (!account) throw AppError.notFound('Credit account');

      const repayAmount = new Decimal(data.amount);
      if (repayAmount.gt(new Decimal(account.balance.toString()))) {
        throw AppError.badRequest('Repayment amount exceeds outstanding balance');
      }

      const newBalance = new Decimal(account.balance.toString()).sub(repayAmount);

      const transaction = await tx.creditTransaction.create({
        data: {
          accountId,
          restaurantId,
          amount: repayAmount.neg(), // negative for repayment
          type: 'REPAYMENT',
          method: data.method,
          reference: data.reference,
          notes: data.notes,
          createdBy: data.createdBy,
        },
      });

      await tx.creditAccount.update({
        where: { id: accountId },
        data: { balance: newBalance },
      });

      return transaction;
    });
  },

  async getTransactions(accountId: string, restaurantId: string, { page = 1, limit = 50 } = {}) {
    const [transactions, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where: { accountId, restaurantId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.creditTransaction.count({ where: { accountId, restaurantId } }),
    ]);
    return { transactions, total, page, limit };
  },

  // ─── Summary ──────────────────────────────────────────

  async getSummary(restaurantId: string) {
    const accounts = await prisma.creditAccount.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, name: true, balance: true },
    });

    const totalOutstanding = accounts.reduce(
      (sum, a) => sum.add(new Decimal(a.balance.toString())),
      new Decimal(0)
    );

    return {
      totalAccounts: accounts.length,
      totalOutstanding: Number(totalOutstanding),
      accountsWithBalance: accounts.filter((a) => Number(a.balance) > 0).length,
    };
  },
};
