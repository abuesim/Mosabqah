import { cn } from '@/lib/utils';
import { Circle } from 'lucide-react';

/** Session status as stored in the `sessions` table. */
export type SessionStatus = 'waiting' | 'active' | 'finished';

const map: Record<SessionStatus, { label: string; color: string; ring: string }> = {
  waiting: { label: 'انتظار', color: 'text-ink-mute', ring: 'fill-ink-mute' },
  active: { label: 'نشطة الآن', color: 'text-success-bright', ring: 'fill-success' },
  finished: { label: 'منتهية', color: 'text-danger-bright', ring: 'fill-danger' },
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
