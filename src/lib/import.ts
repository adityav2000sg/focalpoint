import { Account, SpaceId, Transaction, TransactionType, ViewScope, uid } from "./finance";

export interface RejectedRow {
  line: number;
  reason: string;
}

export interface ImportReport {
  accepted: Transaction[];
  duplicates: number;
  rejected: RejectedRow[];
  error?: string;
}

// RFC 4180-style parser: handles quoted fields, commas and newlines inside
// quotes, and "" as an escaped quote.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 2; continue; }
        quoted = false; index += 1; continue;
      }
      field += char; index += 1; continue;
    }
    if (char === '"') { quoted = true; index += 1; continue; }
    if (char === ",") { row.push(field); field = ""; index += 1; continue; }
    if (char === "\r") { index += 1; continue; }
    if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; index += 1; continue; }
    field += char; index += 1;
  }
  row.push(field);
  rows.push(row);

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

export function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// Two rows are the same transaction when date, amount and description match.
export function dedupeKey(date: string, amount: number, description: string) {
  return `${date}|${amount.toFixed(2)}|${description.trim().toLowerCase()}`;
}

export function importTransactions(
  text: string,
  { accounts, existing, scope }: { accounts: Account[]; existing: Transaction[]; scope: ViewScope },
): ImportReport {
  const empty: ImportReport = { accepted: [], duplicates: 0, rejected: [] };
  const rows = parseCsv(text);
  if (rows.length < 2) return { ...empty, error: "Add a header row and at least one transaction row." };

  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const missing = ["date", "description", "amount"].filter((header) => !headers.includes(header));
  if (missing.length) return { ...empty, error: `The sheet is missing a ${missing.join(", ")} column.` };
  if (!accounts.length) return { ...empty, error: "Add an account before importing transactions." };

  const seen = new Set(existing.map((item) => dedupeKey(item.date, item.amount, item.description)));
  const accepted: Transaction[] = [];
  const rejected: RejectedRow[] = [];
  let duplicates = 0;

  rows.slice(1).forEach((cells, offset) => {
    // Line number as the user sees it in the pasted text: header is line 1.
    const line = offset + 2;
    const row = Object.fromEntries(headers.map((header, position) => [header, (cells[position] || "").trim()]));

    const date = row.date;
    const description = row.description;
    const rawAmount = row.amount;

    if (!date) { rejected.push({ line, reason: "Date is missing" }); return; }
    if (!isValidIsoDate(date)) { rejected.push({ line, reason: `Date "${date}" is not a valid YYYY-MM-DD date` }); return; }
    if (!description) { rejected.push({ line, reason: "Description is missing" }); return; }
    if (!rawAmount) { rejected.push({ line, reason: "Amount is missing" }); return; }

    const signedAmount = Number(rawAmount);
    if (!Number.isFinite(signedAmount)) { rejected.push({ line, reason: `Amount "${rawAmount}" is not a number` }); return; }
    const amount = Math.abs(signedAmount);
    if (amount === 0) { rejected.push({ line, reason: "Amount must be greater than zero" }); return; }

    const explicitType = row.type?.toLowerCase();
    const type: TransactionType = explicitType === "income" || explicitType === "transfer" || explicitType === "expense"
      ? explicitType
      : signedAmount < 0 ? "expense" : "income";
    if (type === "transfer") {
      rejected.push({ line, reason: "Transfers must be added in the app so both accounts stay linked" });
      return;
    }

    // An unmatched account name is rejected rather than silently reassigned to
    // the first account, which would file the row against the wrong balance.
    let account: Account | undefined;
    if (row.account) {
      account = accounts.find((item) => item.name.toLowerCase() === row.account.toLowerCase());
      if (!account) { rejected.push({ line, reason: `No account named "${row.account}"` }); return; }
    } else {
      account = accounts[0];
    }

    const key = dedupeKey(date, amount, description);
    if (seen.has(key)) { duplicates += 1; return; }
    seen.add(key);

    accepted.push({
      id: uid("sheet"),
      type,
      amount,
      date,
      description,
      category: row.category || (type === "income" ? "Income" : "Other"),
      accountId: account.id,
      space: account.space || ((scope === "all" ? "household" : "personal") as SpaceId),
      source: "sheet",
    });
  });

  return { accepted, duplicates, rejected };
}

export function describeImport(report: ImportReport) {
  const parts = [`${report.accepted.length} imported`];
  if (report.duplicates) parts.push(`${report.duplicates} skipped as duplicate${report.duplicates === 1 ? "" : "s"}`);
  if (report.rejected.length) parts.push(`${report.rejected.length} rejected`);
  return parts.join(" · ");
}
