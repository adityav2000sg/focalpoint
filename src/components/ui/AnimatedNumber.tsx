"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts a figure up to its value instead of cutting to it.
 *
 * The first version seeded `from` with the incoming value, so on mount the delta was zero
 * and the guard below snapped it — the count-up never once ran on load, which is the only
 * moment it matters. It now starts at zero the first time and from the previous figure on
 * every change after.
 *
 * The tween holds tabular figures for its duration only. Proportional digits have different
 * widths, so a counting number visibly jitters; equal-width digits fix that, but they make a
 * large settled number look loose, which is why they are released at the end.
 */
export function useCountUp(value: number, duration = 1100) {
  const [shown, setShown] = useState(0);
  const [running, setRunning] = useState(false);
  const from = useRef(0);
  const mounted = useRef(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = mounted.current ? from.current : 0;
    mounted.current = true;
    const delta = value - start;

    const settle = () => { setShown(value); from.current = value; setRunning(false); };
    if (typeof window === "undefined" || !Number.isFinite(delta)) { settle(); return; }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Nothing to watch travel, or the user asked for stillness.
    if (reduced || Math.abs(delta) < 0.005) { settle(); return; }

    setRunning(true);
    const began = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - began) / duration);
      // Decelerating hard, so the figure sprints and then arrives rather than stopping dead.
      const eased = 1 - Math.pow(1 - progress, 5);
      setShown(start + delta * eased);
      if (progress < 1) { frame.current = requestAnimationFrame(step); return; }
      settle();
    };
    frame.current = requestAnimationFrame(step);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [value, duration]);

  return { shown, running };
}

/**
 * Splits a formatted amount at its decimal separator so the cents can be set back.
 * On a hero figure the dollars are the number and the cents are a footnote; rendering both
 * at the same size makes the whole thing read as a serial number. Returns null when there is
 * no fractional part — a zero-decimal currency like JPY must not be cut apart.
 */
export function splitAmount(formatted: string): { whole: string; fraction: string } | null {
  const at = formatted.lastIndexOf(".");
  if (at < 0 || at === formatted.length - 1) return null;
  const fraction = formatted.slice(at + 1);
  if (!/^\d{1,2}$/.test(fraction)) return null;
  return { whole: formatted.slice(0, at), fraction };
}

export default function AnimatedNumber({
  value, format, duration, className, split = false,
}: {
  value: number;
  format: (value: number) => string;
  duration?: number;
  className?: string;
  /** Set the cents back from the dollars. For hero figures only. */
  split?: boolean;
}) {
  const { shown, running } = useCountUp(value, duration);
  const formatted = format(shown);
  const parts = split ? splitAmount(formatted) : null;
  const classes = running ? `counting ${className || ""}`.trim() : className;
  if (!parts) return <span className={classes}>{formatted}</span>;
  return (
    <span className={classes}>
      {parts.whole}<span className="amount-fraction">.{parts.fraction}</span>
    </span>
  );
}
