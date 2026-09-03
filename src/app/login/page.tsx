import { redirect } from "next/navigation";
import LoginScreen from "@/components/LoginScreen";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/";
  const testing = process.env.E2E_BYPASS_AUTH === "1";
  const configured = testing || isSupabaseConfigured();
  const appleEnabled = process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED === "true";
  if (configured && !testing) {
    const { user } = await getAuthenticatedUser();
    if (user) redirect(next);
  }
  return <LoginScreen configured={configured} appleEnabled={appleEnabled} error={params.error} next={next} />;
}
