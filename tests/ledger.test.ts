import { describe, expect, it } from "vitest";
import {
  Account,
  FinanceData,
  Transaction,
  applyTransaction,
  advanceRecurringDate,
  buildForecast,
  createEmptyFinanceData,
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
