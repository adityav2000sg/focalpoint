import type { FinanceData } from "@/lib/finance";

export type TogetherMember = {
  email: string;
  display_name: string;
  role: string;
  status: string;
};

export function needsTogetherSpace(data: FinanceData) {
  if (data.profile.partnerEmail?.trim()) return true;
  return [
    ...data.accounts,
    ...data.transactions,
    ...data.goals,
    ...data.recurring,
    ...data.spendingPlans,
    ...data.plannedEvents,
    ...data.inbox,
  ].some((item) => item.space === "household");
}

export function hasTogetherAccess(profile: FinanceData["profile"], members: TogetherMember[], viewerEmail: string) {
  if (profile.partnerEmail?.trim()) return true;
  const normalizedViewer = viewerEmail.trim().toLowerCase();
  return members.some((member) => member.email.trim().toLowerCase() !== normalizedViewer);
}
