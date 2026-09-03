import { getAuthenticatedUser } from "@/lib/supabase/server";
import { isTrustedMutation } from "@/lib/server/requestSecurity";

export async function DELETE(request: Request) {
  if (!isTrustedMutation(request)) return Response.json({ error: "Cross-site request blocked" }, { status: 403 });
  const { supabase, user } = await getAuthenticatedUser(request);
  if (!supabase || !user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const result = await supabase.rpc("delete_finance_account");
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json({ ok: true });
}
