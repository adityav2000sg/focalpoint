import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { createClient, type Session } from "@supabase/supabase-js";
import { Apple, ArrowRight, Leaf, LockKeyhole, Users } from "lucide-react";
import LifetimeFinanceHub from "@/components/LifetimeFinanceHub";
import "./mobile.css";

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_KEY__: string;
declare const __SITE_URL__: string;

const configured = Boolean(__SUPABASE_URL__ && __SUPABASE_KEY__ && !__SUPABASE_URL__.includes("your-project"));
const supabase = configured ? createClient(__SUPABASE_URL__, __SUPABASE_KEY__, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !Capacitor.isNativePlatform() },
}) : null;

function NativeLogin() {
  const [working, setWorking] = useState<"google" | "apple" | null>(null);
  const [message, setMessage] = useState("");

  async function signIn(provider: "google" | "apple") {
    if (!supabase) return;
    setWorking(provider); setMessage("");
    const native = Capacitor.isNativePlatform();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: native ? "com.adityav2000.focalpoint://auth/callback" : window.location.origin,
        skipBrowserRedirect: native,
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
      },
    });
    if (error) { setMessage(error.message); setWorking(null); return; }
    if (native && data.url) await Browser.open({ url: data.url, presentationStyle: "popover" });
  }

  return <main className="auth-page native-auth-page"><section className="auth-card">
    <div className="auth-brand"><span><Leaf size={22} /></span><strong>LIFETIME</strong></div>
    <p className="eyebrow">Your financial home</p>
    <h1>One calm place for the money you manage alone and together.</h1>
    <p className="auth-copy">Private by default, shared intentionally, and built so transfers never pretend to be spending.</p>
    <div className="auth-promises"><span><LockKeyhole size={17} /> Your personal records stay yours</span><span><Users size={17} /> Share only what you put in Together</span></div>
    {configured ? <div className="auth-buttons">
      <button className="google-button" onClick={() => void signIn("google")} disabled={Boolean(working)}><span className="google-mark">G</span>{working === "google" ? "Opening Google…" : "Continue with Google"}<ArrowRight size={18} /></button>
      <button className="apple-button" onClick={() => void signIn("apple")} disabled={Boolean(working)}><Apple size={19} />{working === "apple" ? "Opening Apple…" : "Continue with Apple"}<ArrowRight size={18} /></button>
    </div> : <div className="setup-message"><strong>Build setup needed</strong><span>Add the Supabase public URL and publishable key before creating the iOS build.</span></div>}
    {message && <p className="auth-error">{message}</p>}
    <small className="auth-footnote">Lifetime never receives your Google or Apple password.</small>
    <div className="auth-legal"><a href={`${__SITE_URL__}/privacy`} target="_blank" rel="noreferrer">Privacy</a><a href={`${__SITE_URL__}/terms`} target="_blank" rel="noreferrer">Terms</a><a href={`${__SITE_URL__}/support`} target="_blank" rel="noreferrer">Support</a></div>
  </section></main>;
}

function MobileApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    const client = supabase;
    void client.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const auth = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    let removeUrlListener: (() => Promise<void>) | undefined;
    if (Capacitor.isNativePlatform()) {
      void App.addListener("appUrlOpen", async ({ url }) => {
        if (!url.startsWith("com.adityav2000.focalpoint://auth/callback")) return;
        await Browser.close().catch(() => undefined);
        const code = new URL(url).searchParams.get("code");
        if (!code) return;
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (!error) setReady(true);
      }).then((listener) => { removeUrlListener = () => listener.remove(); });
    }
    return () => { auth.data.subscription.unsubscribe(); void removeUrlListener?.(); };
  }, []);

  if (!ready) return <main className="native-loading"><span><Leaf size={28} /></span><strong>Opening Lifetime…</strong></main>;
  if (!session) return <NativeLogin />;
  const email = session.user.email || "Signed-in user";
  const displayName = String(session.user.user_metadata.full_name || session.user.user_metadata.name || email.split("@")[0]);
  return <LifetimeFinanceHub
    viewer={{ userId: session.user.id, displayName, email }}
    apiBaseUrl={__SITE_URL__}
    publicBaseUrl={__SITE_URL__}
    accessToken={session.access_token}
    onSignOut={async () => { await supabase?.auth.signOut(); setSession(null); }}
  />;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><MobileApp /></React.StrictMode>);
