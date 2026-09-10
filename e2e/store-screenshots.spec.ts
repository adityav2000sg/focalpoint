import { test, type Page } from "@playwright/test";

/**
 * Renders the App Store listing screenshots from the real app against a representative
 * workspace. Run with `npm run store:screenshots`; output lands in store-assets/screenshots.
 */

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

// Ninety days of history so the chart has a real shape rather than an empty state.
const history = Array.from({ length: 90 }, (_, index) => {
  const value = 38_500 + index * 235 + Math.sin(index / 7) * 1_450;
  return {
    date: iso(index - 89),
    netWorth: Number(value.toFixed(2)),
    liquid: Number((value * 0.58).toFixed(2)),
    investments: Number((value * 0.47).toFixed(2)),
    liabilities: Number((value * 0.05).toFixed(2)),
    currency: "SGD" as const,
  };
});

const workspace = {
  version: 3,
  profile: {
    name: "Peter Parker", partnerName: "MJ", householdName: "Our Home", partnerEmail: "",
    voiceLocale: "en-SG", voiceLexicon: ["PayNow", "DBS", "CPF", "Yochi"],
    aiEnabled: false, voiceAiEnabled: false, baseCurrency: "SGD", fxRates: { USD: 1.34 },
  },
  accounts: [
    { id: "a1", name: "Everyday", institution: "DBS", type: "checking", space: "personal", owner: "Peter", balance: 6480.25, currency: "SGD", last4: "4412", accent: "mint" },
    { id: "a2", name: "Emergency", institution: "OCBC", type: "savings", space: "personal", owner: "Peter", balance: 24800, currency: "SGD", accent: "sky" },
    { id: "a3", name: "Brokerage", institution: "IBKR", type: "investment", space: "personal", owner: "Peter", balance: 18250, currency: "USD", accent: "violet" },
    { id: "a4", name: "Everyday Card", institution: "Amex", type: "credit", space: "personal", owner: "Peter", balance: -862.4, currency: "SGD", last4: "1003", accent: "coral" },
    { id: "a5", name: "CPF", institution: "CPF Board", type: "cpf", space: "personal", owner: "Peter", balance: 61_400, currency: "SGD", accent: "lime" },
    { id: "a6", name: "Travel cash", institution: "Wise", type: "cash", space: "personal", owner: "Peter", balance: 940, currency: "SGD", last4: "2260", accent: "gold" },
  ],
  transactions: [
    { id: "t1", type: "income", amount: 7400, date: iso(-3), description: "Salary", category: "Income", accountId: "a1", space: "personal", source: "manual" },
    { id: "t2", type: "expense", amount: 13.8, date: iso(-1), description: "Yochi", category: "Food", accountId: "a1", space: "personal", source: "voice" },
    { id: "t3", type: "expense", amount: 248.9, date: iso(-2), description: "Cold Storage", category: "Food", accountId: "a4", space: "personal", source: "sheet" },
    { id: "t4", type: "expense", amount: 89.4, date: iso(-4), description: "Grab", category: "Transport", accountId: "a1", space: "personal", source: "manual" },
    { id: "t5", type: "transfer", amount: 2000, date: iso(-5), description: "To Emergency", category: "Transfer", accountId: "a1", transferAccountId: "a2", space: "personal", source: "manual" },
    { id: "t6", type: "expense", amount: 42.5, date: iso(-6), description: "Sheng Siong", category: "Food", accountId: "a1", space: "personal", source: "manual" },
    { id: "t7", type: "expense", amount: 310, date: iso(-8), description: "Utilities", category: "Home", accountId: "a1", space: "personal", source: "recurring" },
  ],
  goals: [
    { id: "g1", name: "Japan, next spring", target: 12000, current: 7400, targetDate: iso(240), space: "personal", icon: "plane", monthlyContribution: 700, priority: "important", currency: "SGD" },
    { id: "g2", name: "Emergency fund", target: 30000, current: 24800, targetDate: iso(400), space: "personal", icon: "shield", monthlyContribution: 500, priority: "essential", currency: "SGD" },
  ],
  recurring: [
    { id: "r1", name: "Rent", amount: 2800, cadence: "monthly", nextDate: iso(4), accountId: "a1", category: "Home", space: "personal", active: true },
    { id: "r2", name: "Insurance", amount: 180, cadence: "monthly", nextDate: iso(9), accountId: "a1", category: "Insurance", space: "personal", active: true },
    { id: "r3", name: "Spotify", amount: 16.9, cadence: "monthly", nextDate: iso(18), accountId: "a1", category: "Subscriptions", space: "personal", active: true },
  ],
  spendingPlans: [{ id: "p1", category: "Food", monthlyLimit: 900, space: "personal" }],
  plannedEvents: [{ id: "e1", name: "Flights to Osaka", amount: 2400, date: iso(120), kind: "travel", space: "personal", includeInPlan: true, currency: "SGD" }],
  inbox: [],
  history,
};

async function mock(page: Page) {
  let saved: unknown = workspace;
  await page.route("**/api/finance", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { data: saved, members: [], revisions: { personal: 7, household: null }, inviteUrl: null } });
    }
    saved = (route.request().postDataJSON() as { data: unknown }).data;
    return route.fulfill({ json: { ok: true, members: [], revisions: { personal: 8, household: null }, inviteUrl: null } });
  });
  await page.route("**/api/coach", (route) => route.fulfill({ json: { configured: false } }));
  await page.route("**/api/history", (route) => route.fulfill({ json: { available: true, entries: [] } }));
}

test("app store screenshots", async ({ page }, info) => {
  const device = info.project.name;
  const shot = (order: string, name: string) =>
    page.screenshot({ path: `store-assets/screenshots/${device}/${order}-${name}.jpg`, type: "jpeg", quality: 92 });
  const isPhone = device.startsWith("iphone");
  const go = async (label: string) => {
    await page.locator(isPhone ? ".mobile-nav button" : ".main-nav button").filter({ hasText: new RegExp(`^${label}$`) }).click();
    await page.waitForTimeout(700);
  };

  await mock(page);
  await page.goto("/preview");
  await page.waitForTimeout(1400);
  await shot("01", "today");

  await go("Money");
  await page.waitForTimeout(500);
  await shot("02", "money");

  await page.getByRole("tab", { name: "Accounts" }).click();
  await page.waitForTimeout(600);
  await shot("03", "accounts");

  await go("Future");
  await page.waitForTimeout(600);
  await shot("04", "future");

  await page.getByRole("button", { name: /Capture/ }).locator(":visible").first().click();
  await page.waitForTimeout(700);
  await shot("05", "capture");

  await page.keyboard.press("Escape");
  await page.emulateMedia({ colorScheme: "dark" });
  await go("Today");
  await page.waitForTimeout(900);
  await shot("06", "today-dark");
});
