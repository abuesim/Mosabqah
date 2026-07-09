import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'neon' | 'cyan' | 'gold' | 'success' | 'danger' | 'muted';

const tones: Record<Tone, string> = {
  neon: 'bg-neon/10 text-neon-bright border-neon/25',
  cyan: 'bg-cyan/10 text-cyan border-cyan/25',
  gold: 'bg-gold/10 text-gold border-gold/25',
  success: 'bg-success/10 text-success-bright border-success/25',
  danger: 'bg-danger/10 text-danger-bright border-danger/25',
  muted: 'bg-white/5 text-ink-mute border-line',
};

export default function Badge({
  tone = 'muted',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
        tones[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}
