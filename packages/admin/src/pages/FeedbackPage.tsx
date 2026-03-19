import { useQuery } from '@tanstack/react-query';
import { featureService } from '../services/featureService';

function StarRating({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-text-muted text-sm">—</span>;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} className={`w-4 h-4 ${i <= rating ? 'text-yellow-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="text-sm font-medium text-text-primary ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

function StatsCard({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4 text-center">
      <p className="text-2xl font-bold text-text-primary">{value ?? '—'}</p>
      <p className="text-xs text-text-muted mt-1">{label}</p>
    </div>
  );
}

export default function FeedbackPage() {
  const { data: stats } = useQuery({
    queryKey: ['feedbackStats'],
    queryFn: featureService.getFeedbackStats,
  });

  const { data: feedbackData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['feedback'],
    queryFn: () => featureService.listFeedback(),
  });

  const feedbacks = feedbackData?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Customer Feedback</h1>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          <StatsCard label="Overall Rating" value={stats.averages.overall?.toFixed(1) ?? null} />
          <StatsCard label="Food" value={stats.averages.food?.toFixed(1) ?? null} />
          <StatsCard label="Service" value={stats.averages.service?.toFixed(1) ?? null} />
          <StatsCard label="Ambience" value={stats.averages.ambience?.toFixed(1) ?? null} />
          <StatsCard label="Total Reviews" value={stats.totalReviews} />
        </div>
      )}

      {/* Rating Distribution */}
      {stats && stats.distribution.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="font-semibold text-text-primary mb-3">Rating Distribution</h3>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map(rating => {
              const entry = stats.distribution.find(d => d.rating === rating);
              const count = entry?.count ?? 0;
              const pct = stats.totalReviews > 0 ? (count / stats.totalReviews) * 100 : 0;
              return (
                <div key={rating} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-text-primary w-3">{rating}</span>
                  <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                  <div className="flex-1 h-2 bg-surface-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-text-muted w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feedback List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : isError ? (
        <div className="card p-4 sm:p-8 text-center space-y-3">
          <p className="text-red-500">Failed to load feedback: {error?.message}</p>
          <button className="btn-primary text-sm" onClick={() => refetch()}>Retry</button>
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="text-center py-20 text-text-muted">
          <p className="text-lg font-medium">No feedback yet</p>
          <p className="text-sm mt-1">Feedback from customers will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedbacks.map(f => (
            <div key={f.id} className="bg-white rounded-xl border border-border p-5">
              <div className="flex items-start justify-between">
                <div>
                  <StarRating rating={f.overallRating} />
                  <div className="flex gap-4 mt-2 text-xs text-text-muted">
                    {f.foodRating && <span>Food: {f.foodRating}/5</span>}
                    {f.serviceRating && <span>Service: {f.serviceRating}/5</span>}
                    {f.ambienceRating && <span>Ambience: {f.ambienceRating}/5</span>}
                  </div>
                </div>
                <div className="text-right text-xs text-text-muted">
                  {new Date(f.createdAt).toLocaleDateString()}
                  {f.order && <p className="mt-1">Order #{f.order.orderNumber}</p>}
                </div>
              </div>
              {f.comment && <p className="mt-3 text-sm text-text-primary">{f.comment}</p>}
              {f.customerPhone && <p className="mt-2 text-xs text-text-muted">Customer: {f.customerPhone}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
