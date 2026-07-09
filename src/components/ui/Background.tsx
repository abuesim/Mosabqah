import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Background — the signature Neo-Arcade animated mesh + grid overlay.
 * Used as the wrapper for every full-screen page so the look is consistent.
 * Blobs are purely decorative and hidden from screen readers.
 */
export default function Background({
  children,
  className,
  variant = 'default',
}: {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'subtle' | 'tv';
}) {
  return (
    <div
      className={cn(
        'relative min-h-screen overflow-hidden bg-void text-ink',
        variant === 'subtle' && 'bg-void-2',
        className
      )}
    >
      {/* Animated neon mesh */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 bg-mesh',
          variant === 'tv' ? 'opacity-90' : 'opacity-70'
        )}
      />
      {/* Grid overlay */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid opacity-60" />

      {/* Floating decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="anim-float absolute -top-24 -right-24 h-72 w-72 rounded-full bg-neon-deep/20 blur-[100px]" />
        <div className="anim-float-slow absolute top-1/3 -left-32 h-80 w-80 rounded-full bg-cyan-deep/15 blur-[110px]" />
        <div className="anim-float absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-magenta/12 blur-[90px]" />
      </div>

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
