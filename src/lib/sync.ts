import type { FinanceData } from "./finance";

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeRecord<T extends { id: string }>(base: T[], local: T[], remote: T[]) {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const orderedIds = [...new Set([...local.map((item) => item.id), ...remote.map((item) => item.id), ...base.map((item) => item.id)])];

  return orderedIds.flatMap((id) => {
    const original = baseById.get(id);
    const mine = localById.get(id);
    const theirs = remoteById.get(id);

    if (same(mine, original)) return theirs ? [theirs] : [];
    if (same(theirs, original)) return mine ? [mine] : [];
    // If both devices changed the same record, preserve the current device's
    // explicit edit. The remote version remains recoverable in snapshot history.
    return mine ? [mine] : [];
  });
}

function mergeProfile(base: FinanceData["profile"], local: FinanceData["profile"], remote: FinanceData["profile"]) {
  const result = { ...remote };
  for (const key of Object.keys(local) as Array<keyof FinanceData["profile"]>) {
    if (!same(local[key], base[key])) Object.assign(result, { [key]: local[key] });
  }
  return result;
}

/** Three-way merge used when another signed-in device saved first. */
export function mergeFinanceWorkspaces(base: FinanceData, local: FinanceData, remote: FinanceData): FinanceData {
  return {
    version: 3,
    profile: mergeProfile(base.profile, local.profile, remote.profile),
    accounts: mergeRecord(base.accounts, local.accounts, remote.accounts),
    transactions: mergeRecord(base.transactions, local.transactions, remote.transactions),
    goals: mergeRecord(base.goals, local.goals, remote.goals),
    recurring: mergeRecord(base.recurring, local.recurring, remote.recurring),
    spendingPlans: mergeRecord(base.spendingPlans, local.spendingPlans, remote.spendingPlans),
    plannedEvents: mergeRecord(base.plannedEvents, local.plannedEvents, remote.plannedEvents),
    inbox: mergeRecord(base.inbox, local.inbox, remote.inbox),
  };
}
