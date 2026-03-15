import { useMemo, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useBranchStore } from '../state/branchStore';
import { settingsService } from '../services/settingsService';
import { tvSlideService, type TVSlide } from '../services/tvSlideService';
import { resolveImg } from '../utils/resolveImg';

const CUSTOMER_BASE =
  (import.meta.env.VITE_CUSTOMER_URL as string) ||
  (import.meta.env.PROD ? 'https://order.infynarc.com' : 'http://localhost:5174');

export default function TVMenuPage() {
  const { user } = useAuth();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

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

  // ── Slides data ──
  const { data: slides = [], isLoading: slidesLoading } = useQuery({
    queryKey: ['tv-slides'],
    queryFn: tvSlideService.list,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => tvSlideService.upload(file, activeBranchId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tv-slides'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tvSlideService.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tv-slides'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      tvSlideService.toggleActive(id, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tv-slides'] }),
  });

  const reorderMutation = useMutation({
    mutationFn: (slideIds: string[]) => tvSlideService.reorder(slideIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tv-slides'] }),
  });

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      Array.from(files).forEach((file) => uploadMutation.mutate(file));
      e.target.value = '';
    },
    [uploadMutation],
  );

  // ── Drag & drop reorder ──
  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };
  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const reordered = [...slides];
      const moved = reordered.splice(draggedIndex, 1)[0];
      if (moved) {
        reordered.splice(dragOverIndex, 0, moved);
        reorderMutation.mutate(reordered.map((s) => s.id));
      }
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

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

      {/* ── Menu Slides Upload Section ── */}
      <div className="bg-surface rounded-xl border border-border p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Menu Slides</h3>
            <p className="text-sm text-text-secondary mt-0.5">
              Upload your menu photos or PDF pages. They will display as a slideshow with a 10-second interval on the TV.
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="btn-primary px-4 py-2 rounded-lg font-medium flex items-center gap-2 shrink-0 disabled:opacity-50"
          >
            {uploadMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            )}
            Upload Images
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Slides grid */}
        {slidesLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : slides.length === 0 ? (
          <div
            className="border-2 border-dashed border-border rounded-xl py-12 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg className="w-12 h-12 text-text-secondary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <p className="text-sm text-text-secondary">Click to upload menu photos</p>
            <p className="text-xs text-text-secondary/60">JPEG, PNG, GIF, WebP — max 5MB each</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {slides.map((slide, index) => (
              <SlideCard
                key={slide.id}
                slide={slide}
                index={index}
                onDelete={() => deleteMutation.mutate(slide.id)}
                onToggle={() => toggleMutation.mutate({ id: slide.id, isActive: !slide.isActive })}
                isDeleting={deleteMutation.isPending}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                isDragOver={dragOverIndex === index}
              />
            ))}
          </div>
        )}

        {slides.length > 0 && (
          <p className="text-xs text-text-secondary/60">
            Drag & drop to reorder. Slides play in order with a 10-second gap. Toggle the eye icon to hide/show slides.
          </p>
        )}
      </div>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard
          icon="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          title="Auto-Scrolling"
          description="Categories and slides rotate automatically every 10 seconds. Click anywhere to pause/resume."
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
          <Step number={4} text="The menu will auto-scroll through categories. If you've uploaded slides, they'll play between category pages with a 10-second interval." />
        </div>
      </div>
    </div>
  );
}

function SlideCard({
  slide,
  index,
  onDelete,
  onToggle,
  isDeleting,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragOver,
}: {
  slide: TVSlide;
  index: number;
  onDelete: () => void;
  onToggle: () => void;
  isDeleting: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`group relative rounded-xl border overflow-hidden transition-all cursor-grab active:cursor-grabbing ${
        isDragOver
          ? 'border-primary ring-2 ring-primary/30 scale-[1.02]'
          : 'border-border hover:border-primary/40'
      } ${!slide.isActive ? 'opacity-50' : ''}`}
    >
      <img
        src={resolveImg(slide.imageUrl)}
        alt={`Slide ${index + 1}`}
        className="w-full aspect-[4/3] object-cover"
        loading="lazy"
      />

      {/* Slide number badge */}
      <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 text-white text-xs font-bold flex items-center justify-center">
        {index + 1}
      </span>

      {/* Actions overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-gray-700 transition-colors"
          title={slide.isActive ? 'Hide slide' : 'Show slide'}
        >
          {slide.isActive ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          )}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          disabled={isDeleting}
          className="w-9 h-9 rounded-full bg-red-500/90 hover:bg-red-500 flex items-center justify-center text-white transition-colors disabled:opacity-50"
          title="Delete slide"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
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
