import type { ReactNode } from 'react';

interface AnimatedPageProps {
  children: ReactNode;
}

export default function AnimatedPage({ children }: AnimatedPageProps) {
  return (
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden z-[1] bg-background">
      {children}
    </div>
  );
}
