import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'ghost' | 'danger' | 'success' | 'gold' | 'outline';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

const base =
  'relative inline-flex items-center justify-center gap-2 font-bold cursor-pointer ' +
  'rounded-xl transition-all duration-200 select-none ' +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ' +
  'focus-visible:outline-none active:scale-[0.97]';

const sizes: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-base',
};

const variants: Record<Variant, string> = {
  primary:
    'text-white bg-gradient-to-l from-neon-deep to-neon shadow-[var(--shadow-neon)] ' +
    'hover:shadow-[var(--shadow-neon-strong)] hover:brightness-110',
  gold:
    'text-[#1a1206] bg-gradient-to-l from-gold-deep to-gold shadow-[var(--shadow-gold)] ' +
    'hover:brightness-105 font-extrabold',
  success:
    'text-white bg-gradient-to-l from-emerald-600 to-success shadow-[var(--shadow-success)] ' +
    'hover:brightness-110',
  danger:
    'text-white bg-gradient-to-l from-red-600 to-danger shadow-[var(--shadow-danger)] ' +
    'hover:brightness-110',
  ghost:
    'text-ink-soft glass hover:bg-white/[0.08] hover:text-ink',
  outline:
    'text-neon-bright border border-neon/40 bg-neon/5 hover:bg-neon/10 hover:border-neon/70',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, iconRight, fullWidth, className, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(base, sizes[size], variants[variant], fullWidth && 'w-full', className)}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
      {iconRight && <span className="shrink-0">{iconRight}</span>}
    </button>
  );
});

export default Button;
