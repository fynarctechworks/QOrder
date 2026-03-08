import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { featureService } from '../services/featureService';

const TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  CALL_WAITER: { label: 'Call Waiter', icon: '🔔', color: 'bg-blue-100 text-blue-700' },
  WATER_REFILL: { label: 'Water Refill', icon: '💧', color: 'bg-cyan-100 text-cyan-700' },
  BILL_REQUEST: { label: 'Bill Request', icon: '🧾', color: 'bg-amber-100 text-amber-700' },
  CUSTOM: { label: 'Custom Request', icon: '💬', color: 'bg-purple-100 text-purple-700' },
};

export default function ServiceRequestsPanel({ onClose: _onClose }: { onClose?: () => void }) {
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['serviceRequests'],
    queryFn: featureService.listPendingRequests,
    refetchInterval: 10_000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => featureService.acknowledgeRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['serviceRequests'] }),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => featureService.resolveRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['serviceRequests'] }),
  });

  const pending = requests.filter(r => r.status === 'PENDING');
  const acknowledged = requests.filter(r => r.status === 'ACKNOWLEDGED');

  function timeAgo(dateStr: string) {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="p-6 text-center text-text-muted">
        <p className="text-lg">No active service requests</p>
        <p className="text-sm mt-1">Requests from customers will appear here in real-time</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto">
      {/* Pending — needs immediate attention */}
      {pending.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
            Pending ({pending.length})
          </h3>
          <div className="space-y-2">
            {pending.map(r => {
              const info = TYPE_LABELS[r.type] ?? TYPE_LABELS.CUSTOM;
              return (
                <div key={r.id} className="bg-red-50 border border-red-200 rounded-xl p-4 animate-pulse-subtle">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{info!.icon}</span>
                      <div>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${info!.color}`}>{info!.label}</span>
                        <p className="text-sm font-medium text-text-primary mt-1">
                          Table {r.table?.number || '—'}
                          {r.table?.section?.name ? ` · ${r.table.section.name}` : ''}
                        </p>
                        {r.message && <p className="text-xs text-text-muted mt-1">"{r.message}"</p>}
                      </div>
                    </div>
                    <span className="text-xs text-text-muted">{timeAgo(r.createdAt)}</span>
                  </div>
                  <button
                    onClick={() => acknowledgeMutation.mutate(r.id)}
                    disabled={acknowledgeMutation.isPending}
                    className="mt-3 w-full py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
                  >
                    Acknowledge
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Acknowledged — in progress */}
      {acknowledged.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
            In Progress ({acknowledged.length})
          </h3>
          <div className="space-y-2">
            {acknowledged.map(r => {
              const info = TYPE_LABELS[r.type] ?? TYPE_LABELS.CUSTOM;
              return (
                <div key={r.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{info!.icon}</span>
                      <div>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${info!.color}`}>{info!.label}</span>
                        <p className="text-sm font-medium text-text-primary mt-1">
                          Table {r.table?.number || '—'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-text-muted">{timeAgo(r.createdAt)}</span>
                  </div>
                  <button
                    onClick={() => resolveMutation.mutate(r.id)}
                    disabled={resolveMutation.isPending}
                    className="mt-3 w-full py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Mark Resolved
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
