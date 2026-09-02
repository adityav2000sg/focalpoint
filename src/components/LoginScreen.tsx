"use client";

import { useState } from "react";
import { ArrowRight, Leaf, LockKeyhole, Users } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginScreen({ configured, error }: { configured: boolean; error?: string }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState(error || "");

  async function signIn() {
    if (!configured) return;
    setWorking(true);
    setMessage("");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (authError) throw authError;
    } catch (authError) {
      setWorking(false);
      setMessage(authError instanceof Error ? authError.message : "Google sign-in could not start.");
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
          <button className="google-button" onClick={signIn} disabled={working}>
            <span className="google-mark">G</span>
            {working ? "Opening Google…" : "Continue with Google"}
            <ArrowRight size={18} />
          </button>
        ) : (
          <div className="setup-message"><strong>Setup needed</strong><span>Add the Supabase variables in Netlify before opening the app.</span></div>
        )}
        {message && <p className="auth-error">{message}</p>}
        <small className="auth-footnote">Lifetime never receives your Google password.</small>
      </section>
    </main>
  );
}
