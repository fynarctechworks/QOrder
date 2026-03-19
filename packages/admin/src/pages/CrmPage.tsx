import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { crmService } from '../services/crmService';
import type { Customer, CustomerDetail } from '../services/crmService';
import { useCurrency } from '../hooks/useCurrency';

const TAG_COLORS: Record<string, string> = {
  VIP: 'bg-amber-100 text-amber-800',
  REGULAR: 'bg-blue-100 text-blue-800',
  NEW: 'bg-green-100 text-green-800',
  CORPORATE: 'bg-purple-100 text-purple-800',
  INACTIVE: 'bg-gray-100 text-gray-600',
  BANNED: 'bg-red-100 text-red-800',
};

const ALL_TAGS = ['VIP', 'REGULAR', 'NEW', 'CORPORATE', 'INACTIVE', 'BANNED'];

export default function CrmPage() {
  const qc = useQueryClient();
  const formatCurrency = useCurrency();
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<{ name: string; email: string; notes: string; tags: string[] }>({ name: '', email: '', notes: '', tags: [] });
  const [customTagInput, setCustomTagInput] = useState('');
  const [customTagError, setCustomTagError] = useState('');

  const { data: result, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['crm', 'customers', page, search, filterTag],
    queryFn: () => crmService.getCustomers({ page, limit: 25, search: search || undefined, tags: filterTag || undefined }),
  });

  const { data: insightsRes } = useQuery({
    queryKey: ['crm', 'insights'],
    queryFn: () => crmService.getInsights(),
  });

  const { data: detailRes } = useQuery({
    queryKey: ['crm', 'customer', selectedId],
    queryFn: () => crmService.getCustomer(selectedId!),
    enabled: !!selectedId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; email?: string; tags?: string[]; notes?: string } }) =>
      crmService.updateCustomer(id, data),
    onSuccess: () => {
      toast.success('Customer updated');
      qc.invalidateQueries({ queryKey: ['crm'] });
      setEditMode(false);
    },
    onError: () => toast.error('Failed to update'),
  });

  const customers = result?.data ?? [];
  const pagination = result?.pagination;
  const insights = insightsRes?.data;
  const detail: CustomerDetail | undefined = detailRes?.data;

  const handleSaveEdit = () => {
    if (!selectedId) return;
    updateMutation.mutate({ id: selectedId, data: {
      ...editData,
      email: editData.email.trim() || undefined,
      notes: editData.notes.trim() || undefined,
    } });
  };

  const openDetail = (c: Customer) => {
    setSelectedId(c.id);
    setEditData({ name: c.name || '', email: c.email || '', notes: c.notes || '', tags: [...c.tags] });
    setCustomTagInput('');
    setCustomTagError('');
    setEditMode(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Customer CRM</h1>
      </div>

      {/* Insight Cards */}
      {insights && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Customers', value: String(insights.totalCustomers), color: 'bg-primary' },
            { label: 'VIP Customers', value: String(insights.tagDistribution.find(t => t.tag === 'VIP')?.count ?? 0), color: 'bg-amber-500' },
            { label: 'Churn Risk', value: String(insights.churnRisk), color: 'bg-red-500' },
            { label: 'New (30d)', value: String(insights.tagDistribution.find(t => t.tag === 'NEW')?.count ?? 0), color: 'bg-green-500' },
          ].map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-text-muted font-medium uppercase tracking-wider">{m.label}</p>
              <p className="text-2xl font-bold text-text-primary mt-1 tabular-nums">{m.value}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by name, phone, or email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
        />
        <select
          value={filterTag}
          onChange={(e) => { setFilterTag(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
        >
          <option value="">All Tags</option>
          {ALL_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Customer Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-text-muted">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">Tags</th>
                <th className="text-right px-4 py-3 font-medium text-text-muted">Visits</th>
                <th className="text-right px-4 py-3 font-medium text-text-muted">Total Spend</th>
                <th className="text-right px-4 py-3 font-medium text-text-muted">Avg Order</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">Last Visit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center"><span className="text-red-500">Failed to load customers: {error?.message}</span><br/><button className="btn-primary text-sm mt-2" onClick={() => refetch()}>Retry</button></td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-text-muted">No customers found</td></tr>
              ) : (
                customers.map(c => (
                  <tr key={c.id} onClick={() => openDetail(c)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-medium text-text-primary">{c.name || '—'}</td>
                    <td className="px-4 py-3 text-text-secondary tabular-nums">{c.phone}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map(t => (
                          <span key={t} className={`px-2 py-0.5 rounded-full text-xs font-medium ${TAG_COLORS[t] || 'bg-gray-100 text-gray-600'}`}>{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.totalVisits}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(c.totalSpend)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(c.avgOrderValue)}</td>
                    <td className="px-4 py-3 text-text-muted">
                      {c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-text-muted">
              Showing {(page - 1) * pagination.limit + 1} - {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                Prev
              </button>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Customer Detail Drawer */}
      <AnimatePresence>
        {selectedId && detail && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setSelectedId(null)} />
            <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
              
              {/* Header */}
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-lg font-bold text-text-primary leading-6">{detail.name || detail.phone}</h2>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-text-secondary mt-1.5">
                      <svg className="w-3.5 h-3.5 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span>{detail.phone}</span>
                      {detail.email && (
                        <>
                          <span className="text-text-muted">·</span>
                          <span className="text-text-muted">{detail.email}</span>
                        </>
                      )}
                    </div>
                    {detail.notes && !editMode && (
                      <p className="text-xs text-text-muted mt-1.5 line-clamp-2">{detail.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!editMode ? (
                      <button onClick={() => setEditMode(true)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors">
                        Edit
                      </button>
                    ) : (
                      <>
                        <button onClick={() => setEditMode(false)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                          Cancel
                        </button>
                        <button onClick={handleSaveEdit}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors">
                          Save
                        </button>
                      </>
                    )}
                    <button onClick={() => setSelectedId(null)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {editMode ? (
                    <>
                      {ALL_TAGS.map(t => (
                        <button key={t} onClick={() => setEditData(d => ({
                          ...d, tags: d.tags.includes(t) ? d.tags.filter(x => x !== t) : [...d.tags, t]
                        }))} className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          editData.tags.includes(t) ? TAG_COLORS[t] + ' border-transparent' : 'bg-white text-gray-400 border-gray-200'
                        }`}>
                          {t}
                        </button>
                      ))}
                      {/* Custom tags */}
                      {editData.tags.filter(t => !ALL_TAGS.includes(t)).map(t => (
                        <span key={t} className="flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700 border border-gray-300">
                          {t}
                          <button className="ml-1 text-gray-400 hover:text-red-500" onClick={() => setEditData(d => ({ ...d, tags: d.tags.filter(x => x !== t) }))}>
                            &times;
                          </button>
                        </span>
                      ))}
                      <form className="flex items-center gap-1 mt-2" onSubmit={e => {
                        e.preventDefault();
                        const val = customTagInput.trim();
                        setCustomTagError('');
                        if (!val) return;
                        if (ALL_TAGS.includes(val)) {
                          setCustomTagError('This is a built-in tag. Use the button above.');
                          return;
                        }
                        if (!/^[a-zA-Z0-9 _-]{1,20}$/.test(val)) {
                          setCustomTagError('Only letters, numbers, spaces, -, _ allowed (max 20 chars).');
                          return;
                        }
                        if (editData.tags.includes(val)) {
                          setCustomTagError('Tag already added.');
                          return;
                        }
                        setEditData(d => ({ ...d, tags: [...d.tags, val] }));
                        setCustomTagInput('');
                      }}>
                        <input
                          type="text"
                          value={customTagInput}
                          onChange={e => { setCustomTagInput(e.target.value); setCustomTagError(''); }}
                          placeholder="Add custom tag..."
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                          maxLength={20}
                        />
                        <button type="submit" className="px-2 py-1 text-xs rounded bg-primary text-white hover:bg-primary-hover">Add</button>
                      </form>
                      {customTagError && <div className="text-xs text-red-500 mt-1">{customTagError}</div>}
                    </>
                  ) : detail.tags.map(t => (
                    <span key={t} className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold leading-none ${TAG_COLORS[t] || 'bg-gray-100 text-gray-600'}`}>{t}</span>
                  ))}
                </div>
              </div>

              {/* Body — scrollable */}
              <div className="flex-1 overflow-y-auto">
                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 sm:px-6 py-4 sm:py-5">
                  {[
                    { l: 'Total Visits', v: String(detail.totalVisits), icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z', iconBg: 'bg-blue-500' },
                    { l: 'Total Spend', v: formatCurrency(detail.totalSpend), icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6', iconBg: 'bg-green-500' },
                    { l: 'Avg Order', v: formatCurrency(detail.avgOrderValue), icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z', iconBg: 'bg-violet-500' },
                    { l: 'First Visit', v: detail.firstVisitAt ? new Date(detail.firstVisitAt).toLocaleDateString() : '—', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', iconBg: 'bg-amber-500' },
                  ].map((s, i) => (
                    <div key={i} className="card p-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl ${s.iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d={s.icon} />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-text-muted font-medium uppercase tracking-wider leading-none">{s.l}</p>
                          <p className="text-sm font-bold text-text-primary mt-1 leading-none tabular-nums">{s.v}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Edit Fields */}
                {editMode && (
                  <div className="px-4 sm:px-6 pb-5 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-text-muted">Name</label>
                      <input value={editData.name} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-muted">Email</label>
                      <input value={editData.email} onChange={e => setEditData(d => ({ ...d, email: e.target.value }))}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-muted">Notes</label>
                      <textarea value={editData.notes} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} rows={3}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
                    </div>
                  </div>
                )}

                {/* Interaction History */}
                <div className="px-4 sm:px-6 py-4 sm:py-5 border-t border-gray-100">
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Recent Activity</h3>
                  <div className="space-y-2">
                    {detail.interactions.length === 0 ? (
                      <p className="text-xs text-text-muted text-center py-6">No interactions recorded</p>
                    ) : (
                      detail.interactions.map(i => (
                        <div key={i.id} className="flex items-start gap-3 p-3 bg-surface rounded-xl">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                            i.type === 'ORDER' ? 'bg-blue-100 text-blue-600' :
                            i.type === 'FEEDBACK' ? 'bg-yellow-100 text-yellow-600' :
                            i.type === 'PAYMENT' ? 'bg-green-100 text-green-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {i.type[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-text-primary">{i.type}</p>
                            {i.summary && <p className="text-xs text-text-muted mt-0.5">{i.summary}</p>}
                            <p className="text-[10px] text-text-muted mt-1">{new Date(i.createdAt).toLocaleString()}</p>
                          </div>
                          {i.amount != null && (
                            <span className="text-xs font-semibold text-text-primary tabular-nums">{formatCurrency(i.amount)}</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
