import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../context/SocketContext';
import { groupOrderService, type GroupOrder, type GroupParticipant } from '../services/groupOrderService';
import { useGeolocation } from '../hooks/useGeolocation';

export default function GroupDashboardPage() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { socket, isConnected } = useSocket();
  const upperCode = code?.toUpperCase() || '';

  const participantId = sessionStorage.getItem(`group:${upperCode}:participantId`) || '';
  const isHost = sessionStorage.getItem(`group:${upperCode}:isHost`) === 'true';

  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const { getCoords, error: geoError, position: geoPosition, refresh: refreshGeo } = useGeolocation();
  const [showShareModal, setShowShareModal] = useState(false);

  // ─── Fetch group data ─────────────────────────────────────
  const { data: group, isLoading, error: fetchError } = useQuery<GroupOrder>({
    queryKey: ['groupOrder', upperCode],
    queryFn: () => groupOrderService.getByCode(upperCode),
    enabled: !!upperCode,
    refetchInterval: 10000, // Fallback polling every 10s
  });

  // ─── Socket: join group room ──────────────────────────────
  useEffect(() => {
    if (!socket || !upperCode) return;
    socket.emit('join:group', upperCode);
    return () => {
      socket.emit('leave:group', upperCode);
    };
  }, [socket, upperCode]);

  // ─── Helper: go back to menu ──────────────────────────────
  const navigateToMenu = useCallback(() => {
    if (group?.restaurant?.slug && group?.table?.id) {
      navigate(`/r/${group.restaurant.slug}/t/${group.table.id}/menu`);
    } else {
      navigate('/');
    }
  }, [group, navigate]);

  // ─── Redirect to menu if group is cancelled ──────────────
  useEffect(() => {
    if (group?.status === 'CANCELLED') {
      navigateToMenu();
    }
  }, [group?.status, navigateToMenu]);

  // ─── Socket: react to group events ────────────────────────
  useEffect(() => {
    if (!socket) return;

    const refetch = () => queryClient.refetchQueries({ queryKey: ['groupOrder', upperCode] });

    // Re-join group room on reconnect
    const handleReconnect = () => {
      socket.emit('join:group', upperCode);
      refetch();
    };

    socket.on('connect', handleReconnect);
    socket.on('group:joined', refetch);
    socket.on('group:cartUpdated', refetch);
    socket.on('group:ready', refetch);
    socket.on('group:submitted', (data: { code: string; orderId: string }) => {
      refetch();
      // Invalidate table cache so session token is refreshed on next visit
      queryClient.invalidateQueries({ queryKey: ['table'] });
      // Redirect to order status page automatically
      navigate(`/order-status/${data.orderId}`);
    });
    socket.on('group:cancelled', () => {
      refetch();
      // Redirect all participants to menu when group is cancelled
      navigateToMenu();
    });
    socket.on('group:expired', refetch);

    return () => {
      socket.off('connect', handleReconnect);
      socket.off('group:joined', refetch);
      socket.off('group:cartUpdated', refetch);
      socket.off('group:ready', refetch);
      socket.off('group:submitted');
      socket.off('group:cancelled');
      socket.off('group:expired', refetch);
    };
  }, [socket, upperCode, queryClient, navigate, navigateToMenu]);

  // ─── Computed ─────────────────────────────────────────────
  const myParticipant = useMemo(
    () => group?.participants.find((p) => p.id === participantId),
    [group, participantId],
  );

  const geoFenceEnabled = !!group?.restaurant?.geoFenceEnabled;
  const geoBlocked = geoFenceEnabled && !geoPosition;

  const allReady = useMemo(
    () => group?.participants
      .filter((p) => p.id !== participantId) // Exclude host — submitting is their "ready"
      .every((p) => p.isReady) ?? false,
    [group, participantId],
  );

  const grandTotal = useMemo(() => {
    if (!group) return 0;
    let total = 0;
    for (const p of group.participants) {
      for (const item of p.cartItems) {
        total += Number(item.totalPrice);
      }
    }
    return total;
  }, [group]);

  // ─── Mark ready ───────────────────────────────────────────
  const handleMarkReady = useCallback(async () => {
    if (!participantId) return;
    try {
      await groupOrderService.markReady(upperCode, participantId);
      await queryClient.refetchQueries({ queryKey: ['groupOrder', upperCode] });
    } catch (err: any) {
      setError(err.message || t('group.failedCreate'));
    }
  }, [upperCode, participantId, queryClient]);

  // ─── Submit (host only) ───────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!participantId) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await groupOrderService.submit(upperCode, participantId, getCoords());
      // Save rotated session token so future orders use the new one
      if (result.newSessionToken && group?.tableId) {
        sessionStorage.setItem(`sessionToken:${group.tableId}`, result.newSessionToken);
      }
      // Invalidate table cache so session token is refreshed on next visit
      queryClient.invalidateQueries({ queryKey: ['table'] });
      navigate(`/order-status/${result.order.id}`);
    } catch (err: any) {
      setError(err.message || t('group.failedCreate'));
    } finally {
      setSubmitting(false);
    }
  }, [upperCode, participantId, navigate]);

  // ─── Cancel (host only) ───────────────────────────────────
  const handleCancel = useCallback(async () => {
    if (!participantId || !window.confirm('Cancel this group order?')) return;
    setCancelling(true);
    try {
      await groupOrderService.cancel(upperCode, participantId);
      queryClient.invalidateQueries({ queryKey: ['groupOrder', upperCode] });
      // Redirect host to menu page
      if (group?.restaurant?.slug && group?.table?.id) {
        navigate(`/r/${group.restaurant.slug}/t/${group.table.id}/menu`);
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to cancel');
    } finally {
      setCancelling(false);
    }
  }, [upperCode, participantId, queryClient, group, navigate]);

  // ─── Share link ───────────────────────────────────────────
  const shareLink = `${window.location.origin}/join?code=${upperCode}`;

  // ─── Leave group (non-host) ───────────────────────────────
  const handleLeave = useCallback(() => {
    if (!window.confirm('Leave this group order?')) return;
    // Clear session data for this group
    sessionStorage.removeItem(`group:${upperCode}:participantId`);
    sessionStorage.removeItem(`group:${upperCode}:isHost`);
    // Leave socket room
    if (socket) socket.emit('leave:group', upperCode);
    // Navigate back to menu
    if (group?.restaurant?.slug && group?.table?.id) {
      navigate(`/r/${group.restaurant.slug}/t/${group.table.id}/menu`);
    } else {
      navigate('/');
    }
  }, [upperCode, socket, group, navigate]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setShowShareModal(false);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = shareLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setShowShareModal(false);
    }
  }, [shareLink]);

  // ─── Loading / error / terminal states ────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (fetchError || !group) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('group.groupNotFound')}</h2>
          <p className="text-sm text-gray-500">{(fetchError as Error)?.message || t('group.groupNotFoundDesc')}</p>
        </div>
      </div>
    );
  }

  const isTerminal = ['SUBMITTED', 'EXPIRED', 'CANCELLED'].includes(group.status);

  if (group.status === 'SUBMITTED' && group.orderId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">{t('group.orderPlaced')}</h2>
          <p className="text-sm text-gray-500 mb-6">{t('group.orderPlacedDesc')}</p>
          <button
            onClick={() => navigate(`/order-status/${group.orderId}`)}
            className="px-6 py-3 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 active:scale-[0.97] transition-all"
          >
            Track Order
          </button>
        </motion.div>
      </div>
    );
  }

  if (isTerminal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('group.groupEnded', { status: group.status.toLowerCase() })}</h2>
          <p className="text-sm text-gray-500">{t('group.groupEndedDesc')}</p>
        </div>
      </div>
    );
  }

  // ─── Active group view ────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{t('group.groupOrder')}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-sm text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md font-bold">
                {upperCode}
              </span>
              {group.table && (
                <span className="text-xs text-gray-400">{t('menu.table', { number: group.table.number })}</span>
              )}
              {!isConnected && (
                <span className="w-2 h-2 rounded-full bg-red-400" title="Offline" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowShareModal(true)}
              className="p-2 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors"
              title="Share invite link"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
            {isHost && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                title="Cancel group order"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            {!isHost && (
              <button
                onClick={handleLeave}
                className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                title="Leave group order"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 bg-red-50 text-red-600 text-sm px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      {/* Geo-fence location warning */}
      {geoBlocked && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">
              {geoError ? t('group.locationDenied') : t('group.locationRequired')}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {geoError ? t('group.locationDeniedDesc') : t('group.locationRequiredDesc')}
            </p>
          </div>
          <button
            onClick={refreshGeo}
            className="flex-shrink-0 text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            {t('common.enable')}
          </button>
        </div>
      )}

      {/* Participants */}
      <div className="px-4 pt-4 pb-32">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {t('group.participants', { count: group.participants.length })}
        </h2>

        <div className="space-y-4">
          {group.participants.map((p) => (
            <ParticipantCard
              key={p.id}
              participant={p}
              currency={group.restaurant.currency}
              isMe={p.id === participantId}
              groupCode={upperCode}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: ['groupOrder', upperCode] })}
            />
          ))}
        </div>

        {/* Add Items button (only if my status is not ready) */}
        {myParticipant && !myParticipant.isReady && (
          <button
            onClick={() => {
              if (group?.restaurant?.slug && group?.table?.id) {
                navigate(`/r/${group.restaurant.slug}/t/${group.table.id}/category/all?group=${upperCode}`);
              }
            }}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-orange-50 text-orange-600 font-semibold rounded-xl border-2 border-dashed border-orange-200 hover:bg-orange-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('group.browseMenuAdd')}
          </button>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 safe-area-pb z-20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">{t('group.grandTotal')}</span>
          <span className="text-lg font-bold text-gray-900">
            {group.restaurant.currency} {grandTotal.toFixed(2)}
          </span>
        </div>
        {isHost ? (
          <button
            onClick={handleSubmit}
            disabled={submitting || geoBlocked || !allReady || grandTotal === 0}
            className={`w-full py-3.5 font-bold rounded-xl transition-all active:scale-[0.97] disabled:pointer-events-none ${geoBlocked ? 'bg-gray-300 text-gray-500' : 'bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50'}`}
          >
            {submitting ? (
              <div className="w-5 h-5 mx-auto border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : geoBlocked ? (
              t('group.enableLocation')
            ) : !allReady ? (
              t('group.waitingReady')
            ) : grandTotal === 0 ? (
              t('group.noItemsInOrder')
            ) : (
              t('group.submitGroup')
            )}
          </button>
        ) : myParticipant && !myParticipant.isReady ? (
          <button
            onClick={handleMarkReady}
            disabled={myParticipant.cartItems.length === 0}
            className="w-full py-3.5 bg-green-500 text-white font-bold rounded-xl transition-all hover:bg-green-600 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none"
          >
            {myParticipant.cartItems.length === 0 ? t('group.addItemsFirst') : t('group.imReady')}
          </button>
        ) : (
          <div className="w-full py-3.5 bg-green-100 text-green-700 font-bold rounded-xl text-center">
            {t('group.waitingHost')}
          </div>
        )}
      </div>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 sm:items-center"
            onClick={() => setShowShareModal(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-sm safe-area-pb"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-2">{t('group.shareCode')}</h3>
              <p className="text-sm text-gray-500 mb-4">
                {t('group.shareHint')}
              </p>
              <div className="bg-orange-50 rounded-xl p-4 text-center mb-4">
                <span className="text-3xl font-mono font-bold text-orange-600 tracking-[0.3em]">
                  {upperCode}
                </span>
              </div>
              <button
                onClick={handleCopyLink}
                className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 active:scale-[0.97] transition-all"
              >
                {t('group.copyLink')}
              </button>
              <button
                onClick={() => setShowShareModal(false)}
                className="w-full py-3 mt-2 text-gray-500 font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                {t('common.close')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Participant Card Component ────────────────────────────

function ParticipantCard({
  participant,
  currency,
  isMe,
  groupCode,
  onRefresh,
}: {
  participant: GroupParticipant;
  currency: string;
  isMe: boolean;
  groupCode: string;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const subtotal = participant.cartItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);

  const handleRemoveItem = async (itemId: string) => {
    try {
      await groupOrderService.removeCartItem(groupCode, participant.id, itemId);
      onRefresh();
    } catch (err: any) {
      console.error('Failed to remove item:', err);
    }
  };
  void handleRemoveItem; // referenced via handleUpdateQty when qty drops to 0

  const handleUpdateQty = async (itemId: string, newQty: number) => {
    try {
      if (newQty < 1) {
        await groupOrderService.removeCartItem(groupCode, participant.id, itemId);
      } else {
        await groupOrderService.updateCartItem(groupCode, participant.id, itemId, { quantity: newQty });
      }
      onRefresh();
    } catch (err: any) {
      console.error('Failed to update item:', err);
    }
  };

  return (
    <motion.div
      layout
      className={`bg-white rounded-xl border ${isMe ? 'border-orange-200 ring-1 ring-orange-100' : 'border-gray-100'} overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${participant.isHost ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600'}`}>
            {participant.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="text-sm font-semibold text-gray-900">
              {participant.name}
              {isMe && <span className="text-orange-500 ml-1">{t('group.you')}</span>}
            </span>
            {participant.isHost && (
              <span className="ml-1.5 text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">{t('group.host')}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {participant.isReady && (
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {t('group.ready')}
            </span>
          )}
          <span className="text-sm font-semibold text-gray-900">{currency} {subtotal.toFixed(2)}</span>
        </div>
      </div>

      {/* Cart Items */}
      {participant.cartItems.length === 0 ? (
        <div className="px-4 py-3 text-center text-xs text-gray-400">{t('group.noItemsYet')}</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {participant.cartItems.map((item) => (
            <div key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.menuItem.name}</p>
                {item.notes && (
                  <p className="text-xs text-gray-400 truncate">{item.notes}</p>
                )}
                <p className="text-xs text-gray-500">{currency} {Number(item.unitPrice).toFixed(2)} {t('common.each')}</p>
              </div>
              {isMe && !participant.isReady ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleUpdateQty(item.id, item.quantity - 1)}
                    className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                    </svg>
                  </button>
                  <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
                  <button
                    onClick={() => handleUpdateQty(item.id, item.quantity + 1)}
                    className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 hover:bg-orange-200 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              ) : (
                <span className="text-sm text-gray-500">x{item.quantity}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
