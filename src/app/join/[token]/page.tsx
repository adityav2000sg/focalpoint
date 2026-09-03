import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function JoinTogetherPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const nextPath = `/join/${encodeURIComponent(token)}`;
  if (!isSupabaseConfigured()) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  const result = await supabase.rpc("claim_finance_invite_token", { p_invite_token: token });
  if (!result.error && result.data) redirect("/?joined=together");

  return (
    <main className="legal-page join-page">
      <section className="legal-card">
        <p className="eyebrow">Together invitation</p>
        <h1>This invitation could not be joined.</h1>
        <p>It may have been revoked, used with a different email, or created before secure invite links were enabled. Sign in with the exact email that was invited, or ask the owner to resend it.</p>
        <Link className="primary-button legal-button" href="/">Return to Lifetime</Link>
      </section>
    </main>
  );
}
