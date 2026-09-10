"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { RefreshCw } from "lucide-react";

/** Past this the gesture commits. Short enough to be easy, long enough not to fire by accident. */
const THRESHOLD = 72;
/** Resistance: the sheet follows the finger less and less, which is what makes it feel attached to something. */
const RESISTANCE = 0.55;
const MAX_PULL = 128;

/**
 * Pull-to-refresh for the touch layer.
 *
 * It listens on the document rather than wrapping a scroller, because the page itself is
 * what scrolls here. The gesture only starts at the very top, only when the finger is moving
 * downward, and never while a modal has locked body scroll — otherwise a drag inside a sheet
 * would drag the page behind it.
 */
export default function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);
  const passedThreshold = useRef(false);
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPull(0);
      busy.current = false;
    }
  }, [onRefresh]);

  useEffect(() => {
    // A pointer-coarse check rather than a native check: the gesture is equally right in a
    // mobile browser, and wrong with a mouse where a scrollbar already exists.
    if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return;

    function locked() {
      // A modal locks body scroll, but the setup wizard and the app lock are fixed overlays
      // that do not — without this, pulling inside either would refresh the page behind it.
      if (document.body.style.overflow === "hidden") return true;
      return document.querySelector('[role="dialog"], [aria-modal="true"]') !== null;
    }

    function onStart(event: TouchEvent) {
      if (busy.current || locked() || window.scrollY > 0 || event.touches.length !== 1) { armed.current = false; return; }
      startY.current = event.touches[0].clientY;
      armed.current = true;
      passedThreshold.current = false;
    }

    function onMove(event: TouchEvent) {
      if (!armed.current || startY.current === null || busy.current) return;
      const delta = event.touches[0].clientY - startY.current;
      // An upward move means the user is scrolling, not pulling; hand the gesture back.
      if (delta <= 0) { armed.current = false; setPull(0); return; }
      if (window.scrollY > 0) { armed.current = false; setPull(0); return; }

      const distance = Math.min(MAX_PULL, Math.pow(delta, 0.92) * RESISTANCE);
      setPull(distance);
      // Only claim the gesture once it is clearly a pull, so a normal scroll is never blocked.
      if (delta > 8 && event.cancelable) event.preventDefault();

      if (!passedThreshold.current && distance >= THRESHOLD) {
        passedThreshold.current = true;
        // The tick that says "let go now" — the whole reason the gesture feels physical.
        if (Capacitor.isNativePlatform()) void Haptics.impact({ style: ImpactStyle.Medium });
      }
    }

    function onEnd() {
      if (!armed.current) return;
      armed.current = false;
      startY.current = null;
      if (passedThreshold.current && !busy.current) void run();
      else setPull(0);
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    // Not passive: the pull has to be able to cancel the browser's own overscroll.
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [run]);

  const progress = Math.min(1, pull / THRESHOLD);
  const showing = refreshing || pull > 0;
  if (!showing) return null;

  return (
    <div
      className={refreshing ? "pull-refresh is-refreshing" : "pull-refresh"}
      style={{ "--pull": `${refreshing ? THRESHOLD : pull}px`, "--progress": progress } as React.CSSProperties}
      aria-live="polite"
    >
      <span className="pull-refresh-mark">
        <RefreshCw size={18} />
      </span>
      <small>{refreshing ? "Refreshing…" : progress >= 1 ? "Release to refresh" : "Pull to refresh"}</small>
    </div>
  );
}
