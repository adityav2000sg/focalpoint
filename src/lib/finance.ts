export type SpaceId = "personal" | "household";
export type ViewScope = SpaceId | "all";
export type AccountType = "checking" | "savings" | "credit" | "investment" | "cash" | "property" | "cpf" | "loan" | "insurance" | "other";
export type TransactionType = "expense" | "income" | "transfer";
export type TransactionSource = "manual" | "voice" | "sheet" | "bank" | "receipt" | "recurring";

export const CURRENCIES = ["SGD", "USD", "EUR", "GBP", "INR", "AUD", "JPY", "MYR", "HKD", "CNY", "IDR", "THB", "PHP", "KRW", "CAD", "CHF", "NZD", "AED"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: CurrencyCode = "SGD";

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

/**
 * Rates are units of the base currency per 1 unit of the foreign currency, and the user
 * sets them by hand — there is no rate feed, so a number here is only ever as fresh as
 * the person who typed it. Returns null when no rate is known, because inventing 1:1
 * would silently corrupt every total that touches a foreign account.
 */
export function convertToBase(amount: number, from: CurrencyCode, base: CurrencyCode, rates: FxRates): number | null {
  if (from === base) return amount;
  const rate = rates[from];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
  return amount * rate;
}

/** Currencies in use by accounts that cannot be converted, so the UI can say so instead of quietly dropping them. */
export function unratedCurrencies(accounts: Account[], base: CurrencyCode, rates: FxRates): CurrencyCode[] {
  const missing = accounts
    .map((account) => account.currency)
    .filter((code) => code !== base && convertToBase(1, code, base, rates) === null);
  return [...new Set(missing)];
}

export type FxRates = Partial<Record<CurrencyCode, number>>;

export interface BaseSum {
  total: number;
  /** Currencies present but unconvertible, so a caller can say what the total leaves out. */
  missing: CurrencyCode[];
}

/** Sums balances in the base currency, reporting rather than absorbing anything it could not convert. */
export function sumAccountsInBase(accounts: Account[], base: CurrencyCode, rates: FxRates, pick: (account: Account) => number = (account) => account.balance): BaseSum {
  const missing = new Set<CurrencyCode>();
  const total = accounts.reduce((sum, account) => {
    const converted = convertToBase(pick(account), account.currency, base, rates);
    if (converted === null) { missing.add(account.currency); return sum; }
    return sum + converted;
  }, 0);
  return { total, missing: [...missing] };
}

/** A transaction is denominated in its account's currency; without the account it cannot be placed. */
export function sumTransactionsInBase(transactions: Transaction[], accounts: Account[], base: CurrencyCode, rates: FxRates): BaseSum {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const missing = new Set<CurrencyCode>();
  const total = transactions.reduce((sum, transaction) => {
    const account = byId.get(transaction.accountId);
    const currency = account?.currency || base;
    const converted = convertToBase(transaction.amount, currency, base, rates);
    if (converted === null) { missing.add(currency); return sum; }
    return sum + converted;
  }, 0);
  return { total, missing: [...missing] };
}

export interface Account {
  id: string;
  name: string;
  institution: string;
  type: AccountType;
  space: SpaceId;
  owner: string;
  balance: number;
  currency: CurrencyCode;
  last4?: string;
  accent: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  date: string;
  description: string;
  category: string;
  accountId: string;
  transferAccountId?: string;
  space: SpaceId;
  note?: string;
  source: TransactionSource;
  /** Historical statement rows can inform reports without re-applying them to a current balance. */
  affectsBalance?: boolean;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  targetDate: string;
  space: SpaceId;
  icon: string;
  monthlyContribution?: number;
  priority?: "essential" | "important" | "flexible";
  /** Currency of target, current and monthlyContribution. Absent means the reporting currency. */
  currency?: CurrencyCode;
}

export interface RecurringItem {
  id: string;
  name: string;
  /** Absent means expense, so items saved before income was supported still load. */
  type?: "expense" | "income";
  amount: number;
  cadence: "monthly" | "quarterly" | "yearly";
  nextDate: string;
  accountId: string;
  category: string;
  space: SpaceId;
  active: boolean;
}

export interface SpendingPlan {
  id: string;
  category: string;
  monthlyLimit: number;
  space: SpaceId;
}

export interface PlannedEvent {
  id: string;
  name: string;
  amount: number;
  date: string;
  kind: "travel" | "home" | "family" | "education" | "car" | "other";
  space: SpaceId;
  includeInPlan: boolean;
  note?: string;
  /** Currency of amount. Absent means the reporting currency. */
  currency?: CurrencyCode;
}

export interface InboxItem {
  id: string;
  description: string;
  amount: number;
  date: string;
  source: "bank" | "receipt" | "sheet" | "screenshot";
  suggestedType: TransactionType;
  suggestedCategory: string;
  suggestedAccountId?: string;
  space: SpaceId;
  confidence: number;
  status: "review" | "approved" | "dismissed";
  reason: string;
  affectsBalance?: boolean;
}

export interface FinanceData {
  version: 3;
  profile: {
    name: string;
    partnerName: string;
    householdName: string;
    partnerEmail?: string;
    householdStartedAt?: string;
    voiceLocale?: string;
    voiceLexicon?: string[];
    customCategories?: string[];
    onboardedAt?: string;
    appLockEnabled?: boolean;
    remindersEnabled?: boolean;
    reminderHour?: number;
    aiEnabled?: boolean;
    voiceAiEnabled?: boolean;
    baseCurrency?: CurrencyCode;
    fxRates?: FxRates;
    fxUpdatedAt?: string;
  };
  accounts: Account[];
  transactions: Transaction[];
  goals: Goal[];
  recurring: RecurringItem[];
  spendingPlans: SpendingPlan[];
  /** Daily net-worth points, oldest first. Absent on workspaces saved before history existed. */
  history?: NetWorthPoint[];
  plannedEvents: PlannedEvent[];
  inbox: InboxItem[];
}

export interface NetWorthPoint {
  /** Local calendar day, YYYY-MM-DD. One point per day. */
  date: string;
  netWorth: number;
  liquid: number;
  investments: number;
  liabilities: number;
  currency: CurrencyCode;
}

/** Two years of daily points is enough to draw any range the app offers without growing without bound. */
export const MAX_HISTORY_POINTS = 730;

/**
 * Appends today's point, replacing an existing one for the same day so the series holds at
 * most one value per date and always reflects the latest balances. Points are kept sorted
 * by date because a restored backup or a device with a wrong clock can arrive out of order.
 */
export function recordNetWorthPoint(history: NetWorthPoint[] | undefined, point: NetWorthPoint, limit = MAX_HISTORY_POINTS): NetWorthPoint[] {
  const withoutToday = (history || []).filter((item) => item.date !== point.date);
  const next = [...withoutToday, point].sort((a, b) => a.date.localeCompare(b.date));
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** Points within the trailing window, used to scope the chart without mutating stored history. */
export function historyWindow(history: NetWorthPoint[] | undefined, days: number, today = todayIso()): NetWorthPoint[] {
  if (!history?.length) return [];
  const cutoff = new Date(`${today}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - days);
  const from = cutoff.toISOString().slice(0, 10);
  return history.filter((item) => item.date >= from);
}

/** Absolute and proportional change across a window; null when there is nothing to compare against. */
export function historyChange(points: NetWorthPoint[]) {
  if (points.length < 2) return null;
  const first = points[0].netWorth;
  const last = points[points.length - 1].netWorth;
  const delta = last - first;
  return { delta, percent: first === 0 ? null : (delta / Math.abs(first)) * 100, from: points[0].date, to: points[points.length - 1].date };
}

export const baseExpenseCategories = [
  "Food & dining",
  "Groceries",
  "Transport",
  "Home",
  "Health",
  "Childcare",
  "Pets",
  "Shopping",
  "Travel",
  "Entertainment",
  "Other",
];

/** Kept as an alias so existing imports and any saved data keep working. */
export const expenseCategories = baseExpenseCategories;

export const MAX_CUSTOM_CATEGORIES = 24;

/** Trimmed, de-duplicated against the base set, and case-insensitive so "Pets" cannot be added twice. */
export function normaliseCategoryName(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, 32);
  if (!trimmed) return "";
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

export function allExpenseCategories(custom: string[] | undefined) {
  const seen = new Set(baseExpenseCategories.map((item) => item.toLowerCase()));
  const extra = (custom || []).filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // "Other" stays last so the list always ends in the catch-all.
  const base = baseExpenseCategories.filter((item) => item !== "Other");
  return [...base, ...extra, "Other"];
}

export const categoryColors: Record<string, string> = {
  "Food & dining": "#ef8354",
  Groceries: "#82b47d",
  Transport: "#6da8c6",
  Home: "#b6a3d8",
  Health: "#e691a7",
  Shopping: "#e2b75e",
  Travel: "#4fb9a9",
  Entertainment: "#8695c9",
  Other: "#9ba5a0",
};

export const accountTypeLabels: Record<AccountType, string> = {
  checking: "Everyday",
  savings: "Savings",
  credit: "Credit card",
  investment: "Investment",
  cash: "Cash",
  property: "Property",
  cpf: "CPF / pension",
  loan: "Loan / mortgage",
  insurance: "Insurance value",
  other: "Other asset",
};

export function createEmptyFinanceData({ name, householdName }: { name: string; householdName: string }): FinanceData {
  return {
    version: 3,
    profile: {
      name,
      partnerName: "Partner",
      householdName,
      partnerEmail: "",
      voiceLocale: "en-SG",
      voiceLexicon: ["PayNow", "DBS", "CPF"],
      aiEnabled: false,
      voiceAiEnabled: false,
      baseCurrency: DEFAULT_CURRENCY,
      fxRates: {},
    },
    accounts: [],
    transactions: [],
    goals: [],
    recurring: [],
    spendingPlans: [],
    history: [],
    plannedEvents: [],
    inbox: [],
  };
}

export function isFinanceData(input: unknown): input is FinanceData {
  if (!input || typeof input !== "object") return false;
  const candidate = input as Partial<FinanceData>;
  const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object");
  const text = (value: unknown) => typeof value === "string";
  const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value);
  const space = (value: unknown) => value === "personal" || value === "household";
  const profile = candidate.profile;
  if (candidate.version !== 3 || !record(profile) || !text(profile.name) || !text(profile.partnerName) || !text(profile.householdName)) return false;
  if (!Array.isArray(candidate.accounts) || !candidate.accounts.every((item) => record(item) && text(item.id) && text(item.name) && text(item.institution) && text(item.type) && space(item.space) && text(item.owner) && amount(item.balance) && isCurrencyCode(item.currency))) return false;
  if (!Array.isArray(candidate.transactions) || !candidate.transactions.every((item) => record(item) && text(item.id) && ["expense", "income", "transfer"].includes(String(item.type)) && amount(item.amount) && item.amount > 0 && text(item.date) && text(item.description) && text(item.category) && text(item.accountId) && space(item.space) && text(item.source) && (item.affectsBalance === undefined || typeof item.affectsBalance === "boolean"))) return false;
  if (!Array.isArray(candidate.goals) || !candidate.goals.every((item) => record(item) && text(item.id) && text(item.name) && amount(item.target) && amount(item.current) && text(item.targetDate) && space(item.space) && text(item.icon) && (item.currency === undefined || isCurrencyCode(item.currency)))) return false;
  if (!Array.isArray(candidate.recurring) || !candidate.recurring.every((item) => record(item) && text(item.id) && text(item.name) && (item.type === undefined || item.type === "expense" || item.type === "income") && amount(item.amount) && ["monthly", "quarterly", "yearly"].includes(String(item.cadence)) && text(item.nextDate) && text(item.accountId) && text(item.category) && space(item.space) && typeof item.active === "boolean")) return false;
  if (candidate.history !== undefined && (!Array.isArray(candidate.history) || !candidate.history.every((item) => record(item) && text(item.date) && amount(item.netWorth) && amount(item.liquid) && amount(item.investments) && amount(item.liabilities) && isCurrencyCode(item.currency)))) return false;
  if (profile.customCategories !== undefined && (!Array.isArray(profile.customCategories) || !profile.customCategories.every(text))) return false;
  if (!Array.isArray(candidate.spendingPlans) || !candidate.spendingPlans.every((item) => record(item) && text(item.id) && text(item.category) && amount(item.monthlyLimit) && space(item.space))) return false;
  if (!Array.isArray(candidate.plannedEvents) || !candidate.plannedEvents.every((item) => record(item) && text(item.id) && text(item.name) && amount(item.amount) && text(item.date) && text(item.kind) && space(item.space) && typeof item.includeInPlan === "boolean" && (item.currency === undefined || isCurrencyCode(item.currency)))) return false;
  if (!Array.isArray(candidate.inbox) || !candidate.inbox.every((item) => record(item) && text(item.id) && text(item.description) && amount(item.amount) && text(item.date) && text(item.source) && ["expense", "income", "transfer"].includes(String(item.suggestedType)) && text(item.suggestedCategory) && space(item.space) && amount(item.confidence) && text(item.status) && text(item.reason) && (item.affectsBalance === undefined || typeof item.affectsBalance === "boolean"))) return false;
  return true;
}

export function normalizeFinanceData(input: Partial<FinanceData>, fallback: FinanceData): FinanceData {
  return {
    ...fallback,
    ...input,
    version: 3,
    profile: { ...fallback.profile, ...(input.profile || {}) },
    accounts: input.accounts || fallback.accounts,
    transactions: input.transactions || fallback.transactions,
    goals: input.goals || fallback.goals,
    recurring: input.recurring || fallback.recurring,
    spendingPlans: input.spendingPlans || [],
    plannedEvents: input.plannedEvents || [],
    inbox: input.inbox || [],
  };
}

export function monthlyEquivalent(item: RecurringItem) {
  return item.cadence === "monthly" ? item.amount : item.cadence === "quarterly" ? item.amount / 3 : item.amount / 12;
}

/** Local calendar date as YYYY-MM-DD, matching how dates are stored on records. */
export function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export type DueStatus = "overdue" | "today" | "soon" | "scheduled";

/** Whole days from `today` to `date`; negative once the date has passed. Compared at midday so a DST shift cannot round a day away. */
export function daysUntil(date: string, today = todayIso()) {
  const target = new Date(`${date}T12:00:00`).getTime();
  const start = new Date(`${today}T12:00:00`).getTime();
  if (Number.isNaN(target) || Number.isNaN(start)) return 0;
  return Math.round((target - start) / 86_400_000);
}

export function dueStatus(date: string, today = todayIso()): DueStatus {
  const days = daysUntil(date, today);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  return days <= 7 ? "soon" : "scheduled";
}

export interface HorizonItem {
  key: string;
  sourceId: string;
  kind: "recurring" | "event";
  name: string;
  detail: string;
  amount: number;
  date: string;
  status: DueStatus;
  daysAway: number;
}

/**
 * One chronological list of everything with a date attached — recurring bills and planned
 * events together. Ordered by date, so whatever needs attention first is genuinely first;
 * a passed date sorts to the top as overdue rather than disappearing, because an unposted
 * bill or an unlogged event is exactly the thing that quietly rots the ledger.
 */
export function buildHorizon(recurring: RecurringItem[], events: PlannedEvent[], today = todayIso()): HorizonItem[] {
  const fromRecurring = recurring
    .filter((item) => item.active)
    .map<HorizonItem>((item) => ({
      key: `recurring:${item.id}`,
      sourceId: item.id,
      kind: "recurring",
      name: item.name,
      detail: item.cadence,
      amount: item.amount,
      date: item.nextDate,
      status: dueStatus(item.nextDate, today),
      daysAway: daysUntil(item.nextDate, today),
    }));

  const fromEvents = events.map<HorizonItem>((item) => ({
    key: `event:${item.id}`,
    sourceId: item.id,
    kind: "event",
    name: item.name,
    detail: item.kind,
    amount: item.amount,
    date: item.date,
    status: dueStatus(item.date, today),
    daysAway: daysUntil(item.date, today),
  }));

  return [...fromRecurring, ...fromEvents].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export function countOverdue(items: HorizonItem[]) {
  return items.filter((item) => item.status === "overdue").length;
}

export function advanceRecurringDate(date: string, cadence: RecurringItem["cadence"]) {
  const current = new Date(`${date}T12:00:00`);
  const originalDay = current.getDate();
  current.setDate(1);
  if (cadence === "monthly") current.setMonth(current.getMonth() + 1);
  if (cadence === "quarterly") current.setMonth(current.getMonth() + 3);
  if (cadence === "yearly") current.setFullYear(current.getFullYear() + 1);
  const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
  current.setDate(Math.min(originalDay, lastDay));
  return current.toISOString().slice(0, 10);
}

// Applies a transaction to account balances. Pass direction -1 to reverse it,
// which is how edits (reverse the old, apply the new) and deletes are handled.
export function applyTransaction(accounts: Account[], transaction: Transaction, direction: 1 | -1 = 1) {
  if (transaction.affectsBalance === false) return accounts;
  return accounts.map((account) => {
    if (transaction.type === "expense" && account.id === transaction.accountId) {
      return { ...account, balance: account.balance - transaction.amount * direction };
    }
    if (transaction.type === "income" && account.id === transaction.accountId) {
      return { ...account, balance: account.balance + transaction.amount * direction };
    }
    if (transaction.type === "transfer") {
      if (account.id === transaction.accountId) {
        return { ...account, balance: account.balance - transaction.amount * direction };
      }
      if (account.id === transaction.transferAccountId) {
        return { ...account, balance: account.balance + transaction.amount * direction };
      }
    }
    return account;
  });
}

export interface FinanceForecast {
  averageIncome: number;
  averageSpending: number;
  monthlySurplus: number;
  recurringCost: number;
  recurringIncome: number;
  liquidBalance: number;
  emergencyMonths: number;
  safeToSpend: number;
  historyMonths: number;
  confidence: "low" | "medium" | "high";
  goalForecasts: Array<{
    goalId: string;
    monthlyContribution: number;
    monthsRemaining: number;
    estimatedDate: string | null;
    onTrack: boolean;
    plannedEventDelayMonths: number;
  }>;
}

export function buildForecast(data: FinanceData, scope: ViewScope): FinanceForecast {
  const accounts = inScope(data.accounts, scope);
  const transactions = inScope(data.transactions, scope).filter((item) => item.type !== "transfer");
  // Every figure below is stated in the base currency, so amounts are converted before
  // they are ever added together. An unconvertible amount is left out rather than
  // treated as if it were already in the base currency.
  const base = data.profile.baseCurrency || DEFAULT_CURRENCY;
  const rates = data.profile.fxRates || {};
  const currencyOf = new Map(data.accounts.map((account) => [account.id, account.currency]));
  const monthTotals = new Map<string, { income: number; spending: number }>();
  transactions.forEach((item) => {
    const converted = convertToBase(item.amount, currencyOf.get(item.accountId) || base, base, rates);
    if (converted === null) return;
    const key = monthKey(item.date);
    const value = monthTotals.get(key) || { income: 0, spending: 0 };
    if (item.type === "income") value.income += converted;
    if (item.type === "expense") value.spending += converted;
    monthTotals.set(key, value);
  });
  // Month keys are YYYY-MM, so sorting them as strings orders them
  // chronologically. Without this the "last six months" would really be the
  // last six months *encountered*, which depends on transaction insertion order.
  const completeishMonths = [...monthTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value)
    .filter((item) => item.income > 0 || item.spending > 0)
    .slice(-6);
  const divisor = Math.max(1, completeishMonths.length);
  const averageIncome = completeishMonths.reduce((sum, item) => sum + item.income, 0) / divisor;
  const averageSpending = completeishMonths.reduce((sum, item) => sum + item.spending, 0) / divisor;
  const activeRecurring = inScope(data.recurring, scope).filter((item) => item.active);
  // A scheduled salary is not a cost. Summing every recurring item as spending would have
  // reported a household with regular income as having a large fixed outgoing.
  const recurringCost = activeRecurring.filter((item) => item.type !== "income").reduce((sum, item) => sum + monthlyEquivalent(item), 0);
  const recurringIncome = activeRecurring.filter((item) => item.type === "income").reduce((sum, item) => sum + monthlyEquivalent(item), 0);
  // Not floored at zero: spending more than you earn must report as a deficit.
  const monthlySurplus = averageIncome - averageSpending;
  const liquidBalance = sumAccountsInBase(accounts.filter((item) => ["checking", "savings", "cash"].includes(item.type)), base, rates, (item) => Math.max(0, item.balance)).total;
  const emergencyMonths = averageSpending > 0 ? liquidBalance / averageSpending : 0;
  const inBase = (amount: number, currency: CurrencyCode | undefined) => convertToBase(amount, currency || base, base, rates) ?? 0;
  const monthlyGoalCommitments = inScope(data.goals, scope).reduce((sum, goal) => sum + inBase(goal.monthlyContribution || 0, goal.currency), 0);
  const safeToSpend = Math.max(0, monthlySurplus - monthlyGoalCommitments);
  const includedEvents = inScope(data.plannedEvents, scope).filter((item) => item.includeInPlan && new Date(`${item.date}T12:00:00`) >= new Date());
  const goalForecasts = inScope(data.goals, scope).map((goal) => {
    const remaining = Math.max(0, inBase(goal.target, goal.currency) - inBase(goal.current, goal.currency));
    const contribution = Math.max(0, inBase(goal.monthlyContribution || 0, goal.currency) || Math.min(monthlySurplus / Math.max(1, inScope(data.goals, scope).length), remaining));
    const monthsRemaining = remaining === 0 ? 0 : contribution > 0 ? Math.ceil(remaining / contribution) : Number.POSITIVE_INFINITY;
    const plannedCost = includedEvents.filter((event) => event.space === goal.space).reduce((sum, event) => sum + inBase(event.amount, event.currency), 0);
    const plannedEventDelayMonths = contribution > 0 ? Math.ceil(plannedCost / contribution) : 0;
    const estimated = Number.isFinite(monthsRemaining) ? new Date(new Date().getFullYear(), new Date().getMonth() + monthsRemaining + plannedEventDelayMonths, 1) : null;
    return {
      goalId: goal.id,
      monthlyContribution: contribution,
      monthsRemaining,
      estimatedDate: estimated ? estimated.toISOString().slice(0, 10) : null,
      onTrack: estimated ? estimated <= new Date(`${goal.targetDate}T12:00:00`) : false,
      plannedEventDelayMonths,
    };
  });
  return {
    averageIncome,
    averageSpending,
    monthlySurplus,
    recurringCost,
    recurringIncome,
    liquidBalance,
    emergencyMonths,
    safeToSpend,
    historyMonths: completeishMonths.length,
    confidence: completeishMonths.length >= 5 ? "high" : completeishMonths.length >= 3 ? "medium" : "low",
    goalForecasts,
  };
}

/**
 * Emergency cover is liquid balance divided by average spending, so a thin history
 * produces figures like "130.7 months" that read as precise but are mostly noise.
 * Past two years the exact number tells the user nothing they can act on, and a
 * decimal place is only meaningful while the runway is short.
 */
export function formatCoverMonths(months: number) {
  if (!Number.isFinite(months) || months <= 0) return "0 months";
  if (months >= 24) return "24+ months";
  if (months >= 12) return `${Math.round(months)} months`;
  const rounded = months.toFixed(1);
  return `${rounded} ${rounded === "1.0" ? "month" : "months"}`;
}

/**
 * In en-SG both SGD and USD render as "$100.00" under narrowSymbol, so a foreign balance
 * would be indistinguishable from a local one. Anything outside the reporting currency is
 * therefore shown with its code.
 */
export function formatAccountBalance(value: number, currency: CurrencyCode, base: CurrencyCode) {
  return formatMoney(value, false, currency, currency === base ? "narrowSymbol" : "code");
}

export function formatMoney(value: number, compact = false, currency: CurrencyCode = DEFAULT_CURRENCY, display: "narrowSymbol" | "code" = "narrowSymbol") {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    currencyDisplay: display,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value);
}

export function formatDate(date: string, short = false) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: short ? "short" : "long",
    year: short ? undefined : "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

export function monthKey(date: string | Date) {
  const parsed = typeof date === "string" ? new Date(`${date}T12:00:00`) : date;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

export function inScope<T extends { space: SpaceId }>(items: T[], scope: ViewScope) {
  return scope === "all" ? items : items.filter((item) => item.space === scope);
}

export function uid(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}
