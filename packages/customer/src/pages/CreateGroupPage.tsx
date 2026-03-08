import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useRestaurant } from '../context/RestaurantContext';
import { groupOrderService } from '../services/groupOrderService';
import { restaurantService } from '../services/restaurantService';
import { otpService } from '../services/otpService';
import { useGeolocation } from '../hooks/useGeolocation';

const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 +91' },
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+971', label: '🇦🇪 +971' },
  { code: '+966', label: '🇸🇦 +966' },
  { code: '+65', label: '🇸🇬 +65' },
  { code: '+60', label: '🇲🇾 +60' },
  { code: '+61', label: '🇦🇺 +61' },
  { code: '+49', label: '🇩🇪 +49' },
  { code: '+33', label: '🇫🇷 +33' },
];

export default function CreateGroupPage() {
  const { t } = useTranslation();
  const { restaurantSlug, tableId } = useParams<{ restaurantSlug: string; tableId: string }>();
  const { restaurant, table } = useRestaurant();
  const navigate = useNavigate();
  const { getCoords, error: geoError, position: geoPosition, refresh: refreshGeo } = useGeolocation();
  const geoFenceEnabled = !!restaurant?.geoFenceEnabled;
  const geoBlocked = geoFenceEnabled && !geoPosition;

  const [hostName, setHostName] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = useCallback(async () => {
    const trimmedName = hostName.trim();
    if (!trimmedName) {
      setError(t('group.nameRequired'));
      return;
    }
    const digits = phoneNumber.replace(/\D/g, '');
    if (!digits || digits.length < 5) {
      setError(t('group.phoneInvalid'));
      return;
    }
    if (!restaurant?.id) {
      setError(t('group.restaurantNotLoaded'));
      return;
    }

    const fullPhone = `${countryCode}${digits}`;

    setLoading(true);
    setError('');
    try {
      // Validate phone format via backend
      if (tableId) {
        await otpService.sendOtp(fullPhone, restaurant.id, tableId);
      }

      // Always fetch the latest session token from the server before creating a group.
      // The token in sessionStorage may be stale if a previous order completed and
      // the backend rotated it.
      let sessionToken: string | undefined;
      if (tableId && restaurant.id) {
        try {
          const freshTable = await restaurantService.getTable(restaurant.id, tableId);
          if (freshTable?.sessionToken) {
            sessionStorage.setItem(`sessionToken:${tableId}`, freshTable.sessionToken);
          }
        } catch { /* fall through to cached token */ }
        sessionToken = sessionStorage.getItem(`sessionToken:${tableId}`) || undefined;
      }
      const group = await groupOrderService.create({
        restaurantId: restaurant.id,
        tableId: tableId,
        sessionToken,
        hostName: trimmedName,
        hostPhone: fullPhone,
      }, getCoords());

      // Store host participant info
      const hostParticipant = group.participants.find((p) => p.isHost);
      if (hostParticipant) {
        const code = group.code;
        sessionStorage.setItem(`group:${code}:participantId`, hostParticipant.id);
        sessionStorage.setItem(`group:${code}:participantName`, hostParticipant.name);
        sessionStorage.setItem(`group:${code}:isHost`, 'true');
      }

      // Navigate to group dashboard
      navigate(`/group/${group.code}`);
    } catch (err: any) {
      setError(err.message || t('group.failedCreate'));
    } finally {
      setLoading(false);
    }
  }, [hostName, countryCode, phoneNumber, restaurant, tableId, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 w-full max-w-sm"
      >
        {/* Back button */}
        <button
          onClick={() => navigate(`/r/${restaurantSlug}/t/${tableId}`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 -mt-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('group.startGroup')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {restaurant?.name && (
              <>at <span className="font-medium">{restaurant.name}</span></>
            )}
            {table && <> · Table {table.number}</>}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('group.yourName')}</label>
            <input
              type="text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder={t('customer.namePlaceholder')}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none transition-all"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('group.phone')}</label>
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="px-2 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none transition-all text-sm min-w-[90px]"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d]/g, ''))}
                placeholder={t('customer.phonePlaceholder')}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none transition-all"
              />
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2"
            >
              {error}
            </motion.p>
          )}

          {geoBlocked && (
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
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

          <button
            onClick={handleCreate}
            disabled={loading || geoBlocked || !hostName.trim() || phoneNumber.replace(/\D/g, '').length < 5}
            className={`w-full py-3.5 font-bold rounded-xl transition-all active:scale-[0.97] disabled:pointer-events-none ${geoBlocked ? 'bg-gray-300 text-gray-500' : 'bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50'}`}
          >
            {loading ? (
              <div className="w-5 h-5 mx-auto border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              t('group.createGroup')
            )}
          </button>

          <p className="text-xs text-center text-gray-400">
            {t('group.codeHint')}
          </p>

          <div className="relative flex items-center my-2">
            <div className="flex-1 border-t border-gray-200" />
            <span className="px-3 text-xs text-gray-400">{t('common.or')}</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <button
            onClick={() => navigate('/join')}
            className="w-full py-3 bg-white text-orange-500 font-semibold rounded-xl border border-orange-200 transition-all hover:bg-orange-50 active:scale-[0.97]"
          >
            {t('group.joinGroup')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
