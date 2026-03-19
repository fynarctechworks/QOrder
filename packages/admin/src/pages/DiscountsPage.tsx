import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { discountService, type Discount, type Coupon, type CreateDiscountInput, type CreateCouponInput } from '../services/discountService';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DiscountForm({ initial, onSubmit, loading }: { initial?: Partial<CreateDiscountInput>; onSubmit: (data: CreateDiscountInput) => void; loading: boolean }) {
  const [form, setForm] = useState<CreateDiscountInput>({
    name: initial?.name || '',
    type: initial?.type || 'PERCENTAGE',
    value: Number(initial?.value) || 0,
    minOrderAmount: initial?.minOrderAmount != null ? Number(initial.minOrderAmount) : null,
    maxDiscount: initial?.maxDiscount != null ? Number(initial.maxDiscount) : null,
    isAutoApply: initial?.isAutoApply ?? false,
    activeFrom: initial?.activeFrom ?? null,
    activeTo: initial?.activeTo ?? null,
    activeDays: initial?.activeDays ?? [],
    activeTimeFrom: initial?.activeTimeFrom ?? null,
    activeTimeTo: initial?.activeTimeTo ?? null,
    maxUses: initial?.maxUses ?? null,
    isActive: initial?.isActive ?? true,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
        <input type="text" required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="input w-full" placeholder="e.g. Summer 20% Off" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Type</label>
          <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value as 'PERCENTAGE' | 'FLAT' }))} className="input w-full">
            <option value="PERCENTAGE">Percentage</option>
            <option value="FLAT">Flat Amount</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Value</label>
          <input type="number" required min="0" step="0.01" value={form.value} onChange={(e) => setForm(f => ({ ...f, value: Number(e.target.value) }))} className="input w-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Min Order Amount</label>
          <input type="number" min="0" step="0.01" value={form.minOrderAmount ?? ''} onChange={(e) => setForm(f => ({ ...f, minOrderAmount: e.target.value ? Number(e.target.value) : null }))} className="input w-full" placeholder="No minimum" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Max Discount Cap</label>
          <input type="number" min="0" step="0.01" value={form.maxDiscount ?? ''} onChange={(e) => setForm(f => ({ ...f, maxDiscount: e.target.value ? Number(e.target.value) : null }))} className="input w-full" placeholder="No cap" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isAutoApply} onChange={(e) => setForm(f => ({ ...f, isAutoApply: e.target.checked }))} className="rounded border-gray-300 text-primary" />
          Auto-apply (applied automatically at checkout)
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Active Days</label>
        <div className="flex flex-wrap gap-2">
          {DAY_NAMES.map((name, i) => (
            <button key={i} type="button"
              onClick={() => setForm(f => ({ ...f, activeDays: f.activeDays?.includes(i) ? f.activeDays.filter(d => d !== i) : [...(f.activeDays || []), i] }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${form.activeDays?.includes(i) ? 'bg-primary text-white' : 'bg-surface-secondary text-text-muted'}`}>
              {name}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-1">Leave empty for all days</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Active Time From</label>
          <input type="time" value={form.activeTimeFrom ?? ''} onChange={(e) => setForm(f => ({ ...f, activeTimeFrom: e.target.value || null }))} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Active Time To</label>
          <input type="time" value={form.activeTimeTo ?? ''} onChange={(e) => setForm(f => ({ ...f, activeTimeTo: e.target.value || null }))} className="input w-full" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Max Total Uses</label>
        <input type="number" min="1" value={form.maxUses ?? ''} onChange={(e) => setForm(f => ({ ...f, maxUses: e.target.value ? Number(e.target.value) : null }))} className="input w-full" placeholder="Unlimited" />
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? 'Saving...' : 'Save Discount'}
      </button>
    </form>
  );
}

function CouponForm({ discounts, initial, onSubmit, loading }: { discounts: Discount[]; initial?: Partial<CreateCouponInput>; onSubmit: (data: CreateCouponInput) => void; loading: boolean }) {
  const [form, setForm] = useState<CreateCouponInput>({
    code: initial?.code || '',
    discountId: initial?.discountId || (discounts[0]?.id ?? ''),
    maxUses: initial?.maxUses ?? null,
    maxUsesPerCustomer: initial?.maxUsesPerCustomer ?? 1,
    expiresAt: initial?.expiresAt ?? null,
    isActive: initial?.isActive ?? true,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Coupon Code</label>
        <input type="text" required value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="input w-full font-mono" placeholder="e.g. SUMMER20" />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Linked Discount</label>
        <select required value={form.discountId} onChange={(e) => setForm(f => ({ ...f, discountId: e.target.value }))} className="input w-full">
          {discounts.map(d => <option key={d.id} value={d.id}>{d.name} ({d.type === 'PERCENTAGE' ? `${d.value}%` : `â‚¹${d.value}`})</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Max Total Uses</label>
          <input type="number" min="1" value={form.maxUses ?? ''} onChange={(e) => setForm(f => ({ ...f, maxUses: e.target.value ? Number(e.target.value) : null }))} className="input w-full" placeholder="Unlimited" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Max Per Customer</label>
          <input type="number" min="1" value={form.maxUsesPerCustomer} onChange={(e) => setForm(f => ({ ...f, maxUsesPerCustomer: Number(e.target.value) || 1 }))} className="input w-full" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Expires At</label>
        <input type="datetime-local" value={form.expiresAt?.slice(0, 16) ?? ''} onChange={(e) => setForm(f => ({ ...f, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null }))} className="input w-full" />
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? 'Saving...' : 'Save Coupon'}
      </button>
    </form>
  );
}

export default function DiscountsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'discounts' | 'coupons'>('discounts');
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  const { data: discounts = [], isLoading: loadingDiscounts, isError: disErr, error: disError, refetch: refetchDis } = useQuery({
    queryKey: ['discounts'],
    queryFn: discountService.list,
  });

  const { data: coupons = [], isLoading: loadingCoupons, isError: couErr, error: couError, refetch: refetchCou } = useQuery({
    queryKey: ['coupons'],
    queryFn: discountService.listCoupons,
    enabled: tab === 'coupons',
  });

  const createDiscount = useMutation({
    mutationFn: (data: CreateDiscountInput) => discountService.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['discounts'] }); setShowDiscountModal(false); toast.success('Discount created'); },
    onError: (err: Error) => toast.error(err.message || 'Failed to create discount'),
  });
  const updateDiscount = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateDiscountInput> }) => discountService.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['discounts'] }); setEditingDiscount(null); toast.success('Discount updated'); },
    onError: (err: Error) => toast.error(err.message || 'Failed to update discount'),
  });
  const deleteDiscount = useMutation({
    mutationFn: (id: string) => discountService.remove(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['discounts'] }); toast.success('Discount deleted'); },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete discount'),
  });

  const createCoupon = useMutation({
    mutationFn: (data: CreateCouponInput) => discountService.createCoupon(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['coupons'] }); setShowCouponModal(false); toast.success('Coupon created'); },
    onError: (err: Error) => toast.error(err.message || 'Failed to create coupon'),
  });
  const updateCoupon = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateCouponInput> }) => discountService.updateCoupon(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['coupons'] }); setEditingCoupon(null); toast.success('Coupon updated'); },
    onError: (err: Error) => toast.error(err.message || 'Failed to update coupon'),
  });
  const deleteCoupon = useMutation({
    mutationFn: (id: string) => discountService.removeCoupon(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['coupons'] }); toast.success('Coupon deleted'); },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete coupon'),
  });

  const isLoading = tab === 'discounts' ? loadingDiscounts : loadingCoupons;
  const isError = tab === 'discounts' ? disErr : couErr;
  const error = tab === 'discounts' ? disError : couError;
  const refetch = tab === 'discounts' ? refetchDis : refetchCou;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Discounts & Coupons</h1>
        </div>
        <button onClick={() => tab === 'discounts' ? setShowDiscountModal(true) : setShowCouponModal(true)} className="btn-primary flex items-center gap-2 self-start sm:self-auto">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {tab === 'discounts' ? 'Add Discount' : 'Add Coupon'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-secondary rounded-xl p-1">
        {(['discounts', 'coupons'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-white text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'}`}>
            {t === 'discounts' ? 'Discounts' : 'Coupon Codes'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : isError ? (
        <div className="card p-4 sm:p-8 text-center space-y-3">
          <p className="text-red-500">Failed to load {tab}: {error?.message}</p>
          <button className="btn-primary text-sm" onClick={() => refetch()}>Retry</button>
        </div>
      ) : tab === 'discounts' ? (
        /* â”€â”€â”€ Discounts List â”€â”€â”€ */
        discounts.length === 0 ? (
          <div className="text-center py-20 text-text-muted">
            <p className="text-lg font-medium">No discounts yet</p>
            <p className="text-sm mt-1">Create your first discount to attract more customers</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {discounts.map(d => (
              <div key={d.id} className="bg-white rounded-xl border border-border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-text-primary">{d.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {d.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {d.isAutoApply && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Auto-apply</span>}
                  </div>
                  <p className="text-sm text-text-muted mt-1">
                    {d.type === 'PERCENTAGE' ? `${d.value}% off` : `â‚¹${d.value} off`}
                    {d.minOrderAmount ? ` Â· Min order â‚¹${d.minOrderAmount}` : ''}
                    {d.maxDiscount ? ` Â· Max â‚¹${d.maxDiscount}` : ''}
                    {d.activeDays.length > 0 ? ` Â· ${d.activeDays.map(i => DAY_NAMES[i]).join(', ')}` : ''}
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    Used {d._count?.orderDiscounts ?? d.usedCount} times
                    {d.coupons && d.coupons.length > 0 ? ` Â· ${d.coupons.length} coupon(s)` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditingDiscount(d)} className="p-2 text-text-muted hover:text-primary rounded-lg hover:bg-surface-secondary transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => { if (confirm('Delete this discount?')) deleteDiscount.mutate(d.id); }} className="p-2 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* â”€â”€â”€ Coupons List â”€â”€â”€ */
        coupons.length === 0 ? (
          <div className="text-center py-20 text-text-muted">
            <p className="text-lg font-medium">No coupons yet</p>
            <p className="text-sm mt-1">Create coupon codes linked to your discounts</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {coupons.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <code className="text-lg font-bold text-primary">{c.code}</code>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted mt-1">
                    Linked to: {c.discount?.name ?? 'â€”'}
                    {c.expiresAt ? ` Â· Expires ${new Date(c.expiresAt).toLocaleDateString()}` : ''}
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    Used {c.usedCount}{c.maxUses ? `/${c.maxUses}` : ''} times Â· Max {c.maxUsesPerCustomer}/customer
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditingCoupon(c)} className="p-2 text-text-muted hover:text-primary rounded-lg hover:bg-surface-secondary transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => { if (confirm('Delete this coupon?')) deleteCoupon.mutate(c.id); }} className="p-2 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* â”€â”€â”€ Discount Modal â”€â”€â”€ */}
      <Modal open={showDiscountModal || !!editingDiscount} onClose={() => { setShowDiscountModal(false); setEditingDiscount(null); }} title={editingDiscount ? 'Edit Discount' : 'Create Discount'}>
        <DiscountForm
          initial={editingDiscount ?? undefined}
          loading={createDiscount.isPending || updateDiscount.isPending}
          onSubmit={(data) => editingDiscount ? updateDiscount.mutate({ id: editingDiscount.id, data }) : createDiscount.mutate(data)}
        />
      </Modal>

      {/* â”€â”€â”€ Coupon Modal â”€â”€â”€ */}
      <Modal open={showCouponModal || !!editingCoupon} onClose={() => { setShowCouponModal(false); setEditingCoupon(null); }} title={editingCoupon ? 'Edit Coupon' : 'Create Coupon'}>
        <CouponForm
          discounts={discounts}
          initial={editingCoupon ?? undefined}
          loading={createCoupon.isPending || updateCoupon.isPending}
          onSubmit={(data) => editingCoupon ? updateCoupon.mutate({ id: editingCoupon.id, data }) : createCoupon.mutate(data)}
        />
      </Modal>
    </div>
  );
}
