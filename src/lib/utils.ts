/**
 * `cn` — conditional className joiner.
 * Filters falsy values and joins the rest with a space.
 * Keeps the bundle tiny (no clsx/tailwind-merge dependency).
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
