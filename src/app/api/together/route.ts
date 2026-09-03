import { getAuthenticatedUser } from "@/lib/supabase/server";
import { isTrustedMutation } from "@/lib/server/requestSecurity";

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function DELETE(request: Request) {
  if (!isTrustedMutation(request)) return error("Cross-site request blocked", 403);
  const { supabase, user } = await getAuthenticatedUser(request);
  if (!supabase || !user) return error("Sign in required", 401);

  const body = await request.json().catch(() => ({})) as { action?: "revoke" | "leave" | "close"; email?: string };
  const profile = await supabase.from("finance_profiles").select("active_household_id").eq("user_id", user.id).maybeSingle();
  if (profile.error) return error(profile.error.message, 500);
  const spaceId = profile.data?.active_household_id;
  if (!spaceId) return error("No Together space is active", 404);

  const space = await supabase.from("finance_spaces").select("owner_user_id").eq("id", spaceId).maybeSingle();
  if (space.error) return error(space.error.message, 500);
  const isOwner = space.data?.owner_user_id === user.id;

  if (body.action === "revoke") {
    if (!isOwner) return error("Only the owner can remove an invitation or member", 403);
    const email = body.email?.trim().toLowerCase();
    if (!email || email === user.email?.toLowerCase()) return error("Choose another member", 400);
    const result = await supabase.from("finance_space_members").delete().eq("space_id", spaceId).eq("email", email).neq("role", "owner");
    if (result.error) return error(result.error.message, 500);
    return Response.json({ ok: true });
  }

  if (body.action === "close") {
    if (!isOwner) return error("Only the owner can close this Together space", 403);
    const result = await supabase.from("finance_spaces").delete().eq("id", spaceId);
    if (result.error) return error(result.error.message, 500);
    return Response.json({ ok: true });
  }

  if (body.action === "leave") {
    if (isOwner) return error("The owner must close the Together space", 400);
    const membership = await supabase.from("finance_space_members").delete().eq("space_id", spaceId).eq("user_id", user.id);
    if (membership.error) return error(membership.error.message, 500);
    const clear = await supabase.from("finance_profiles").update({ active_household_id: null }).eq("user_id", user.id);
    if (clear.error) return error(clear.error.message, 500);
    return Response.json({ ok: true });
  }

  return error("Unknown Together action", 400);
}
