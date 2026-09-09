/**
 * The navigation glyphs, drawn for this app rather than taken from a general set.
 *
 * Each is on a 24 grid with a 1.75 stroke and one filled element, so the family reads as
 * duotone: an outline that carries the shape and a solid accent that carries the weight.
 * That filled element is what lets an active item look genuinely different from an idle
 * one without changing the icon, and it is the thing a generic outline set cannot do.
 */

type IconProps = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

/** A card with a trend across it: the day, summarised. */
export function TodayGlyph({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4.5" width="18" height="15" rx="4" />
      <path d="M7.2 14.6l3.1-3.2 2.4 2.4 4.1-4.4" />
      <circle cx="16.8" cy="9.4" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Stacked cards: everything you hold, in one place. */
export function MoneyGlyph({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6.2 7.4V6.1A2.1 2.1 0 0 1 8.3 4h10A2.1 2.1 0 0 1 20.4 6.1v7.3" opacity=".55" />
      <rect x="3" y="7.4" width="15.4" height="12.6" rx="3.2" />
      <circle cx="14.4" cy="13.7" r="2.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** A range to cross with the goal above it: distance ahead, and what sits at the end of it. */
export function FutureGlyph({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M2.2 19.4 L8.6 8.2 L12.9 14.6 L15.8 10.1 L21.8 19.4 Z" fill="currentColor" stroke="none" />
      <circle cx="17.4" cy="5.9" r="2.6" />
    </svg>
  );
}

/** One solid spark, filling its box — a trailing mark just became noise at nav size. */
export function CoachGlyph({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 1.5l2.7 7.05 7.05 2.7-7.05 2.7L12 21l-2.7-7.05L2.25 11.25l7.05-2.7z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Two overlapping fields with the shared part filled: exactly what Together means here. */
export function TogetherGlyph({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="9.1" cy="12" r="5.6" />
      <circle cx="14.9" cy="12" r="5.6" />
      <path d="M12 7.4a5.6 5.6 0 0 0 0 9.2 5.6 5.6 0 0 1 0-9.2z" fill="currentColor" stroke="none" />
    </svg>
  );
}
