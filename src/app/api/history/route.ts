import { isTrustedMutation } from "@/lib/server/requestSecurity";
import { getAuthenticatedUser } from "@/lib/supabase/server";

const migrationMissing = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"]);

function apiError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

async function accessibleSpaces(supabase: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"]>, userId: string) {
  const [profile, personal] = await Promise.all([
    supabase.from("finance_profiles").select("active_household_id").eq("user_id", userId).maybeSingle(),
    supabase.from("finance_spaces").select("id").eq("type", "personal").eq("owner_user_id", userId).maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  if (personal.error) throw personal.error;
  const spaces: Array<{ id: string; scope: "personal" | "household" }> = [];
  if (personal.data?.id) spaces.push({ id: personal.data.id, scope: "personal" });
  if (profile.data?.active_household_id) spaces.push({ id: profile.data.active_household_id, scope: "household" });
  return spaces;
}

export async function GET(request: Request) {
  const { supabase, user } = await getAuthenticatedUser(request);
  if (!supabase || !user) return apiError("Sign in required", 401);
  try {
    const spaces = await accessibleSpaces(supabase, user.id);
    if (!spaces.length) return Response.json({ available: true, entries: [] });
    const result = await supabase
      .from("finance_space_history")
      .select("id,space_id,revision,summary,created_at")
      .in("space_id", spaces.map((space) => space.id))
      .order("created_at", { ascending: false })
      .limit(30);
    if (result.error) {
      if (migrationMissing.has(result.error.code || "")) return Response.json({ available: false, entries: [] });
      throw result.error;
    }
    const scopes = new Map(spaces.map((space) => [space.id, space.scope]));
    return Response.json({
      available: true,
      entries: (result.data || []).map((entry) => ({
        id: entry.id,
        scope: scopes.get(entry.space_id) || "personal",
        revision: entry.revision,
        summary: entry.summary,
        createdAt: entry.created_at,
      })),
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Recovery history is unavailable");
  }
}

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return apiError("Cross-site request blocked", 403);
  const { supabase, user } = await getAuthenticatedUser(request);
  if (!supabase || !user) return apiError("Sign in required", 401);
  try {
    const body = await request.json().catch(() => ({})) as { historyId?: number };
    if (!Number.isSafeInteger(body.historyId) || Number(body.historyId) < 1) return apiError("Choose a valid recovery point", 400);

    const history = await supabase
      .from("finance_space_history")
      .select("space_id,revision,data_json")
      .eq("id", body.historyId)
      .maybeSingle();
    if (history.error) {
      if (migrationMissing.has(history.error.code || "")) return apiError("Apply the product hardening migration before using recovery history", 503);
      throw history.error;
    }
    if (!history.data) return apiError("That recovery point is no longer available", 404);

    const space = await supabase.from("finance_spaces").select("revision").eq("id", history.data.space_id).maybeSingle();
    if (space.error) throw space.error;
    if (typeof space.data?.revision !== "number") return apiError("Recovery history is not enabled for this workspace", 503);

    const restored = await supabase.rpc("save_finance_space_snapshot", {
      p_space_id: history.data.space_id,
      p_expected_revision: space.data.revision,
      p_data: history.data.data_json,
      p_summary: `Restored revision ${history.data.revision}`,
    });
    if (restored.error) throw restored.error;
    return Response.json({ ok: true, revision: restored.data });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "40001") return apiError("The workspace changed while restoring. Reload and choose the recovery point again.", 409);
    return apiError(error instanceof Error ? error.message : "That recovery point could not be restored");
  }
}
