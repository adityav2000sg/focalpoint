"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

const interactiveSelector = "button, a[href], [role='button'], .file-button, .editable-row";

/**
 * Press feedback is CSS (`:active` plus the shared tap transition), so it starts on the
 * compositor in the same frame as the touch and cannot be left half-played on an element
 * that unmounts — which is what happened when a press opened a modal. This component now
 * only adds the native haptic, fired on pointerdown so it lands with the press, not after it.
 */
export default function InteractionMotion() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    function tap(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(interactiveSelector) : null;
      if (!target || target.matches(":disabled, [aria-disabled='true']")) return;
      void Haptics.impact({ style: ImpactStyle.Light });
    }

    document.addEventListener("pointerdown", tap, { passive: true });
    return () => document.removeEventListener("pointerdown", tap);
  }, []);

  return null;
}
