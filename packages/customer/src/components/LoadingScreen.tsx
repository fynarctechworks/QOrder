import { memo } from 'react';

function LoadingScreenComponent() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        {/* Animated logo/spinner — CSS animation replaces framer-motion to keep it out of the initial bundle */}
        <div
          className="w-16 h-16 mx-auto mb-4 flex items-center justify-center animate-loading-pulse"
        >
          <img src="/Q Order Logo QO.svg" alt="Logo" className="w-16 h-16 object-contain" />
        </div>

        {/* Loading dots */}
        <div className="flex items-center justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary animate-loading-dot"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(LoadingScreenComponent);
