import { describe, expect, it } from "vitest";
import { createEmptyFinanceData } from "@/lib/finance";
import { mergeFinanceWorkspaces } from "@/lib/sync";

describe("mergeFinanceWorkspaces", () => {
  it("keeps independent edits from two devices", () => {
    const base = createEmptyFinanceData({ name: "Peter", householdName: "Home" });
    const local = { ...base, goals: [{ id: "goal-1", name: "Home", target: 10, current: 0, targetDate: "2027-01-01", space: "personal" as const, icon: "home" }] };
    const remote = { ...base, plannedEvents: [{ id: "event-1", name: "Trip", amount: 5, date: "2027-02-01", kind: "travel" as const, space: "personal" as const, includeInPlan: true }] };
    const merged = mergeFinanceWorkspaces(base, local, remote);
    expect(merged.goals).toHaveLength(1);
    expect(merged.plannedEvents).toHaveLength(1);
  });

  it("honours a deletion when the other device left the record unchanged", () => {
    const empty = createEmptyFinanceData({ name: "Peter", householdName: "Home" });
    const account = { id: "a", name: "DBS", institution: "DBS", type: "checking" as const, space: "personal" as const, owner: "Peter", balance: 10, currency: "SGD" as const, accent: "mint" };
    const base = { ...empty, accounts: [account] };
    expect(mergeFinanceWorkspaces(base, { ...base, accounts: [] }, base).accounts).toEqual([]);
  });
});
