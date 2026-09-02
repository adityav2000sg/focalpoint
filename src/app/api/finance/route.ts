import type { User } from "@supabase/supabase-js";
import { isFinanceData, type FinanceData, type SpaceId } from "@/lib/finance";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { needsTogetherSpace } from "@/lib/together";

type SpaceRow = {
  id: string;
  type: SpaceId;
  owner_user_id: string;
  data_json: Partial<FinanceData> | null;
  updated_at: string;
};

type MemberRow = { email: string; display_name: string; role: string; status: string };
type SupabaseClient = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"]>;

function displayName(user: User) {
  return user.user_metadata.full_name || user.user_metadata.name || user.email?.split("@")[0] || "You";
}

function apiError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

async function ensureProfile(supabase: SupabaseClient, user: User) {
  const { error } = await supabase.from("finance_profiles").upsert({
    user_id: user.id,
    email: user.email?.toLowerCase() || "",
    display_name: displayName(user),
  }, { onConflict: "user_id" });
  if (error) throw error;
  const claim = await supabase.rpc("claim_finance_invite");
  if (claim.error) throw claim.error;
}

async function findSpaces(supabase: SupabaseClient, user: User) {
  const [profileResult, personalResult] = await Promise.all([
    supabase.from("finance_profiles").select("active_household_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("finance_spaces").select("id,type,owner_user_id,data_json,updated_at").eq("type", "personal").eq("owner_user_id", user.id).maybeSingle(),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (personalResult.error) throw personalResult.error;

  let household: SpaceRow | null = null;
  let activeHouseholdId = profileResult.data?.active_household_id as string | null | undefined;
  if (activeHouseholdId) {
    const result = await supabase.from("finance_spaces").select("id,type,owner_user_id,data_json,updated_at").eq("id", activeHouseholdId).eq("type", "household").maybeSingle();
    if (result.error) throw result.error;
    household = result.data as SpaceRow | null;
    if (!household) activeHouseholdId = null;
  }
  if (!activeHouseholdId) {
    const membership = await supabase.from("finance_space_members").select("space_id").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (membership.error) throw membership.error;
    activeHouseholdId = membership.data?.space_id;
    if (activeHouseholdId) {
      const update = await supabase.from("finance_profiles").update({ active_household_id: activeHouseholdId }).eq("user_id", user.id);
      if (update.error) throw update.error;
    }
  }
  if (activeHouseholdId && !household) {
    const result = await supabase.from("finance_spaces").select("id,type,owner_user_id,data_json,updated_at").eq("id", activeHouseholdId).eq("type", "household").maybeSingle();
    if (result.error) throw result.error;
    household = result.data as SpaceRow | null;
  }

  return { personal: personalResult.data as SpaceRow | null, household };
}

function mergeSpaces(personal: SpaceRow | null, household: SpaceRow | null): Partial<FinanceData> | null {
  if (!personal && !household) return null;
  const personalData = personal?.data_json || {};
  const householdData = household?.data_json || {};
  return {
    version: 3,
    profile: { ...(personalData.profile || {}), ...(householdData.profile || {}) } as FinanceData["profile"],
    accounts: [...(personalData.accounts || []), ...(householdData.accounts || [])],
    transactions: [...(personalData.transactions || []), ...(householdData.transactions || [])],
    goals: [...(personalData.goals || []), ...(householdData.goals || [])],
    recurring: [...(personalData.recurring || []), ...(householdData.recurring || [])],
    spendingPlans: [...(personalData.spendingPlans || []), ...(householdData.spendingPlans || [])],
    plannedEvents: [...(personalData.plannedEvents || []), ...(householdData.plannedEvents || [])],
    inbox: [...(personalData.inbox || []), ...(householdData.inbox || [])],
  };
}

function splitSpace(data: FinanceData, space: SpaceId): Partial<FinanceData> {
  const profile = space === "personal"
    ? { name: data.profile.name, voiceLocale: data.profile.voiceLocale, voiceLexicon: data.profile.voiceLexicon }
    : { partnerName: data.profile.partnerName, partnerEmail: data.profile.partnerEmail, householdName: data.profile.householdName, householdStartedAt: data.profile.householdStartedAt };
  return {
    version: 3,
    profile: profile as unknown as FinanceData["profile"],
    accounts: data.accounts.filter((item) => item.space === space),
    transactions: data.transactions.filter((item) => item.space === space),
    goals: data.goals.filter((item) => item.space === space),
    recurring: data.recurring.filter((item) => item.space === space),
    spendingPlans: data.spendingPlans.filter((item) => item.space === space),
    plannedEvents: data.plannedEvents.filter((item) => item.space === space),
    inbox: data.inbox.filter((item) => item.space === space),
  };
}

async function createSpace(supabase: SupabaseClient, user: User, type: SpaceId, data: FinanceData) {
  const result = await supabase.from("finance_spaces").insert({ type, owner_user_id: user.id, data_json: splitSpace(data, type) }).select("id,type,owner_user_id,data_json,updated_at").single();
  if (result.error) throw result.error;
  return result.data as SpaceRow;
}

async function ensureSpaces(supabase: SupabaseClient, user: User, data: FinanceData) {
  let { personal, household } = await findSpaces(supabase, user);
  if (!personal) personal = await createSpace(supabase, user, "personal", data);
  if (!household && needsTogetherSpace(data)) {
    const owned = await supabase.from("finance_spaces").select("id,type,owner_user_id,data_json,updated_at").eq("type", "household").eq("owner_user_id", user.id).maybeSingle();
    if (owned.error) throw owned.error;
    household = (owned.data as SpaceRow | null) || await createSpace(supabase, user, "household", data);
    const membership = await supabase.from("finance_space_members").upsert({
      space_id: household.id,
      user_id: user.id,
      email: user.email?.toLowerCase() || "",
      display_name: displayName(user),
      role: "owner",
      status: "active",
    }, { onConflict: "space_id,email" });
    if (membership.error) throw membership.error;
    const profile = await supabase.from("finance_profiles").update({ active_household_id: household.id }).eq("user_id", user.id);
    if (profile.error) throw profile.error;
  }
  return { personal, household };
}

async function listMembers(supabase: SupabaseClient, householdId?: string) {
  if (!householdId) return [];
  const result = await supabase.from("finance_space_members").select("email,display_name,role,status").eq("space_id", householdId).order("created_at", { ascending: true });
  if (result.error) throw result.error;
  return result.data as MemberRow[];
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return apiError("Sign in required", 401);
  try {
    await ensureProfile(supabase, user);
    const { personal, household } = await findSpaces(supabase, user);
    return Response.json({ data: mergeSpaces(personal, household), members: await listMembers(supabase, household?.id) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Finance workspace unavailable");
  }
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return apiError("Sign in required", 401);
  try {
    const data: unknown = await request.json();
    if (!isFinanceData(data)) return apiError("Invalid finance workspace", 400);
    if (JSON.stringify(data).length > 2_000_000) return apiError("Workspace is too large", 413);

    await ensureProfile(supabase, user);
    const { personal, household } = await ensureSpaces(supabase, user, data);
    const personalUpdate = await supabase.from("finance_spaces").update({ data_json: splitSpace(data, "personal") }).eq("id", personal.id);
    if (personalUpdate.error) throw personalUpdate.error;
    if (household) {
      const householdUpdate = await supabase.from("finance_spaces").update({ data_json: splitSpace(data, "household") }).eq("id", household.id);
      if (householdUpdate.error) throw householdUpdate.error;
    }

    if (household?.owner_user_id === user.id) {
      const inviteEmail = data.profile.partnerEmail?.trim().toLowerCase();
      let pendingCleanup = supabase.from("finance_space_members").delete().eq("space_id", household.id).eq("status", "pending");
      if (inviteEmail) pendingCleanup = pendingCleanup.neq("email", inviteEmail);
      const cleanup = await pendingCleanup;
      if (cleanup.error) throw cleanup.error;
      if (inviteEmail && inviteEmail !== user.email?.toLowerCase()) {
        const invite = await supabase.from("finance_space_members").upsert({
          space_id: household.id,
          email: inviteEmail,
          display_name: data.profile.partnerName || "Partner",
          role: "member",
        }, { onConflict: "space_id,email" });
        if (invite.error) throw invite.error;
      }
    }

    return Response.json({ ok: true, members: await listMembers(supabase, household?.id) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Finance workspace could not be saved");
  }
}
