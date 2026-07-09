import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Glow = 'none' | 'neon' | 'gold' | 'cyan' | 'subtle';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: Glow;
  strong?: boolean;
  children: ReactNode;
}

const glowMap: Record<Glow, string> = {
  none: '',
  neon: 'shadow-[var(--shadow-neon)]',
  gold: 'shadow-[var(--shadow-gold)]',
  cyan: 'shadow-[var(--shadow-cyan)]',
  subtle: 'shadow-2xl shadow-black/40',
};

/**
 * Card — frosted-glass surface with optional neon glow.
 */
export default function Card({ glow = 'subtle', strong, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        strong ? 'glass-strong' : 'glass',
        'rounded-[var(--radius-card)]',
        glowMap[glow],
        'transition-all duration-300',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** CardHeader — consistent inner padding + optional accent line. */
export function CardHeader({
  title,
  icon,
  accent = 'neon',
  action,
  className,
}: {
  title: ReactNode;
  icon?: ReactNode;
  accent?: 'neon' | 'gold' | 'cyan';
  action?: ReactNode;
  className?: string;
}) {
  const accentColor =
    accent === 'gold' ? 'text-gold' : accent === 'cyan' ? 'text-cyan' : 'text-neon-bright';

  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-line pb-4', className)}>
      <h3 className="flex items-center gap-2 text-base font-bold text-ink">
        {icon && <span className={accentColor}>{icon}</span>}
        {title}
      </h3>
      {action}
    </div>
  );
}
