"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts a figure up to its value instead of cutting to it. A balance that snaps gives no
 * sense that anything happened; a number that travels does, and it is the single clearest
 * signal that a screen is alive.
 *
 * The tween holds tabular figures for its duration only. Proportional digits have different
 * widths, so a counting number would visibly jitter; equal-width digits fix that, but they
 * make a large settled number look loose, which is why they are released at the end.
 */
export function useCountUp(value: number, duration = 900) {
  const [shown, setShown] = useState(value);
  const [running, setRunning] = useState(false);
  const from = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = from.current;
    const delta = value - start;

    if (typeof window === "undefined" || !Number.isFinite(delta)) { setShown(value); from.current = value; return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Nothing to watch travel, or the user asked for stillness.
    if (reduced || Math.abs(delta) < 0.005) { setShown(value); from.current = value; setRunning(false); return; }

    setRunning(true);
    const began = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - began) / duration);
      // Decelerating, so the figure arrives rather than stopping dead.
      const eased = 1 - Math.pow(1 - progress, 4);
      setShown(start + delta * eased);
      if (progress < 1) { frame.current = requestAnimationFrame(step); return; }
      from.current = value;
      setRunning(false);
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
