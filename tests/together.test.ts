import { describe, expect, it } from "vitest";
import { createEmptyFinanceData } from "../src/lib/finance";
import { hasTogetherAccess, needsTogetherSpace } from "../src/lib/together";

describe("Together setup boundaries", () => {
  it("does not create or reveal Together for a new personal workspace", () => {
    const data = createEmptyFinanceData({ name: "Aditya", householdName: "Aditya’s Together" });
    expect(needsTogetherSpace(data)).toBe(false);
    expect(hasTogetherAccess(data.profile, [], "aditya@example.com")).toBe(false);
  });

  it("creates and reveals Together after a partner email is invited", () => {
    const data = createEmptyFinanceData({ name: "Aditya", householdName: "Aditya’s Together" });
    data.profile.partnerEmail = "mj@example.com";
    expect(needsTogetherSpace(data)).toBe(true);
    expect(hasTogetherAccess(data.profile, [], "aditya@example.com")).toBe(true);
  });

  it("creates Together when a record is deliberately shared", () => {
    const data = createEmptyFinanceData({ name: "Aditya", householdName: "Aditya’s Together" });
    data.goals.push({ id: "goal-1", name: "Home", target: 100_000, current: 0, targetDate: "2030-01-01", space: "household", icon: "home" });
    expect(needsTogetherSpace(data)).toBe(true);
  });

  it("does not reveal Together for an owner-only membership row", () => {
    const data = createEmptyFinanceData({ name: "Aditya", householdName: "Aditya’s Together" });
    expect(hasTogetherAccess(data.profile, [{ email: "aditya@example.com", display_name: "Aditya", role: "owner", status: "active" }], "aditya@example.com")).toBe(false);
  });

  it("reveals Together to an invited or active second member", () => {
    const data = createEmptyFinanceData({ name: "Aditya", householdName: "Aditya’s Together" });
    const members = [
      { email: "aditya@example.com", display_name: "Aditya", role: "owner", status: "active" },
      { email: "mj@example.com", display_name: "MJ", role: "member", status: "pending" },
    ];
    expect(hasTogetherAccess(data.profile, members, "aditya@example.com")).toBe(true);
  });
});
