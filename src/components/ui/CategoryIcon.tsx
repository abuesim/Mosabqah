import { cn } from '@/lib/utils';
import { BookOpen, Puzzle, FlaskConical, Users, Globe, Landmark, MapPinned, Dumbbell } from 'lucide-react';

/** Category value as stored in the `questions` table (default 'general'). */
export type Category =
  | 'general' | 'islamic' | 'riddles' | 'science' | 'family' | 'history' | 'geography' | 'sports'
  | 'عامة' | 'إسلامية' | 'ألغاز' | 'علوم' | 'عائلية' | 'تاريخ' | 'جغرافيا' | 'رياضة';

const map: Record<Category, { label: string; Icon: typeof BookOpen; tone: string }> = {
  islamic: { label: 'إسلامية', Icon: BookOpen, tone: 'text-emerald-400' },
  riddles: { label: 'ألغاز', Icon: Puzzle, tone: 'text-magenta' },
  science: { label: 'علوم', Icon: FlaskConical, tone: 'text-cyan' },
  family: { label: 'عائلية', Icon: Users, tone: 'text-pink-400' },
  history: { label: 'تاريخ', Icon: Landmark, tone: 'text-gold' },
  geography: { label: 'جغرافيا', Icon: MapPinned, tone: 'text-cyan' },
  sports: { label: 'رياضة', Icon: Dumbbell, tone: 'text-success-bright' },
  general: { label: 'عامة', Icon: Globe, tone: 'text-neon-bright' },
  'إسلامية': { label: 'إسلامية', Icon: BookOpen, tone: 'text-emerald-400' },
  'ألغاز': { label: 'ألغاز', Icon: Puzzle, tone: 'text-magenta' },
  'علوم': { label: 'علوم', Icon: FlaskConical, tone: 'text-cyan' },
  'عائلية': { label: 'عائلية', Icon: Users, tone: 'text-pink-400' },
  'تاريخ': { label: 'تاريخ', Icon: Landmark, tone: 'text-gold' },
  'جغرافيا': { label: 'جغرافيا', Icon: MapPinned, tone: 'text-cyan' },
  'رياضة': { label: 'رياضة', Icon: Dumbbell, tone: 'text-success-bright' },
  'عامة': { label: 'عامة', Icon: Globe, tone: 'text-neon-bright' },
};

/**
 * CategoryIcon — replaces emoji-as-icon (🕌🧩🔬…) with a real SVG glyph + label.
 * Renders an inline icon+label chip.
 */
export default function CategoryIcon({
  category,
  withLabel = true,
  className,
}: {
  category: Category | string;
  withLabel?: boolean;
  className?: string;
}) {
  const cfg = map[(category as Category)] ?? {
    label: category || 'عامة', Icon: BookOpen, tone: 'text-ink-soft',
  };
  const { Icon } = cfg;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-bold', cfg.tone, className)}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {withLabel && cfg.label}
    </span>
  );
}
