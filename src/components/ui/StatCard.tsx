import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { LucideProps } from 'lucide-react';

type Tone = 'neon' | 'cyan' | 'gold';

const tones: Record<Tone, { text: string; bg: string; glow: string }> = {
  neon: { text: 'text-neon-bright', bg: 'bg-neon/10', glow: 'shadow-[0_0_25px_-10px_rgba(168,85,247,0.6)]' },
  cyan: { text: 'text-cyan', bg: 'bg-cyan/10', glow: 'shadow-[0_0_25px_-10px_rgba(34,211,238,0.5)]' },
  gold: { text: 'text-gold', bg: 'bg-gold/10', glow: 'shadow-[0_0_25px_-10px_rgba(251,191,36,0.5)]' },
};

/**
 * StatCard — dashboard metric tile with a neon icon well + large figure.
 * Uses font-display (Orbitron) for the number so it reads like a scoreboard.
 */
export default function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'neon',
  suffix,
}: {
  label: string;
  value: number | string;
  icon: ComponentType<LucideProps>;
  tone?: Tone;
  suffix?: ReactNode;
}) {
  const t = tones[tone];
  return (
    <div className="group glass rounded-[var(--radius-card)] p-6 transition-all duration-300 hover:border-line-strong">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-mute">{label}</p>
          <p className="mt-2 font-display text-3xl font-extrabold text-ink">
            {value}
            {suffix && <span className="mr-1 text-sm text-ink-mute">{suffix}</span>}
          </p>
        </div>
        <div className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-xl', t.bg, t.text, t.glow)}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
