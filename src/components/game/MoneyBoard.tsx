import type { Session } from "@/lib/db";
import { cn } from "@/lib/utils";

export default function MoneyBoard({
  session,
  compact = false,
}: {
  session: Session;
  compact?: boolean;
}) {
  const categories = session.moneyCategories || [
    ...new Set((session.moneyBoard || []).map((cell) => cell.category)),
  ];

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-cyan/25 bg-void/55 p-2 sm:p-4">
      <div
        className="grid gap-1.5 sm:gap-2"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, categories.length)}, minmax(0, 1fr))`,
        }}
      >
        {categories.map((category) => (
          <div key={category} className="min-w-0 space-y-1.5 sm:space-y-2">
            <div className="flex h-9 items-center justify-center rounded-lg border border-line bg-void-2 px-1 text-center text-[8px] font-black leading-3 text-gold sm:h-11 sm:text-xs">
              <span className="line-clamp-2">{category}</span>
            </div>
            {(session.moneyBoard || [])
              .filter((cell) => cell.category === category)
              .sort((first, second) => first.value - second.value)
              .map((cell, index) => (
                <div
                  key={cell.id}
                  className={cn(
                    "anim-option-enter grid place-items-center rounded-lg border font-display font-black transition-all",
                    compact
                      ? "h-10 text-xs sm:h-14 sm:text-lg"
                      : "h-12 text-sm sm:h-20 sm:text-2xl",
                    cell.status === "available" &&
                      "border-cyan/45 bg-gradient-to-b from-cyan/80 to-cyan/45 text-void shadow-[var(--shadow-cyan)]",
                    cell.status === "open" &&
                      "border-gold bg-gold/25 text-gold anim-pulse-neon",
                    cell.status === "used" &&
                      "border-line bg-white/5 text-ink-faint opacity-30",
                  )}
                  style={{ animationDelay: `${index * 45}ms` }}
                >
                  {cell.status === "used" ? "✓" : cell.value}
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
