import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const appOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || requestUrl.origin;
  if (!isSupabaseConfigured()) return NextResponse.redirect(`${appOrigin}/login?error=Supabase%20is%20not%20configured`);

  const code = requestUrl.searchParams.get("code");
  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${appOrigin}${safeNext(requestUrl.searchParams.get("next"))}`);
  }

  return NextResponse.redirect(`${appOrigin}/login?error=Sign-in%20could%20not%20be%20completed`);
}
