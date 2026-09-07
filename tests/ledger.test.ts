import { describe, expect, it } from "vitest";
import {
  Account,
  FinanceData,
  Transaction,
  applyTransaction,
  advanceRecurringDate,
  buildHorizon,
  convertToBase,
  formatAccountBalance,
  isCurrencyCode,
  sumAccountsInBase,
  sumTransactionsInBase,
  unratedCurrencies,
  countOverdue,
  daysUntil,
  dueStatus,
  buildForecast,
  createEmptyFinanceData,
  formatCoverMonths,
  isFinanceData,
  monthKey,
} from "@/lib/finance";

describe("first-run workspace", () => {
  it("starts without invented financial records", () => {
    const data = createEmptyFinanceData({ name: "Aditya", householdName: "Vaidya household" });
    expect(data.profile.name).toBe("Aditya");
    expect(data.accounts).toEqual([]);
    expect(data.transactions).toEqual([]);
    expect(data.goals).toEqual([]);
    expect(data.recurring).toEqual([]);
  });

  it("accepts complete backups and rejects partial workspace files", () => {
    const data = createEmptyFinanceData({ name: "Aditya", householdName: "Vaidya household" });
    expect(isFinanceData(data)).toBe(true);
    expect(isFinanceData({ version: 3, profile: data.profile, accounts: [], transactions: [] })).toBe(false);
    expect(isFinanceData({ ...data, accounts: [null] })).toBe(false);
    expect(isFinanceData({ ...data, transactions: [{ amount: "not-a-number" }] })).toBe(false);
    expect(isFinanceData(null)).toBe(false);
  });
});

function account(id: string, balance: number, overrides: Partial<Account> = {}): Account {
  return {
    id,
    name: id,
    institution: "Test Bank",
    type: "checking",
    space: "personal",
    owner: "You",
    balance,
    currency: "SGD",
    accent: "mint",
    ...overrides,
  };
}

function transaction(overrides: Partial<Transaction> & Pick<Transaction, "id" | "type" | "amount">): Transaction {
  return {
    date: "2026-08-10",
    description: "Test",
    category: "Other",
    accountId: "a",
    space: "personal",
    source: "manual",
    ...overrides,
  };
}

function workspace(overrides: Partial<FinanceData> = {}): FinanceData {
  return {
    version: 3,
    profile: { name: "You", partnerName: "Partner", householdName: "Household" },
    accounts: [],
    transactions: [],
    goals: [],
    recurring: [],
    spendingPlans: [],
    plannedEvents: [],
    inbox: [],
    ...overrides,
  };
}

describe("transfers", () => {
  const accounts = [account("a", 1000), account("b", 500)];
  const transfer = transaction({ id: "t1", type: "transfer", amount: 250, accountId: "a", transferAccountId: "b" });

  it("nets to zero across the two accounts", () => {
    const before = accounts.reduce((sum, item) => sum + item.balance, 0);
    const after = applyTransaction(accounts, transfer).reduce((sum, item) => sum + item.balance, 0);
    expect(after).toBe(before);
  });

  it("moves the amount from source to destination", () => {
    const result = applyTransaction(accounts, transfer);
    expect(result.find((item) => item.id === "a")?.balance).toBe(750);
    expect(result.find((item) => item.id === "b")?.balance).toBe(750);
  });

  it("counts as neither income nor spending in the forecast", () => {
    const data = workspace({
      accounts,
      transactions: [
        transfer,
        transaction({ id: "t2", type: "income", amount: 3000, date: "2026-08-01" }),
        transaction({ id: "t3", type: "expense", amount: 1000, date: "2026-08-05" }),
      ],
    });
    const forecast = buildForecast(data, "all");
    expect(forecast.averageIncome).toBe(3000);
    expect(forecast.averageSpending).toBe(1000);
  });
});

describe("balance recomputation", () => {
  it("does not apply imported statement history to a current balance", () => {
    const accounts = [account("a", 1000)];
    const imported = transaction({ id: "t-history", type: "expense", amount: 320.5, source: "sheet", affectsBalance: false });
    expect(applyTransaction(accounts, imported)[0].balance).toBe(1000);
    expect(applyTransaction(accounts, imported, -1)[0].balance).toBe(1000);
  });

  it("restores the original balance after an edit", () => {
    const accounts = [account("a", 1000)];
    const original = transaction({ id: "t1", type: "expense", amount: 100 });
    const edited = { ...original, amount: 250 };

    // The app reverses the old transaction, then applies the new one.
    const reversed = applyTransaction(accounts, original, -1);
    const result = applyTransaction(applyTransaction(accounts, original), original, -1);
    expect(result[0].balance).toBe(1000);

    const afterEdit = applyTransaction(applyTransaction(applyTransaction(accounts, original), original, -1), edited);
    expect(afterEdit[0].balance).toBe(750);
    expect(reversed[0].balance).toBe(1100);
  });

  it("restores the balance after a delete", () => {
    const accounts = [account("a", 1000)];
    const expense = transaction({ id: "t1", type: "expense", amount: 320.5 });
    const applied = applyTransaction(accounts, expense);
    expect(applied[0].balance).toBe(679.5);
    expect(applyTransaction(applied, expense, -1)[0].balance).toBe(1000);
  });

  it("restores both sides after deleting a transfer", () => {
    const accounts = [account("a", 1000), account("b", 500)];
    const transfer = transaction({ id: "t1", type: "transfer", amount: 400, accountId: "a", transferAccountId: "b" });
    const applied = applyTransaction(accounts, transfer);
    const restored = applyTransaction(applied, transfer, -1);
    expect(restored.find((item) => item.id === "a")?.balance).toBe(1000);
    expect(restored.find((item) => item.id === "b")?.balance).toBe(500);
  });

  it("adds income to the balance and reverses cleanly", () => {
    const accounts = [account("a", 1000)];
    const income = transaction({ id: "t1", type: "income", amount: 2500 });
    const applied = applyTransaction(accounts, income);
    expect(applied[0].balance).toBe(3500);
    expect(applyTransaction(applied, income, -1)[0].balance).toBe(1000);
  });
});

describe("recurring schedule advancement", () => {
  it("keeps month-end payments at the end of a shorter month", () => {
    expect(advanceRecurringDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceRecurringDate("2026-01-31", "quarterly")).toBe("2026-04-30");
  });

  it("handles leap-day yearly payments", () => {
    expect(advanceRecurringDate("2024-02-29", "yearly")).toBe("2025-02-28");
  });
});

describe("month assignment", () => {
  it("assigns a transaction to the month of its date, not its position", () => {
    expect(monthKey("2026-01-31")).toBe("2026-01");
    expect(monthKey("2026-12-01")).toBe("2026-12");
  });

  it("groups by date even when transactions are stored out of order", () => {
    const data = workspace({
      accounts: [account("a", 0)],
      transactions: [
        transaction({ id: "t1", type: "income", amount: 500, date: "2026-03-15" }),
        transaction({ id: "t2", type: "income", amount: 100, date: "2026-01-15" }),
        transaction({ id: "t3", type: "income", amount: 300, date: "2026-02-15" }),
      ],
    });
    const forecast = buildForecast(data, "all");
    // Three distinct months, regardless of the order they were added in.
    expect(forecast.historyMonths).toBe(3);
    expect(forecast.averageIncome).toBe(300);
  });
});

describe("buildForecast chronology", () => {
  it("keeps the six most recent months, not the six most recently inserted", () => {
    // Eight months of history, deliberately shuffled. The two oldest months
    // (2026-01 and 2026-02) carry a distinctive value that must be excluded.
    const dates = [
      { date: "2026-01-10", amount: 100000 },
      { date: "2026-02-10", amount: 100000 },
      { date: "2026-03-10", amount: 1000 },
      { date: "2026-04-10", amount: 1000 },
      { date: "2026-05-10", amount: 1000 },
      { date: "2026-06-10", amount: 1000 },
      { date: "2026-07-10", amount: 1000 },
      { date: "2026-08-10", amount: 1000 },
    ];
    const shuffled = [dates[0], dates[7], dates[3], dates[1], dates[6], dates[2], dates[5], dates[4]];
    const data = workspace({
      accounts: [account("a", 0)],
      transactions: shuffled.map((item, index) => transaction({ id: `t${index}`, type: "income", amount: item.amount, date: item.date })),
    });

    const forecast = buildForecast(data, "all");
    expect(forecast.historyMonths).toBe(6);
    // Only the six most recent months (all 1000) should be averaged.
    expect(forecast.averageIncome).toBe(1000);
  });
});

describe("monthlySurplus", () => {
  it("reports a deficit as a negative number", () => {
    const data = workspace({
      accounts: [account("a", 5000)],
      transactions: [
        transaction({ id: "t1", type: "income", amount: 3000, date: "2026-08-01" }),
        transaction({ id: "t2", type: "expense", amount: 4200, date: "2026-08-05" }),
      ],
    });
    const forecast = buildForecast(data, "all");
    expect(forecast.monthlySurplus).toBe(-1200);
  });

  it("still reports a surplus as positive", () => {
    const data = workspace({
      accounts: [account("a", 5000)],
      transactions: [
        transaction({ id: "t1", type: "income", amount: 4000, date: "2026-08-01" }),
        transaction({ id: "t2", type: "expense", amount: 1500, date: "2026-08-05" }),
      ],
    });
    expect(buildForecast(data, "all").monthlySurplus).toBe(2500);
  });

  it("does not fund goals out of a deficit", () => {
    const data = workspace({
      accounts: [account("a", 5000)],
      transactions: [
        transaction({ id: "t1", type: "income", amount: 1000, date: "2026-08-01" }),
        transaction({ id: "t2", type: "expense", amount: 3000, date: "2026-08-05" }),
      ],
      goals: [{ id: "g1", name: "Fund", target: 10000, current: 0, targetDate: "2027-08-01", space: "personal", icon: "spark" }],
    });
    const forecast = buildForecast(data, "all");
    expect(forecast.monthlySurplus).toBe(-2000);
    expect(forecast.goalForecasts[0].monthlyContribution).toBe(0);
    expect(forecast.goalForecasts[0].onTrack).toBe(false);
  });
});

describe("emergency cover formatting", () => {
  it("keeps a decimal only while the runway is short enough to act on", () => {
    expect(formatCoverMonths(3.45)).toBe("3.5 months");
    expect(formatCoverMonths(1.04)).toBe("1.0 month");
    expect(formatCoverMonths(11.92)).toBe("11.9 months");
  });

  it("drops false precision once cover is long", () => {
    expect(formatCoverMonths(12)).toBe("12 months");
    expect(formatCoverMonths(19.6)).toBe("20 months");
  });

  it("caps runaway figures produced by a thin spending history", () => {
    expect(formatCoverMonths(24)).toBe("24+ months");
    expect(formatCoverMonths(130.7)).toBe("24+ months");
    expect(formatCoverMonths(Number.POSITIVE_INFINITY)).toBe("0 months");
  });

  it("reports nothing when there is no spending to divide by", () => {
    expect(formatCoverMonths(0)).toBe("0 months");
    expect(formatCoverMonths(-4)).toBe("0 months");
  });
});

const recurringItem = (over: Partial<import("@/lib/finance").RecurringItem> = {}) => ({
  id: "r1", name: "Spotify", amount: 16.9, cadence: "monthly" as const, nextDate: "2026-09-25",
  accountId: "a1", category: "Subscriptions", space: "personal" as const, active: true, ...over,
});

const eventItem = (over: Partial<import("@/lib/finance").PlannedEvent> = {}) => ({
  id: "e1", name: "Japan flights", amount: 2400, date: "2026-09-10",
  kind: "travel" as const, space: "personal" as const, includeInPlan: true, ...over,
});

describe("due status", () => {
  it("separates passed, current and approaching dates", () => {
    expect(dueStatus("2026-09-01", "2026-09-04")).toBe("overdue");
    expect(dueStatus("2026-09-04", "2026-09-04")).toBe("today");
    expect(dueStatus("2026-09-11", "2026-09-04")).toBe("soon");
    expect(dueStatus("2026-09-12", "2026-09-04")).toBe("scheduled");
  });

  it("counts whole days in both directions", () => {
    expect(daysUntil("2026-09-09", "2026-09-04")).toBe(5);
    expect(daysUntil("2026-08-30", "2026-09-04")).toBe(-5);
    expect(daysUntil("2026-09-04", "2026-09-04")).toBe(0);
  });

  it("does not lose a day across a month or year boundary", () => {
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
    expect(daysUntil("2026-03-01", "2026-02-28")).toBe(1);
  });
});

describe("horizon", () => {
  it("orders by date rather than the order records were created", () => {
    const horizon = buildHorizon([
      recurringItem({ id: "r1", name: "Spotify", nextDate: "2026-09-25" }),
      recurringItem({ id: "r2", name: "Rent", nextDate: "2026-09-01" }),
      recurringItem({ id: "r3", name: "Insurance", nextDate: "2026-09-05" }),
    ], [], "2026-09-04");
    expect(horizon.map((item) => item.name)).toEqual(["Rent", "Insurance", "Spotify"]);
  });

  it("merges planned events into the same ordered list", () => {
    const horizon = buildHorizon(
      [recurringItem({ nextDate: "2026-09-25" })],
      [eventItem({ date: "2026-09-10" })],
      "2026-09-04",
    );
    expect(horizon.map((item) => [item.kind, item.name])).toEqual([["event", "Japan flights"], ["recurring", "Spotify"]]);
  });

  it("keeps a passed date at the top as overdue instead of hiding it", () => {
    const horizon = buildHorizon(
      [recurringItem({ id: "r1", name: "Rent", nextDate: "2026-08-28" }), recurringItem({ id: "r2", name: "Spotify", nextDate: "2026-09-25" })],
      [],
      "2026-09-04",
    );
    expect(horizon[0].name).toBe("Rent");
    expect(horizon[0].status).toBe("overdue");
    expect(horizon[0].daysAway).toBe(-7);
    expect(countOverdue(horizon)).toBe(1);
  });

  it("leaves paused recurring payments out entirely", () => {
    expect(buildHorizon([recurringItem({ active: false })], [], "2026-09-04")).toHaveLength(0);
  });

  it("reports nothing to chase when every date is still ahead", () => {
    expect(countOverdue(buildHorizon([recurringItem({ nextDate: "2026-09-25" })], [], "2026-09-04"))).toBe(0);
  });
});

const acct = (over: Partial<Account> = {}): Account => ({
  id: "a1", name: "Everyday", institution: "DBS", type: "checking", space: "personal",
  owner: "Peter", balance: 1000, currency: "SGD", accent: "#9fe1c2", ...over,
});

describe("currency conversion", () => {
  it("passes a base-currency amount through untouched", () => {
    expect(convertToBase(1000, "SGD", "SGD", {})).toBe(1000);
  });

  it("applies a user-set rate", () => {
    expect(convertToBase(100, "USD", "SGD", { USD: 1.35 })).toBeCloseTo(135, 6);
  });

  it("refuses to guess when no rate is set, rather than assuming parity", () => {
    expect(convertToBase(100, "USD", "SGD", {})).toBeNull();
    expect(convertToBase(100, "USD", "SGD", { USD: 0 })).toBeNull();
    expect(convertToBase(100, "USD", "SGD", { USD: Number.NaN })).toBeNull();
  });

  it("recognises only supported codes", () => {
    expect(isCurrencyCode("SGD")).toBe(true);
    expect(isCurrencyCode("XYZ")).toBe(false);
    expect(isCurrencyCode(42)).toBe(false);
  });
});

describe("aggregating across currencies", () => {
  it("converts every balance into the base currency", () => {
    const result = sumAccountsInBase(
      [acct({ id: "a1", balance: 1000, currency: "SGD" }), acct({ id: "a2", balance: 100, currency: "USD" })],
      "SGD",
      { USD: 1.35 },
    );
    expect(result.total).toBeCloseTo(1135, 6);
    expect(result.missing).toEqual([]);
  });

  it("excludes an unconvertible balance and names the currency instead of silently adding it", () => {
    const accounts = [acct({ id: "a1", balance: 1000, currency: "SGD" }), acct({ id: "a2", balance: 100, currency: "USD" })];
    const result = sumAccountsInBase(accounts, "SGD", {});
    expect(result.total).toBe(1000);
    expect(result.missing).toEqual(["USD"]);
    expect(unratedCurrencies(accounts, "SGD", {})).toEqual(["USD"]);
  });

  it("prices a transaction in the currency of the account it belongs to", () => {
    const accounts = [acct({ id: "a2", currency: "USD" })];
    const tx: Transaction = { id: "t1", type: "expense", amount: 100, date: "2026-09-01", description: "Hotel", category: "Travel", accountId: "a2", space: "personal", source: "manual" };
    expect(sumTransactionsInBase([tx], accounts, "SGD", { USD: 1.35 }).total).toBeCloseTo(135, 6);
  });
});

describe("showing an account's own currency", () => {
  // Intl separates a currency code from the number with a non-breaking space.
  const shown = (value: number, currency: Parameters<typeof formatAccountBalance>[1], base: Parameters<typeof formatAccountBalance>[2]) =>
    formatAccountBalance(value, currency, base).replace(/\u00a0/g, " ");

  it("uses the plain symbol for the currency the user reports in", () => {
    expect(shown(100, "SGD", "SGD")).toBe("$100.00");
  });

  it("names a foreign currency, because en-SG renders SGD and USD identically", () => {
    expect(shown(100, "USD", "SGD")).toBe("USD 100.00");
    expect(shown(100, "USD", "SGD")).not.toBe(shown(100, "SGD", "SGD"));
  });

  it("follows the reporting currency rather than assuming SGD is local", () => {
    expect(shown(100, "USD", "USD")).toBe("$100.00");
    expect(shown(100, "SGD", "USD")).toBe("SGD 100.00");
  });
});

describe("goals and events in their own currency", () => {
  const workspace = (over: Partial<FinanceData> = {}): FinanceData => ({
    ...createEmptyFinanceData({ name: "P", householdName: "H" }),
    profile: { ...createEmptyFinanceData({ name: "P", householdName: "H" }).profile, baseCurrency: "SGD", fxRates: { USD: 1.35 } },
    accounts: [acct({ id: "a1", balance: 10_000, currency: "SGD" })],
    transactions: [
      { id: "t1", type: "income", amount: 5000, date: "2026-08-05", description: "Salary", category: "Income", accountId: "a1", space: "personal", source: "manual" },
      { id: "t2", type: "expense", amount: 2000, date: "2026-08-06", description: "Living", category: "Home", accountId: "a1", space: "personal", source: "manual" },
    ],
    ...over,
  });

  it("converts a foreign goal target before measuring it against the surplus", () => {
    const usdGoal = { id: "g1", name: "US trip", target: 1000, current: 0, targetDate: "2027-06-01", space: "personal" as const, icon: "plane", monthlyContribution: 100, currency: "USD" as const };
    const forecast = buildForecast(workspace({ goals: [usdGoal] }), "personal");
    // 100 USD of contribution is 135 SGD against a 3000 SGD surplus.
    expect(forecast.safeToSpend).toBeCloseTo(3000 - 135, 6);
    // 1000 USD remaining is 1350 SGD, at 135 SGD a month.
    expect(forecast.goalForecasts[0].monthsRemaining).toBe(10);
  });

  it("converts a foreign planned event when it delays a goal", () => {
    const goal = { id: "g1", name: "Fund", target: 2000, current: 0, targetDate: "2027-06-01", space: "personal" as const, icon: "spark", monthlyContribution: 100 };
    const event = { id: "e1", name: "Flights", amount: 100, date: "2027-01-01", kind: "travel" as const, space: "personal" as const, includeInPlan: true, currency: "USD" as const };
    const forecast = buildForecast(workspace({ goals: [goal], plannedEvents: [event] }), "personal");
    // 100 USD of planned cost is 135 SGD, which is two months of a 100 SGD contribution.
    expect(forecast.goalForecasts[0].plannedEventDelayMonths).toBe(2);
  });

  it("rejects a restored backup carrying a currency it does not understand", () => {
    const bad = workspace({ goals: [{ id: "g1", name: "X", target: 1, current: 0, targetDate: "2027-01-01", space: "personal", icon: "spark", currency: "XYZ" } as never] });
    expect(isFinanceData(bad)).toBe(false);
  });
});
