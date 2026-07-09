import { cn } from '@/lib/utils';

/** Neon loading spinner. Sizes: sm | md | lg. */
export default function Spinner({
  size = 'md',
  label,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}) {
  const dim = size === 'sm' ? 'h-5 w-5 border-2' : size === 'lg' ? 'h-12 w-12 border-4' : 'h-8 w-8 border-2';
  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div
        className={cn(
          'rounded-full border-white/10 border-t-neon animate-spin',
          dim
        )}
      />
      {label && <p className="text-xs text-ink-mute">{label}</p>}
    </div>
  );
}
