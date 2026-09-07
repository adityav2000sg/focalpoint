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

  it("keeps net-worth history added on the other device when this device did not change it", () => {
    const base = createEmptyFinanceData({ name: "Peter", householdName: "Home" });
    const point = { date: "2026-09-07", netWorth: 12000, liquid: 7000, investments: 5000, liabilities: 0, currency: "SGD" as const };
    const remote = { ...base, history: [point] };
    expect(mergeFinanceWorkspaces(base, base, remote).history).toEqual([point]);
  });

  it("keeps this device's explicit history update during a conflict", () => {
    const base = createEmptyFinanceData({ name: "Peter", householdName: "Home" });
    const localPoint = { date: "2026-09-07", netWorth: 14000, liquid: 9000, investments: 5000, liabilities: 0, currency: "SGD" as const };
    const remotePoint = { ...localPoint, netWorth: 13000, liquid: 8000 };
    const merged = mergeFinanceWorkspaces(base, { ...base, history: [localPoint] }, { ...base, history: [remotePoint] });
    expect(merged.history).toEqual([localPoint]);
  });
});
