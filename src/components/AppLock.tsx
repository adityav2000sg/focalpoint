"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Leaf, LockKeyhole } from "lucide-react";
import { authenticate, checkBiometry } from "@/lib/native/appLock";

/** Re-lock after this long in the background, so a glance away does not demand a new check. */
const RELOCK_AFTER_MS = 60_000;

/**
 * Gates the app behind a device biometric check. It renders its children hidden rather than
 * unmounted while locked, so the workspace keeps its state and no in-flight save is dropped
 * by locking; `inert` keeps the hidden tree out of focus and the accessibility tree.
 */
export default function AppLock({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const active = enabled && Capacitor.isNativePlatform();
  const [locked, setLocked] = useState(active);
  const [checking, setChecking] = useState(false);
  const [label, setLabel] = useState("Face ID");
  const [failed, setFailed] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active) { setLocked(false); return; }
    void checkBiometry().then((state) => setLabel(state.label));
  }, [active]);

  const unlock = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    setFailed(false);
    const ok = await authenticate("Unlock Lifetime to see your finances");
    setChecking(false);
    if (ok) setLocked(false);
    else setFailed(true);
  }, [checking]);

  // Locking on resume is the point of the feature: the risk is someone picking the phone up,
  // not the app starting. A short grace period keeps app-switching from becoming a chore.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const handle = App.addListener("appStateChange", ({ isActive }) => {
      if (cancelled) return;
      if (!isActive) { backgroundedAt.current = Date.now(); return; }
      const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
      if (away >= RELOCK_AFTER_MS) setLocked(true);
    });
    return () => { cancelled = true; void handle.then((listener) => listener.remove()); };
  }, [active]);

  // Prompt once as soon as the lock screen appears, so unlocking is usually a glance.
  useEffect(() => {
    if (locked && !checking && !failed) void unlock();
    // Only when the lock first engages; unlock() guards re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  return (
    <>
      <div inert={locked} aria-hidden={locked || undefined} className={locked ? "locked-content" : undefined}>
        {children}
      </div>
      {locked && (
        <div className="app-lock" role="dialog" aria-modal="true" aria-label="Lifetime is locked">
          <div className="app-lock-card">
            <span className="app-lock-mark"><Leaf size={26} /></span>
            <strong>Lifetime is locked</strong>
            <p>{failed ? `${label} did not confirm it was you. Try again, or use your device passcode.` : `Unlock with ${label} to see your accounts.`}</p>
            <button type="button" className="primary-button" onClick={() => void unlock()} disabled={checking}>
              <LockKeyhole size={17} /> {checking ? "Waiting for you…" : `Unlock with ${label}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
