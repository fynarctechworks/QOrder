import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useBranchStore } from '../state/branchStore';
import { settingsService } from '../services/settingsService';

const CUSTOMER_BASE =
  (import.meta.env.VITE_CUSTOMER_URL as string) || 'http://localhost:5174';

export default function TVMenuPage() {
  const { user } = useAuth();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);

  const { data: _restaurant } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
  });

  const tvMenuUrl = useMemo(() => {
    if (!user?.restaurantId) return '';
    const base = `${CUSTOMER_BASE}/tv-menu/${user.restaurantId}`;
    return activeBranchId ? `${base}/${activeBranchId}` : base;
  }, [user?.restaurantId, activeBranchId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">TV Menu Display</h1>
        <p className="text-text-secondary mt-1">
          Full-screen digital menu board for your restaurant TVs and displays.
        </p>
      </div>

      {/* Quick Actions Card */}
      <div className="bg-surface rounded-xl border border-border p-4 sm:p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-text-primary">Open TV Display</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Opens the TV menu in a new tab. Use full-screen mode (press <kbd className="px-1.5 py-0.5 rounded bg-surface-elevated text-xs font-mono border border-border">F</kbd>) for the best experience on TV screens.
            </p>
          </div>
        </div>

        {/* URL display & launch button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 min-w-0 bg-surface-elevated rounded-lg border border-border px-4 py-3 font-mono text-sm text-text-secondary truncate">
            {tvMenuUrl || 'Loading...'}
          </div>
          <button
            onClick={() => tvMenuUrl && window.open(tvMenuUrl, '_blank')}
            disabled={!tvMenuUrl}
            className="btn-primary px-5 py-3 rounded-lg font-medium flex items-center gap-2 shrink-0 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open in New Tab
          </button>
          <button
            onClick={() => {
              if (tvMenuUrl) {
                navigator.clipboard.writeText(tvMenuUrl);
              }
            }}
            disabled={!tvMenuUrl}
            className="btn-icon p-3 rounded-lg border border-border hover:bg-surface-elevated disabled:opacity-50"
            title="Copy URL"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard
          icon="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          title="Auto-Scrolling"
          description="Categories rotate automatically every 10 seconds. Click anywhere to pause/resume."
        />
        <InfoCard
          icon="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          title="Live Updates"
          description="Menu changes sync automatically every 2 minutes. No manual refresh needed."
        />
        <InfoCard
          icon="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          title="Keyboard Shortcuts"
          description="← → navigate categories, Space to advance, P to pause, F for fullscreen."
        />
      </div>

      {/* Setup Guide */}
      <div className="bg-surface rounded-xl border border-border p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Setup Guide</h3>
        <div className="space-y-3">
          <Step number={1} text="Connect a TV or large display to a device with a web browser (Smart TV, Chromecast, Fire Stick, mini PC, etc.)" />
          <Step number={2} text={`Navigate to the TV Menu URL above in the browser`} />
          <Step number={3} text="Press F or click the fullscreen icon in the top-right to enter full-screen mode" />
          <Step number={4} text="The menu will auto-scroll through categories. Any changes you make in the admin panel will reflect automatically." />
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        <div>
          <h4 className="font-semibold text-text-primary">{title}</h4>
          <p className="text-sm text-text-secondary mt-1">{description}</p>
        </div>
      </div>
    </div>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">
        {number}
      </span>
      <p className="text-sm text-text-secondary pt-0.5">{text}</p>
    </div>
  );
}
