"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

const interactiveSelector = "button, a[href], [role='button'], .file-button, .editable-row";

export default function InteractionMotion() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function animateInteraction(event: MouseEvent) {
      if (reducedMotion.matches) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(interactiveSelector) : null;
      if (!target || target.matches(":disabled, [aria-disabled='true']")) return;

      target.animate(
        [
          { transform: "scale(1)", filter: "brightness(1)" },
          { transform: "scale(.975)", filter: "brightness(.97)", offset: 0.28 },
          { transform: "scale(1.006)", filter: "brightness(1.015)", offset: 0.72 },
          { transform: "scale(1)", filter: "brightness(1)" },
        ],
        { duration: 720, easing: "cubic-bezier(.2,.75,.2,1)" },
      );
      if (Capacitor.isNativePlatform()) void Haptics.impact({ style: ImpactStyle.Light });
    }

    document.addEventListener("click", animateInteraction);
    return () => document.removeEventListener("click", animateInteraction);
  }, []);

  return null;
}
