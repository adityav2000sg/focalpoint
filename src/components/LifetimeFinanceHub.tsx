"use client";

import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  Cloud,
  CloudOff,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Download,
  Edit3,
  FileSpreadsheet,
  Gauge,
  Home,
  Landmark,
  Layers3,
  LayoutDashboard,
  Leaf,
  List,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Mic,
  PiggyBank,
  Plus,
  Repeat2,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Table2,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  WalletCards,
  WandSparkles,
  X,
} from "lucide-react";
import {
  Account,
  AccountType,
  FinanceData,
  FinanceForecast,
  Goal,
  InboxItem,
  PlannedEvent,
  RecurringItem,
  SpaceId,
  Transaction,
  TransactionType,
  ViewScope,
  accountTypeLabels,
  applyTransaction,
  buildForecast,
  categoryColors,
  createEmptyFinanceData,
  expenseCategories,
  formatDate,
  formatMoney,
  inScope,
  isFinanceData,
  monthKey,
  monthlyEquivalent,
  normalizeFinanceData,
  uid,
} from "@/lib/finance";
import { ImportReport, describeImport, importTransactions } from "@/lib/import";
import { hasTogetherAccess, type TogetherMember } from "@/lib/together";

type ViewId = "today" | "money" | "future" | "coach" | "together";
type MoneySection = "snapshot" | "activity" | "accounts" | "inbox" | "plan";
type ModalId = "capture" | "transaction" | "account" | "goal" | "event" | "recurring" | "import" | "household" | null;
type ActivityMode = "feed" | "ledger";
type ActivityFilter = "all" | TransactionType;
type ActivityPeriod = "month" | "all";

const baseNavItems: { id: ViewId; label: string; icon: React.ElementType }[] = [
  { id: "today", label: "Today", icon: LayoutDashboard },
  { id: "money", label: "Money", icon: WalletCards },
  { id: "future", label: "Future", icon: Target },
  { id: "coach", label: "Coach", icon: WandSparkles },
];

const personalScopeOption: { id: ViewScope; label: string; shortLabel: string; icon: React.ElementType } =
  { id: "personal", label: "Personal", shortLabel: "Me", icon: UserRound };
const togetherScopeOption: { id: ViewScope; label: string; shortLabel: string; icon: React.ElementType } =
  { id: "all", label: "Together", shortLabel: "Us", icon: Layers3 };

const accountAccents = ["mint", "sky", "coral", "violet", "lime", "gold"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type Viewer = {
  userId: string;
  displayName: string;
  email: string;
};

type Confirmation = {
  title: string;
  copy: string;
  actionLabel: string;
  onConfirm: () => void;
};

function createViewerSeed(viewer: Viewer) {
  const emailName = viewer.email.split("@")[0];
  const displayName = viewer.displayName === viewer.email ? emailName : viewer.displayName;
  const firstName = displayName.split(/\s+/)[0] || "You";
  return createEmptyFinanceData({ name: displayName, householdName: `${firstName}’s Together` });
}

export default function LifetimeFinanceHub({ viewer, signOutPath }: { viewer: Viewer; signOutPath: string }) {
  const [data, setData] = useState<FinanceData>(() => createViewerSeed(viewer));
  const [scope, setScope] = useState<ViewScope>("personal");
  const [activeView, setActiveView] = useState<ViewId>("today");
  const [moneySection, setMoneySection] = useState<MoneySection>("snapshot");
  const [modal, setModal] = useState<ModalId>(null);
  const [search, setSearch] = useState("");
  const [activityMode, setActivityMode] = useState<ActivityMode>("feed");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>("month");
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const [toast, setToast] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [goalContribution, setGoalContribution] = useState<string | null>(null);
  const [contributionAmount, setContributionAmount] = useState("");
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [captureDraft, setCaptureDraft] = useState<Partial<Transaction> | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editingEvent, setEditingEvent] = useState<PlannedEvent | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringItem | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [afterAccount, setAfterAccount] = useState<"transaction" | "import" | "recurring" | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"loading" | "saving" | "saved" | "offline">("loading");
  const [householdMembers, setHouseholdMembers] = useState<TogetherMember[]>([]);
  const [qwenConfigured, setQwenConfigured] = useState(false);
  const loaded = useRef(false);
  const storageKey = `lifetimeFinanceDataV3:${viewer.userId}`;
  const hasTogether = hasTogetherAccess(data.profile, householdMembers, viewer.email);
  const navItems = hasTogether ? [...baseNavItems, { id: "together" as const, label: "Together", icon: Users }] : baseNavItems;
  const scopeOptions = hasTogether ? [personalScopeOption, togetherScopeOption] : [personalScopeOption];

  useEffect(() => {
    let cancelled = false;
    const defaults = createViewerSeed(viewer);
    async function hydrate() {
      try {
        const response = await fetch("/api/finance", { cache: "no-store" });
        if (response.status === 401) { window.location.assign("/login"); return; }
        if (!response.ok) throw new Error("cloud unavailable");
        const payload = await response.json() as { data?: Partial<FinanceData> | null; members?: typeof householdMembers };
        if (cancelled) return;
        setData(payload.data ? normalizeFinanceData(payload.data, defaults) : defaults);
        setHouseholdMembers(payload.members || []);
        setSyncStatus("saved");
      } catch {
        const saved = window.localStorage.getItem(storageKey) || window.localStorage.getItem(`lifetimeFinanceDataV2:${viewer.userId}`);
        if (saved) {
          try { setData(normalizeFinanceData(JSON.parse(saved) as Partial<FinanceData>, defaults)); }
          catch { setData(defaults); }
        } else setData(defaults);
        setSyncStatus("offline");
      } finally {
        if (!cancelled) {
          loaded.current = true;
          setHydrated(true);
        }
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, [storageKey, viewer]);

  useEffect(() => {
    if (!loaded.current || !hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify(data));
    setSyncStatus((current) => current === "offline" ? "offline" : "saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        if (response.status === 401) { window.location.assign("/login"); return; }
        if (!response.ok) throw new Error("save failed");
        const payload = await response.json() as { members?: typeof householdMembers };
        if (payload.members) setHouseholdMembers(payload.members);
        setSyncStatus("saved");
      } catch { setSyncStatus("offline"); }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [data, hydrated, storageKey]);

  useEffect(() => {
    fetch("/api/coach", { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
      .then((payload: { configured?: boolean } | null) => setQwenConfigured(Boolean(payload?.configured))).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (hasTogether) return;
    if (scope !== "personal") setScope("personal");
    if (activeView === "together") setActiveView("today");
  }, [activeView, hasTogether, scope]);

  const scopedAccounts = useMemo(() => inScope(data.accounts, scope), [data.accounts, scope]);
  const scopedTransactions = useMemo(() => {
    if (scope === "all") return [...data.transactions].sort((a, b) => b.date.localeCompare(a.date));
    const accountSpaces = new Map(data.accounts.map((account) => [account.id, account.space]));
    return data.transactions
      .filter((transaction) =>
        transaction.space === scope ||
        accountSpaces.get(transaction.accountId) === scope ||
        (transaction.transferAccountId && accountSpaces.get(transaction.transferAccountId) === scope),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.accounts, data.transactions, scope]);
  const scopedGoals = useMemo(() => inScope(data.goals, scope), [data.goals, scope]);
  const scopedRecurring = useMemo(() => inScope(data.recurring, scope), [data.recurring, scope]);
  const scopedPlans = useMemo(() => inScope(data.spendingPlans, scope), [data.spendingPlans, scope]);
  const scopedEvents = useMemo(() => inScope(data.plannedEvents, scope), [data.plannedEvents, scope]);
  const scopedInbox = useMemo(() => inScope(data.inbox, scope), [data.inbox, scope]);
  const forecast = useMemo(() => buildForecast(data, scope), [data, scope]);
  const monthTransactions = useMemo(
    () => scopedTransactions.filter((transaction) => monthKey(transaction.date) === selectedMonth),
    [scopedTransactions, selectedMonth],
  );

  const netWorth = scopedAccounts.reduce((sum, account) => sum + account.balance, 0);
  const monthIncome = monthTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const monthSpending = monthTransactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const monthCashFlow = monthIncome - monthSpending;
  const savingsRate = monthIncome > 0 ? Math.max(0, (monthCashFlow / monthIncome) * 100) : 0;
  const activeRecurringCost = scopedRecurring
    .filter((item) => item.active)
    .reduce((sum, item) => sum + monthlyEquivalent(item), 0);

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    monthTransactions
      .filter((transaction) => transaction.type === "expense")
      .forEach((transaction) => totals.set(transaction.category, (totals.get(transaction.category) || 0) + transaction.amount));
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthTransactions]);

  const visibleTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return scopedTransactions.filter((transaction) => {
      const matchesMonth = activityPeriod === "all" || monthKey(transaction.date) === selectedMonth;
      const matchesType = activityFilter === "all" || transaction.type === activityFilter;
      const matchesSearch = !query || [transaction.description, transaction.category, transaction.note, transaction.source]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      return matchesMonth && matchesType && matchesSearch;
    });
  }, [scopedTransactions, search, selectedMonth, activityFilter, activityPeriod]);

  const currentScope = scopeOptions.find((option) => option.id === scope) || personalScopeOption;
  const selectedMonthLabel = new Date(`${selectedMonth}-01T12:00:00`).toLocaleDateString("en-SG", { month: "long", year: "numeric" });

  function notify(message: string) {
    setToast(message);
  }

  function openNewTransaction(type?: TransactionType) {
    setEditingTransaction(null);
    setCaptureDraft(type ? { type } : null);
    if (type) setActivityFilter(type);
    setModal("transaction");
  }

  function openCaptureDraft(draft: Partial<Transaction>) {
    setEditingTransaction(null);
    setCaptureDraft(draft);
    setModal("transaction");
  }

  function openEditTransaction(transaction: Transaction) {
    setCaptureDraft(null);
    setEditingTransaction(transaction);
    setModal("transaction");
  }

  function saveTransaction(transaction: Transaction) {
    setData((current) => {
      if (editingTransaction) {
        const restoredAccounts = applyTransaction(current.accounts, editingTransaction, -1);
        return {
          ...current,
          accounts: applyTransaction(restoredAccounts, transaction),
          transactions: current.transactions.map((item) => item.id === editingTransaction.id ? transaction : item),
        };
      }
      return {
        ...current,
        accounts: applyTransaction(current.accounts, transaction),
        transactions: [transaction, ...current.transactions],
      };
    });
    setModal(null);
    setEditingTransaction(null);
    notify(editingTransaction ? "Transaction updated and balances recalculated." : transaction.type === "transfer" ? "Transfer recorded — spending stayed unchanged." : "Transaction added.");
  }

  function deleteTransaction(transaction: Transaction) {
    setConfirmation({
      title: "Delete this transaction?",
      copy: `“${transaction.description}” will be removed and its effect on the connected account balances will be reversed.`,
      actionLabel: "Delete transaction",
      onConfirm: () => {
        setData((current) => ({
          ...current,
          accounts: applyTransaction(current.accounts, transaction, -1),
          transactions: current.transactions.filter((item) => item.id !== transaction.id),
        }));
        setEditingTransaction(null);
        setModal(null);
        notify("Transaction removed and balances restored.");
      },
    });
  }

  function openNewAccount() {
    setEditingAccount(null);
    setAfterAccount(null);
    setModal("account");
  }

  function openEditAccount(account: Account) {
    setEditingAccount(account);
    setAfterAccount(null);
    setModal("account");
  }

  function openRequiredAccount(returnTo: "transaction" | "import" | "recurring") {
    setEditingAccount(null);
    setAfterAccount(returnTo);
    setModal("account");
  }

  function saveAccount(account: Account) {
    setData((current) => ({
      ...current,
      accounts: editingAccount
        ? current.accounts.map((item) => item.id === editingAccount.id ? account : item)
        : [...current.accounts, account],
    }));
    const nextStep = editingAccount ? null : afterAccount;
    setModal(nextStep === "transaction" ? "transaction" : nextStep === "import" ? "import" : nextStep === "recurring" ? "recurring" : null);
    setEditingAccount(null);
    setAfterAccount(null);
    notify(editingAccount ? "Account details updated." : nextStep ? "Account added. Finish the next step when you’re ready." : "Account added to your workspace.");
  }

  function deleteAccount(account: Account) {
    const relatedTransactions = data.transactions.filter((item) => item.accountId === account.id || item.transferAccountId === account.id);
    const relatedRecurring = data.recurring.filter((item) => item.accountId === account.id);
    const impact = [
      relatedTransactions.length ? `${relatedTransactions.length} transaction${relatedTransactions.length === 1 ? "" : "s"}` : "",
      relatedRecurring.length ? `${relatedRecurring.length} recurring payment${relatedRecurring.length === 1 ? "" : "s"}` : "",
    ].filter(Boolean).join(" and ");
    setConfirmation({
      title: `Remove ${account.name}?`,
      copy: impact ? `This also removes ${impact}. Transfers involving this account will be reversed on the remaining account before deletion.` : "This account will be removed from your balance sheet.",
      actionLabel: "Remove account",
      onConfirm: () => {
        setData((current) => {
          const attached = current.transactions.filter((item) => item.accountId === account.id || item.transferAccountId === account.id);
          const restoredAccounts = attached.reduce((accounts, transaction) => applyTransaction(accounts, transaction, -1), current.accounts);
          return {
            ...current,
            accounts: restoredAccounts.filter((item) => item.id !== account.id),
            transactions: current.transactions.filter((item) => item.accountId !== account.id && item.transferAccountId !== account.id),
            recurring: current.recurring.filter((item) => item.accountId !== account.id),
          };
        });
        setEditingAccount(null);
        setModal(null);
        notify("Account and connected records removed safely.");
      },
    });
  }

  async function saveHousehold(profile: FinanceData["profile"], prepareEmail = false) {
    const nextData = { ...data, profile };
    setData(nextData);
    setScope("all");
    setModal(null);
    if (prepareEmail && profile.partnerEmail) {
      setSyncStatus("saving");
      try {
        const response = await fetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nextData) });
        if (!response.ok) throw new Error("invite save failed");
        const payload = await response.json() as { members?: typeof householdMembers };
        if (payload.members) setHouseholdMembers(payload.members);
        setSyncStatus("saved");
      } catch {
        setSyncStatus("offline");
        notify("The invite is saved on this device, but cloud sync failed. Reconnect before sending it.");
        return;
      }
      const loginUrl = `${window.location.origin}/login`;
      const subject = `Join ${profile.householdName} on Lifetime`;
      const body = `${profile.name} invited you to share a Together space on Lifetime.\n\nSign in with ${profile.partnerEmail} here:\n${loginUrl}\n\nOnly finances deliberately marked “Shared in Together” are visible to both people. Your Personal space remains private.`;
      window.location.href = `mailto:${encodeURIComponent(profile.partnerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      notify("Invite saved. Your email app has a ready-to-send message.");
      return;
    }
    notify("Together setup saved. They can join by signing in with the invited Google email.");
  }

  function shiftSelectedMonth(offset: number) {
    const date = new Date(`${selectedMonth}-01T12:00:00`);
    date.setMonth(date.getMonth() + offset);
    setSelectedMonth(monthKey(date));
  }

  function openActivity(filter: ActivityFilter = "all", mode: ActivityMode = "feed") {
    setActivityFilter(filter);
    setActivityMode(mode);
    setActivityPeriod(mode === "ledger" ? "all" : "month");
    setMoneySection("activity");
    setActiveView("money");
  }

  function openImport() {
    setModal("import");
  }

  function stageInbox(transactions: Transaction[]) {
    const staged: InboxItem[] = transactions.map((transaction) => ({
      id: uid("inbox"),
      description: transaction.description,
      amount: transaction.amount,
      date: transaction.date,
      source: transaction.source === "sheet" ? "sheet" : "bank",
      suggestedType: transaction.type,
      suggestedCategory: transaction.category,
      suggestedAccountId: transaction.accountId,
      space: transaction.space,
      confidence: 0.9,
      status: "review",
      reason: "Imported row matched an account and is ready for your approval.",
    }));
    setData((current) => ({ ...current, inbox: [...staged, ...current.inbox] }));
    setModal(null);
    setMoneySection("inbox");
    setActiveView("money");
    notify(`${staged.length} item${staged.length === 1 ? "" : "s"} added to the review inbox.`);
  }

  function approveInbox(item: InboxItem) {
    const account = data.accounts.find((candidate) => candidate.id === item.suggestedAccountId);
    if (!account) { notify("Choose or add the matching account before approving this item."); return; }
    const transaction: Transaction = {
      id: uid("tx"), type: item.suggestedType, amount: item.amount, date: item.date, description: item.description,
      category: item.suggestedCategory, accountId: account.id, space: account.space, source: item.source === "receipt" || item.source === "screenshot" ? "receipt" : item.source,
    };
    setData((current) => ({ ...current, accounts: applyTransaction(current.accounts, transaction), transactions: [transaction, ...current.transactions], inbox: current.inbox.filter((candidate) => candidate.id !== item.id) }));
    notify("Inbox item approved and added to the ledger.");
  }

  function dismissInbox(item: InboxItem) {
    setData((current) => ({ ...current, inbox: current.inbox.filter((candidate) => candidate.id !== item.id) }));
    notify("Inbox item dismissed.");
  }

  function openNewGoal() {
    setEditingGoal(null);
    setModal("goal");
  }

  function openEditGoal(goal: Goal) {
    setEditingGoal(goal);
    setModal("goal");
  }

  function saveGoal(goal: Goal) {
    setData((current) => ({ ...current, goals: editingGoal ? current.goals.map((item) => item.id === goal.id ? goal : item) : [...current.goals, goal] }));
    setModal(null);
    setEditingGoal(null);
    notify(editingGoal ? "Goal updated." : "Goal created.");
  }

  function deleteGoal(goal: Goal) {
    setConfirmation({ title: `Delete ${goal.name}?`, copy: "Its target, progress, and forecast will be removed. Your account balances are not affected.", actionLabel: "Delete goal", onConfirm: () => {
      setData((current) => ({ ...current, goals: current.goals.filter((item) => item.id !== goal.id) }));
      setEditingGoal(null); setModal(null); notify("Goal removed.");
    } });
  }

  function openNewRecurring() {
    setEditingRecurring(null);
    setModal("recurring");
  }

  function openEditRecurring(item: RecurringItem) {
    setEditingRecurring(item);
    setModal("recurring");
  }

  function saveRecurring(item: RecurringItem) {
    setData((current) => ({ ...current, recurring: editingRecurring ? current.recurring.map((candidate) => candidate.id === item.id ? item : candidate) : [...current.recurring, item] }));
    setModal(null);
    setEditingRecurring(null);
    notify(editingRecurring ? "Recurring payment updated." : "Recurring payment added.");
  }

  function deleteRecurring(item: RecurringItem) {
    setConfirmation({ title: `Delete ${item.name}?`, copy: "This recurring payment will be removed from future monthly estimates. Existing transactions stay unchanged.", actionLabel: "Delete recurring payment", onConfirm: () => {
      setData((current) => ({ ...current, recurring: current.recurring.filter((candidate) => candidate.id !== item.id) }));
      setEditingRecurring(null); setModal(null); notify("Recurring payment removed.");
    } });
  }

  function openNewEvent() {
    setEditingEvent(null);
    setModal("event");
  }

  function openEditEvent(item: PlannedEvent) {
    setEditingEvent(item);
    setModal("event");
  }

  function savePlannedEvent(item: PlannedEvent) {
    setData((current) => ({ ...current, plannedEvents: editingEvent ? current.plannedEvents.map((candidate) => candidate.id === item.id ? item : candidate) : [...current.plannedEvents, item] }));
    setModal(null);
    setEditingEvent(null);
    setActiveView("future");
    notify(editingEvent ? "Future plan updated." : "Future plan added to your forecast.");
  }

  function deletePlannedEvent(item: PlannedEvent) {
    setConfirmation({ title: `Delete ${item.name}?`, copy: "The event cost will be removed from your forecast and goal-delay estimates.", actionLabel: "Delete event", onConfirm: () => {
      setData((current) => ({ ...current, plannedEvents: current.plannedEvents.filter((candidate) => candidate.id !== item.id) }));
      setEditingEvent(null); setModal(null); notify("Future plan removed.");
    } });
  }

  function saveSpendingPlan(category: string, monthlyLimit: number, planScope: SpaceId) {
    setData((current) => {
      const existing = current.spendingPlans.find((item) => item.category === category && item.space === planScope);
      return {
        ...current,
        spendingPlans: existing
          ? current.spendingPlans.map((item) => item.id === existing.id ? { ...item, monthlyLimit } : item)
          : [...current.spendingPlans, { id: uid("plan"), category, monthlyLimit, space: planScope }],
      };
    });
    notify("Spending plan updated.");
  }

  function fundGoal(goalId: string) {
    const amount = Number(contributionAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setData((current) => ({
      ...current,
      goals: current.goals.map((goal) => goal.id === goalId ? { ...goal, current: Math.min(goal.target, goal.current + amount) } : goal),
    }));
    setGoalContribution(null);
    setContributionAmount("");
    notify("Goal progress updated.");
  }

  function toggleRecurring(id: string) {
    const item = data.recurring.find((candidate) => candidate.id === id);
    setData((current) => ({
      ...current,
      recurring: current.recurring.map((item) => item.id === id ? { ...item, active: !item.active } : item),
    }));
    notify(item?.active ? "Recurring payment paused." : "Recurring payment resumed.");
  }

  function togglePlannedEvent(id: string) {
    const item = data.plannedEvents.find((candidate) => candidate.id === id);
    setData((current) => ({ ...current, plannedEvents: current.plannedEvents.map((event) => event.id === id ? { ...event, includeInPlan: !event.includeInPlan } : event) }));
    notify(item?.includeInPlan ? "Event excluded from the forecast." : "Event included in the forecast.");
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lifetime-finance-${todayIso()}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
    notify("A private backup was downloaded.");
  }

  async function restoreBackup(file: File) {
    try {
      if (file.size > 2_000_000) throw new Error("That backup is larger than the supported 2 MB workspace size.");
      const parsed: unknown = JSON.parse(await file.text());
      if (!isFinanceData(parsed)) throw new Error("That file is not a valid Lifetime backup.");
      const restored = normalizeFinanceData(parsed, createViewerSeed(viewer));
      setConfirmation({ title: "Restore this backup?", copy: `This will replace the current workspace with ${restored.accounts.length} accounts and ${restored.transactions.length} transactions from the selected file.`, actionLabel: "Restore backup", onConfirm: () => {
        setData(restored); setScope("all"); setActiveView("today"); notify("Backup restored and queued for secure sync.");
      } });
    } catch (error) {
      notify(error instanceof Error ? error.message : "That backup could not be opened.");
    }
  }

  function clearWorkspace() {
    setConfirmation({ title: "Clear the whole workspace?", copy: "Every account, transaction, goal, recurring payment, plan, and inbox item will be removed. Your profile and Together setup will remain.", actionLabel: "Clear workspace", onConfirm: () => {
      setData((current) => ({ ...createViewerSeed(viewer), profile: current.profile, accounts: [], transactions: [], goals: [], recurring: [], spendingPlans: [], plannedEvents: [], inbox: [] }));
      setScope("all"); setActiveView("today"); notify("Workspace cleared. Add your first account when you’re ready.");
    } });
  }

  function navigateTo(view: ViewId, section?: MoneySection) {
    if (section) setMoneySection(section);
    if (view === "together") setScope("all");
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!hydrated) return <AppLoading displayName={viewer.displayName} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <span className="brand-mark"><Leaf size={20} strokeWidth={2.4} /></span>
          <div>
            <strong>LIFETIME</strong>
            <span>Finance, for the life you’re building.</span>
          </div>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          <p className="eyebrow nav-eyebrow">Workspace</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={activeView === item.id ? "nav-item nav-active" : "nav-item"}
                onClick={() => { navigateTo(item.id); setMobileMenu(false); }}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {activeView === item.id && <span className="nav-dot" />}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-grow" />
        <div className="foundation-card">
          <div className="foundation-icon"><Sparkles size={18} /></div>
          <p className="eyebrow">Monthly signal</p>
          <strong>{monthTransactions.length ? `${savingsRate.toFixed(0)}% savings rate` : "No signal yet"}</strong>
          <span>{monthTransactions.length ? `You kept ${formatMoney(monthCashFlow)} this month.` : "Add income and spending to build a monthly signal."}</span>
          <div className="mini-progress"><i style={{ width: `${Math.min(savingsRate, 100)}%` }} /></div>
        </div>

        <div className="profile-chip">
          <span className="avatar">{data.profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
          <div><strong>{data.profile.name}</strong><small>{viewer.email}</small></div>
          <div className="profile-actions">
            <button className="signout-button" onClick={() => { setModal("household"); setMobileMenu(false); }} aria-label="Together settings" title="Together settings"><Settings2 size={17} /></button>
            <form action={signOutPath} method="post"><button className="signout-button" type="submit" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></form>
          </div>
        </div>
      </aside>
      {mobileMenu && <button className="mobile-menu-scrim" onClick={() => setMobileMenu(false)} aria-label="Close navigation" />}

      <div className="app-main">
        <header className="topbar">
          <button className="icon-button mobile-menu-button" onClick={() => setMobileMenu((open) => !open)} aria-label="Open navigation">
            <Menu size={21} />
          </button>

          <div className="scope-switcher" aria-label="Financial view">
            {scopeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  className={scope === option.id ? "scope-option scope-active" : "scope-option"}
                  onClick={() => setScope(option.id)}
                  aria-pressed={scope === option.id}
                >
                  <Icon size={15} />
                  <span className="scope-long">{option.label}</span>
                  <span className="scope-short">{option.shortLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="top-actions">
            <span className={`sync-pill sync-${syncStatus}`} title={syncStatus === "saved" ? "Saved across your signed-in devices" : syncStatus === "offline" ? "Using the private on-device backup" : "Saving changes"}>
              {syncStatus === "offline" ? <CloudOff size={15} /> : <Cloud size={15} />}
              <span>{syncStatus === "saved" ? "Saved" : syncStatus === "saving" ? "Saving" : syncStatus === "offline" ? "On device" : "Loading"}</span>
            </span>
            <button className="primary-button compact-button capture-button" onClick={() => setModal("capture")}><Mic size={18} /> Capture</button>
          </div>
        </header>

        <main className="content">
          <div className="view-stage" key={`${activeView}-${activeView === "money" ? moneySection : "main"}`}>
          {activeView === "today" && (
            <Overview
              scope={scope}
              scopeLabel={currentScope.label}
              profileName={data.profile.name}
              selectedMonth={selectedMonth}
              selectedMonthLabel={selectedMonthLabel}
              setSelectedMonth={setSelectedMonth}
              shiftMonth={shiftSelectedMonth}
              netWorth={netWorth}
              monthIncome={monthIncome}
              monthSpending={monthSpending}
              monthCashFlow={monthCashFlow}
              savingsRate={savingsRate}
              accounts={scopedAccounts}
              transactions={scopedTransactions}
              goals={scopedGoals}
              recurring={scopedRecurring}
              categoryTotals={categoryTotals}
              onAdd={() => openNewTransaction()}
              onView={navigateTo}
              onMetric={openActivity}
              goalContribution={goalContribution}
              setGoalContribution={setGoalContribution}
              contributionAmount={contributionAmount}
              setContributionAmount={setContributionAmount}
              fundGoal={fundGoal}
              data={data}
              forecast={forecast}
              onCapture={() => setModal("capture")}
              onEditGoal={openEditGoal}
              onAddAccount={openNewAccount}
              onHousehold={() => setModal("household")}
            />
          )}

          {activeView === "money" && (
            <MoneyView
              section={moneySection}
              setSection={setMoneySection}
              accounts={scopedAccounts}
              allAccounts={data.accounts}
              transactions={visibleTransactions}
              monthTransactions={monthTransactions}
              plans={scopedPlans}
              inbox={scopedInbox}
              netWorth={netWorth}
              monthIncome={monthIncome}
              monthSpending={monthSpending}
              search={search}
              setSearch={setSearch}
              onAdd={() => openNewTransaction()}
              onImport={openImport}
              onApproveInbox={approveInbox}
              onDismissInbox={dismissInbox}
              onDelete={deleteTransaction}
              onEditTransaction={openEditTransaction}
              onAddAccount={openNewAccount}
              onEditAccount={openEditAccount}
              selectedMonthLabel={selectedMonthLabel}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              shiftMonth={shiftSelectedMonth}
              mode={activityMode}
              setMode={setActivityMode}
              filter={activityFilter}
              setFilter={setActivityFilter}
              period={activityPeriod}
              setPeriod={setActivityPeriod}
              onSavePlan={saveSpendingPlan}
              onExport={exportData}
              onRestore={restoreBackup}
              onReset={clearWorkspace}
              scope={scope}
            />
          )}

          {activeView === "future" && (
            <FutureView
              goals={scopedGoals}
              recurring={scopedRecurring}
              events={scopedEvents}
              accounts={data.accounts}
              forecast={forecast}
              recurringCost={activeRecurringCost}
              onAddGoal={openNewGoal}
              onAddEvent={openNewEvent}
              onAddRecurring={openNewRecurring}
              onToggleRecurring={toggleRecurring}
              onEditGoal={openEditGoal}
              onEditEvent={openEditEvent}
              onEditRecurring={openEditRecurring}
              goalContribution={goalContribution}
              setGoalContribution={setGoalContribution}
              contributionAmount={contributionAmount}
              setContributionAmount={setContributionAmount}
              fundGoal={fundGoal}
              onToggleEvent={togglePlannedEvent}
            />
          )}

          {activeView === "coach" && (
            <CoachView data={data} scope={scope} forecast={forecast} categoryTotals={categoryTotals} qwenConfigured={qwenConfigured} onCapture={() => setModal("capture")} />
          )}

          {activeView === "together" && hasTogether && (
            <TogetherView data={data} accounts={scopedAccounts} members={householdMembers} viewerEmail={viewer.email} onSetup={() => setModal("household")} onEditAccount={openEditAccount} />
          )}
          </div>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={activeView === item.id ? "mobile-nav-active" : ""} onClick={() => navigateTo(item.id)}>
              <Icon size={20} /><span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <button className="mobile-fab voice-fab" onClick={() => setModal("capture")} aria-label="Capture with voice or text"><Mic size={24} /></button>

      {modal === "capture" && <CaptureModal accounts={data.accounts} profile={data.profile} scope={scope} qwenConfigured={qwenConfigured} onClose={() => setModal(null)} onTransaction={(draft) => openCaptureDraft(draft)} onPlan={(event) => savePlannedEvent(event)} onAsk={(prompt) => { setModal(null); setActiveView("coach"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("lifetime-coach-question", { detail: prompt })), 100); }} onProfile={(profile) => setData((current) => ({ ...current, profile }))} />}
      {modal === "transaction" && <TransactionModal initial={editingTransaction || captureDraft} accounts={data.accounts} scope={scope} onNeedAccount={() => openRequiredAccount("transaction")} onClose={() => { setModal(null); setEditingTransaction(null); setCaptureDraft(null); }} onSubmit={saveTransaction} />}
      {modal === "account" && <AccountModal initial={editingAccount} scope={scope} canShare={hasTogether} profileName={data.profile.name} partnerName={data.profile.partnerName} onClose={() => { setModal(null); setEditingAccount(null); setAfterAccount(null); setCaptureDraft(null); }} onSubmit={saveAccount} onDelete={editingAccount ? () => deleteAccount(editingAccount) : undefined} />}
      {modal === "goal" && <GoalModal initial={editingGoal} scope={scope} canShare={hasTogether} onClose={() => { setModal(null); setEditingGoal(null); }} onSubmit={saveGoal} onDelete={editingGoal ? () => deleteGoal(editingGoal) : undefined} />}
      {modal === "event" && <PlannedEventModal initial={editingEvent} scope={scope} canShare={hasTogether} onClose={() => { setModal(null); setEditingEvent(null); }} onSubmit={savePlannedEvent} onDelete={editingEvent ? () => deletePlannedEvent(editingEvent) : undefined} />}
      {modal === "recurring" && <RecurringModal initial={editingRecurring} scope={scope} accounts={data.accounts} onNeedAccount={() => openRequiredAccount("recurring")} onClose={() => { setModal(null); setEditingRecurring(null); }} onSubmit={saveRecurring} onDelete={editingRecurring ? () => deleteRecurring(editingRecurring) : undefined} />}
      {modal === "import" && <ImportModal data={data} scope={scope} onNeedAccount={() => openRequiredAccount("import")} onClose={() => setModal(null)} setData={setData} onStage={stageInbox} notify={notify} />}
      {modal === "household" && <HouseholdModal profile={data.profile} members={householdMembers} viewerEmail={viewer.email} onClose={() => setModal(null)} onSubmit={saveHousehold} />}

      {confirmation && <ConfirmationModal confirmation={confirmation} onClose={() => setConfirmation(null)} onConfirm={() => { const action = confirmation.onConfirm; setConfirmation(null); action(); }} />}

      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function AppLoading({ displayName }: { displayName: string }) {
  return (
    <main className="app-loading" aria-live="polite" aria-busy="true">
      <div className="loading-mark"><Leaf size={27} /><i /><i /></div>
      <p className="eyebrow">Lifetime</p>
      <strong>Opening {displayName.split(/\s+/)[0] || "your"}’s private workspace</strong>
      <span>Syncing your Personal and Together spaces…</span>
    </main>
  );
}

function FirstRunGuide({ onAddAccount, onHousehold, onCapture }: { onAddAccount: () => void; onHousehold: () => void; onCapture: () => void }) {
  const steps = [
    { number: "01", title: "Add where money lives", copy: "Start with one bank account, card, cash balance, investment, CPF account, or loan.", action: "Add first account", icon: <WalletCards size={19} />, onClick: onAddAccount },
    { number: "02", title: "Invite someone when ready", copy: "Create Together only when a partner or family member is invited. Your Personal space stays separate.", action: "Set up Together", icon: <Users size={19} />, onClick: onHousehold },
    { number: "03", title: "Capture naturally", copy: "Speak or type a transaction, then review it before it changes any balance.", action: "Try capture", icon: <Mic size={19} />, onClick: onCapture },
  ];
  return (
    <section className="first-run-guide">
      <div className="first-run-heading"><div><p className="eyebrow">Start your foundation</p><h2>Three quiet steps to a useful financial picture.</h2></div><span>Nothing is pre-filled</span></div>
      <div className="first-run-steps">{steps.map((step) => <button key={step.number} onClick={step.onClick}><span className="first-run-number">{step.number}</span><i>{step.icon}</i><strong>{step.title}</strong><p>{step.copy}</p><small>{step.action}<ChevronRight size={15} /></small></button>)}</div>
    </section>
  );
}

function Overview({
  scope,
  scopeLabel,
  profileName,
  selectedMonth,
  selectedMonthLabel,
  setSelectedMonth,
  shiftMonth,
  netWorth,
  monthIncome,
  monthSpending,
  monthCashFlow,
  savingsRate,
  accounts,
  transactions,
  goals,
  recurring,
  categoryTotals,
  onAdd,
  onView,
  onMetric,
  goalContribution,
  setGoalContribution,
  contributionAmount,
  setContributionAmount,
  fundGoal,
  data,
  forecast,
  onCapture,
  onEditGoal,
  onAddAccount,
  onHousehold,
}: {
  scope: ViewScope;
  scopeLabel: string;
  profileName: string;
  selectedMonth: string;
  selectedMonthLabel: string;
  setSelectedMonth: (value: string) => void;
  shiftMonth: (offset: number) => void;
  netWorth: number;
  monthIncome: number;
  monthSpending: number;
  monthCashFlow: number;
  savingsRate: number;
  accounts: Account[];
  transactions: Transaction[];
  goals: Goal[];
  recurring: RecurringItem[];
  categoryTotals: [string, number][];
  onAdd: () => void;
  onView: (view: ViewId, section?: MoneySection) => void;
  onMetric: (filter: ActivityFilter, mode?: ActivityMode) => void;
  goalContribution: string | null;
  setGoalContribution: (id: string | null) => void;
  contributionAmount: string;
  setContributionAmount: (value: string) => void;
  fundGoal: (id: string) => void;
  data: FinanceData;
  forecast: FinanceForecast;
  onCapture: () => void;
  onEditGoal: (goal: Goal) => void;
  onAddAccount: () => void;
  onHousehold: () => void;
}) {
  const today = new Date();
  const firstName = profileName.split(" ")[0];
  const scopeCopy = scope === "all" ? "the money you manage alone and together" : "your personal foundation";
  const goal = goals[0];
  const hasEvidence = accounts.length > 0 || transactions.length > 0;

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div className="hero-orb hero-orb-one" />
        <div className="hero-orb hero-orb-two" />
        <div className="hero-grid" />
        <div className="hero-content">
          <div>
            <p className="eyebrow hero-eyebrow">{today.toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long" })}</p>
            <h1>Good morning, {firstName}.</h1>
            <p className="hero-copy">Here’s how {scopeCopy} is growing.</p>
          </div>
          <div className="hero-balance">
            <div className="hero-label-row"><span>{scopeLabel} net worth</span><span className="live-pill"><i /> {accounts.length} account{accounts.length === 1 ? "" : "s"}</span></div>
            <strong>{formatMoney(netWorth)}</strong>
            <p>{monthCashFlow >= 0 ? <TrendingUp size={16} /> : <ArrowUpRight size={16} />} {monthCashFlow >= 0 ? "+" : "−"}{formatMoney(Math.abs(monthCashFlow))} net cash flow in {selectedMonthLabel}</p>
          </div>
        </div>
        <div className="hero-actions">
          <button className="hero-button" onClick={onCapture}><Mic size={18} /> Tell Lifetime</button>
          <button className="hero-secondary" onClick={() => onView("money", "snapshot")}>Explore your money <ChevronRight size={17} /></button>
        </div>
      </section>

      {!accounts.length && <FirstRunGuide onAddAccount={onAddAccount} onHousehold={onHousehold} onCapture={onCapture} />}

      <section className="coach-glance">
        <div className="coach-glance-icon"><WandSparkles size={21} /></div>
        <div>
          <p className="eyebrow">Lifetime outlook</p>
          <h2>{!hasEvidence ? "Add real numbers before Lifetime judges your position." : forecast.safeToSpend > 0 ? `${formatMoney(forecast.safeToSpend)} is flexible each month.` : "Your current commitments use the monthly surplus."}</h2>
          <p>{!hasEvidence ? "There is no financial assessment yet. Start with an account, then add or import activity." : `You have ${forecast.emergencyMonths.toFixed(1)} months of liquid cover. ${forecast.goalForecasts.some((item) => !item.onTrack) ? "At least one goal needs a timing or contribution adjustment." : "Your modelled goals are currently on track."}`}</p>
        </div>
        <button className="secondary-button" onClick={() => onView("coach")}>Ask Coach <ChevronRight size={16} /></button>
      </section>

      <div className="month-row">
        <div>
          <p className="eyebrow">Monthly pulse</p>
          <h2>{selectedMonthLabel}</h2>
        </div>
        <div className="month-controls">
          <button className="month-arrow" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
          <label className="month-picker"><CalendarDays size={17} /><span>Change month</span><input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} aria-label="Choose month" /></label>
          <button className="month-arrow" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
        </div>
      </div>

      <section className="metric-grid">
        <MetricCard label="Income" value={monthIncome} note="Open income activity" tone="green" icon={<ArrowDownLeft size={19} />} onClick={() => onMetric("income")} />
        <MetricCard label="Spending" value={monthSpending} note={`${transactions.filter((item) => item.type === "expense" && monthKey(item.date) === selectedMonth).length} transactions · open`} tone="coral" icon={<ArrowUpRight size={19} />} onClick={() => onMetric("expense")} />
        <MetricCard label="Cash flow" value={monthCashFlow} note="Open full ledger" tone="blue" icon={<ArrowLeftRight size={19} />} onClick={() => onMetric("all", "ledger")} />
        <MetricCard label="Savings rate" value={savingsRate} suffix="%" note="Open Coach" tone="gold" icon={<PiggyBank size={19} />} money={false} onClick={() => onView("coach")} />
      </section>

      <div className="dashboard-grid">
        <section className="panel accounts-panel">
          <PanelHeading eyebrow="Accounts" title="Where your money lives" action="See all" onAction={() => onView("money", "accounts")} />
          <div className="account-list">
            {accounts.length ? accounts.slice(0, 4).map((account) => <AccountRow key={account.id} account={account} />) : <EmptyState icon={<WalletCards />} title="Add your first account" copy="Start with a bank, card, cash, or investment account." />}
          </div>
        </section>

        <section className="panel spending-panel">
          <PanelHeading eyebrow="Spending" title="This month by category" action="Open activity" onAction={() => onView("money", "activity")} />
          {categoryTotals.length ? (
            <>
              <div className="category-meter" aria-label="Spending category breakdown">
                {categoryTotals.map(([category, amount]) => (
                  <i key={category} style={{ width: `${(amount / Math.max(monthSpending, 1)) * 100}%`, background: categoryColors[category] || categoryColors.Other }} />
                ))}
              </div>
              <div className="category-list">
                {categoryTotals.slice(0, 5).map(([category, amount]) => (
                  <div key={category}><span><i style={{ background: categoryColors[category] || categoryColors.Other }} />{category}</span><strong>{formatMoney(amount)}</strong></div>
                ))}
              </div>
            </>
          ) : <EmptyState icon={<CircleDollarSign />} title="No spending yet" copy="Add an expense to see the pattern." />}
        </section>

        <section className="panel activity-panel">
          <PanelHeading eyebrow="Activity" title="Recent transactions" action="See all" onAction={() => onView("money", "activity")} />
          <div className="transaction-list compact-list">
            {transactions.length ? transactions.slice(0, 6).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} accounts={data.accounts} />) : <EmptyState icon={<ArrowLeftRight />} title="No activity yet" copy="Transactions you add or import will appear here." />}
          </div>
        </section>

        <section className="panel goal-panel">
          <PanelHeading eyebrow="Next milestone" title={goal ? goal.name : "Create your first goal"} action="Open Future" onAction={() => onView("future")} />
          {goal ? (
            <GoalCard
              goal={goal}
              compact
              contributionOpen={goalContribution === goal.id}
              onContribution={() => setGoalContribution(goalContribution === goal.id ? null : goal.id)}
              contributionAmount={contributionAmount}
              setContributionAmount={setContributionAmount}
              fundGoal={() => fundGoal(goal.id)}
              onEdit={() => onEditGoal(goal)}
            />
          ) : <EmptyState icon={<Target />} title="A future worth funding" copy="Set a shared or personal goal." />}
        </section>

        <section className="panel recurring-panel">
          <PanelHeading eyebrow="On the horizon" title="Upcoming payments" action="Manage" onAction={() => onView("future")} />
          <div className="upcoming-list">
            {recurring.some((item) => item.active) ? recurring.filter((item) => item.active).slice(0, 3).map((item) => (
              <div key={item.id}>
                <span className="date-tile"><strong>{new Date(`${item.nextDate}T12:00:00`).getDate()}</strong><small>{new Date(`${item.nextDate}T12:00:00`).toLocaleDateString("en-SG", { month: "short" })}</small></span>
                <span className="upcoming-name"><strong>{item.name}</strong><small>{item.cadence}</small></span>
                <strong>{formatMoney(item.amount)}</strong>
              </div>
            )) : <EmptyState icon={<Repeat2 />} title="Nothing scheduled" copy="Add recurring bills to see what’s coming." />}
          </div>
        </section>
      </div>
    </div>
  );
}

function MoneyView({ section, setSection, accounts, allAccounts, transactions, monthTransactions, plans, inbox, netWorth, monthIncome, monthSpending, search, setSearch, onAdd, onImport, onApproveInbox, onDismissInbox, onDelete, onEditTransaction, onAddAccount, onEditAccount, selectedMonthLabel, selectedMonth, setSelectedMonth, shiftMonth, mode, setMode, filter, setFilter, period, setPeriod, onSavePlan, onExport, onRestore, onReset, scope }: {
  section: MoneySection;
  setSection: (section: MoneySection) => void;
  accounts: Account[];
  allAccounts: Account[];
  transactions: Transaction[];
  monthTransactions: Transaction[];
  plans: FinanceData["spendingPlans"];
  inbox: InboxItem[];
  netWorth: number;
  monthIncome: number;
  monthSpending: number;
  search: string;
  setSearch: (value: string) => void;
  onAdd: () => void;
  onImport: () => void;
  onApproveInbox: (item: InboxItem) => void;
  onDismissInbox: (item: InboxItem) => void;
  onDelete: (transaction: Transaction) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onAddAccount: () => void;
  onEditAccount: (account: Account) => void;
  selectedMonthLabel: string;
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  shiftMonth: (offset: number) => void;
  mode: ActivityMode;
  setMode: (mode: ActivityMode) => void;
  filter: ActivityFilter;
  setFilter: (filter: ActivityFilter) => void;
  period: ActivityPeriod;
  setPeriod: (period: ActivityPeriod) => void;
  onSavePlan: (category: string, amount: number, scope: SpaceId) => void;
  onExport: () => void;
  onRestore: (file: File) => void;
  onReset: () => void;
  scope: ViewScope;
}) {
  const tabs: Array<{ id: MoneySection; label: string; icon: React.ElementType; count?: number }> = [
    { id: "snapshot", label: "Snapshot", icon: Gauge },
    { id: "activity", label: "Activity", icon: ArrowLeftRight },
    { id: "accounts", label: "Accounts", icon: WalletCards },
    { id: "inbox", label: "Review", icon: Layers3, count: inbox.length },
    { id: "plan", label: "Spending plan", icon: PiggyBank },
  ];
  const assets = accounts.filter((account) => account.balance >= 0);
  const liabilities = accounts.filter((account) => account.balance < 0);

  return (
    <div className="page-stack">
      <PageHeading eyebrow="The full picture" title="Money" copy="Balances, transactions, spending decisions and incoming data—one trusted ledger.">
        <button className="secondary-button" onClick={onImport}><Upload size={17} /> Import</button>
        <button className="primary-button" onClick={onAdd}><Plus size={17} /> Transaction</button>
      </PageHeading>
      <div className="section-tabs money-tabs" role="tablist" aria-label="Money sections">
        {tabs.map(({ id, label, icon: Icon, count }) => <button key={id} className={section === id ? "section-tab section-tab-active" : "section-tab"} onClick={() => setSection(id)} role="tab" aria-selected={section === id}><Icon size={17} />{label}{Boolean(count) && <span>{count}</span>}</button>)}
      </div>

      {section === "snapshot" && <>
        <section className="money-snapshot-grid">
          <div className="money-total-card"><p className="eyebrow">Net worth</p><strong>{formatMoney(netWorth)}</strong><span>Assets {formatMoney(assets.reduce((sum, item) => sum + item.balance, 0))} · Liabilities {formatMoney(Math.abs(liabilities.reduce((sum, item) => sum + item.balance, 0)))}</span></div>
          <div className="money-mini-card"><span><ArrowDownLeft size={17} /> Income</span><strong>{formatMoney(monthIncome)}</strong><small>{selectedMonthLabel}</small></div>
          <div className="money-mini-card"><span><ArrowUpRight size={17} /> Spending</span><strong>{formatMoney(monthSpending)}</strong><small>Transfers excluded</small></div>
          <button className="money-mini-card actionable-card" onClick={() => setSection("activity")}><span><ArrowLeftRight size={17} /> Transactions</span><strong>{monthTransactions.length}</strong><small>{selectedMonthLabel}</small></button>
        </section>
        <div className="dashboard-grid">
          <section className="panel accounts-panel">
            <PanelHeading eyebrow="Balance sheet" title="Assets and liabilities" action="Manage" onAction={() => setSection("accounts")} />
            <div className="account-list">
              {accounts.slice(0, 7).map((account) => <button className="account-edit-row" key={account.id} onClick={() => onEditAccount(account)}><AccountRow account={account} /></button>)}
              {!accounts.length && <EmptyState icon={<WalletCards />} title="Build your balance sheet" copy="Add cash, cards, CPF, investments, property, insurance values and loans." />}
            </div>
          </section>
          <section className="panel spending-panel">
            <PanelHeading eyebrow="Plan vs actual" title="This month" action="Edit plan" onAction={() => setSection("plan")} />
            <SpendingPlanList plans={plans} transactions={monthTransactions} compact onSave={onSavePlan} scope={scope} />
          </section>
        </div>
        <section className="data-controls"><div><p className="eyebrow">Your data</p><strong>Back up, restore, or start over.</strong><span>Restore replaces this workspace from a Lifetime JSON backup. Clearing preserves your profile and Together setup.</span></div><div><button className="secondary-button" onClick={onExport}><Download size={16} /> Download backup</button><label className="secondary-button file-button"><Upload size={16} /> Restore backup<input className="file-input" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onRestore(file); event.target.value = ""; }} /></label><button className="secondary-button danger-button" onClick={onReset}><Trash2 size={16} /> Clear workspace</button></div></section>
      </>}

      {section === "activity" && <ActivityView transactions={transactions} accounts={allAccounts} search={search} setSearch={setSearch} onAdd={onAdd} onImport={onImport} onDelete={onDelete} onEdit={onEditTransaction} selectedMonthLabel={selectedMonthLabel} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} shiftMonth={shiftMonth} mode={mode} setMode={setMode} filter={filter} setFilter={setFilter} period={period} setPeriod={setPeriod} />}
      {section === "accounts" && <AccountsView accounts={accounts} netWorth={netWorth} onAdd={onAddAccount} onEdit={onEditAccount} />}
      {section === "inbox" && <InboxView inbox={inbox} accounts={allAccounts} onImport={onImport} onApprove={onApproveInbox} onDismiss={onDismissInbox} />}
      {section === "plan" && <section className="panel plan-editor-panel"><PanelHeading eyebrow="A plan, not a punishment" title="Monthly spending boundaries" /><SpendingPlanList plans={plans} transactions={monthTransactions} onSave={onSavePlan} scope={scope} /></section>}
    </div>
  );
}

function InboxView({ inbox, accounts, onImport, onApprove, onDismiss }: { inbox: InboxItem[]; accounts: Account[]; onImport: () => void; onApprove: (item: InboxItem) => void; onDismiss: (item: InboxItem) => void }) {
  return (
    <div className="page-stack">
      <PageHeading eyebrow="Human in the loop" title="Review inbox" copy="Imported money waits here until you approve it. Nothing changes a balance silently.">
        <button className="primary-button" onClick={onImport}><Upload size={17} /> Bring in transactions</button>
      </PageHeading>
      <section className="panel inbox-panel">
        <div className="inbox-intro"><span className="inbox-source"><ShieldCheck size={20} /></span><div><strong>{inbox.length ? `${inbox.length} item${inbox.length === 1 ? "" : "s"} waiting for you` : "Your review inbox is clear"}</strong><p>Approve adds the item to the ledger and updates its account balance. Dismiss removes it without touching your finances.</p></div></div>
        <div className="inbox-list">
          {inbox.map((item) => {
            const account = accounts.find((candidate) => candidate.id === item.suggestedAccountId);
            return (
              <div className="inbox-row" key={item.id}>
                <span className="inbox-source">{item.source === "sheet" ? <FileSpreadsheet size={19} /> : <Upload size={19} />}</span>
                <span className="inbox-copy"><strong>{item.description}</strong><small>{formatDate(item.date, true)} · {account?.name || "Account unavailable"}</small><span>{item.suggestedType} · {item.suggestedCategory} · {Math.round(item.confidence * 100)}% match</span></span>
                <strong>{item.suggestedType === "income" ? "+" : item.suggestedType === "expense" ? "−" : ""}{formatMoney(item.amount)}</strong>
                <span className="inbox-actions"><button className="secondary-button" onClick={() => onDismiss(item)}><X size={15} /> Dismiss</button><button className="primary-button" onClick={() => onApprove(item)} disabled={!account}><Check size={15} /> Approve</button></span>
              </div>
            );
          })}
          {!inbox.length && <EmptyState icon={<Layers3 />} title="Nothing needs review" copy="Import a CSV or paste rows from Google Sheets, then choose Review first." />}
        </div>
      </section>
    </div>
  );
}

function SpendingPlanList({ plans, transactions, compact = false, onSave, scope }: { plans: FinanceData["spendingPlans"]; transactions: Transaction[]; compact?: boolean; onSave: (category: string, amount: number, scope: SpaceId) => void; scope: ViewScope }) {
  const spending = new Map<string, number>();
  transactions.filter((item) => item.type === "expense").forEach((item) => spending.set(item.category, (spending.get(item.category) || 0) + item.amount));
  return (
    <div className="plan-list">
      {plans.length
        ? plans.slice(0, compact ? 5 : undefined).map((plan) => <SpendingPlanRow key={plan.id} plan={plan} spent={spending.get(plan.category) || 0} onSave={onSave} />)
        : <EmptyState icon={<PiggyBank />} title="No spending plan yet" copy={compact ? "Set a monthly limit in the spending plan tab and it will be tracked here." : "Choose a category and set a monthly limit to track your spending against it."} />}
      {!compact && <AddSpendingPlan plans={plans} scope={scope} onSave={onSave} />}
    </div>
  );
}

function AddSpendingPlan({ plans, scope, onSave }: { plans: FinanceData["spendingPlans"]; scope: ViewScope; onSave: (category: string, amount: number, scope: SpaceId) => void }) {
  const planSpace: SpaceId = scope === "all" ? "household" : "personal";
  const available = expenseCategories.filter((category) => !plans.some((plan) => plan.category === category && plan.space === planSpace));
  const [category, setCategory] = useState(available[0] || "");
  const [amount, setAmount] = useState("");
  if (!available.length) return null;
  const chosen = available.includes(category) ? category : available[0];

  function submit(event: FormEvent) {
    event.preventDefault();
    const limit = Number(amount);
    if (!chosen || !Number.isFinite(limit) || limit <= 0) return;
    onSave(chosen, limit, planSpace);
    setAmount("");
    setCategory(available.filter((item) => item !== chosen)[0] || "");
  }

  return (
    <form className="plan-add-row" onSubmit={submit}>
      <label className="field"><span>Category</span><select value={chosen} onChange={(event) => setCategory(event.target.value)}>{available.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="field"><span>Monthly limit</span><input required type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="500" /></label>
      <button className="secondary-button" type="submit"><Plus size={16} /> Add plan</button>
    </form>
  );
}

function SpendingPlanRow({ plan, spent, onSave }: { plan: FinanceData["spendingPlans"][number]; spent: number; onSave: (category: string, amount: number, scope: SpaceId) => void }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(plan.monthlyLimit));
  const ratio = plan.monthlyLimit > 0 ? spent / plan.monthlyLimit : 0;
  return <div className="plan-row"><div className="plan-row-top"><span><i style={{ background: categoryColors[plan.category] || categoryColors.Other }} />{plan.category}<small>{formatMoney(spent)} spent</small></span>{editing ? <span className="inline-plan-edit"><input autoFocus type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label={`${plan.category} monthly plan`} /><button onClick={() => { onSave(plan.category, Number(amount) || 0, plan.space); setEditing(false); }}><Check size={15} /></button></span> : <button onClick={() => setEditing(true)}>{formatMoney(plan.monthlyLimit)} <Edit3 size={14} /></button>}</div><div className="plan-progress"><i className={ratio > 1 ? "over-plan" : ""} style={{ width: `${Math.min(100, ratio * 100)}%`, background: categoryColors[plan.category] || categoryColors.Other }} /></div><small>{ratio > 1 ? `${formatMoney(spent - plan.monthlyLimit)} over` : `${formatMoney(Math.max(0, plan.monthlyLimit - spent))} left`}</small></div>;
}

function FutureView({ goals, recurring, events, accounts, forecast, recurringCost, onAddGoal, onAddEvent, onAddRecurring, onToggleRecurring, onEditGoal, onEditEvent, onEditRecurring, goalContribution, setGoalContribution, contributionAmount, setContributionAmount, fundGoal, onToggleEvent }: {
  goals: Goal[]; recurring: RecurringItem[]; events: PlannedEvent[]; accounts: Account[]; forecast: FinanceForecast; recurringCost: number; onAddGoal: () => void; onAddEvent: () => void; onAddRecurring: () => void; onToggleRecurring: (id: string) => void; onEditGoal: (goal: Goal) => void; onEditEvent: (event: PlannedEvent) => void; onEditRecurring: (item: RecurringItem) => void; goalContribution: string | null; setGoalContribution: (id: string | null) => void; contributionAmount: string; setContributionAmount: (value: string) => void; fundGoal: (id: string) => void; onToggleEvent: (id: string) => void;
}) {
  const plannedTotal = events.filter((item) => item.includeInPlan).reduce((sum, item) => sum + item.amount, 0);
  const hasForecastEvidence = forecast.historyMonths > 0;
  return <div className="page-stack"><PageHeading eyebrow="From today to someday" title="Future" copy="Goals, life plans and scenarios share one model, so every choice reveals its trade-off."><button className="secondary-button" onClick={onAddEvent}><CalendarDays size={17} /> Plan an event</button><button className="primary-button" onClick={onAddGoal}><Target size={17} /> New goal</button></PageHeading>
    <section className="future-hero"><div><p className="eyebrow hero-eyebrow">Forecast runway</p><h2>{hasForecastEvidence ? `${formatMoney(Math.abs(forecast.monthlySurplus))} monthly ${forecast.monthlySurplus < 0 ? "deficit" : "surplus"}` : "Waiting for real activity"}</h2><p>{hasForecastEvidence ? `Based on ${forecast.historyMonths} month${forecast.historyMonths === 1 ? "" : "s"} of activity · ${forecast.confidence} confidence` : "Add an account and transactions before relying on a forecast."}</p></div><div className="future-stat"><span>Safe to spend</span><strong>{hasForecastEvidence ? formatMoney(forecast.safeToSpend) : "Not available"}</strong><small>{hasForecastEvidence ? "after goal contributions" : "needs income and spending"}</small></div><div className="future-stat"><span>Emergency cover</span><strong>{hasForecastEvidence ? `${forecast.emergencyMonths.toFixed(1)} months` : "Not available"}</strong><small>{hasForecastEvidence ? `${formatMoney(forecast.liquidBalance)} liquid` : "needs a liquid balance"}</small></div></section>
    <section className="goal-runway-grid">{goals.map((goal) => { const model = forecast.goalForecasts.find((item) => item.goalId === goal.id); return <button className="runway-card" key={goal.id} onClick={() => onEditGoal(goal)}><div className="runway-top"><span className={`goal-symbol goal-${goal.icon}`}><Target size={18} /></span><span className={model?.onTrack ? "status-on-track" : "status-watch"}>{model?.onTrack ? "On track" : "Needs attention"}</span></div><h3>{goal.name}</h3><strong>{model?.estimatedDate ? new Date(`${model.estimatedDate}T12:00:00`).toLocaleDateString("en-SG", { month: "long", year: "numeric" }) : "No forecast yet"}</strong><p>{model?.plannedEventDelayMonths ? `Planned events add about ${model.plannedEventDelayMonths} months.` : "No planned event delay modelled."}</p><div className="goal-progress"><i style={{ width: `${Math.min(100, (goal.current / goal.target) * 100)}%` }} /></div><small>{formatMoney(goal.current)} of {formatMoney(goal.target)} · tap to edit</small></button>; })}{!goals.length && <EmptyState icon={<Target />} title="Give the future a number" copy="Create a goal and Lifetime will estimate when you can reach it." />}</section>
    <div className="dashboard-grid"><section className="panel scenario-panel"><PanelHeading eyebrow="Scenario lab" title="What your plans change" action="Add event" onAction={onAddEvent} /><div className="scenario-summary"><span>Included life plans</span><strong>{formatMoney(plannedTotal)}</strong><small>Turn an event off to compare the forecast without it.</small></div><div className="event-list">{events.map((event) => <div className={event.includeInPlan ? "event-row" : "event-row event-muted"} key={event.id}><span className="event-date"><strong>{new Date(`${event.date}T12:00:00`).toLocaleDateString("en-SG", { month: "short" })}</strong><small>{new Date(`${event.date}T12:00:00`).getFullYear()}</small></span><button className="event-copy" onClick={() => onEditEvent(event)}><strong>{event.name}</strong><small>{event.kind} · tap to edit</small></button><strong>{formatMoney(event.amount)}</strong><button className={event.includeInPlan ? "tiny-toggle tiny-toggle-on" : "tiny-toggle"} onClick={() => onToggleEvent(event.id)} aria-label={`${event.includeInPlan ? "Exclude" : "Include"} ${event.name} in forecast`}><i /></button></div>)}{!events.length && <EmptyState icon={<CalendarDays />} title="No life plans yet" copy="Add a trip, move, car, education, or family event to model the trade-off." />}</div></section><section className="panel forecast-explain"><span className="coach-glance-icon"><WandSparkles size={21} /></span><p className="eyebrow">Scenario signal</p><h3>{plannedTotal ? `${formatMoney(plannedTotal)} of plans are competing with your goals.` : "No planned events are competing with your goals."}</h3><p>{forecast.goalForecasts.some((item) => item.plannedEventDelayMonths > 0) ? `The largest modelled delay is ${Math.max(...forecast.goalForecasts.map((item) => item.plannedEventDelayMonths))} months. Lifetime recalculates this when spending or contributions change.` : "Your forecast currently has no event-driven delays."}</p><small>Forecasts are estimates, not guarantees. Evidence: transaction averages, current balances, goal contributions and included events.</small></section></div>
    <PlansView goals={goals} recurring={recurring} accounts={accounts} recurringCost={recurringCost} onAddGoal={onAddGoal} onAddRecurring={onAddRecurring} onToggleRecurring={onToggleRecurring} onEditGoal={onEditGoal} onEditRecurring={onEditRecurring} goalContribution={goalContribution} setGoalContribution={setGoalContribution} contributionAmount={contributionAmount} setContributionAmount={setContributionAmount} fundGoal={fundGoal} />
  </div>;
}

function CoachView({ data, scope, forecast, categoryTotals, qwenConfigured, onCapture }: { data: FinanceData; scope: ViewScope; forecast: FinanceForecast; categoryTotals: [string, number][]; qwenConfigured: boolean; onCapture: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "coach"; text: string }>>([]);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasEvidence = forecast.historyMonths > 0;
  useEffect(() => {
    const listener = (event: Event) => { const value = (event as CustomEvent<string>).detail; if (value) { setPrompt(value); window.setTimeout(() => document.getElementById("coach-submit")?.click(), 20); } };
    window.addEventListener("lifetime-coach-question", listener);
    return () => window.removeEventListener("lifetime-coach-question", listener);
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, thinking]);
  function localCoach(question: string) {
    if (!hasEvidence) return "I don’t have enough real financial data to assess your position yet. Add an account, then log or import income and spending. Once there is activity, I can explain cash flow, resilience, and goal trade-offs without inventing a signal.";
    const lower = question.toLowerCase();
    if (lower.includes("emergency") || lower.includes("safe")) return `You have about ${forecast.emergencyMonths.toFixed(1)} months of liquid cover. After current goal contributions, the model leaves ${formatMoney(forecast.safeToSpend)} flexible each month. I’d protect the emergency buffer before raising discretionary plans.`;
    if (lower.includes("goal") || lower.includes("afford") || lower.includes("trip")) { const delayed = Math.max(0, ...forecast.goalForecasts.map((item) => item.plannedEventDelayMonths)); return delayed ? `Your included life plans could push the most affected goal back by about ${delayed} months. That estimate uses the plan costs divided by the goal’s current monthly contribution; change either input and it recalculates.` : "Your current goal model does not show an event-driven delay. Add a future event with a cost to compare the trade-off."; }
    return `The strongest signal is a modelled monthly ${forecast.monthlySurplus < 0 ? "deficit" : "surplus"} of ${formatMoney(Math.abs(forecast.monthlySurplus))} with ${forecast.confidence} confidence. Your largest current spending category is ${categoryTotals[0]?.[0] || "not established yet"}. Add more history or ask about a specific goal for a sharper answer.`;
  }
  async function ask(questionOverride?: string) {
    const question = (questionOverride || prompt).trim();
    if (!question || thinking) return;
    setPrompt(""); setMessages((current) => [...current, { role: "user", text: question }]); setThinking(true);
    let answer = localCoach(question);
    if (qwenConfigured) {
      try {
        const response = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "coach", prompt: question, context: { scope, forecast, goals: data.goals, plannedEvents: data.plannedEvents, categories: categoryTotals.slice(0, 6), accounts: data.accounts.map(({ name, type, balance, space }) => ({ name, type, balance, space })) }, lexicon: data.profile.voiceLexicon }) });
        const payload = await response.json() as { answer?: string };
        if (response.ok && payload.answer) answer = payload.answer;
      } catch { /* deterministic answer remains available */ }
    }
    setMessages((current) => [...current, { role: "coach", text: answer }]); setThinking(false);
  }
  return <div className="page-stack"><PageHeading eyebrow="Evidence, explained" title="Coach" copy="A financial co-pilot that reasons from your numbers, shows assumptions and never moves money for you."><button className="primary-button" onClick={onCapture}><Mic size={17} /> Ask by voice</button></PageHeading>
    <section className="coach-brief"><div className="coach-avatar"><WandSparkles size={24} /></div><div><p className="eyebrow">Your brief today</p><h2>{!hasEvidence ? "Not enough data to assess your foundation yet." : forecast.goalForecasts.some((item) => !item.onTrack) ? "One plan deserves a closer look." : "Your current numbers look stable."}</h2><p>{!hasEvidence ? "Add an account and at least one real transaction. Until then, Lifetime will not invent a verdict from zeroes." : `${forecast.emergencyMonths >= 6 ? "Your liquid buffer is above six months of modelled spending." : `Your liquid buffer covers ${forecast.emergencyMonths.toFixed(1)} months of modelled spending.`} ${forecast.safeToSpend > 0 ? `${formatMoney(forecast.safeToSpend)} remains flexible after goal contributions.` : "There is no unallocated surplus in the current model."}`}</p><span>{hasEvidence ? `Confidence: ${forecast.confidence} · ${forecast.historyMonths} months of ledger evidence` : "Confidence: unavailable · waiting for real ledger evidence"}</span></div></section>
    <div className="coach-layout"><section className="panel coach-chat"><div className="coach-thread" ref={scrollRef}>{!messages.length && <div className="coach-starters"><p>Try asking</p>{["Can I afford my planned trip?", "How strong is my emergency fund?", "What is slowing down my goals?"].map((item) => <button key={item} onClick={() => ask(item)}>{item}<ChevronRight size={15} /></button>)}</div>}{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`coach-message coach-message-${message.role}`}>{message.role === "coach" && <span><WandSparkles size={15} /></span>}<p>{message.text}</p></div>)}{thinking && <div className="coach-thinking"><i /><i /><i /></div>}</div><form className="coach-composer" onSubmit={(event) => { event.preventDefault(); ask(); }}><button type="button" onClick={onCapture} aria-label="Ask by voice"><Mic size={19} /></button><input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask about a goal, trade-off, or pattern…" /><button id="coach-submit" className="primary-button" type="submit">Ask</button></form></section><aside className="coach-evidence"><div className="evidence-card"><span><Gauge size={18} /> Monthly model</span><strong>{hasEvidence ? `${formatMoney(forecast.averageIncome)} in` : "Waiting for data"}</strong><p>{hasEvidence ? `${formatMoney(forecast.averageSpending)} average spending` : "No income or spending assessed"}</p></div><div className="evidence-card"><span><ShieldCheck size={18} /> Resilience</span><strong>{hasEvidence ? `${forecast.emergencyMonths.toFixed(1)} months` : "Not assessed"}</strong><p>{hasEvidence ? `${formatMoney(forecast.liquidBalance)} liquid` : "Add balances and activity"}</p></div><div className="evidence-card"><span><Target size={18} /> Goals</span><strong>{forecast.goalForecasts.length ? `${forecast.goalForecasts.filter((item) => item.onTrack).length} on track` : "No goals yet"}</strong><p>{forecast.goalForecasts.length} modelled</p></div><p className="evidence-note">Coach explains the deterministic model. It does not calculate balances itself or recommend securities.</p></aside></div>
  </div>;
}

function TogetherView({ data, accounts, members, viewerEmail, onSetup, onEditAccount }: { data: FinanceData; accounts: Account[]; members: Array<{ email: string; display_name: string; role: string; status: string }>; viewerEmail: string; onSetup: () => void; onEditAccount: (account: Account) => void }) {
  const sharedAccounts = data.accounts.filter((item) => item.space === "household");
  const personalAccounts = data.accounts.filter((item) => item.space === "personal");
  const visibleMembers = members.length ? members : [{ email: viewerEmail, display_name: data.profile.name, role: "owner", status: "active" }, ...(data.profile.partnerEmail ? [{ email: data.profile.partnerEmail, display_name: data.profile.partnerName, role: "member", status: "pending" }] : [])];
  return <div className="page-stack"><PageHeading eyebrow="Private by default, shared on purpose" title={data.profile.householdName || "Together"} copy="Together combines your private records with records deliberately shared between members. The other person never receives your Personal records."><button className="primary-button" onClick={onSetup}><Settings2 size={17} /> Manage Together</button></PageHeading>
    <section className="household-hero"><div className="household-orbits"><span className="avatar">{data.profile.name.slice(0, 1)}</span><span className="avatar partner-avatar">{data.profile.partnerName?.slice(0, 1) || "P"}</span></div><div><p className="eyebrow hero-eyebrow">Together, with boundaries</p><h2>{formatMoney(sharedAccounts.reduce((sum, item) => sum + item.balance, 0))} shared net worth</h2><p>{sharedAccounts.length} shared accounts · {personalAccounts.length} personal accounts stay private in each member’s Personal view.</p></div></section>
    <div className="dashboard-grid"><section className="panel members-panel"><PanelHeading eyebrow="People and access" title="Together members" action="Manage" onAction={onSetup} /><div className="member-list">{visibleMembers.map((member) => <div key={member.email}><span className="avatar">{(member.display_name || member.email).slice(0, 1).toUpperCase()}</span><span><strong>{member.display_name || member.email}</strong><small>{member.email}</small></span><span className={member.status === "active" ? "member-status active-member" : "member-status"}>{member.status === "active" ? "Active" : "Invite pending"}</span><small>{member.role}</small></div>)}</div><div className="info-note"><ShieldCheck size={17} /><span>An invitation is activated only when that person signs in with the same verified Google email. Database access rules keep every Personal space owner-only.</span></div></section><section className="panel access-panel"><PanelHeading eyebrow="Visibility" title="What the other person can see" /><div className="privacy-map"><div><span>Personal</span><strong>{personalAccounts.length} accounts</strong><small>Only you can read these records.</small></div><div><span>Shared in Together</span><strong>{sharedAccounts.length} accounts</strong><small>Visible to active Together members.</small></div></div><p className="privacy-caption">Your Together dashboard currently combines {accounts.length} accounts visible to you, without counting transfers as income or spending.</p></section></div>
    <section className="panel household-accounts"><PanelHeading eyebrow="Shared balance sheet" title="Accounts shared in Together" /><div className="account-card-grid">{sharedAccounts.map((account) => <AccountCard key={account.id} account={account} onEdit={() => onEditAccount(account)} />)}{!sharedAccounts.length && <EmptyState icon={<Users />} title="Nothing shared yet" copy="Edit an account and set its visibility to Shared in Together." />}</div></section>
  </div>;
}

function ActivityView({ transactions, accounts, search, setSearch, onAdd, onImport, onDelete, onEdit, selectedMonthLabel, selectedMonth, setSelectedMonth, shiftMonth, mode, setMode, filter, setFilter, period, setPeriod }: {
  transactions: Transaction[];
  accounts: Account[];
  search: string;
  setSearch: (value: string) => void;
  onAdd: () => void;
  onImport: () => void;
  onDelete: (transaction: Transaction) => void;
  onEdit: (transaction: Transaction) => void;
  selectedMonthLabel: string;
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  shiftMonth: (offset: number) => void;
  mode: ActivityMode;
  setMode: (mode: ActivityMode) => void;
  filter: ActivityFilter;
  setFilter: (filter: ActivityFilter) => void;
  period: ActivityPeriod;
  setPeriod: (period: ActivityPeriod) => void;
}) {
  const grouped = transactions.reduce<Record<string, Transaction[]>>((result, transaction) => {
    (result[transaction.date] ||= []).push(transaction);
    return result;
  }, {});
  const visibleIncome = transactions.filter((transaction) => transaction.type === "income").reduce((sum, transaction) => sum + transaction.amount, 0);
  const visibleSpending = transactions.filter((transaction) => transaction.type === "expense").reduce((sum, transaction) => sum + transaction.amount, 0);
  const visibleCashFlow = visibleIncome - visibleSpending;

  return (
    <div className="page-stack activity-page">
      <PageHeading eyebrow="Unified ledger" title="Activity" copy={`Every movement, across every account. Transfers never count as income or spending.`}>
        <button className="secondary-button" onClick={onImport}><Upload size={17} /> Import</button>
        <button className="primary-button" onClick={onAdd}><Plus size={18} /> Add transaction</button>
      </PageHeading>

      <section className="activity-sticky-summary">
        <div className="activity-summary-top">
          <div className="activity-month-stepper">
            <button disabled={period === "all"} onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <label><CalendarDays size={17} /><strong>{period === "all" ? "All transactions" : selectedMonthLabel}</strong><input disabled={period === "all"} type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} aria-label="Choose activity month" /></label>
            <button disabled={period === "all"} onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
          </div>
          <div className="activity-balance">
            <span>{filter === "all" ? "Net cash flow" : "Filtered flow"}</span>
            <strong className={visibleCashFlow < 0 ? "negative-value" : ""}>{visibleCashFlow >= 0 ? "+" : ""}{formatMoney(visibleCashFlow)}</strong>
          </div>
          <div className="activity-mini-stat"><span>In</span><strong>+{formatMoney(visibleIncome)}</strong></div>
          <div className="activity-mini-stat"><span>Out</span><strong>−{formatMoney(visibleSpending)}</strong></div>
        </div>

        <div className="activity-controls">
          <div className="view-switcher" aria-label="Activity layout">
            <button className={mode === "feed" ? "view-active" : ""} onClick={() => setMode("feed")}><List size={17} /> Feed</button>
            <button className={mode === "ledger" ? "view-active" : ""} onClick={() => setMode("ledger")}><Table2 size={17} /> Ledger</button>
          </div>
          <label className="search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant, category, or note" /></label>
          <label className="select-filter"><span className="sr-only">Transaction type</span><select value={filter} onChange={(event) => setFilter(event.target.value as ActivityFilter)}><option value="all">All types</option><option value="expense">Expenses</option><option value="income">Income</option><option value="transfer">Transfers</option></select><ChevronDown size={15} /></label>
          <label className="select-filter period-filter"><span className="sr-only">Date range</span><select value={period} onChange={(event) => setPeriod(event.target.value as ActivityPeriod)}><option value="month">This month</option><option value="all">All time</option></select><ChevronDown size={15} /></label>
        </div>
      </section>

      {mode === "feed" ? (
        <section className="panel activity-feed-panel">
          {Object.entries(grouped).length ? Object.entries(grouped).map(([date, items]) => (
            <div className="transaction-day" key={date}>
              <div className="day-heading"><span>{formatDate(date)}</span><small>{items.length} item{items.length === 1 ? "" : "s"}</small></div>
              {items.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} accounts={accounts} showSpace onEdit={() => onEdit(transaction)} onDelete={() => onDelete(transaction)} />
              ))}
            </div>
          )) : <EmptyState icon={<Search />} title="Nothing matched" copy="Try another month or filter, or add a transaction." />}
        </section>
      ) : (
        <LedgerTable transactions={transactions} accounts={accounts} onEdit={onEdit} onDelete={onDelete} />
      )}
    </div>
  );
}

function LedgerTable({ transactions, accounts, onEdit, onDelete }: { transactions: Transaction[]; accounts: Account[]; onEdit: (transaction: Transaction) => void; onDelete: (transaction: Transaction) => void }) {
  return (
    <section className="panel spreadsheet-shell">
      {transactions.length ? (
        <div className="spreadsheet-scroll">
          <table className="transaction-table">
            <thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Category</th><th>Space</th><th>Type</th><th>Amount</th><th aria-label="Actions" /></tr></thead>
            <tbody>{transactions.map((transaction) => {
              const account = accounts.find((candidate) => candidate.id === transaction.accountId);
              return (
                <tr key={transaction.id} onClick={() => onEdit(transaction)}>
                  <td>{formatDate(transaction.date, true)}</td>
                  <td><strong>{transaction.description}</strong>{transaction.note && <small>{transaction.note}</small>}</td>
                  <td>{account?.name || "Unknown"}</td>
                  <td>{transaction.category}</td>
                  <td>{transaction.space === "household" ? "Together" : "Personal"}</td>
                  <td><span className={`table-type type-${transaction.type}`}>{transaction.type}</span></td>
                  <td className={`table-amount amount-${transaction.type}`}>{transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : ""}{formatMoney(transaction.amount)}</td>
                  <td><div className="table-actions"><button onClick={(event) => { event.stopPropagation(); onEdit(transaction); }} aria-label={`Edit ${transaction.description}`}><Edit3 size={16} /></button><button onClick={(event) => { event.stopPropagation(); onDelete(transaction); }} aria-label={`Delete ${transaction.description}`}><Trash2 size={16} /></button></div></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      ) : <EmptyState icon={<Table2 />} title="Your ledger is clear" copy="Adjust the filters or add your first transaction for this month." />}
    </section>
  );
}

function AccountsView({ accounts, netWorth, onAdd, onEdit }: { accounts: Account[]; netWorth: number; onAdd: () => void; onEdit: (account: Account) => void }) {
  const liquid = accounts.filter((account) => ["checking", "savings", "cash"].includes(account.type)).reduce((sum, account) => sum + account.balance, 0);
  const investments = accounts.filter((account) => account.type === "investment").reduce((sum, account) => sum + account.balance, 0);
  const credit = accounts.filter((account) => account.type === "credit").reduce((sum, account) => sum + Math.abs(Math.min(0, account.balance)), 0);

  return (
    <div className="page-stack">
      <PageHeading eyebrow="Balance sheet" title="Accounts" copy="One calm view of cash, savings, cards, and investments.">
        <button className="primary-button" onClick={onAdd}><Plus size={18} /> Add account</button>
      </PageHeading>
      <section className="accounts-hero">
        <div><p className="eyebrow">Total net worth</p><strong>{formatMoney(netWorth)}</strong><span><WalletCards size={15} /> Across {accounts.length} account{accounts.length === 1 ? "" : "s"}</span></div>
        <div className="balance-breakdown">
          <div><span>Cash & savings</span><strong>{formatMoney(liquid)}</strong></div>
          <div><span>Investments</span><strong>{formatMoney(investments)}</strong></div>
          <div><span>Card balance</span><strong>{formatMoney(credit)}</strong></div>
        </div>
      </section>
      <section className="account-card-grid">
        {accounts.map((account) => <AccountCard key={account.id} account={account} onEdit={() => onEdit(account)} />)}
        <button className="add-account-card" onClick={onAdd}><span><Plus size={22} /></span><strong>Add another account</strong><small>Bank, card, cash, or investment</small></button>
      </section>
    </div>
  );
}

function PlansView({ goals, recurring, accounts, recurringCost, onAddGoal, onAddRecurring, onToggleRecurring, onEditGoal, onEditRecurring, goalContribution, setGoalContribution, contributionAmount, setContributionAmount, fundGoal }: {
  goals: Goal[];
  recurring: RecurringItem[];
  accounts: Account[];
  recurringCost: number;
  onAddGoal: () => void;
  onAddRecurring: () => void;
  onToggleRecurring: (id: string) => void;
  onEditGoal: (goal: Goal) => void;
  onEditRecurring: (item: RecurringItem) => void;
  goalContribution: string | null;
  setGoalContribution: (id: string | null) => void;
  contributionAmount: string;
  setContributionAmount: (value: string) => void;
  fundGoal: (id: string) => void;
}) {
  return (
    <div className="page-stack">
      <PageHeading eyebrow="The life ahead" title="Plans" copy="Shared ambitions and quiet personal goals, each with a clear path.">
        <button className="secondary-button" onClick={onAddRecurring}><Repeat2 size={17} /> Add recurring</button>
        <button className="primary-button" onClick={onAddGoal}><Plus size={18} /> New goal</button>
      </PageHeading>

      <div className="section-heading"><div><p className="eyebrow">Milestones</p><h2>Goals in motion</h2></div><span>{goals.length} active</span></div>
      <section className="goal-grid">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            contributionOpen={goalContribution === goal.id}
            onContribution={() => setGoalContribution(goalContribution === goal.id ? null : goal.id)}
            contributionAmount={contributionAmount}
            setContributionAmount={setContributionAmount}
            fundGoal={() => fundGoal(goal.id)}
            onEdit={() => onEditGoal(goal)}
          />
        ))}
        {!goals.length && <EmptyState icon={<Target />} title="No goals in this view" copy="Create a personal or shared milestone." />}
      </section>

      <div className="section-heading plans-recurring-heading"><div><p className="eyebrow">Predictable spending</p><h2>Recurring payments</h2></div><span>{formatMoney(recurringCost)}/month</span></div>
      <section className="panel recurring-table">
        <div className="recurring-table-head"><span>Payment</span><span>Paid from</span><span>Next date</span><span>Amount</span><span>Actions</span></div>
        {recurring.map((item) => {
          const account = accounts.find((candidate) => candidate.id === item.accountId);
          return (
            <div className={!item.active ? "recurring-row muted-row" : "recurring-row"} key={item.id}>
              <span className="recurring-main"><i><Repeat2 size={17} /></i><span><strong>{item.name}</strong><small>{item.category} · {item.cadence}</small></span></span>
              <span>{account?.name || "Unknown"}</span>
              <span>{formatDate(item.nextDate, true)}</span>
              <strong>{formatMoney(item.amount)}</strong>
              <span className="item-actions"><button className="edit-item-button" onClick={() => onEditRecurring(item)} aria-label={`Edit ${item.name}`}><Edit3 size={16} /></button><button className={item.active ? "status-toggle active" : "status-toggle"} onClick={() => onToggleRecurring(item.id)} aria-label={`${item.active ? "Pause" : "Resume"} ${item.name}`}><i /></button></span>
            </div>
          );
        })}
        {!recurring.length && <EmptyState icon={<Repeat2 />} title="Nothing recurring yet" copy="Add subscriptions, bills, memberships, and annual renewals." />}
      </section>
    </div>
  );
}

function MetricCard({ label, value, note, tone, icon, suffix = "", money = true, onClick }: { label: string; value: number; note: string; tone: string; icon: React.ReactNode; suffix?: string; money?: boolean; onClick: () => void }) {
  return (
    <button className={`metric-card metric-${tone}`} onClick={onClick}>
      <div className="metric-top"><span>{label}</span><i>{icon}</i></div>
      <strong>{money ? formatMoney(value) : `${value.toFixed(0)}${suffix}`}</strong>
      <small>{note}<ChevronRight size={14} /></small>
    </button>
  );
}

function PanelHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="panel-heading">
      <div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div>
      {action && <button className="text-button" onClick={onAction}>{action}<ChevronRight size={16} /></button>}
    </div>
  );
}

function PageHeading({ eyebrow, title, copy, children }: { eyebrow: string; title: string; copy: string; children?: React.ReactNode }) {
  return (
    <header className="page-heading">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></div>
      {children && <div className="page-heading-actions">{children}</div>}
    </header>
  );
}

function accountIcon(type: AccountType) {
  if (type === "credit") return CreditCard;
  if (type === "investment") return TrendingUp;
  if (type === "savings" || type === "cpf" || type === "insurance") return PiggyBank;
  if (type === "property") return Home;
  if (type === "loan") return CircleDollarSign;
  return Landmark;
}

function AccountRow({ account }: { account: Account }) {
  const Icon = accountIcon(account.type);
  return (
    <div className="account-row">
      <span className={`account-icon accent-${account.accent}`}><Icon size={18} /></span>
      <span className="account-name"><strong>{account.name}</strong><small>{account.institution}{account.last4 ? ` · •${account.last4}` : ` · ${accountTypeLabels[account.type]}`}</small></span>
      <span className="account-scope">{account.space === "household" ? <Users size={13} /> : <UserRound size={13} />}{account.space === "household" ? "Shared" : "Personal"}</span>
      <strong className={account.balance < 0 ? "negative-value" : ""}>{formatMoney(account.balance)}</strong>
    </div>
  );
}

function AccountCard({ account, onEdit }: { account: Account; onEdit: () => void }) {
  const Icon = accountIcon(account.type);
  return (
    <button className={`account-card account-card-${account.accent}`} onClick={onEdit} aria-label={`Edit ${account.name}`}>
      <div className="account-card-top"><span><Icon size={20} /></span><span className="edit-account-pill"><Edit3 size={15} /> Edit</span></div>
      <p>{account.institution}</p>
      <h3>{account.name}</h3>
      <strong>{formatMoney(account.balance)}</strong>
      <div><span>{accountTypeLabels[account.type]}{account.last4 ? ` · •${account.last4}` : ""}</span><span>{account.space === "household" ? <Users size={14} /> : <UserRound size={14} />}{account.space === "household" ? "Shared" : account.owner}</span></div>
    </button>
  );
}

function TransactionRow({ transaction, accounts, showSpace = false, onDelete, onEdit }: { transaction: Transaction; accounts: Account[]; showSpace?: boolean; onDelete?: () => void; onEdit?: () => void }) {
  const source = accounts.find((account) => account.id === transaction.accountId);
  const destination = accounts.find((account) => account.id === transaction.transferAccountId);
  const Icon = transaction.type === "income" ? ArrowDownLeft : transaction.type === "transfer" ? ArrowLeftRight : ArrowUpRight;
  return (
    <div className={`transaction-row ${onEdit ? "editable-row" : ""}`} onClick={onEdit} onKeyDown={(event) => { if (onEdit && (event.key === "Enter" || event.key === " ")) onEdit(); }} role={onEdit ? "button" : undefined} tabIndex={onEdit ? 0 : undefined}>
      <span className={`transaction-icon transaction-${transaction.type}`}><Icon size={18} /></span>
      <span className="transaction-name">
        <strong>{transaction.description}</strong>
        <small>{transaction.type === "transfer" ? `${source?.name || "Account"} → ${destination?.name || "Account"}` : `${transaction.category} · ${source?.name || "Account"}`}</small>
      </span>
      {showSpace && <span className="transaction-space">{transaction.space === "household" ? <Users size={13} /> : <UserRound size={13} />}{transaction.space === "household" ? "Shared" : "Personal"}</span>}
      <span className="transaction-date">{formatDate(transaction.date, true)}</span>
      <strong className={`transaction-amount amount-${transaction.type}`}>
        {transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : ""}{formatMoney(transaction.amount)}
      </strong>
      {(onEdit || onDelete) && <span className="row-actions">{onEdit && <button onClick={(event) => { event.stopPropagation(); onEdit(); }} aria-label={`Edit ${transaction.description}`}><Edit3 size={16} /></button>}{onDelete && <button onClick={(event) => { event.stopPropagation(); onDelete(); }} aria-label={`Delete ${transaction.description}`}><Trash2 size={16} /></button>}</span>}
    </div>
  );
}

function GoalCard({ goal, compact = false, contributionOpen, onContribution, contributionAmount, setContributionAmount, fundGoal, onEdit }: {
  goal: Goal;
  compact?: boolean;
  contributionOpen: boolean;
  onContribution: () => void;
  contributionAmount: string;
  setContributionAmount: (value: string) => void;
  fundGoal: () => void;
  onEdit?: () => void;
}) {
  const progress = Math.min(100, (goal.current / goal.target) * 100);
  const Icon = goal.icon === "home" ? Home : goal.icon === "shield" ? ShieldCheck : Sparkles;
  return (
    <article className={compact ? "goal-card compact-goal" : "goal-card"}>
      <div className="goal-card-top"><span className="goal-icon"><Icon size={19} /></span><span className="goal-card-tools"><span className="space-badge">{goal.space === "household" ? <Users size={13} /> : <UserRound size={13} />}{goal.space === "household" ? "Shared" : "Personal"}</span>{onEdit && <button className="edit-item-button" onClick={onEdit} aria-label={`Edit ${goal.name}`}><Edit3 size={15} /></button>}</span></div>
      {!compact && <h3>{goal.name}</h3>}
      <div className="goal-numbers"><strong>{formatMoney(goal.current)}</strong><span>of {formatMoney(goal.target)}</span></div>
      <div className="goal-progress"><i style={{ width: `${progress}%` }} /></div>
      <div className="goal-footer"><span>{progress.toFixed(0)}% funded</span><span>Target {formatDate(goal.targetDate, true)}</span></div>
      <button className="goal-contribute" onClick={onContribution}><Plus size={15} /> Add contribution</button>
      {contributionOpen && (
        <div className="contribution-form">
          <label><span>S$</span><input autoFocus type="number" min="0" step="10" value={contributionAmount} onChange={(event) => setContributionAmount(event.target.value)} placeholder="500" /></label>
          <button onClick={fundGoal}>Add</button>
        </div>
      )}
    </article>
  );
}

function EmptyState({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{copy}</p></div>;
}

function AccountRequired({ forWhat, onAddAccount }: { forWhat: string; onAddAccount: () => void }) {
  return (
    <div className="account-required">
      <span><WalletCards size={23} /></span>
      <h3>First, add where this money lives.</h3>
      <p>{forWhat} needs a real account so balances and transfers stay accurate. You will return here immediately after adding it.</p>
      <button className="primary-button" onClick={onAddAccount}><Plus size={17} /> Add first account</button>
    </div>
  );
}

function ModalShell({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  const titleId = React.useId();
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><div><p className="eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></header>
        {children}
      </section>
    </div>
  );
}

function ConfirmationModal({ confirmation, onClose, onConfirm }: { confirmation: Confirmation; onClose: () => void; onConfirm: () => void }) {
  return (
    <ModalShell eyebrow="Please confirm" title={confirmation.title} onClose={onClose}>
      <div className="confirmation-copy"><span><Trash2 size={22} /></span><p>{confirmation.copy}</p></div>
      <div className="form-actions"><button className="secondary-button" onClick={onClose}>Keep it</button><button className="primary-button destructive-button" onClick={onConfirm}>{confirmation.actionLabel}</button></div>
    </ModalShell>
  );
}

type SpeechRecognizer = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function localCaptureDraft(text: string, accounts: Account[], scope: ViewScope): Partial<Transaction> {
  const lower = text.toLowerCase();
  const amountMatch = text.match(/(?:s\$|\$)?\s*(\d+(?:\.\d{1,2})?)/i);
  const type: TransactionType = /\b(transfer|move|shift|paynow to)\b/.test(lower) ? "transfer" : /\b(salary|income|earned|received|refund)\b/.test(lower) ? "income" : "expense";
  const account = accounts.find((item) => lower.includes(item.name.toLowerCase()) || lower.includes(item.institution.toLowerCase())) || accounts.find((item) => item.space === (scope === "all" ? "household" : "personal")) || accounts[0];
  const destination = type === "transfer" ? accounts.find((item) => item.id !== account?.id && lower.includes(item.name.toLowerCase())) : undefined;
  const category = /grab|taxi|mrt|bus|transport/.test(lower) ? "Transport" : /grocery|fairprice|cold storage|supermarket/.test(lower) ? "Groceries" : /netflix|movie|spotify|entertainment/.test(lower) ? "Entertainment" : /doctor|gym|health|physio/.test(lower) ? "Health" : /rent|utility|home/.test(lower) ? "Home" : /trip|flight|hotel|travel/.test(lower) ? "Travel" : "Food & dining";
  let description = text.replace(/(?:s\$|\$)?\s*\d+(?:\.\d{1,2})?/i, "").replace(/\b(i|just|spent|paid|received|earned|transfer|transferred|move|moved|dollars?|bucks?|at|from|using|today|yesterday)\b/gi, " ").replace(/\s+/g, " ").trim();
  description = description.replace(/^to\s+/i, "").replace(/\s+to\s+.+$/i, "").trim() || (type === "transfer" ? "Account transfer" : type === "income" ? "Income" : "Expense");
  return { type, amount: amountMatch ? Number(amountMatch[1]) : undefined, description, date: todayIso(), category: type === "expense" ? category : type === "income" ? "Income" : "Transfer", accountId: account?.id, transferAccountId: destination?.id, space: account?.space || (scope === "all" ? "household" : "personal"), source: "voice" };
}

function CaptureModal({ accounts, profile, scope, qwenConfigured, onClose, onTransaction, onPlan, onAsk, onProfile }: { accounts: Account[]; profile: FinanceData["profile"]; scope: ViewScope; qwenConfigured: boolean; onClose: () => void; onTransaction: (draft: Partial<Transaction>) => void; onPlan: (event: PlannedEvent) => void; onAsk: (prompt: string) => void; onProfile: (profile: FinanceData["profile"]) => void }) {
  const [intent, setIntent] = useState<"transaction" | "plan" | "question">("transaction");
  const [inputMode, setInputMode] = useState<"voice" | "type">("voice");
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [newWord, setNewWord] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRef = useRef<SpeechRecognizer | null>(null);

  useEffect(() => () => { speechRef.current?.stop(); recorderRef.current?.stop(); streamRef.current?.getTracks().forEach((track) => track.stop()); }, []);

  async function transcribeBlob(blob: Blob) {
    setProcessing(true);
    try {
      const audio = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
      const response = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio, locale: profile.voiceLocale || "en-SG", lexicon: profile.voiceLexicon || [] }) });
      const payload = await response.json() as { transcript?: string; error?: string };
      if (!response.ok || !payload.transcript) throw new Error(payload.error || "Voice transcription failed");
      setText(payload.transcript); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Voice transcription failed"); }
    finally { setProcessing(false); }
  }

  async function startVoice() {
    setError("");
    if (qwenConfigured && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        streamRef.current = stream; recorderRef.current = recorder; chunksRef.current = [];
        recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
        recorder.onstop = () => { const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }); stream.getTracks().forEach((track) => track.stop()); streamRef.current = null; if (blob.size) transcribeBlob(blob); };
        recorder.start(); setListening(true); return;
      } catch { setError("Microphone access was not available. You can type instead."); setInputMode("type"); return; }
    }
    const constructors = window as unknown as { SpeechRecognition?: new () => SpeechRecognizer; webkitSpeechRecognition?: new () => SpeechRecognizer };
    const Recognition = constructors.SpeechRecognition || constructors.webkitSpeechRecognition;
    if (!Recognition) { setError("Voice capture is not supported in this browser yet. You can type the same sentence."); setInputMode("type"); return; }
    const recognition = new Recognition(); speechRef.current = recognition; recognition.lang = profile.voiceLocale || "en-SG"; recognition.interimResults = true; recognition.continuous = false;
    recognition.onresult = (event) => { let transcript = ""; for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0].transcript; setText(transcript.trim()); };
    recognition.onend = () => setListening(false); recognition.onerror = () => { setListening(false); setError("I couldn’t hear that clearly. Try again or type it."); };
    recognition.start(); setListening(true);
  }

  function stopVoice() { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); speechRef.current?.stop(); setListening(false); }

  async function continueCapture() {
    const trimmed = text.trim(); if (!trimmed) { setError("Say or type something first."); return; }
    if (intent === "question") { onAsk(trimmed); return; }
    if (intent === "plan") {
      const amount = Number(trimmed.match(/(?:s\$|\$)?\s*(\d+(?:\.\d{1,2})?)/i)?.[1] || 0);
      const target = new Date(); target.setMonth(target.getMonth() + 6);
      onPlan({ id: uid("event"), name: trimmed.replace(/(?:s\$|\$)?\s*\d+(?:\.\d{1,2})?/i, "").replace(/\b(plan|budget|for|a|an)\b/gi, " ").replace(/\s+/g, " ").trim() || "Future plan", amount, date: target.toISOString().slice(0, 10), kind: /trip|holiday|japan|travel|flight/i.test(trimmed) ? "travel" : /car|lambo/i.test(trimmed) ? "car" : /home|reno|house/i.test(trimmed) ? "home" : "other", space: scope === "all" ? "household" : "personal", includeInPlan: true, note: trimmed });
      return;
    }
    let draft = localCaptureDraft(trimmed, accounts, scope);
    if (qwenConfigured) {
      setProcessing(true);
      try {
        const response = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "capture", prompt: trimmed, lexicon: profile.voiceLexicon }) });
        const payload = await response.json() as { parsed?: { intent?: TransactionType; description?: string; amount?: number; date?: string; category?: string; sourceAccount?: string; destinationAccount?: string } };
        if (response.ok && payload.parsed) {
          const parsed = payload.parsed; const source = accounts.find((item) => [item.name, item.institution].some((value) => parsed.sourceAccount?.toLowerCase().includes(value.toLowerCase()))) || accounts.find((item) => item.id === draft.accountId); const destination = accounts.find((item) => [item.name, item.institution].some((value) => parsed.destinationAccount?.toLowerCase().includes(value.toLowerCase())));
          draft = { ...draft, type: parsed.intent || draft.type, description: parsed.description || draft.description, amount: parsed.amount || draft.amount, date: parsed.date || draft.date, category: parsed.category || draft.category, accountId: source?.id || draft.accountId, transferAccountId: destination?.id || draft.transferAccountId };
        }
      } catch { /* local parser remains available */ }
      finally { setProcessing(false); }
    }
    onTransaction(draft);
  }

  function addLexiconWord() { const value = newWord.trim(); if (!value) return; onProfile({ ...profile, voiceLexicon: [...new Set([...(profile.voiceLexicon || []), value])] }); setNewWord(""); }

  return <ModalShell eyebrow="Voice-first financial capture" title="Tell Lifetime" onClose={onClose}><div className="capture-shell"><div className="capture-intents">{(["transaction", "plan", "question"] as const).map((item) => <button key={item} className={intent === item ? "capture-intent-active" : ""} onClick={() => setIntent(item)}>{item === "transaction" ? <ArrowLeftRight size={17} /> : item === "plan" ? <CalendarDays size={17} /> : <MessageCircle size={17} />}{item === "transaction" ? "Log money" : item === "plan" ? "Plan ahead" : "Ask Coach"}</button>)}</div><div className="capture-mode-switch"><button className={inputMode === "voice" ? "active" : ""} onClick={() => setInputMode("voice")}><Mic size={16} /> Talk</button><button className={inputMode === "type" ? "active" : ""} onClick={() => setInputMode("type")}><Edit3 size={16} /> Type</button></div>{inputMode === "voice" && <div className={listening ? "voice-stage voice-listening" : "voice-stage"}><button className="voice-orb" onClick={listening ? stopVoice : startVoice} aria-label={listening ? "Stop listening" : "Start listening"}><span><Mic size={28} /></span><i /><i /><i /></button><strong>{processing ? "Understanding your words…" : listening ? "I’m listening… tap when finished" : "Tap, then speak naturally"}</strong><p>{qwenConfigured ? "Enhanced speech recognition is active; your own vocabulary nudges exact spellings." : "Browser speech capture is active, and you can correct the transcript before saving."}</p></div>}<label className="field capture-transcript"><span>{inputMode === "voice" ? "Transcript — correct anything before continuing" : intent === "transaction" ? "Try “Spent $13.80 at Yochi on Revolut”" : intent === "plan" ? "Try “Plan $12,000 for Japan next April”" : "What do you want to understand?"}</span><textarea autoFocus={inputMode === "type"} value={text} onChange={(event) => setText(event.target.value)} placeholder="Your words appear here…" /></label><div className="voice-lexicon"><div><strong>Your vocabulary</strong><small>Names, Singlish, merchants and community terms that should be spelt exactly.</small></div><div className="lexicon-tags">{(profile.voiceLexicon || []).slice(0, 8).map((word) => <span key={word}>{word}</span>)}</div><div className="lexicon-add"><input value={newWord} onChange={(event) => setNewWord(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLexiconWord(); } }} placeholder="Add Yochi, PayNow…" /><button onClick={addLexiconWord}><Plus size={16} /></button></div></div>{error && <p className="form-error">{error}</p>}<div className="form-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={continueCapture} disabled={processing}>{processing ? "Understanding…" : intent === "transaction" ? "Review transaction" : intent === "plan" ? "Add to forecast" : "Ask Coach"}</button></div></div></ModalShell>;
}

function TransactionModal({ initial, accounts, scope, onNeedAccount, onClose, onSubmit }: { initial?: Partial<Transaction> | null; accounts: Account[]; scope: ViewScope; onNeedAccount: () => void; onClose: () => void; onSubmit: (transaction: Transaction) => void }) {
  const defaultAccount = accounts.find((account) => account.space === (scope === "all" ? "personal" : scope)) || accounts[0];
  const [type, setType] = useState<TransactionType>(initial?.type || "expense");
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : "");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.type === "expense" ? initial.category || expenseCategories[0] : expenseCategories[0]);
  const [date, setDate] = useState(initial?.date || todayIso());
  const [accountId, setAccountId] = useState(initial?.accountId || defaultAccount?.id || "");
  const [transferAccountId, setTransferAccountId] = useState(initial?.transferAccountId || "");
  const [note, setNote] = useState(initial?.note || "");

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const destination = accounts.find((account) => account.id === transferAccountId);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !accountId) return;
    if (type === "transfer" && (!transferAccountId || transferAccountId === accountId)) return;
    const transactionScope: SpaceId = type === "transfer" && destination?.space === "household"
      ? "household"
      : selectedAccount?.space || (scope === "all" ? "household" : "personal");
    onSubmit({
      id: initial?.id || uid("tx"),
      type,
      amount: parsedAmount,
      description: description.trim(),
      category: type === "transfer" ? "Transfer" : type === "income" ? "Income" : category,
      date,
      accountId,
      transferAccountId: type === "transfer" ? transferAccountId : undefined,
      note: note.trim() || undefined,
      space: transactionScope,
      source: initial?.source || "manual",
    });
  }

  return (
    <ModalShell eyebrow={initial?.id ? "Update the ledger" : "Quick capture"} title={initial?.id ? "Edit transaction" : "Add transaction"} onClose={onClose}>
      {!accounts.length ? <AccountRequired forWhat="A transaction" onAddAccount={onNeedAccount} /> :
      <form className="form-stack" onSubmit={submit}>
        <div className="type-switcher">
          {(["expense", "income", "transfer"] as TransactionType[]).map((option) => <button type="button" key={option} className={type === option ? "type-active" : ""} onClick={() => setType(option)}>{option === "expense" ? <ArrowUpRight size={16} /> : option === "income" ? <ArrowDownLeft size={16} /> : <ArrowLeftRight size={16} />}{option}</button>)}
        </div>
        <label className="amount-field"><span>S$</span><input autoFocus required inputMode="decimal" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label>
        <div className="form-grid">
          <label className="field full-field"><span>{type === "income" ? "Source" : type === "transfer" ? "Transfer note" : "Merchant or description"}</span><input required value={description} onChange={(event) => setDescription(event.target.value)} placeholder={type === "transfer" ? "Move to savings" : "What was this for?"} /></label>
          <label className="field"><span>{type === "income" ? "Paid into" : type === "transfer" ? "From account" : "Paid from"}</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {formatMoney(account.balance)}</option>)}</select></label>
          {type === "transfer" ? (
            <label className="field"><span>To account</span><select required value={transferAccountId} onChange={(event) => setTransferAccountId(event.target.value)}><option value="">Choose destination</option>{accounts.filter((account) => account.id !== accountId).map((account) => <option key={account.id} value={account.id}>{account.name} · {formatMoney(account.balance)}</option>)}</select></label>
          ) : type === "expense" ? (
            <label className="field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
          ) : <label className="field"><span>Category</span><input value="Income" disabled /></label>}
          <label className="field"><span>Date</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label className="field"><span>Note (optional)</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context" /></label>
        </div>
        {type === "transfer" && <div className="info-note"><ShieldCheck size={17} /><span>This moves money between accounts. It will not change your income, spending, or savings rate.</span></div>}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">{initial?.id ? "Save changes" : `Save ${type}`}</button></div>
      </form>}
    </ModalShell>
  );
}

function AccountModal({ initial, scope, canShare, profileName, partnerName, onClose, onSubmit, onDelete }: { initial?: Account | null; scope: ViewScope; canShare: boolean; profileName: string; partnerName: string; onClose: () => void; onSubmit: (account: Account) => void; onDelete?: () => void }) {
  const [name, setName] = useState(initial?.name || "");
  const [institution, setInstitution] = useState(initial?.institution || "");
  const [type, setType] = useState<AccountType>(initial?.type || "checking");
  const [balance, setBalance] = useState(initial ? String(initial.balance) : "");
  const [space, setSpace] = useState<SpaceId>(initial?.space || (scope === "all" ? "household" : "personal"));
  const [last4, setLast4] = useState(initial?.last4 || "");

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(balance);
    if (!name.trim() || !institution.trim() || !Number.isFinite(parsed)) return;
    const normalizedBalance = ["credit", "loan"].includes(type) && parsed > 0 ? -parsed : parsed;
    onSubmit({ id: initial?.id || uid("acct"), name: name.trim(), institution: institution.trim(), type, balance: normalizedBalance, space, owner: space === "household" ? `${profileName} + ${partnerName}` : profileName, currency: initial?.currency || "SGD", last4: last4.slice(-4), accent: initial?.accent || accountAccents[Math.floor(Math.random() * accountAccents.length)] });
  }

  return (
    <ModalShell eyebrow="Balance sheet" title={initial ? "Edit account" : "Add an account"} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field"><span>Account name</span><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="Rainy day fund" /></label>
          <label className="field"><span>Institution</span><input required value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="DBS, HSBC, Revolut…" /></label>
          <label className="field"><span>Account type</span><select value={type} onChange={(event) => setType(event.target.value as AccountType)}>{Object.entries(accountTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>{["credit", "loan"].includes(type) ? "Amount owed" : "Current value or balance"}</span><input required type="number" step="0.01" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0.00" /></label>
          <label className="field"><span>Visibility</span><select value={space} onChange={(event) => setSpace(event.target.value as SpaceId)}><option value="personal">Private to me</option>{canShare && <option value="household">Shared in Together</option>}</select></label>
          <label className="field"><span>Last four digits (optional)</span><input maxLength={4} inputMode="numeric" value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, ""))} placeholder="2841" /></label>
        </div>
        <div className="form-actions">{initial && onDelete && <button type="button" className="secondary-button danger-button form-delete-button" onClick={onDelete}><Trash2 size={16} /> Remove</button>}<span className="form-action-spacer" /><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">{initial ? "Save changes" : "Add account"}</button></div>
      </form>
    </ModalShell>
  );
}

function HouseholdModal({ profile, members, viewerEmail, onClose, onSubmit }: { profile: FinanceData["profile"]; members: Array<{ email: string; display_name: string; role: string; status: string }>; viewerEmail: string; onClose: () => void; onSubmit: (profile: FinanceData["profile"], prepareEmail?: boolean) => void }) {
  const [name, setName] = useState(profile.name);
  const [householdName, setHouseholdName] = useState(profile.householdName);
  const [partnerName, setPartnerName] = useState(profile.partnerName || "");
  const [partnerEmail, setPartnerEmail] = useState(profile.partnerEmail || "");
  const [voiceLocale, setVoiceLocale] = useState(profile.voiceLocale || "en-SG");
  const [voiceLexicon, setVoiceLexicon] = useState((profile.voiceLexicon || []).join(", "));
  const [error, setError] = useState("");
  const invitedMember = members.find((member) => member.email.toLowerCase() !== viewerEmail.toLowerCase());
  const inviteStatus = invitedMember?.status || (profile.partnerEmail ? "pending" : null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedEmail = partnerEmail.trim().toLowerCase();
    if (!name.trim() || !householdName.trim() || !partnerName.trim() || !normalizedEmail) return;
    if (normalizedEmail === viewerEmail.toLowerCase()) {
      setError("Invite the other person’s Google email, not the email you are signed in with.");
      return;
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    onSubmit({
      ...profile,
      name: name.trim(),
      householdName: householdName.trim(),
      partnerName: partnerName.trim(),
      partnerEmail: normalizedEmail,
      householdStartedAt: profile.householdStartedAt || todayIso(),
      voiceLocale,
      voiceLexicon: voiceLexicon.split(",").map((item) => item.trim()).filter(Boolean),
    }, submitter?.value === "email");
  }

  return (
    <ModalShell eyebrow="Personal + Together" title={profile.partnerEmail ? "Manage Together" : "Invite someone to Together"} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <div className="household-people">
          <div><span className="avatar">{name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span><strong>{name || "You"}</strong><small>{viewerEmail} · signed in</small></span><Check size={17} /></div>
          <div><span className="avatar partner-avatar">{partnerName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "P"}</span><span><strong>{partnerName || "Partner"}</strong><small>{partnerEmail || "Add their Google email below"}</small></span>{inviteStatus === "active" ? <Check size={17} /> : <Mail size={17} />}</div>
        </div>
        <div className="form-grid">
          <label className="field"><span>Your display name</span><input required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field"><span>Together name</span><input required value={householdName} onChange={(event) => setHouseholdName(event.target.value)} placeholder="Peter & MJ" /></label>
          <label className="field"><span>Partner or family member</span><input required value={partnerName} onChange={(event) => setPartnerName(event.target.value)} placeholder="Their name" /></label>
          <label className="field"><span>Their Google email</span><input required disabled={inviteStatus === "active"} type="email" value={partnerEmail} onChange={(event) => { setPartnerEmail(event.target.value); setError(""); }} placeholder="partner@example.com" /></label>
          <label className="field"><span>Voice and accent region</span><select value={voiceLocale} onChange={(event) => setVoiceLocale(event.target.value)}><option value="en-SG">English · Singapore</option><option value="en-IN">English · India</option><option value="en-GB">English · United Kingdom</option><option value="en-US">English · United States</option><option value="ms-MY">Malay · Malaysia</option><option value="zh-SG">Mandarin · Singapore</option></select></label>
          <label className="field"><span>Voice vocabulary</span><input value={voiceLexicon} onChange={(event) => setVoiceLexicon(event.target.value)} placeholder="Yochi, PayNow, kopitiam…" /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="invite-explainer">
          <div><span>1</span><p><strong>Save the invitation</strong><small>Lifetime records the invited Google email as pending.</small></p></div>
          <div><span>2</span><p><strong>Send the prepared email</strong><small>Your own mail app sends a login link; Lifetime does not read your contacts.</small></p></div>
          <div><span>3</span><p><strong>They sign in with that email</strong><small>The verified match activates Together automatically.</small></p></div>
        </div>
        <details className="privacy-details">
          <summary><ShieldCheck size={17} /> Who can see the financial data?</summary>
          <p><strong>Family members:</strong> database row-level rules keep Personal records owner-only. Active members can read only records deliberately marked Shared in Together.</p>
          <p><strong>Important:</strong> the Supabase project administrator can still administer the hosted database. This is protected access, not zero-knowledge end-to-end encryption.</p>
        </details>
        <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><span className="form-action-spacer" /><button className="secondary-button" type="submit" value="save">Save only</button>{inviteStatus !== "active" && <button className="primary-button" type="submit" value="email"><Mail size={16} /> {inviteStatus === "pending" ? "Save & resend invite" : "Save & draft invite"}</button>}</div>
      </form>
    </ModalShell>
  );
}

function GoalModal({ initial, scope, canShare, onClose, onSubmit, onDelete }: { initial?: Goal | null; scope: ViewScope; canShare: boolean; onClose: () => void; onSubmit: (goal: Goal) => void; onDelete?: () => void }) {
  const [name, setName] = useState(initial?.name || "");
  const [target, setTarget] = useState(initial ? String(initial.target) : "");
  const [current, setCurrent] = useState(initial ? String(initial.current) : "");
  const [targetDate, setTargetDate] = useState(initial?.targetDate || "");
  const [monthlyContribution, setMonthlyContribution] = useState(initial?.monthlyContribution ? String(initial.monthlyContribution) : "");
  const [priority, setPriority] = useState<NonNullable<Goal["priority"]>>(initial?.priority || "important");
  const [space, setSpace] = useState<SpaceId>(initial?.space || (scope === "all" ? "household" : "personal"));

  function submit(event: FormEvent) {
    event.preventDefault();
    const targetAmount = Number(target);
    const currentAmount = Number(current || 0);
    if (!name.trim() || !targetDate || !Number.isFinite(targetAmount) || targetAmount <= 0 || !Number.isFinite(currentAmount)) return;
    onSubmit({ id: initial?.id || uid("goal"), name: name.trim(), target: targetAmount, current: Math.min(targetAmount, Math.max(0, currentAmount)), targetDate, space, icon: initial?.icon || (space === "household" ? "home" : "spark"), monthlyContribution: Math.max(0, Number(monthlyContribution) || 0), priority });
  }

  return (
    <ModalShell eyebrow="A future worth funding" title={initial ? "Edit goal" : "Create a goal"} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field full-field"><span>Goal name</span><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="What are you building toward?" /></label>
          <label className="field"><span>Target amount</span><input required type="number" min="1" step="1" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="30000" /></label>
          <label className="field"><span>Already saved</span><input type="number" min="0" step="1" value={current} onChange={(event) => setCurrent(event.target.value)} placeholder="0" /></label>
          <label className="field"><span>Target date</span><input required type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
          <label className="field"><span>Monthly contribution</span><input type="number" min="0" step="1" value={monthlyContribution} onChange={(event) => setMonthlyContribution(event.target.value)} placeholder="800" /></label>
          <label className="field"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as NonNullable<Goal["priority"]>)}><option value="essential">Essential</option><option value="important">Important</option><option value="flexible">Flexible</option></select></label>
          <label className="field"><span>Visibility</span><select value={space} onChange={(event) => setSpace(event.target.value as SpaceId)}><option value="personal">Private to me</option>{canShare && <option value="household">Shared in Together</option>}</select></label>
        </div>
        <div className="form-actions">{initial && onDelete && <button type="button" className="secondary-button danger-button form-delete-button" onClick={onDelete}><Trash2 size={16} /> Delete</button>}<span className="form-action-spacer" /><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">{initial ? "Save changes" : "Create goal"}</button></div>
      </form>
    </ModalShell>
  );
}

function PlannedEventModal({ initial, scope, canShare, onClose, onSubmit, onDelete }: { initial?: PlannedEvent | null; scope: ViewScope; canShare: boolean; onClose: () => void; onSubmit: (event: PlannedEvent) => void; onDelete?: () => void }) {
  const [name, setName] = useState(initial?.name || "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [date, setDate] = useState(initial?.date || "");
  const [kind, setKind] = useState<PlannedEvent["kind"]>(initial?.kind || "travel");
  const [space, setSpace] = useState<SpaceId>(initial?.space || (scope === "all" ? "household" : "personal"));
  const [note, setNote] = useState(initial?.note || "");
  function submit(event: FormEvent) {
    event.preventDefault(); const parsed = Number(amount); if (!name.trim() || !date || !Number.isFinite(parsed) || parsed <= 0) return;
    onSubmit({ id: initial?.id || uid("event"), name: name.trim(), amount: parsed, date, kind, space, includeInPlan: initial?.includeInPlan ?? true, note: note.trim() || undefined });
  }
  return (
    <ModalShell eyebrow="Life happens in the forecast" title={initial ? "Edit future event" : "Plan a future event"} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field full-field"><span>What are you planning?</span><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="Japan in spring" /></label>
          <label className="field"><span>Estimated total cost</span><input required type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="12000" /></label>
          <label className="field"><span>When</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label className="field"><span>Kind of plan</span><select value={kind} onChange={(event) => setKind(event.target.value as PlannedEvent["kind"])}><option value="travel">Travel</option><option value="home">Home</option><option value="family">Family</option><option value="education">Education</option><option value="car">Car</option><option value="other">Other</option></select></label>
          <label className="field"><span>Visibility</span><select value={space} onChange={(event) => setSpace(event.target.value as SpaceId)}><option value="personal">Private to me</option>{canShare && <option value="household">Shared in Together</option>}</select></label>
          <label className="field full-field"><span>Assumptions or notes</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Flights, hotels, food and shopping" /></label>
        </div>
        <div className="info-note"><WandSparkles size={17} /><span>Lifetime compares this cost with your monthly surplus and goal contributions, then shows the estimated timing trade-off.</span></div>
        <div className="form-actions">{initial && onDelete && <button type="button" className="secondary-button danger-button form-delete-button" onClick={onDelete}><Trash2 size={16} /> Delete</button>}<span className="form-action-spacer" /><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">{initial ? "Save changes" : "Add to forecast"}</button></div>
      </form>
    </ModalShell>
  );
}

function RecurringModal({ initial, scope, accounts, onNeedAccount, onClose, onSubmit, onDelete }: { initial?: RecurringItem | null; scope: ViewScope; accounts: Account[]; onNeedAccount: () => void; onClose: () => void; onSubmit: (item: RecurringItem) => void; onDelete?: () => void }) {
  const [name, setName] = useState(initial?.name || "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [cadence, setCadence] = useState<RecurringItem["cadence"]>(initial?.cadence || "monthly");
  const [nextDate, setNextDate] = useState(initial?.nextDate || "");
  const [accountId, setAccountId] = useState(initial?.accountId || accounts[0]?.id || "");
  const [category, setCategory] = useState(initial?.category || expenseCategories[0]);
  const selectedAccount = accounts.find((account) => account.id === accountId);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(amount);
    if (!name.trim() || !nextDate || !accountId || !Number.isFinite(parsed) || parsed <= 0) return;
    onSubmit({ id: initial?.id || uid("recurring"), name: name.trim(), amount: parsed, cadence, nextDate, accountId, category, space: selectedAccount?.space || (scope === "all" ? "household" : "personal"), active: initial?.active ?? true });
  }

  return (
    <ModalShell eyebrow="Predict what’s next" title={initial ? "Edit recurring payment" : "Add recurring payment"} onClose={onClose}>
      {!accounts.length ? <AccountRequired forWhat="A recurring payment" onAddAccount={onNeedAccount} /> :
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field"><span>Name</span><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="Phone plan" /></label>
          <label className="field"><span>Amount</span><input required type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="45.00" /></label>
          <label className="field"><span>Cadence</span><select value={cadence} onChange={(event) => setCadence(event.target.value as RecurringItem["cadence"])}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label>
          <label className="field"><span>Next date</span><input required type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} /></label>
          <label className="field"><span>Paid from</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <label className="field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <div className="form-actions">{initial && onDelete && <button type="button" className="secondary-button danger-button form-delete-button" onClick={onDelete}><Trash2 size={16} /> Delete</button>}<span className="form-action-spacer" /><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">{initial ? "Save changes" : "Add recurring payment"}</button></div>
      </form>}
    </ModalShell>
  );
}

function ImportModal({ data, scope, onNeedAccount, onClose, setData, onStage, notify }: { data: FinanceData; scope: ViewScope; onNeedAccount: () => void; onClose: () => void; setData: React.Dispatch<React.SetStateAction<FinanceData>>; onStage: (transactions: Transaction[]) => void; notify: (message: string) => void }) {
  const [text, setText] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);

  function importRows() {
    const result = importTransactions(text, { accounts: data.accounts, existing: data.transactions, scope });
    setReport(result);
    if (result.error || !result.accepted.length) return;
    setData((current) => ({
      ...current,
      accounts: result.accepted.reduce((accounts, transaction) => applyTransaction(accounts, transaction), current.accounts),
      transactions: [...result.accepted, ...current.transactions],
    }));
    notify(describeImport(result));
    if (!result.duplicates && !result.rejected.length) onClose();
  }

  function reviewRows() {
    const result = importTransactions(text, { accounts: data.accounts, existing: data.transactions, scope });
    setReport(result);
    if (result.error || !result.accepted.length) return;
    onStage(result.accepted);
  }

  return (
    <ModalShell eyebrow="Sheets and statements" title="Import transactions" onClose={onClose}>
      {!data.accounts.length ? <AccountRequired forWhat="A transaction import" onAddAccount={onNeedAccount} /> : <>
      <div className="import-copy"><span className="import-icon"><FileSpreadsheet size={22} /></span><div><strong>Paste rows from Google Sheets or a CSV</strong><p>Use the columns date, description, amount, type, category, and account. Negative amounts become expenses when type is blank. Rows matching a transaction you already have are skipped.</p></div></div>
      <textarea className="import-textarea" value={text} onChange={(event) => { setText(event.target.value); setReport(null); }} placeholder={"date,description,amount,type,category,account\n2026-08-14,Coffee,6.50,expense,Food & dining,Everyday"} aria-label="Transaction CSV data" />
      <div className="info-note"><ShieldCheck size={17} /><span>Transfers are intentionally skipped here so they can be linked safely between two accounts in the ledger.</span></div>
      {report?.error && <p className="form-error">{report.error}</p>}
      {report && !report.error && (
        <div className="import-report">
          <div className="import-report-counts">
            <span><strong>{report.accepted.length}</strong> imported</span>
            <span><strong>{report.duplicates}</strong> skipped as duplicate{report.duplicates === 1 ? "" : "s"}</span>
            <span><strong>{report.rejected.length}</strong> rejected</span>
          </div>
          {report.rejected.length > 0 && (
            <ul className="import-rejects">
              {report.rejected.map((item) => <li key={item.line}>Line {item.line}: {item.reason}</li>)}
            </ul>
          )}
        </div>
      )}
      <div className="form-actions"><button className="secondary-button" onClick={onClose}>{report && !report.error ? "Done" : "Cancel"}</button><span className="form-action-spacer" /><button className="secondary-button" onClick={reviewRows}><Layers3 size={16} /> Review first</button><button className="primary-button" onClick={importRows}>Import all</button></div>
      </>}
    </ModalShell>
  );
}
