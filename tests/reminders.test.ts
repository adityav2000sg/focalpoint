import { describe, expect, it } from "vitest";
import { buildHorizon } from "@/lib/finance";
import { planReminders, reminderId } from "@/lib/reminders";

const bill = (over: Record<string, unknown> = {}) => ({
  id: "r1", name: "Rent", amount: 2800, cadence: "monthly" as const, nextDate: "2026-09-20",
  accountId: "a1", category: "Home", space: "personal" as const, active: true, ...over,
});

const now = new Date("2026-09-07T08:00:00");

describe("reminder scheduling", () => {
  it("schedules a due-day reminder and an early nudge", () => {
    const horizon = buildHorizon([bill()], [], "2026-09-07");
    const plans = planReminders(horizon, "SGD", { hour: 9, leadDays: 1 }, now);
    expect(plans).toHaveLength(2);
    expect(plans[0].at.toISOString().slice(0, 10)).toBe("2026-09-19");
    expect(plans[1].at.toISOString().slice(0, 10)).toBe("2026-09-20");
    expect(plans[1].title).toBe("Rent is due today");
    expect(plans[0].title).toBe("Rent is due tomorrow");
  });

  it("fires at the chosen local hour", () => {
    const horizon = buildHorizon([bill()], [], "2026-09-07");
    const [first] = planReminders(horizon, "SGD", { hour: 18, leadDays: 0 }, now);
    expect(first.at.getHours()).toBe(18);
  });

  it("never schedules a moment that has already passed", () => {
    const horizon = buildHorizon([bill({ nextDate: "2026-08-30" })], [], "2026-09-07");
    expect(planReminders(horizon, "SGD", { hour: 9, leadDays: 1 }, now)).toEqual([]);
  });

  it("skips only the lead when today's hour is still ahead", () => {
    const horizon = buildHorizon([bill({ nextDate: "2026-09-07" })], [], "2026-09-07");
    const plans = planReminders(horizon, "SGD", { hour: 9, leadDays: 1 }, now);
    expect(plans).toHaveLength(1);
    expect(plans[0].title).toBe("Rent is due today");
  });

  it("carries the amount so the reminder is actionable from the lock screen", () => {
    const horizon = buildHorizon([bill()], [], "2026-09-07");
    const plans = planReminders(horizon, "SGD", { hour: 9, leadDays: 0 }, now);
    expect(plans[0].body).toContain("$2,800.00");
  });

  it("includes planned events, not only bills", () => {
    const horizon = buildHorizon([], [{ id: "e1", name: "Flights", amount: 2400, date: "2026-09-25", kind: "travel", space: "personal", includeInPlan: true }], "2026-09-07");
    const plans = planReminders(horizon, "SGD", { hour: 9, leadDays: 0 }, now);
    expect(plans[0].title).toBe("Flights is due today");
    expect(plans[0].body).toContain("Planned event");
  });

  it("gives the same reminder the same id every time it is rebuilt", () => {
    expect(reminderId("recurring:r1:due")).toBe(reminderId("recurring:r1:due"));
    expect(reminderId("recurring:r1:due")).not.toBe(reminderId("recurring:r1:lead"));
    expect(reminderId("recurring:r1:due")).toBeGreaterThanOrEqual(0);
    expect(reminderId("recurring:r1:due")).toBeLessThanOrEqual(2_147_483_647);
  });
});
