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

export default function AnimatedNumber({
  value, format, duration, className,
}: {
  value: number;
  format: (value: number) => string;
  duration?: number;
  className?: string;
}) {
  const { shown, running } = useCountUp(value, duration);
  return (
    <span className={running ? `counting ${className || ""}`.trim() : className}>
      {format(shown)}
    </span>
  );
}
