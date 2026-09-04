import "server-only";
import type { User } from "@supabase/supabase-js";
import type { getAuthenticatedUser } from "@/lib/supabase/server";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"]>;

export async function checkAiAccess(supabase: SupabaseClient, user: User, action: "coach" | "voice") {
  const preference = await supabase.from("finance_spaces").select("data_json").eq("type", "personal").eq("owner_user_id", user.id).maybeSingle();
  const profile = preference.data?.data_json?.profile;
  // The two consents are independent, exactly as Settings and the privacy page state.
  // Enabling Coach must never imply permission to upload a recording.
  const hasConsent = action === "voice" ? profile?.voiceAiEnabled === true : profile?.aiEnabled === true;
  if (preference.error || !hasConsent) {
    return {
      allowed: false,
      message: action === "voice"
        ? "Enable reliable voice transcription before sending a recording."
        : "Turn on Private AI Coach in Settings before using this feature.",
    };
  }

  const limit = action === "voice" ? 20 : 40;
  const rate = await supabase.rpc("consume_finance_rate_limit", { p_action: action, p_limit: limit, p_window_seconds: 3600 });
  if (rate.error && !["PGRST202", "42883"].includes(rate.error.code || "")) {
    return { allowed: false, message: "AI access could not be verified." };
  }
  if (!rate.error && rate.data !== true) return { allowed: false, message: "Hourly AI limit reached. Try again later." };
  return { allowed: true, message: "" };
}
