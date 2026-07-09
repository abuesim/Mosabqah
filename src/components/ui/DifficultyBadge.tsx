import Badge from './Badge';
import { Circle } from 'lucide-react';

/** Difficulty value as stored in the `questions` table. */
export type Difficulty = 'easy' | 'medium' | 'hard';

const map: Record<Difficulty, { label: string; tone: 'success' | 'gold' | 'danger' }> = {
  easy: { label: 'سهل', tone: 'success' },
  medium: { label: 'متوسط', tone: 'gold' },
  hard: { label: 'صعب', tone: 'danger' },
};

/** A semantic difficulty pill — color + dot + label (not color alone). */
export default function DifficultyBadge({ difficulty }: { difficulty: Difficulty | string }) {
  const cfg = map[(difficulty as Difficulty)] ?? map.medium;
  return (
    <Badge tone={cfg.tone} icon={<Circle className="h-2 w-2 fill-current" />}>
      {cfg.label}
    </Badge>
  );
}
