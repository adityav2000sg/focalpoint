import type { User } from "@supabase/supabase-js";
import { isFinanceData, type FinanceData, type SpaceId } from "@/lib/finance";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { needsTogetherSpace } from "@/lib/together";
import { isTrustedMutation } from "@/lib/server/requestSecurity";

type SpaceRow = {
  id: string;
  type: SpaceId;
  owner_user_id: string;
  data_json: Partial<FinanceData> | null;
  updated_at: string;
  revision?: number;
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

  const [personal, versionedHousehold] = await Promise.all([
    attachRevision(supabase, personalResult.data as SpaceRow | null),
    attachRevision(supabase, household),
  ]);
  return { personal, household: versionedHousehold };
}

async function attachRevision(supabase: SupabaseClient, space: SpaceRow | null) {
  if (!space) return null;
  // This separate lookup keeps the deployment compatible while the hardening
  // migration and the web release roll out independently.
  const result = await supabase.from("finance_spaces").select("revision").eq("id", space.id).maybeSingle();
  if (result.error || typeof result.data?.revision !== "number") return space;
  return { ...space, revision: result.data.revision };
}

function revisionsFor(personal: SpaceRow | null, household: SpaceRow | null) {
  return {
    personal: typeof personal?.revision === "number" ? personal.revision : null,
    household: typeof household?.revision === "number" ? household.revision : null,
  };
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
    history: personalData.history || [],
  };
}

function splitSpace(data: FinanceData, space: SpaceId): Partial<FinanceData> {
  const profile = space === "personal"
    ? {
      name: data.profile.name,
      voiceLocale: data.profile.voiceLocale,
      voiceLexicon: data.profile.voiceLexicon,
      customCategories: data.profile.customCategories,
      onboardedAt: data.profile.onboardedAt,
      appLockEnabled: data.profile.appLockEnabled,
      remindersEnabled: data.profile.remindersEnabled,
      reminderHour: data.profile.reminderHour,
      aiEnabled: data.profile.aiEnabled,
      voiceAiEnabled: data.profile.voiceAiEnabled,
      baseCurrency: data.profile.baseCurrency,
      fxRates: data.profile.fxRates,
      fxUpdatedAt: data.profile.fxUpdatedAt,
    }
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
    history: space === "personal" ? data.history : undefined,
  };
}

async function createSpace(supabase: SupabaseClient, user: User, type: SpaceId, data: FinanceData) {
  const result = await supabase.from("finance_spaces").insert({ type, owner_user_id: user.id, data_json: splitSpace(data, type) }).select("id,type,owner_user_id,data_json,updated_at").single();
  if (result.error) throw result.error;
  return (await attachRevision(supabase, result.data as SpaceRow)) as SpaceRow;
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

async function inviteUrl(supabase: SupabaseClient, household: SpaceRow | null, user: User) {
  if (!household || household.owner_user_id !== user.id) return null;
  const result = await supabase.rpc("get_finance_invite_token", { p_space_id: household.id });
  if (result.error || !result.data) return null;
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return `${origin || ""}/join/${result.data}`;
}

type SavePayload = {
  data?: unknown;
  revisions?: { personal?: number | null; household?: number | null };
  summary?: string;
};

async function saveSpace(
  supabase: SupabaseClient,
  space: SpaceRow,
  data: Partial<FinanceData>,
  expectedRevision: number | null | undefined,
  summary: string,
) {
  if (JSON.stringify(space.data_json || {}) === JSON.stringify(data)) return space.revision ?? null;
  if (typeof space.revision === "number" && typeof expectedRevision === "number") {
    const result = await supabase.rpc("save_finance_space_snapshot", {
      p_space_id: space.id,
      p_expected_revision: expectedRevision,
      p_data: data,
      p_summary: summary,
    });
    if (!result.error) return result.data as number;
    // A missing RPC means the migration has not reached this environment yet.
    if (!["PGRST202", "42883"].includes(result.error.code || "")) throw result.error;
  }
  const result = await supabase.from("finance_spaces").update({ data_json: data }).eq("id", space.id);
  if (result.error) throw result.error;
  return space.revision ?? null;
}

export async function GET(request: Request) {
  const { supabase, user } = await getAuthenticatedUser(request);
  if (!supabase || !user) return apiError("Sign in required", 401);
  try {
    await ensureProfile(supabase, user);
    const { personal, household } = await findSpaces(supabase, user);
    return Response.json({
      data: mergeSpaces(personal, household),
      members: await listMembers(supabase, household?.id),
      revisions: revisionsFor(personal, household),
      inviteUrl: await inviteUrl(supabase, household, user),
      versioned: typeof personal?.revision === "number",
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Finance workspace unavailable");
  }
}

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return apiError("Cross-site request blocked", 403);
  const { supabase, user } = await getAuthenticatedUser(request);
  if (!supabase || !user) return apiError("Sign in required", 401);
  try {
    const body: unknown = await request.json();
    const envelope = isFinanceData(body) ? { data: body } : body as SavePayload;
    const data = envelope.data;
    if (!isFinanceData(data)) return apiError("Invalid finance workspace", 400);
    if (JSON.stringify(data).length > 2_000_000) return apiError("Workspace is too large", 413);

    await ensureProfile(supabase, user);
    const { personal, household } = await ensureSpaces(supabase, user, data);
    const personalRevision = await saveSpace(supabase, personal, splitSpace(data, "personal"), envelope.revisions?.personal, envelope.summary || "Personal workspace updated");
    let householdRevision = household?.revision ?? null;
    if (household) {
      householdRevision = await saveSpace(supabase, household, splitSpace(data, "household"), envelope.revisions?.household, envelope.summary || "Together workspace updated");
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

    const refreshed = await findSpaces(supabase, user);
    return Response.json({
      ok: true,
      members: await listMembers(supabase, household?.id),
      revisions: { personal: personalRevision, household: householdRevision },
      inviteUrl: await inviteUrl(supabase, refreshed.household, user),
      versioned: typeof refreshed.personal?.revision === "number",
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "40001") {
      const current = await findSpaces(supabase, user);
      return Response.json({
        error: "This workspace changed on another device.",
        conflict: true,
        data: mergeSpaces(current.personal, current.household),
        revisions: revisionsFor(current.personal, current.household),
      }, { status: 409 });
    }
    return apiError(error instanceof Error ? error.message : "Finance workspace could not be saved");
  }
}
