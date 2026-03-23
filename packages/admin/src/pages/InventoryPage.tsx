import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';
import { inventoryService } from '../services/inventoryService';
import type {
  Ingredient, Supplier, StockMovement,
  InventoryOverview, ForecastItem, IngredientCategory,
} from '../services/inventoryService';
import { INGREDIENT_CATEGORIES, AUTO_DEDUCT_FREQUENCIES } from '../services/inventoryService';
import type { AutoDeductFrequency } from '../services/inventoryService';
import Modal from '../components/Modal';
import { useCurrency } from '../hooks/useCurrency';

/* ═══════════════════ Constants ═══════════════════ */

type TabKey = 'dashboard' | 'products' | 'stock' | 'suppliers' | 'forecast';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'products',  label: 'Products',  icon: '📦' },
  { key: 'stock',     label: 'Stock In / Out', icon: '🔄' },
  { key: 'suppliers', label: 'Suppliers',  icon: '🏢' },
  { key: 'forecast',  label: 'Forecast',  icon: '🔮' },
];

const UNITS = ['KG', 'G', 'L', 'ML', 'PCS', 'DOZEN', 'PACKET', 'BUNCH', 'BOX', 'PLATE', 'CUP', 'TBSP', 'TSP'];

/* ═══════════════════ Helpers ═══════════════════ */

function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function badge(type: string) {
  const map: Record<string, string> = {
    PURCHASE: 'badge-success', USAGE: 'badge-warning',
    MANUAL_ADD: 'badge-info', MANUAL_DEDUCT: 'badge-error',
    WASTE: 'badge-error', RETURN: 'badge-info',
    TRANSFER: 'badge-neutral', ORDER_DEDUCT: 'badge-warning',
  };
  return map[type] ?? 'badge-neutral';
}

function stockStatus(current: number, min: number): { label: string; cls: string } {
  if (min <= 0) return { label: 'OK', cls: 'text-success' };
  const ratio = current / min;
  if (ratio <= 0) return { label: 'Out', cls: 'text-error font-semibold' };
  if (ratio <= 1) return { label: 'Low', cls: 'text-warning font-semibold' };
  return { label: 'OK', cls: 'text-success' };
}

/* ═══════════════════ Main Component ═══════════════════ */

export default function InventoryPage() {
  const [tab, setTab] = useState<TabKey>('dashboard');
  const fmt = useCurrency();
  const qc = useQueryClient();
  const { socket } = useSocket();

  // Auto-refresh inventory data when smart inventory deducts stock on an order
  useEffect(() => {
    if (!socket) return;
    const handler = () => qc.invalidateQueries({ queryKey: ['inventory'] });
    socket.on('inventory:updated', handler);
    return () => { socket.off('inventory:updated', handler); };
  }, [socket, qc]);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              tab === t.key
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:bg-surface-elevated'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {tab === 'dashboard' && <DashboardTab fmt={fmt} />}
          {tab === 'products' && <ProductsTab fmt={fmt} qc={qc} />}
          {tab === 'stock' && <StockTab fmt={fmt} qc={qc} />}
          {tab === 'suppliers' && <SuppliersTab qc={qc} />}
          {tab === 'forecast' && <ForecastTab fmt={fmt} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════ */

function DashboardTab({ fmt }: { fmt: (v: number) => string }) {
  const { data: overview, isLoading, isError, error, refetch } = useQuery<InventoryOverview>({
    queryKey: ['inventory', 'overview'],
    queryFn: inventoryService.getOverview,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-20 mb-2" />
            <div className="h-6 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card p-4 sm:p-8 text-center space-y-3">
        <p className="text-error">Failed to load overview: {error instanceof Error ? error.message : 'Unknown error'}</p>
        <button className="btn-primary text-sm" onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  const ov = overview!;

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Products', value: String(ov.totalIngredients), icon: '📦', color: 'bg-primary' },
          { label: 'Stock Value', value: fmt(ov.totalInventoryValue), icon: '💰', color: 'bg-emerald-500' },
          { label: 'Low Stock', value: String(ov.lowStockCount), icon: '⚠️', color: ov.lowStockCount > 0 ? 'bg-red-500' : 'bg-green-500' },
          { label: 'Pending Orders', value: String(ov.pendingPurchaseOrders), icon: '🛒', color: 'bg-amber-500' },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="card p-5"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${card.color} flex items-center justify-center text-white text-lg shadow-sm`}>
                {card.icon}
              </div>
              <div>
                <p className="text-xs text-text-secondary uppercase tracking-wider">{card.label}</p>
                <p className="text-xl font-bold text-text-primary">{card.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            ⚠️ Low Stock Alerts
            {ov.lowStockCount > 0 && <span className="badge badge-error text-xs">{ov.lowStockCount}</span>}
          </h3>
          {ov.lowStockAlerts.length > 0 ? (
            <div className="space-y-2.5 max-h-[320px] overflow-y-auto">
              {ov.lowStockAlerts.map(a => {
                const pct = a.minStock > 0 ? Math.min((a.currentStock / a.minStock) * 100, 100) : 0;
                return (
                  <div key={a.id} className="flex items-center gap-3 p-3 bg-surface-elevated rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.name}</p>
                      <p className="text-xs text-text-secondary">{a.currentStock} / {a.minStock} {a.unit}</p>
                    </div>
                    <div className="w-20">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct <= 25 ? 'bg-red-500' : pct <= 50 ? 'bg-amber-500' : 'bg-green-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-medium text-text-secondary w-8 text-right">{Math.round(pct)}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-text-secondary py-8 text-center">All items are well-stocked 👍</div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Recent Activity</h3>
          {ov.recentMovements.length > 0 ? (
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {ov.recentMovements.map(m => {
                const isAdd = ['PURCHASE', 'MANUAL_ADD', 'RETURN'].includes(m.type);
                return (
                  <div key={m.id} className="flex items-center gap-3 text-sm p-2 rounded-lg hover:bg-surface-elevated">
                    <span className={`${badge(m.type)} text-xs shrink-0`}>{m.type.replace(/_/g, ' ')}</span>
                    <span className="truncate flex-1">{m.ingredient?.name ?? '—'}</span>
                    <span className={`font-mono shrink-0 ${isAdd ? 'text-success' : 'text-error'}`}>
                      {isAdd ? '+' : '-'}{Number(m.quantity)} {m.ingredient?.unit ?? ''}
                    </span>
                    <span className="text-xs text-text-secondary shrink-0">{fmtDateTime(m.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-text-secondary py-8 text-center">No recent movements</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PRODUCTS
   ═══════════════════════════════════════════════════════ */

function ProductsTab({ fmt, qc }: { fmt: (v: number) => string; qc: ReturnType<typeof useQueryClient> }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<IngredientCategory | 'ALL'>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Ingredient | null>(null);
  const [adjustItem, setAdjustItem] = useState<Ingredient | null>(null);

  const { data: ingredients = [], isLoading, isError, error, refetch } = useQuery<Ingredient[]>({
    queryKey: ['inventory', 'ingredients'],
    queryFn: () => inventoryService.getIngredients(),
    staleTime: 0,
  });

  const filtered = useMemo(() => {
    return ingredients.filter(i => {
      const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.unit.toLowerCase().includes(search.toLowerCase());
      const matchCat = categoryFilter === 'ALL' || i.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [ingredients, search, categoryFilter]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => inventoryService.deleteIngredient(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });

  const autoDeductMut = useMutation({
    mutationFn: () => inventoryService.runAutoDeduct(),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      alert(`Auto-deduct complete:\n✓ Deducted: ${data.deducted}\n⚠ Low stock skipped: ${data.skippedLowStock}\n— Already ran today: ${data.skippedAlreadyRan}`);
    },
  });

  if (isLoading) {
    return <div className="card p-4 sm:p-8 text-center text-text-secondary">Loading products...</div>;
  }

  if (isError) {
    return (
      <div className="card p-4 sm:p-8 text-center space-y-3">
        <p className="text-error">Failed to load products: {error instanceof Error ? error.message : 'Unknown error'}</p>
        <button className="btn-primary text-sm" onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <div className="flex gap-1 flex-wrap">
        {[{ value: 'ALL' as const, label: 'All' }, ...INGREDIENT_CATEGORIES].map(cat => (
          <button
            key={cat.value}
            onClick={() => setCategoryFilter(cat.value as IngredientCategory | 'ALL')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              categoryFilter === cat.value
                ? 'bg-primary text-white'
                : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex gap-3 items-center justify-between">
        <input
          className="input w-64"
          placeholder="Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            className="btn-secondary text-sm"
            disabled={autoDeductMut.isPending}
            onClick={() => autoDeductMut.mutate()}
            title="Manually run auto-deduct for all enabled products"
          >
            {autoDeductMut.isPending ? 'Running...' : '▶ Run Auto-Deduct'}
          </button>
          <button className="btn-primary text-sm" onClick={() => setShowForm(true)}>+ Add Product</button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Unit</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Min Stock</th>
                <th>Status</th>
                <th className="text-right">Cost/Unit</th>
                <th className="text-right">Value</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-text-secondary">
                    {search || categoryFilter !== 'ALL' ? 'No products match your filter' : 'No products yet — add your first one!'}
                  </td>
                </tr>
              ) : filtered.map(item => {
                const status = stockStatus(item.currentStock, item.minStock);
                const catLabel = INGREDIENT_CATEGORIES.find(c => c.value === item.category)?.label ?? item.category;
                return (
                  <tr key={item.id} className={!item.isActive ? 'opacity-50' : ''}>
                    <td className="font-medium">
                      {item.name}
                      {item.autoDeductEnabled && (
                        <span className="ml-2 text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">AUTO</span>
                      )}
                    </td>
                    <td><span className="badge badge-neutral text-xs">{catLabel}</span></td>
                    <td><span className="badge badge-neutral text-xs">{item.unit}</span></td>
                    <td className="text-right font-mono">{item.currentStock}</td>
                    <td className="text-right font-mono text-text-secondary">{item.minStock}</td>
                    <td><span className={`text-xs font-medium ${status.cls}`}>{status.label}</span></td>
                    <td className="text-right">{fmt(item.costPerUnit)}</td>
                    <td className="text-right font-medium">{fmt(item.currentStock * item.costPerUnit)}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditItem(item)} className="btn-icon text-xs" title="Edit">✏️</button>
                        <button
                          onClick={() => { if (confirm(`Delete "${item.name}"?`)) deleteMut.mutate(item.id); }}
                          className="btn-icon text-xs text-error"
                          title="Delete"
                        >🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-xs text-text-secondary">
        <span>{filtered.length} product{filtered.length !== 1 ? 's' : ''}</span>
        <span>Total value: <strong className="text-text-primary">{fmt(filtered.reduce((s, i) => s + i.currentStock * i.costPerUnit, 0))}</strong></span>
      </div>

      {/* Modals */}
      {(showForm || editItem) && (
        <ProductFormModal
          item={editItem ?? undefined}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSaved={() => { setShowForm(false); setEditItem(null); qc.invalidateQueries({ queryKey: ['inventory'] }); }}
        />
      )}
      {adjustItem && (
        <AdjustStockModal
          item={adjustItem}
          onClose={() => setAdjustItem(null)}
          onSaved={() => { setAdjustItem(null); qc.invalidateQueries({ queryKey: ['inventory'] }); }}
        />
      )}
    </div>
  );
}

/* ─── Product Form Modal ─── */

function ProductFormModal({ item, onClose, onSaved }: {
  item?: Ingredient; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [unit, setUnit] = useState(item?.unit ?? 'KG');
  const [category, setCategory] = useState<IngredientCategory>(item?.category ?? 'PANTRY');
  const [currentStock, setCurrentStock] = useState(item?.currentStock ?? 0);
  const [minStock, setMinStock] = useState(item?.minStock ?? 0);
  const [costPerUnit, setCostPerUnit] = useState(item?.costPerUnit ?? 0);
  const [autoDeductEnabled, setAutoDeductEnabled] = useState(item?.autoDeductEnabled ?? false);
  const [autoDeductQty, setAutoDeductQty] = useState(item?.autoDeductQty ?? 0);
  const [autoDeductUnit, setAutoDeductUnit] = useState(item?.autoDeductUnit ?? item?.unit ?? 'KG');
  const [autoDeductFrequency, setAutoDeductFrequency] = useState<AutoDeductFrequency>(item?.autoDeductFrequency ?? 'DAILY');
  const [error, setError] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      item
        ? inventoryService.updateIngredient(item.id, { name, unit, category, minStock, costPerUnit, autoDeductEnabled, autoDeductQty, autoDeductUnit, autoDeductFrequency })
        : inventoryService.createIngredient({ name, unit, category, currentStock, minStock, costPerUnit, autoDeductEnabled, autoDeductQty, autoDeductUnit, autoDeductFrequency }),
    onSuccess: onSaved,
    onError: (e: any) => setError(e?.message ?? 'Failed to save'),
  });

  return (
    <Modal open title={item ? 'Edit Product' : 'Add Product'} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (!name.trim()) { setError('Name required'); return; } mut.mutate(); }} className="space-y-4">
        {error && <p className="text-sm text-error">{error}</p>}
        <div>
          <label className="text-sm font-medium">Name *</label>
          <input className="input mt-1" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="text-sm font-medium">Category</label>
          <select className="select mt-1" value={category} onChange={e => setCategory(e.target.value as IngredientCategory)}>
            {INGREDIENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Unit</label>
            <select className="select mt-1" value={unit} onChange={e => setUnit(e.target.value)}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Cost per Unit (₹)</label>
            <input className="input mt-1" type="number" min={0} step="0.01" value={costPerUnit} onChange={e => setCostPerUnit(+e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!item && (
            <div>
              <label className="text-sm font-medium">Opening Stock</label>
              <input className="input mt-1" type="number" min={0} step="0.01" value={currentStock} onChange={e => setCurrentStock(+e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Min Stock (alert level)</label>
            <input className="input mt-1" type="number" min={0} step="0.01" value={minStock} onChange={e => setMinStock(+e.target.value)} />
          </div>
        </div>

        {/* Auto-deduct */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Daily Auto-Deduct</p>
              <p className="text-xs text-text-secondary">Automatically deduct stock on a schedule</p>
            </div>
            <button
              type="button"
              onClick={() => setAutoDeductEnabled(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoDeductEnabled ? 'bg-primary' : 'bg-surface-elevated border border-border'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${autoDeductEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {autoDeductEnabled && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-text-secondary">Qty per cycle</label>
                <input
                  className="input mt-1"
                  type="number" min={0} step="0.01"
                  value={autoDeductQty || ''}
                  onChange={e => setAutoDeductQty(+e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary">Unit</label>
                <select className="select mt-1" value={autoDeductUnit} onChange={e => setAutoDeductUnit(e.target.value)}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary">Frequency</label>
                <select className="select mt-1" value={autoDeductFrequency} onChange={e => setAutoDeductFrequency(e.target.value as AutoDeductFrequency)}>
                  {AUTO_DEDUCT_FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={mut.isPending}>
            {mut.isPending ? 'Saving...' : item ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Adjust Stock Modal ─── */

function AdjustStockModal({ item, onClose, onSaved }: {
  item: Ingredient; onClose: () => void; onSaved: () => void;
}) {
  const [type, setType] = useState<'MANUAL_DEDUCT' | 'WASTE'>('MANUAL_DEDUCT');
  const [quantity, setQuantity] = useState(0);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const isAdd = false;
  const newStock = isAdd ? item.currentStock + quantity : item.currentStock - quantity;

  const mut = useMutation({
    mutationFn: () => inventoryService.adjustStock(item.id, { type, quantity, notes: notes || undefined }),
    onSuccess: onSaved,
    onError: (e: any) => setError(e?.message ?? 'Failed'),
  });

  return (
    <Modal open title={`Adjust — ${item.name}`} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (quantity <= 0) { setError('Qty must be > 0'); return; } mut.mutate(); }} className="space-y-4">
        {error && <p className="text-sm text-error">{error}</p>}

        <div className="p-3 bg-surface-elevated rounded-lg flex items-center justify-between">
          <span className="text-sm text-text-secondary">Current Stock</span>
          <span className="font-bold text-lg">{item.currentStock} {item.unit}</span>
        </div>

        <div>
          <label className="text-sm font-medium">Type</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {([
              { key: 'MANUAL_DEDUCT', label: '- Deduct', cls: 'bg-red-50 border-red-400 text-red-700' },
              { key: 'WASTE', label: '🗑 Waste', cls: 'bg-amber-50 border-amber-400 text-amber-700' },
            ] as const).map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setType(t.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                  type === t.key ? t.cls + ' ring-1' : 'bg-white border-gray-200 text-text-secondary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Quantity ({item.unit})</label>
          <input className="input mt-1" type="number" min={0} step="0.01" value={quantity || ''} onChange={e => setQuantity(+e.target.value)} autoFocus />
        </div>

        {quantity > 0 && (
          <div className="p-3 bg-surface-elevated rounded-lg flex items-center justify-between text-sm">
            <span>New stock:</span>
            <span className={`font-bold ${newStock < 0 ? 'text-error' : 'text-success'}`}>
              {newStock.toFixed(2)} {item.unit}
            </span>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">Notes (optional)</label>
          <input className="input mt-1" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason..." />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={mut.isPending || quantity <= 0}>
            {mut.isPending ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   STOCK IN / OUT
   ═══════════════════════════════════════════════════════ */

function todayISO() {
  return new Date().toISOString().split('T')[0]!;
}

const HISTORY_LIMIT = 20;

function StockTab({ fmt, qc }: { fmt: (v: number) => string; qc: ReturnType<typeof useQueryClient> }) {
  const [mode, setMode] = useState<'purchase' | 'usage'>('purchase');
  const [date, setDate] = useState<string>(todayISO());
  const [ingredientId, setIngredientId] = useState('');
  const [quantity, setQuantity] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [histPage, setHistPage] = useState(1);

  const { data: ingredients = [], isError: ingError, error: ingErr, refetch: refetchIng } = useQuery<Ingredient[]>({
    queryKey: ['inventory', 'ingredients'],
    queryFn: inventoryService.getIngredients,
  });

  const { data: historyResult, isError: histError, error: histErr, refetch: refetchHist } = useQuery({
    queryKey: ['inventory', 'stock-history', histPage],
    queryFn: () => inventoryService.getStockHistory({ page: histPage, limit: HISTORY_LIMIT }),
  });

  const movements = (historyResult?.data ?? []) as StockMovement[];
  const histMeta = historyResult?.meta as { total: number; totalPages: number } | undefined;

  const reset = () => { setIngredientId(''); setQuantity(0); setNotes(''); };

  // Usage recording
  const usageMut = useMutation({
    mutationFn: () => {
      if (!ingredientId || quantity <= 0) throw new Error('Select a product and enter quantity');
      return inventoryService.recordUsage([{ ingredientId, quantity, notes: notes || undefined }], date);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      reset();
      setHistPage(1);
    },
  });

  // Purchase (manual add) — adjust stock
  const purchaseMut = useMutation({
    mutationFn: () => {
      if (!ingredientId || quantity <= 0) throw new Error('Select a product and enter quantity');
      return inventoryService.adjustStock(ingredientId, {
        type: 'PURCHASE',
        quantity,
        notes: notes || 'Stock purchase',
        date,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      reset();
      setHistPage(1);
    },
  });

  const activeMut = mode === 'purchase' ? purchaseMut : usageMut;

  const ing = ingredients.find(i => i.id === ingredientId);
  const estValue = ing ? quantity * ing.costPerUnit : 0;


  return (
    <div className="space-y-6">
      {(ingError || histError) && (
        <div className="card p-6 text-center space-y-3">
          <p className="text-red-500">Failed to load stock data: {ingErr?.message || histErr?.message}</p>
          <button className="btn-primary text-sm" onClick={() => { refetchIng(); refetchHist(); }}>Retry</button>
        </div>
      )}
      {/* Record Form */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <h3 className="text-sm font-semibold text-text-primary">Record Stock Movement</h3>
          <input
            type="date"
            className="input text-sm ml-auto"
            value={date}
            max={todayISO()}
            onChange={e => setDate(e.target.value)}
          />
          <div className="flex bg-surface-elevated rounded-lg p-0.5">
            <button
              onClick={() => setMode('purchase')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === 'purchase' ? 'bg-white shadow-sm text-success' : 'text-text-secondary'
              }`}
            >
              📥 Stock In
            </button>
            <button
              onClick={() => setMode('usage')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === 'usage' ? 'bg-white shadow-sm text-warning' : 'text-text-secondary'
              }`}
            >
              📤 Stock Out
            </button>
          </div>
        </div>

        <form onSubmit={e => { e.preventDefault(); activeMut.mutate(); }} className="space-y-3">
          {activeMut.isError && <p className="text-sm text-error">{(activeMut.error as any)?.message ?? 'Failed'}</p>}
          {activeMut.isSuccess && <p className="text-sm text-success">Recorded successfully ✓</p>}

          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="select flex-1 min-w-[180px]"
              value={ingredientId}
              onChange={e => setIngredientId(e.target.value)}
            >
              <option value="">Select product...</option>
              {ingredients.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.currentStock} {i.unit})
                </option>
              ))}
            </select>
            <input
              className="input w-24"
              type="number" min={0} step="0.1"
              placeholder="Qty"
              value={quantity || ''}
              onChange={e => setQuantity(+e.target.value)}
            />
            {ing && <span className="text-xs text-text-secondary w-8">{ing.unit}</span>}
            <input
              className="input w-36"
              placeholder="Notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end pt-2">
            <div className="flex items-center gap-4">
              {estValue > 0 && <span className="text-xs text-text-secondary">Est. value: <strong>{fmt(estValue)}</strong></span>}
              <button type="submit" className="btn-primary text-sm" disabled={activeMut.isPending}>
                {activeMut.isPending ? 'Recording...' : mode === 'purchase' ? 'Record Purchase' : 'Record Usage'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* History */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">
            Stock Movements
            {histMeta && <span className="ml-2 text-text-secondary font-normal">({histMeta.total} total)</span>}
          </h3>
          {histMeta && histMeta.totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <button
                className="btn-secondary px-3 py-1 text-xs"
                disabled={histPage === 1}
                onClick={() => setHistPage(p => p - 1)}
              >← Prev</button>
              <span className="text-text-secondary">{histPage} / {histMeta.totalPages}</span>
              <button
                className="btn-secondary px-3 py-1 text-xs"
                disabled={histPage === histMeta.totalPages}
                onClick={() => setHistPage(p => p + 1)}
              >Next →</button>
            </div>
          )}
        </div>
        {movements.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-6">No stock movements yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Product</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Before</th>
                  <th className="text-right">After</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => {
                  const isAdd = ['PURCHASE', 'MANUAL_ADD', 'RETURN'].includes(m.type);
                  return (
                    <tr key={m.id}>
                      <td className="text-xs whitespace-nowrap">{fmtDateTime(m.createdAt)}</td>
                      <td><span className={`${badge(m.type)} text-xs`}>{m.type.replace(/_/g, ' ')}</span></td>
                      <td className="font-medium">{m.ingredient?.name ?? '—'}</td>
                      <td className={`text-right font-mono ${isAdd ? 'text-success' : 'text-error'}`}>
                        {isAdd ? '+' : '-'}{Number(m.quantity).toFixed(2)}
                      </td>
                      <td className="text-right font-mono text-text-secondary">{Number(m.previousQty).toFixed(2)}</td>
                      <td className="text-right font-mono">{Number(m.newQty).toFixed(2)}</td>
                      <td className="text-xs text-text-secondary truncate max-w-[150px]">{m.notes ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {histMeta && histMeta.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4 text-sm">
            <button
              className="btn-secondary px-3 py-1 text-xs"
              disabled={histPage === 1}
              onClick={() => setHistPage(p => p - 1)}
            >← Prev</button>
            <span className="text-text-secondary">Page {histPage} of {histMeta.totalPages}</span>
            <button
              className="btn-secondary px-3 py-1 text-xs"
              disabled={histPage === histMeta.totalPages}
              onClick={() => setHistPage(p => p + 1)}
            >Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SUPPLIERS
   ═══════════════════════════════════════════════════════ */

function SuppliersTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

  const { data: suppliers = [], isLoading, isError, error, refetch } = useQuery<Supplier[]>({
    queryKey: ['inventory', 'suppliers'],
    queryFn: inventoryService.getSuppliers,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => inventoryService.deleteSupplier(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });

  const filtered = useMemo(() => {
    if (!search) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.contactName?.toLowerCase().includes(q) ||
      s.phone?.includes(q)
    );
  }, [suppliers, search]);

  if (isLoading) return <div className="card p-4 sm:p-8 text-center text-text-secondary">Loading...</div>;

  if (isError) {
    return (
      <div className="card p-4 sm:p-8 text-center space-y-3">
        <p className="text-error">Failed to load suppliers: {error instanceof Error ? error.message : 'Unknown error'}</p>
        <button className="btn-primary text-sm" onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-3 items-center justify-between">
        <input className="input w-64" placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn-primary text-sm" onClick={() => setShowForm(true)}>+ Add Supplier</button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Email</th>
                <th className="text-center">Products</th>
                <th className="text-center">Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-text-secondary">
                    {search ? 'No suppliers match your search' : 'No suppliers yet — add your first one!'}
                  </td>
                </tr>
              ) : filtered.map(s => (
                <tr key={s.id} className={!s.isActive ? 'opacity-50' : ''}>
                  <td className="font-medium">{s.name}</td>
                  <td className="text-text-secondary">{s.contactName ?? '—'}</td>
                  <td className="text-text-secondary">{s.phone ?? '—'}</td>
                  <td className="text-text-secondary text-sm">{s.email ?? '—'}</td>
                  <td className="text-center">{s._count?.ingredients ?? 0}</td>
                  <td className="text-center">
                    <span className={`badge text-xs ${s.isActive ? 'badge-success' : 'badge-neutral'}`}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditSupplier(s)} className="btn-icon text-xs" title="Edit">✏️</button>
                      <button
                        onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteMut.mutate(s.id); }}
                        className="btn-icon text-xs text-error"
                        title="Delete"
                      >🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-text-secondary">
        {filtered.length} supplier{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* Modal */}
      {(showForm || editSupplier) && (
        <SupplierFormModal
          supplier={editSupplier ?? undefined}
          onClose={() => { setShowForm(false); setEditSupplier(null); }}
          onSaved={() => { setShowForm(false); setEditSupplier(null); qc.invalidateQueries({ queryKey: ['inventory'] }); }}
        />
      )}
    </div>
  );
}

/* ─── Supplier Form Modal ─── */

function SupplierFormModal({ supplier, onClose, onSaved }: {
  supplier?: Supplier; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(supplier?.name ?? '');
  const [contactName, setContactName] = useState(supplier?.contactName ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');
  const [address, setAddress] = useState(supplier?.address ?? '');
  const [error, setError] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      supplier
        ? inventoryService.updateSupplier(supplier.id, { name, contactName: contactName || undefined, phone: phone || undefined, email: email || undefined, address: address || undefined })
        : inventoryService.createSupplier({ name, contactName: contactName || undefined, phone: phone || undefined, email: email || undefined, address: address || undefined }),
    onSuccess: onSaved,
    onError: (e: any) => setError(e?.message ?? 'Failed'),
  });

  return (
    <Modal open title={supplier ? 'Edit Supplier' : 'Add Supplier'} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (!name.trim()) { setError('Name required'); return; } mut.mutate(); }} className="space-y-4">
        {error && <p className="text-sm text-error">{error}</p>}
        <div>
          <label className="text-sm font-medium">Company Name *</label>
          <input className="input mt-1" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Contact Person</label>
            <input className="input mt-1" value={contactName} onChange={e => setContactName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Phone</label>
            <input className="input mt-1" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Email</label>
          <input className="input mt-1" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Address</label>
          <input className="input mt-1" value={address} onChange={e => setAddress(e.target.value)} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={mut.isPending}>
            {mut.isPending ? 'Saving...' : supplier ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   FORECAST
   ═══════════════════════════════════════════════════════ */

function ForecastTab({ fmt }: { fmt: (v: number) => string }) {
  const [days, setDays] = useState(14);

  const { data: items = [], isLoading, isError, error, refetch } = useQuery<ForecastItem[]>({
    queryKey: ['inventory', 'forecast', days],
    queryFn: () => inventoryService.getForecast(days),
  });

  const statusConfig = {
    out:      { label: 'Out of Stock',  cls: 'bg-red-100 text-red-700',    bar: 'bg-red-500' },
    low:      { label: 'Low Stock',     cls: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' },
    critical: { label: 'Critical',      cls: 'bg-orange-100 text-orange-700', bar: 'bg-orange-500' },
    ok:       { label: 'OK',            cls: 'bg-green-100 text-green-700', bar: 'bg-green-500' },
  };

  const sorted = useMemo(() => {
    const order = { out: 0, low: 1, critical: 2, ok: 3 };
    return [...items].sort((a, b) => order[a.status] - order[b.status]);
  }, [items]);

  const counts = useMemo(() => ({
    out: items.filter(i => i.status === 'out').length,
    low: items.filter(i => i.status === 'low').length,
    critical: items.filter(i => i.status === 'critical').length,
    ok: items.filter(i => i.status === 'ok').length,
  }), [items]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4 animate-pulse flex gap-4">
            <div className="h-4 bg-gray-200 rounded w-32" />
            <div className="h-4 bg-gray-200 rounded w-16 ml-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-error">{error instanceof Error ? error.message : 'Failed to load forecast'}</p>
        <button className="btn-primary text-sm" onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Stock Forecast</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Based on order usage over the last {days} days. Enable Smart Inventory in Settings → Orders to populate this data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">Window:</span>
          {[7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                days === d ? 'bg-primary text-white' : 'bg-surface-elevated text-text-secondary hover:bg-gray-200'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(counts) as [keyof typeof counts, number][]).map(([status, count]) => {
          const cfg = statusConfig[status];
          return (
            <div key={status} className={`rounded-xl p-3 ${cfg.cls.split(' ').map(c => c.replace('text-', 'bg-').replace('700', '50')).join(' ')}`}>
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">{cfg.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${cfg.cls.split(' ')[1]}`}>{count}</p>
            </div>
          );
        })}
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="card p-8 text-center text-sm text-text-secondary">
          No ingredients configured. Add ingredients in the Products tab and set up recipes to enable forecasting.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Ingredient</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">Stock</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">Avg/Day</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">Days Left</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">Value</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-text-secondary uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map(item => {
                  const cfg = statusConfig[item.status];
                  const maxDays = 30;
                  const barPct = item.daysRemaining !== null
                    ? Math.min((item.daysRemaining / maxDays) * 100, 100)
                    : 100;
                  return (
                    <tr key={item.id} className="hover:bg-surface-elevated transition-colors">
                      <td className="px-4 py-3 font-medium text-text-primary">{item.name}</td>
                      <td className="px-4 py-3 text-right text-text-secondary font-mono">
                        {item.currentStock} {item.unit}
                        {item.minStock > 0 && (
                          <div className="w-full mt-1">
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-24 ml-auto">
                              <div
                                className={`h-full rounded-full ${cfg.bar}`}
                                style={{ width: `${Math.min((item.currentStock / Math.max(item.minStock, 1)) * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-text-secondary font-mono">
                        {item.avgDailyUsage > 0 ? `${item.avgDailyUsage} ${item.unit}` : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.daysRemaining !== null ? (
                          <div>
                            <span className={`font-semibold ${item.daysRemaining <= 3 ? 'text-red-600' : item.daysRemaining <= 7 ? 'text-amber-600' : 'text-green-600'}`}>
                              {item.daysRemaining}d
                            </span>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-16 ml-auto mt-1">
                              <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${barPct}%` }} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-text-muted text-xs">No usage data</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-text-secondary">
                        {fmt(item.currentStock * item.costPerUnit)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
