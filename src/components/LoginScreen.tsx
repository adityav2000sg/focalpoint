"use client";

import { useState } from "react";
import { Apple, ArrowRight, Leaf, LockKeyhole, Users } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginScreen({ configured, appleEnabled, error, next = "/" }: { configured: boolean; appleEnabled: boolean; error?: string; next?: string }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState(error || "");

  async function signIn(provider: "google" | "apple") {
    if (!configured) return;
    setWorking(true);
    setMessage("");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
        },
      });
      if (authError) throw authError;
    } catch (authError) {
      setWorking(false);
      setMessage(authError instanceof Error ? authError.message : "Sign-in could not start.");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><span><Leaf size={22} /></span><strong>LIFETIME</strong></div>
        <p className="eyebrow">Your financial home</p>
        <h1>One calm place for the money you manage alone and together.</h1>
        <p className="auth-copy">Private by default, shared intentionally, and built so transfers never pretend to be spending.</p>
        <div className="auth-promises">
          <span><LockKeyhole size={17} /> Your personal records stay yours</span>
          <span><Users size={17} /> Share only what you put in Together</span>
        </div>
        {configured ? (
          <div className="auth-buttons">
          {/* Apple leads when it is available. Guideline 4.8 asks that Sign in with
              Apple be presented no less prominently than the other options, and
              Apple's own button is the filled one — so it takes that treatment and
              Google becomes the outlined alternative. */}
          {appleEnabled && <button className="apple-button" onClick={() => signIn("apple")} disabled={working}>
            <Apple size={19} />
            {working ? "Opening Apple…" : "Continue with Apple"}
            <ArrowRight size={18} />
          </button>}
          <button className={appleEnabled ? "google-button" : "google-button google-button-lead"} onClick={() => signIn("google")} disabled={working}>
            <span className="google-mark">G</span>
            {working ? "Opening Google…" : "Continue with Google"}
            <ArrowRight size={18} />
          </button>
          </div>
        ) : (
          <div className="setup-message"><strong>Setup needed</strong><span>Add the Supabase variables in Netlify before opening the app.</span></div>
        )}
        {message && <p className="auth-error">{message}</p>}
        <small className="auth-footnote">Lifetime never receives your {appleEnabled ? "Google or Apple" : "Google"} password.</small>
        <div className="auth-legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a></div>
      </section>
    </main>
  );
}
