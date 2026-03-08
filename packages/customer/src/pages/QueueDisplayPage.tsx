import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { featureService } from '../services/featureService';

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: string }> = {
  PENDING: { label: 'In Queue', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200', icon: '🕐' },
  PREPARING: { label: 'Preparing', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200', icon: '👨‍🍳' },
  READY: { label: 'Ready!', color: 'text-green-700', bgColor: 'bg-green-50 border-green-200', icon: '✅' },
};

export default function QueueDisplayPage() {
  const { t } = useTranslation();
  const { restaurantId } = useParams<{ restaurantId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['queue', restaurantId],
    queryFn: () => featureService.getQueue(restaurantId!),
    enabled: !!restaurantId,
    refetchInterval: 5_000, // Live refresh every 5s
  });

  const restaurant = data?.restaurant;
  const orders = data?.orders || [];

  const readyOrders = orders.filter(o => o.status === 'READY');
  const preparingOrders = orders.filter(o => o.status === 'PREPARING');
  const pendingOrders = orders.filter(o => o.status === 'PENDING');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-white/60 text-lg">{t('queueDisplay.unavailable')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {restaurant.logo && (
            <img src={restaurant.logo} alt="" className="w-10 h-10 rounded-full object-cover" />
          )}
          <h1 className="text-2xl font-bold">{restaurant.name}</h1>
        </div>
        <div className="text-sm text-white/50">
          {t('queueDisplay.liveQueue')} &bull; {t('queueDisplay.active', { count: orders.length })}
        </div>
      </header>

      {/* Queue Grid */}
      <div className="p-6">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <span className="text-6xl mb-4">🍽️</span>
            <p className="text-xl text-white/50">{t('queueDisplay.noOrders')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Ready column */}
            <div>
              <h2 className="text-lg font-bold text-green-400 mb-4 flex items-center gap-2">
                ✅ {t('queueDisplay.readyPickup')}
                <span className="text-sm font-normal text-white/40">({readyOrders.length})</span>
              </h2>
              <div className="space-y-3">
                {readyOrders.map(order => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            </div>

            {/* Preparing column */}
            <div>
              <h2 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2">
                👨‍🍳 {t('queueDisplay.preparing')}
                <span className="text-sm font-normal text-white/40">({preparingOrders.length})</span>
              </h2>
              <div className="space-y-3">
                {preparingOrders.map(order => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            </div>

            {/* Pending column */}
            <div>
              <h2 className="text-lg font-bold text-amber-400 mb-4 flex items-center gap-2">
                🕐 {t('queueDisplay.inQueue')}
                <span className="text-sm font-normal text-white/40">({pendingOrders.length})</span>
              </h2>
              <div className="space-y-3">
                {pendingOrders.map(order => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: { id: string; orderNumber: string; status: string; customerName: string | null; createdAt: string } }) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING!;
  const elapsed = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000);

  return (
    <div className={`rounded-xl border p-4 ${config.bgColor}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-2xl font-black ${config.color}`}>#{order.orderNumber}</p>
          {order.customerName && (
            <p className={`text-sm ${config.color} opacity-70`}>{order.customerName}</p>
          )}
        </div>
        <div className="text-right">
          <span className="text-2xl">{config.icon}</span>
          <p className={`text-xs ${config.color} opacity-60 mt-1`}>{t('queueDisplay.ago', { time: elapsed })}</p>
        </div>
      </div>
    </div>
  );
}
