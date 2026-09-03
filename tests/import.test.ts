import { describe, expect, it } from "vitest";
import { Account, Transaction } from "@/lib/finance";
import { importTransactions, isValidIsoDate, parseCsv } from "@/lib/import";

const accounts: Account[] = [
  { id: "acc-everyday", name: "Everyday", institution: "DBS", type: "checking", space: "personal", owner: "You", balance: 1000, currency: "SGD", accent: "mint" },
  { id: "acc-joint", name: "Joint", institution: "DBS", type: "checking", space: "household", owner: "Us", balance: 2000, currency: "SGD", accent: "lime" },
];

function run(text: string, existing: Transaction[] = []) {
  return importTransactions(text, { accounts, existing, scope: "all" });
}

describe("parseCsv", () => {
  it("keeps commas that are inside quoted fields", () => {
    const rows = parseCsv('date,description,amount\n2026-08-14,"Dinner, drinks and dessert",84.50');
    expect(rows[1]).toEqual(["2026-08-14", "Dinner, drinks and dessert", "84.50"]);
  });

  it("unescapes doubled quotes", () => {
    const rows = parseCsv('date,description,amount\n2026-08-14,"The ""Good"" Cafe",12');
    expect(rows[1][1]).toBe('The "Good" Cafe');
  });

  it("keeps newlines inside quoted fields", () => {
    const rows = parseCsv('date,description,amount\n2026-08-14,"Line one\nLine two",12');
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe("Line one\nLine two");
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("date,description,amount\r\n2026-08-14,Coffee,6.50\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["2026-08-14", "Coffee", "6.50"]);
  });
});

describe("date validation", () => {
  it("accepts real dates and rejects impossible ones", () => {
    expect(isValidIsoDate("2026-08-14")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("14/08/2026")).toBe(false);
    expect(isValidIsoDate("not a date")).toBe(false);
  });

  it("rejects a row with an invalid date and says why", () => {
    const report = run("date,description,amount\n2026-02-30,Coffee,6.50");
    expect(report.accepted).toHaveLength(0);
    expect(report.rejected).toEqual([{ line: 2, reason: 'Date "2026-02-30" is not a valid YYYY-MM-DD date' }]);
  });
});

describe("dedupe", () => {
  const csv = "date,description,amount,type\n2026-08-14,Coffee,6.50,expense\n2026-08-15,Lunch,18.00,expense";

  it("imports every row the first time", () => {
    const report = run(csv);
    expect(report.accepted).toHaveLength(2);
    expect(report.duplicates).toBe(0);
  });

  it("creates no duplicates when the same file is imported again", () => {
    const first = run(csv);
    const second = run(csv, first.accepted);
    expect(second.accepted).toHaveLength(0);
    expect(second.duplicates).toBe(2);
  });

  it("matches on date, amount and description regardless of case or spacing", () => {
    const first = run(csv);
    const second = run("date,description,amount,type\n2026-08-14,  coffee  ,6.50,expense", first.accepted);
    expect(second.accepted).toHaveLength(0);
    expect(second.duplicates).toBe(1);
  });

  it("still imports a row that differs only by amount", () => {
    const first = run(csv);
    const second = run("date,description,amount,type\n2026-08-14,Coffee,7.50,expense", first.accepted);
    expect(second.accepted).toHaveLength(1);
    expect(second.duplicates).toBe(0);
  });

  it("collapses a row repeated inside a single file", () => {
    const report = run("date,description,amount,type\n2026-08-14,Coffee,6.50,expense\n2026-08-14,Coffee,6.50,expense");
    expect(report.accepted).toHaveLength(1);
    expect(report.duplicates).toBe(1);
  });

  it("keeps the same merchant, date and amount when it belongs to another account", () => {
    const first = importTransactions("date,description,amount,type\n2026-08-14,Coffee,6.50,expense", { accounts, existing: [], scope: "all", defaultAccountId: "acc-everyday" });
    const second = importTransactions("date,description,amount,type\n2026-08-14,Coffee,6.50,expense", { accounts, existing: first.accepted, scope: "all", defaultAccountId: "acc-joint" });
    expect(second.accepted).toHaveLength(1);
    expect(second.accepted[0].accountId).toBe("acc-joint");
  });
});

describe("import report", () => {
  it("accounts for every row as accepted, duplicate or rejected", () => {
    const existing = run("date,description,amount,type\n2026-08-01,Rent,1800,expense").accepted;
    const report = run(
      [
        "date,description,amount,type,account",
        "2026-08-01,Rent,1800,expense,Everyday",        // duplicate
        "2026-08-14,Coffee,6.50,expense,Everyday",      // accepted
        "2026-99-14,Broken date,10,expense,Everyday",   // rejected: date
        "2026-08-16,,10,expense,Everyday",              // rejected: description
        "2026-08-17,No amount,,expense,Everyday",       // rejected: amount missing
        "2026-08-18,Bad amount,abc,expense,Everyday",   // rejected: amount NaN
        "2026-08-19,Zero,0,expense,Everyday",           // rejected: zero
        "2026-08-20,Moving money,500,transfer,Everyday", // rejected: transfer
        "2026-08-21,Unknown account,25,expense,Nowhere", // rejected: no such account
      ].join("\n"),
      existing,
    );

    expect(report.accepted).toHaveLength(1);
    expect(report.duplicates).toBe(1);
    expect(report.rejected).toHaveLength(7);
    expect(report.rejected.map((item) => item.line)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(report.rejected[6].reason).toBe('No account named "Nowhere"');
    expect(report.rejected[5].reason).toContain("Transfers must be added in the app");
  });

  it("reports a missing required column instead of importing", () => {
    const report = run("date,description\n2026-08-14,Coffee");
    expect(report.error).toBe("The sheet is missing a amount column.");
    expect(report.accepted).toHaveLength(0);
  });

  it("reports an empty sheet", () => {
    expect(run("date,description,amount").error).toBe("Add a header row and at least one transaction row.");
  });
});

describe("row mapping", () => {
  it("files a row against the named account and its space", () => {
    const report = run("date,description,amount,type,account\n2026-08-14,Groceries,60,expense,Joint");
    expect(report.accepted[0].accountId).toBe("acc-joint");
    expect(report.accepted[0].space).toBe("household");
    expect(report.accepted[0].affectsBalance).toBe(false);
  });

  it("infers expense from a negative amount when type is blank", () => {
    const report = run("date,description,amount\n2026-08-14,Coffee,-6.50");
    expect(report.accepted[0].type).toBe("expense");
    expect(report.accepted[0].amount).toBe(6.5);
  });

  it("infers income from a positive amount when type is blank", () => {
    const report = run("date,description,amount\n2026-08-14,Salary,5000");
    expect(report.accepted[0].type).toBe("income");
    expect(report.accepted[0].amount).toBe(5000);
  });

  it("imports a description containing a comma without losing columns", () => {
    const report = run('date,description,amount,type,account\n2026-08-14,"Dinner, drinks",84.50,expense,Everyday');
    expect(report.accepted).toHaveLength(1);
    expect(report.accepted[0].description).toBe("Dinner, drinks");
    expect(report.accepted[0].amount).toBe(84.5);
    expect(report.accepted[0].accountId).toBe("acc-everyday");
  });
});
