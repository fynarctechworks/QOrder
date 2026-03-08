import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import { creditService } from '../services/creditService';
import type { CreditAccount, CreditTransaction } from '../services/creditService';
import { useCurrency } from '../hooks/useCurrency';

/* ═══════════════════ Main Page ═══════════════════════════ */

export default function CreditPage() {
  const fmt = useCurrency();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CreditAccount | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [showRepayModal, setShowRepayModal] = useState<string | null>(null);

  // ─── Queries ──────────────────────────────────────────
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['credit-accounts', search],
    queryFn: () => creditService.getAccounts({ search: search || undefined }),
  });

  const { data: summary } = useQuery({
    queryKey: ['credit-summary'],
    queryFn: creditService.getSummary,
  });

  const { data: accountDetail } = useQuery({
    queryKey: ['credit-account', selectedAccount],
    queryFn: () => creditService.getAccount(selectedAccount!),
    enabled: !!selectedAccount,
  });

  // ─── Mutations ────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: creditService.createAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-accounts'] });
      qc.invalidateQueries({ queryKey: ['credit-summary'] });
      setShowCreateModal(false);
      toast.success('Credit account created');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof creditService.updateAccount>[1] }) =>
      creditService.updateAccount(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-accounts'] });
      qc.invalidateQueries({ queryKey: ['credit-summary'] });
      qc.invalidateQueries({ queryKey: ['credit-account'] });
      setEditingAccount(null);
      toast.success('Account updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: creditService.deleteAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-accounts'] });
      qc.invalidateQueries({ queryKey: ['credit-summary'] });
      setSelectedAccount(null);
      toast.success('Account deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const repayMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof creditService.recordRepayment>[1] }) =>
      creditService.recordRepayment(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-accounts'] });
      qc.invalidateQueries({ queryKey: ['credit-summary'] });
      qc.invalidateQueries({ queryKey: ['credit-account'] });
      setShowRepayModal(null);
      toast.success('Repayment recorded');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeAccounts = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);
  const inactiveAccounts = useMemo(() => accounts.filter((a) => !a.isActive), [accounts]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Credit Accounts</h1>
          <p className="text-sm text-text-muted mt-1">Manage credit (udhar) for family, friends & trusted regulars</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary rounded-xl text-sm px-5 py-2.5 shadow-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Account
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-text-muted">Total Accounts</div>
            <div className="text-2xl font-bold text-text-primary mt-1">{summary.totalAccounts}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-text-muted">Outstanding Balance</div>
            <div className="text-2xl font-bold text-red-600 mt-1">{fmt(summary.totalOutstanding)}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-text-muted">Accounts with Balance</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{summary.accountsWithBalance}</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Account List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          {search ? 'No accounts match your search' : 'No credit accounts yet. Create one to get started.'}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Accounts */}
          {activeAccounts.length > 0 && (
            <div className="space-y-3">
              {activeAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  fmt={fmt}
                  onView={() => setSelectedAccount(account.id)}
                  onEdit={() => setEditingAccount(account)}
                  onRepay={() => setShowRepayModal(account.id)}
                />
              ))}
            </div>
          )}

          {/* Inactive */}
          {inactiveAccounts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-text-muted mb-3">Inactive Accounts</h3>
              <div className="space-y-3 opacity-60">
                {inactiveAccounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    fmt={fmt}
                    onView={() => setSelectedAccount(account.id)}
                    onEdit={() => setEditingAccount(account)}
                    onRepay={() => setShowRepayModal(account.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Create Modal ─────────────────────────────────── */}
      <Modal open={showCreateModal} title="New Credit Account" onClose={() => setShowCreateModal(false)}>
        <AccountForm
          isLoading={createMutation.isPending}
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>

      {/* ── Edit Modal ───────────────────────────────────── */}
      <Modal open={!!editingAccount} title="Edit Credit Account" onClose={() => setEditingAccount(null)}>
        {editingAccount && (
          <AccountForm
            initial={editingAccount}
            isLoading={updateMutation.isPending}
            onSubmit={(data) => updateMutation.mutate({ id: editingAccount.id, data })}
            onCancel={() => setEditingAccount(null)}
          />
        )}
      </Modal>

      {/* ── Account Detail / Ledger Modal ────────────────── */}
      <Modal open={!!selectedAccount} title="Account Ledger" onClose={() => setSelectedAccount(null)}>
        {accountDetail && (
          <AccountLedger
            account={accountDetail}
            fmt={fmt}
            onDelete={() => {
              if (confirm(`Delete account "${accountDetail.name}"? This cannot be undone.`)) {
                deleteMutation.mutate(accountDetail.id);
              }
            }}
            isDeleting={deleteMutation.isPending}
          />
        )}
      </Modal>

      {/* ── Repayment Modal ──────────────────────────────── */}
      <Modal open={!!showRepayModal} title="Record Repayment" onClose={() => setShowRepayModal(null)}>
        {showRepayModal && (
          <RepaymentForm
            accountId={showRepayModal}
            account={accounts.find((a) => a.id === showRepayModal)!}
            fmt={fmt}
            isLoading={repayMutation.isPending}
            onSubmit={(data) => repayMutation.mutate({ id: showRepayModal, data })}
            onCancel={() => setShowRepayModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}

/* ═══════════════════ Account Card ════════════════════════ */

function AccountCard({
  account,
  fmt,
  onView,
  onEdit,
  onRepay,
}: {
  account: CreditAccount;
  fmt: (n: number) => string;
  onView: () => void;
  onEdit: () => void;
  onRepay: () => void;
}) {
  const balance = Number(account.balance);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onView}>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {account.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-text-primary truncate">{account.name}</h3>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                {account.phone && <span>{account.phone}</span>}
                {account.phone && account.email && <span>·</span>}
                {account.email && <span className="truncate">{account.email}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className={`text-lg font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {fmt(balance)}
          </div>
          {account.creditLimit != null && (
            <div className="text-xs text-text-muted">Limit: {fmt(Number(account.creditLimit))}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
        <button
          onClick={onView}
          className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-text-secondary rounded-lg transition-colors"
        >
          View Ledger
        </button>
        <button
          onClick={onEdit}
          className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-text-secondary rounded-lg transition-colors"
        >
          Edit
        </button>
        {balance > 0 && (
          <button
            onClick={onRepay}
            className="text-xs px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors ml-auto"
          >
            Record Payment
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ Account Form ════════════════════════ */

function AccountForm({
  initial,
  isLoading,
  onSubmit,
  onCancel,
}: {
  initial?: CreditAccount | null;
  isLoading: boolean;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [creditLimit, setCreditLimit] = useState(initial?.creditLimit != null ? String(initial.creditLimit) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const data: Record<string, unknown> = { name: name.trim() };
    if (phone.trim()) data.phone = phone.trim();
    else if (initial) data.phone = null;
    if (email.trim()) data.email = email.trim();
    else if (initial) data.email = null;
    if (creditLimit.trim()) data.creditLimit = parseFloat(creditLimit);
    else if (initial) data.creditLimit = null;
    if (notes.trim()) data.notes = notes.trim();
    else if (initial) data.notes = null;
    if (initial) data.isActive = isActive;
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Name <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ajay (Family)"
          required
          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210"
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Credit Limit</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={creditLimit}
          onChange={(e) => setCreditLimit(e.target.value)}
          placeholder="Leave empty for no limit"
          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any details about this account..."
          rows={2}
          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
        />
      </div>
      {initial && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-gray-300 text-primary focus:ring-primary"
          />
          Active
        </label>
      )}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} disabled={isLoading} className="px-5 py-2.5 text-sm font-medium text-text-secondary bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all">
          Cancel
        </button>
        <button type="submit" disabled={isLoading || !name.trim()} className="btn-primary rounded-xl text-sm px-5 py-2.5 shadow-sm disabled:opacity-50">
          {isLoading ? 'Saving...' : initial ? 'Update' : 'Create Account'}
        </button>
      </div>
    </form>
  );
}

/* ═══════════════════ Account Ledger ═════════════════════ */

function AccountLedger({
  account,
  fmt,
  onDelete,
  isDeleting,
}: {
  account: CreditAccount & { transactions: CreditTransaction[] };
  fmt: (n: number) => string;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const balance = Number(account.balance);

  return (
    <div className="space-y-4">
      {/* Account Info */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-text-muted">Account</span>
          <span className="font-semibold text-text-primary">{account.name}</span>
        </div>
        {account.phone && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-text-muted">Phone</span>
            <span className="text-sm text-text-primary">{account.phone}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-sm text-text-muted">Outstanding</span>
          <span className={`text-xl font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(balance)}</span>
        </div>
        {account.creditLimit != null && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-text-muted">Credit Limit</span>
            <span className="text-sm text-text-primary">{fmt(Number(account.creditLimit))}</span>
          </div>
        )}
        {account.notes && (
          <div className="text-xs text-text-muted border-t border-gray-200 pt-2 mt-2">{account.notes}</div>
        )}
      </div>

      {/* Transaction History */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Transaction History</h3>
        {account.transactions.length === 0 ? (
          <div className="text-center py-6 text-text-muted text-sm">No transactions yet</div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {account.transactions.map((txn) => (
              <div key={txn.id} className={`flex items-start justify-between gap-3 p-3 rounded-lg border ${
                txn.type === 'CHARGE' ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'
              }`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      txn.type === 'CHARGE' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {txn.type === 'CHARGE' ? 'Charge' : 'Repayment'}
                    </span>
                    {txn.method && <span className="text-xs text-text-muted">{txn.method}</span>}
                  </div>
                  {txn.notes && <div className="text-xs text-text-muted mt-1">{txn.notes}</div>}
                  <div className="text-xs text-text-muted mt-1">
                    {new Date(txn.createdAt).toLocaleDateString()} {new Date(txn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {txn.createdBy && <span> · by {txn.createdBy}</span>}
                  </div>
                </div>
                <div className={`text-sm font-bold whitespace-nowrap ${
                  txn.type === 'CHARGE' ? 'text-red-600' : 'text-green-600'
                }`}>
                  {txn.type === 'CHARGE' ? '+' : '-'}{fmt(Math.abs(Number(txn.amount)))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete */}
      {balance === 0 && (
        <div className="border-t border-gray-200 pt-3">
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete this account'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ Repayment Form ═════════════════════ */

function RepaymentForm({
  accountId: _accountId,
  account,
  fmt,
  isLoading,
  onSubmit,
  onCancel,
}: {
  accountId: string;
  account: CreditAccount;
  fmt: (n: number) => string;
  isLoading: boolean;
  onSubmit: (data: { amount: number; method?: string; reference?: string; notes?: string }) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const balance = Number(account.balance);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (!num || num <= 0 || num > balance) return;
    onSubmit({
      amount: num,
      method,
      reference: reference || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-amber-900">{account.name} — Outstanding</span>
          <span className="text-xl font-bold text-amber-900">{fmt(balance)}</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Amount <span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={balance}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
            className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => setAmount(balance.toFixed(2))}
            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-text-secondary rounded-xl text-sm font-medium transition-colors"
          >
            Full
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Payment Method</label>
        <div className="grid grid-cols-4 gap-2">
          {['CASH', 'UPI', 'CARD', 'WALLET'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`py-2 rounded-xl text-xs font-medium border-2 transition-all ${
                method === m ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-text-secondary hover:border-gray-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Reference</label>
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Transaction ID (optional)"
          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
          rows={2}
          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} disabled={isLoading} className="px-5 py-2.5 text-sm font-medium text-text-secondary bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Processing...' : `Record Payment ${amount ? fmt(parseFloat(amount) || 0) : ''}`}
        </button>
      </div>
    </form>
  );
}
