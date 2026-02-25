import { memo } from 'react';

interface SkeletonLoaderProps {
  variant?: 'text' | 'circle' | 'rectangle' | 'card' | 'menuItem';
  width?: string;
  height?: string;
  className?: string;
}

function SkeletonLoaderComponent({
  variant = 'rectangle',
  width,
  height,
  className = '',
}: SkeletonLoaderProps) {
  const getBaseClasses = () => {
    switch (variant) {
      case 'text':
        return 'h-4 rounded-md';
      case 'circle':
        return 'rounded-full';
      case 'card':
        return 'rounded-2xl';
      case 'menuItem':
        return null; // Custom layout
      default:
        return 'rounded-2xl';
    }
  };

  if (variant === 'menuItem') {
    return (
      <div className={`card p-4 ${className}`}>
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="skeleton h-5 w-3/4 mb-2" />
            <div className="skeleton h-4 w-full mb-1" />
            <div className="skeleton h-4 w-2/3 mb-3" />
            <div className="flex gap-1 mb-3">
              <div className="skeleton h-5 w-12 rounded-full" />
              <div className="skeleton h-5 w-14 rounded-full" />
            </div>
            <div className="flex justify-between">
              <div className="skeleton h-6 w-16" />
              <div className="skeleton h-4 w-12" />
            </div>
          </div>
          <div className="skeleton w-24 h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  const baseClasses = getBaseClasses();
  const style: React.CSSProperties = {};

  if (width) style.width = width;
  if (height) style.height = height;

  return (
    <div
      className={`skeleton ${baseClasses} ${className}`}
      style={style}
    />
  );
}

export const SkeletonLoader = memo(SkeletonLoaderComponent);

// Pre-built skeleton layouts
export const MenuSkeleton = memo(function MenuSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {/* Category scroller skeleton */}
      <div className="flex gap-2 overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-10 w-24 rounded-full flex-shrink-0" />
        ))}
      </div>

      {/* Menu items skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonLoader key={i} variant="menuItem" />
        ))}
      </div>
    </div>
  );
});

export const CartSkeleton = memo(function CartSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="card p-4">
          <div className="flex gap-4">
            <div className="skeleton w-20 h-20 rounded-xl" />
            <div className="flex-1">
              <div className="skeleton h-5 w-3/4 mb-2" />
              <div className="skeleton h-4 w-1/2 mb-3" />
              <div className="flex justify-between">
                <div className="skeleton h-10 w-28 rounded-xl" />
                <div className="skeleton h-6 w-16" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});
