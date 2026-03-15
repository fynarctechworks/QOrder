import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { restaurantService } from '../services/restaurantService';
import { apiClient } from '../services/apiClient';
import { getDietType } from '../components/DietBadge';
import { resolveImg } from '../utils/resolveImg';
import type { Category, MenuItem } from '../types';

interface TVSlide {
  id: string;
  imageUrl: string;
  sortOrder: number;
}

const SLIDE_INTERVAL = 10_000; // 10 seconds per category/slide
const REFETCH_INTERVAL = 120_000; // Refetch menu every 2 minutes

/** Format price with currency symbol */
function formatPrice(price: number, currency = '₹') {
  return `${currency}${price.toFixed(0)}`;
}

/** Diet indicator dot (veg/non-veg/egg) */
function DietDot({ item }: { item: MenuItem }) {
  const diet = getDietType(item.tags, item.dietType);
  if (!diet) return null;
  const color =
    diet === 'veg'
      ? 'border-emerald-500 [&>span]:bg-emerald-500'
      : diet === 'egg'
        ? 'border-amber-500 [&>span]:bg-amber-500'
        : 'border-red-500 [&>span]:bg-red-500';
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded-[3px] border-2 ${color} shrink-0`}
    >
      <span className="w-2.5 h-2.5 rounded-full" />
    </span>
  );
}

/** Single menu item card for the TV grid */
function TVMenuItem({ item, currency }: { item: MenuItem; currency: string }) {
  const hasDiscount = item.discountPrice != null && item.discountPrice < item.price;
  const imgSrc = resolveImg(item.image);

  return (
    <div
      className={`flex gap-4 bg-white/[0.06] rounded-2xl p-4 border border-white/10 transition-all ${
        !item.isAvailable ? 'opacity-40 grayscale' : ''
      }`}
    >
      {/* Image */}
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={item.name}
          className="w-28 h-28 rounded-xl object-cover shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-28 h-28 rounded-xl bg-white/10 shrink-0 flex items-center justify-center text-4xl">
          🍽️
        </div>
      )}

      {/* Info */}
      <div className="flex flex-col justify-center min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <DietDot item={item} />
          <h3 className="text-xl font-semibold text-white truncate">{item.name}</h3>
        </div>

        {item.description && (
          <p className="text-sm text-white/50 line-clamp-2 mb-2">{item.description}</p>
        )}

        <div className="flex items-baseline gap-2 mt-auto">
          <span className="text-lg font-bold text-emerald-400">
            {formatPrice(hasDiscount ? item.discountPrice! : item.price, currency)}
          </span>
          {hasDiscount && (
            <span className="text-sm text-white/30 line-through">
              {formatPrice(item.price, currency)}
            </span>
          )}
        </div>

        {!item.isAvailable && (
          <span className="text-xs text-red-400 font-medium mt-1">Unavailable</span>
        )}
      </div>
    </div>
  );
}

/** Pagination dots */
function PaginationDots({
  total,
  active,
  slidePageCount,
  onDotClick,
}: {
  total: number;
  active: number;
  slidePageCount: number;
  onDotClick: (index: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      {Array.from({ length: total }, (_, i) => {
        const isSlide = i < slidePageCount;
        return (
          <button
            key={i}
            onClick={() => onDotClick(i)}
            className={`rounded-full transition-all duration-300 ${
              i === active
                ? isSlide
                  ? 'w-8 h-3 bg-blue-400'
                  : 'w-8 h-3 bg-emerald-400'
                : isSlide
                  ? 'w-3 h-3 bg-blue-400/30 hover:bg-blue-400/50'
                  : 'w-3 h-3 bg-white/20 hover:bg-white/40'
            }`}
          />
        );
      })}
    </div>
  );
}

/** A carousel "page" is either a category view or a full-screen slide image */
type CarouselPage =
  | { type: 'category'; category: Category; items: MenuItem[] }
  | { type: 'slide'; slide: TVSlide };

export default function TVMenuPage() {
  const { restaurantId, branchId } = useParams<{
    restaurantId: string;
    branchId?: string;
  }>();

  const [activePageIndex, setActivePageIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Fetch restaurant info
  const { data: restaurant } = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => restaurantService.getById(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 300_000,
  });

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', restaurantId, branchId],
    queryFn: () => restaurantService.getCategories(restaurantId!, branchId),
    enabled: !!restaurantId,
    refetchInterval: REFETCH_INTERVAL,
  });

  // Fetch all menu items
  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu', restaurantId, branchId],
    queryFn: () => restaurantService.getMenuItems(restaurantId!, branchId),
    enabled: !!restaurantId,
    refetchInterval: REFETCH_INTERVAL,
  });

  // Fetch TV slides
  const { data: tvSlides = [] } = useQuery({
    queryKey: ['tv-slides', restaurantId, branchId],
    queryFn: () => {
      const params = branchId ? `?branchId=${branchId}` : '';
      return apiClient.get<TVSlide[]>(`/restaurants/${restaurantId}/tv-slides${params}`);
    },
    enabled: !!restaurantId,
    refetchInterval: REFETCH_INTERVAL,
  });

  // Sort categories
  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  // Items grouped by category
  const itemsByCategory = sortedCategories.reduce<Record<string, MenuItem[]>>((acc, cat) => {
    acc[cat.id] = menuItems.filter((item) => item.categoryId === cat.id);
    return acc;
  }, {});

  // Only categories that have items
  const activeCategories = sortedCategories.filter(
    (cat) => (itemsByCategory[cat.id]?.length ?? 0) > 0,
  );

  // Build unified carousel: slides first, then categories
  const carouselPages: CarouselPage[] = useMemo(() => {
    const pages: CarouselPage[] = [];

    // Add slide pages first (full-screen images)
    tvSlides.forEach((slide) => {
      pages.push({ type: 'slide', slide });
    });

    // Then category pages
    activeCategories.forEach((cat) => {
      pages.push({ type: 'category', category: cat, items: itemsByCategory[cat.id] ?? [] });
    });

    return pages;
  }, [tvSlides, activeCategories, itemsByCategory]);

  const currentPage = carouselPages[activePageIndex] as CarouselPage | undefined;
  const currency = restaurant?.currency ?? '₹';

  // Count of slide pages vs category pages
  const slidePageCount = tvSlides.length;

  // Auto-advance carousel
  const advanceSlide = useCallback(() => {
    setActivePageIndex((prev) =>
      carouselPages.length > 0 ? (prev + 1) % carouselPages.length : 0,
    );
  }, [carouselPages.length]);

  const goToPreviousSlide = useCallback(() => {
    setActivePageIndex((prev) =>
      prev <= 0 ? carouselPages.length - 1 : prev - 1,
    );
  }, [carouselPages.length]);

  useEffect(() => {
    if (isPaused || carouselPages.length <= 1) return;
    timerRef.current = setInterval(advanceSlide, SLIDE_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [advanceSlide, isPaused, carouselPages.length]);

  // Reset index when pages change
  useEffect(() => {
    if (activePageIndex >= carouselPages.length) {
      setActivePageIndex(0);
    }
  }, [carouselPages.length, activePageIndex]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        advanceSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPreviousSlide();
      } else if (e.key === 'p') {
        setIsPaused((p) => !p);
      } else if (e.key === 'f') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advanceSlide, goToPreviousSlide, toggleFullscreen]);

  // Loading state
  if (!restaurant || (categories.length === 0 && tvSlides.length === 0)) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400" />
          <p className="text-white/40 text-lg">Loading menu...</p>
        </div>
      </div>
    );
  }

  // No items and no slides
  if (carouselPages.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="text-6xl">🍽️</span>
          <p className="text-white/50 text-xl">No menu items available</p>
        </div>
      </div>
    );
  }

  // ── Full-screen slide image page ──
  if (currentPage?.type === 'slide') {
    return (
      <div
        className="min-h-screen bg-gray-950 text-white flex flex-col cursor-none select-none"
        onClick={() => setIsPaused((p) => !p)}
      >
        {/* Slide image — full screen */}
        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
          <img
            src={resolveImg(currentPage.slide.imageUrl)}
            alt="Menu slide"
            className="w-full h-full object-contain"
          />

          {/* Pause badge */}
          {isPaused && (
            <span className="absolute top-4 right-4 text-xs text-amber-400 bg-amber-400/10 px-3 py-1 rounded-full">
              PAUSED
            </span>
          )}

          {/* Fullscreen button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            className="absolute top-4 right-16 text-white/30 hover:text-white/70 transition-colors"
            title="Toggle fullscreen (F)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
              />
            </svg>
          </button>
        </div>

        {/* Footer / Pagination */}
        <footer className="px-8 pb-4 pt-2">
          <PaginationDots
            total={carouselPages.length}
            active={activePageIndex}
            slidePageCount={slidePageCount}
            onDotClick={(idx) => setActivePageIndex(idx)}
          />
          {!isPaused && carouselPages.length > 1 && (
            <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500/50 rounded-full"
                style={{ animation: `tvMenuProgress ${SLIDE_INTERVAL}ms linear infinite` }}
              />
            </div>
          )}
        </footer>

        <style>{`
          @keyframes tvMenuProgress { from { width: 0%; } to { width: 100%; } }
        `}</style>
      </div>
    );
  }

  // ── Category page (original view) ──
  const currentCategory = currentPage?.type === 'category' ? currentPage.category : undefined;
  const currentItems = currentPage?.type === 'category' ? currentPage.items : [];

  return (
    <div
      className="min-h-screen bg-gray-950 text-white flex flex-col cursor-none select-none"
      onClick={() => setIsPaused((p) => !p)}
    >
      {/* ─── Header Bar ─── */}
      <header className="flex items-center justify-between px-8 py-5 bg-gray-900/80 backdrop-blur border-b border-white/5">
        <div className="flex items-center gap-4">
          {restaurant.coverImageUrl && (
            <img
              src={resolveImg(restaurant.coverImageUrl)}
              alt=""
              className="w-12 h-12 rounded-full object-cover border-2 border-white/10"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{restaurant.name}</h1>
            {restaurant.description && (
              <p className="text-sm text-white/40 truncate max-w-md">{restaurant.description}</p>
            )}
          </div>
        </div>

        {/* Category tabs — only show categories, not slide pages */}
        <nav className="flex items-center gap-1 overflow-x-auto max-w-[60%] scrollbar-none">
          {activeCategories.map((cat, idx) => {
            const pageIdx = slidePageCount + idx;
            return (
              <button
                key={cat.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePageIndex(pageIdx);
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                  activePageIndex === pageIdx
                    ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {isPaused && (
            <span className="text-xs text-amber-400 bg-amber-400/10 px-3 py-1 rounded-full">
              PAUSED
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            className="text-white/30 hover:text-white/70 transition-colors"
            title="Toggle fullscreen (F)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* ─── Category Title ─── */}
      <div className="px-8 pt-6 pb-2">
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-bold tracking-tight">{currentCategory?.name}</h2>
          <span className="text-sm text-white/30 bg-white/5 px-3 py-1 rounded-full">
            {currentItems.length} items
          </span>
        </div>
      </div>

      {/* ─── Menu Items Grid ─── */}
      <main className="flex-1 overflow-hidden px-8 py-4">
        <div
          className="grid gap-4 h-full auto-rows-min"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
          }}
        >
          {currentItems.map((item) => (
            <TVMenuItem key={item.id} item={item} currency={currency} />
          ))}
        </div>
      </main>

      {/* ─── Footer / Pagination ─── */}
      <footer className="px-8 pb-6 pt-2">
        <PaginationDots
          total={carouselPages.length}
          active={activePageIndex}
          slidePageCount={slidePageCount}
          onDotClick={(idx) => {
            setActivePageIndex(idx);
          }}
        />

        {/* Progress bar for auto-advance */}
        {!isPaused && carouselPages.length > 1 && (
          <div className="mt-4 h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500/50 rounded-full"
              style={{
                animation: `tvMenuProgress ${SLIDE_INTERVAL}ms linear infinite`,
              }}
            />
          </div>
        )}
      </footer>

      {/* Inline animation keyframe */}
      <style>{`
        @keyframes tvMenuProgress {
          from { width: 0%; }
          to { width: 100%; }
        }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
