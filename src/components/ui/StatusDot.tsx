import { cn } from '@/lib/utils';
import { Circle } from 'lucide-react';

/** Session status as stored in the `sessions` table. */
export type SessionStatus = 'waiting' | 'ready' | 'active' | 'paused' | 'scheduled' | 'finished' | 'cancelled' | 'archived';

const map: Record<SessionStatus, { label: string; color: string; ring: string }> = {
  waiting: { label: 'بانتظار المتسابقين', color: 'text-cyan', ring: 'fill-cyan' },
  ready: { label: 'جاهزة للبدء', color: 'text-neon-bright', ring: 'fill-neon' },
  active: { label: 'مباشرة الآن', color: 'text-success-bright', ring: 'fill-success' },
  paused: { label: 'متوقفة مؤقتاً', color: 'text-gold', ring: 'fill-gold' },
  scheduled: { label: 'مجدولة', color: 'text-magenta', ring: 'fill-magenta' },
  finished: { label: 'مكتملة', color: 'text-success-bright', ring: 'fill-success' },
  cancelled: { label: 'ملغاة', color: 'text-danger-bright', ring: 'fill-danger' },
  archived: { label: 'مؤرشفة', color: 'text-ink-mute', ring: 'fill-ink-mute' },
};

/** A live status indicator: colored dot + text label. */
export default function StatusDot({
  status,
  pulse = false,
  className,
}: {
  status: SessionStatus | string;
  pulse?: boolean;
  className?: string;
}) {
  const cfg = map[(status as SessionStatus)] ?? map.waiting;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', cfg.color, className)}>
      <Circle className={cn('h-2.5 w-2.5', cfg.ring, pulse && cfg.color === 'text-success-bright' && 'anim-pulse-neon')} />
      {cfg.label}
    </span>
  );
}
