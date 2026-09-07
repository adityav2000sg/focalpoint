"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, BellRing, Check, CreditCard, Globe2, Landmark,
  LockKeyhole, PiggyBank, Repeat2, ShieldCheck, Sparkles, Target, TrendingUp, Wallet,
} from "lucide-react";
import {
  CURRENCIES, DEFAULT_CURRENCY, allExpenseCategories, formatMoney, todayIso, uid,
  type Account, type AccountType, type CurrencyCode, type Goal, type RecurringItem,
} from "@/lib/finance";

export interface OnboardingResult {
  baseCurrency: CurrencyCode;
  account: Account;
  salary: RecurringItem | null;
  bill: RecurringItem | null;
  goal: Goal | null;
  remindersEnabled: boolean;
  appLockEnabled: boolean;
}

const accountKinds: Array<{ id: AccountType; label: string; hint: string; icon: React.ReactNode }> = [
  { id: "checking", label: "Everyday", hint: "Where pay lands and cards draw from", icon: <Landmark size={19} /> },
  { id: "savings", label: "Savings", hint: "Money set aside", icon: <PiggyBank size={19} /> },
  { id: "credit", label: "Credit card", hint: "What you owe, not what you hold", icon: <CreditCard size={19} /> },
  { id: "investment", label: "Investments", hint: "Brokerage, funds, CPF", icon: <TrendingUp size={19} /> },
  { id: "cash", label: "Cash", hint: "Notes and coins you track", icon: <Wallet size={19} /> },
];

type StepId = "welcome" | "currency" | "account" | "salary" | "bill" | "goal" | "device" | "done";

/**
 * The guided setup. It writes real records rather than demonstrating them, so the app that
 * appears afterwards is the person's own — a first run that ends in a seeded fake would
 * undermine the honesty the rest of the product works to keep.
 */
export default function OnboardingWizard({
  displayName, biometryAvailable, biometryLabel, onComplete, onSkip,
}: {
  displayName: string;
  biometryAvailable: boolean;
  biometryLabel: string;
  onComplete: (result: OnboardingResult) => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState<StepId>("welcome");
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [accountName, setAccountName] = useState("");
  const [institution, setInstitution] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("checking");
  const [balance, setBalance] = useState("");
  const [salaryAmount, setSalaryAmount] = useState("");
  const [salaryDate, setSalaryDate] = useState("");
  const [billName, setBillName] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billDate, setBillDate] = useState("");
  const [billCategory, setBillCategory] = useState(allExpenseCategories([])[0]);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [reminders, setReminders] = useState(true);
  const [appLock, setAppLock] = useState(biometryAvailable);

  const order: StepId[] = ["welcome", "currency", "account", "salary", "bill", "goal", "device", "done"];
  const index = order.indexOf(step);
  const progress = (index / (order.length - 1)) * 100;

  const parsedBalance = Number(balance);
  const accountReady = accountName.trim().length > 0 && Number.isFinite(parsedBalance) && balance.trim() !== "";

  function go(next: StepId, way: "forward" | "back" = "forward") {
    setDirection(way);
    setStep(next);
  }

  function advance() { if (index < order.length - 1) go(order[index + 1], "forward"); }
  function retreat() { if (index > 0) go(order[index - 1], "back"); }

  const account = useMemo<Account>(() => {
    const owed = ["credit", "loan"].includes(accountType);
    const magnitude = Math.abs(parsedBalance || 0);
    return {
      id: uid("acct"),
      name: accountName.trim() || "Everyday",
      institution: institution.trim() || "—",
      type: accountType,
      space: "personal",
      owner: displayName,
      balance: owed ? -magnitude : magnitude,
      currency,
      accent: "mint",
    };
  }, [accountName, institution, accountType, parsedBalance, currency, displayName]);

  function finish() {
    const salaryValue = Number(salaryAmount);
    const billValue = Number(billAmount);
    const goalValue = Number(goalTarget);
    onComplete({
      baseCurrency: currency,
      account,
      salary: salaryValue > 0 && salaryDate
        ? { id: uid("recurring"), name: "Salary", type: "income", amount: salaryValue, cadence: "monthly", nextDate: salaryDate, accountId: account.id, category: "Income", space: "personal", active: true }
        : null,
      bill: billValue > 0 && billDate && billName.trim()
        ? { id: uid("recurring"), name: billName.trim(), type: "expense", amount: billValue, cadence: "monthly", nextDate: billDate, accountId: account.id, category: billCategory, space: "personal", active: true }
        : null,
      goal: goalValue > 0 && goalName.trim() && goalDate
        ? { id: uid("goal"), name: goalName.trim(), target: goalValue, current: 0, targetDate: goalDate, space: "personal", icon: "spark", priority: "important", currency }
        : null,
      remindersEnabled: reminders,
      appLockEnabled: biometryAvailable && appLock,
    });
  }

  return (
    <div className="wizard" role="dialog" aria-modal="true" aria-label="Set up Lifetime">
      <div className="wizard-rail" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>

      <header className="wizard-top">
        {index > 0 && index < order.length - 1
          ? <button type="button" className="wizard-back" onClick={retreat} aria-label="Back"><ArrowLeft size={18} /></button>
          : <span />}
        <span className="wizard-count">{index === 0 || index === order.length - 1 ? "" : `${index} of ${order.length - 2}`}</span>
        {index < order.length - 1
          ? <button type="button" className="wizard-skip" onClick={onSkip}>Skip setup</button>
          : <span />}
      </header>

      <main className={`wizard-stage wizard-${direction}`} key={step}>
        {step === "welcome" && (
          <div className="wizard-panel wizard-centred">
            <span className="wizard-mark stagger-1"><Sparkles size={30} /></span>
            <h1 className="stagger-2">Let&rsquo;s build your picture, {displayName.split(" ")[0]}.</h1>
            <p className="stagger-3">Six short steps. Everything you enter is yours and stays private — Lifetime never invents a number, and nothing here is shared until you deliberately share it.</p>
            <div className="wizard-promises stagger-4">
              <span><ShieldCheck size={16} /> Private by default</span>
              <span><Check size={16} /> No pre-filled data</span>
              <span><Check size={16} /> Change anything later</span>
            </div>
            <button type="button" className="primary-button wizard-primary stagger-5" onClick={advance}>Start <ArrowRight size={17} /></button>
          </div>
        )}

        {step === "currency" && (
          <div className="wizard-panel">
            <span className="wizard-mark stagger-1"><Globe2 size={26} /></span>
            <h1 className="stagger-2">Which currency do you think in?</h1>
            <p className="stagger-3">Every total is shown in this one. Accounts can be held in any currency — you set the rate yourself, and Lifetime never guesses one.</p>
            <div className="wizard-currency stagger-4">
              {CURRENCIES.slice(0, 8).map((code) => (
                <button key={code} type="button" className={currency === code ? "active" : ""} onClick={() => setCurrency(code)}>{code}</button>
              ))}
            </div>
            <label className="field stagger-5"><span>Something else</span>
              <select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>
                {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
            <button type="button" className="primary-button wizard-primary stagger-6" onClick={advance}>Continue <ArrowRight size={17} /></button>
          </div>
        )}

        {step === "account" && (
          <div className="wizard-panel">
            <span className="wizard-mark stagger-1"><Landmark size={26} /></span>
            <h1 className="stagger-2">Start with one account.</h1>
            <p className="stagger-3">The one most of your money moves through. You can add the rest in a minute — this is just so the numbers mean something.</p>
            <div className="wizard-kinds stagger-4">
              {accountKinds.map((kind) => (
                <button key={kind.id} type="button" className={accountType === kind.id ? "active" : ""} onClick={() => setAccountType(kind.id)}>
                  <i>{kind.icon}</i><strong>{kind.label}</strong><small>{kind.hint}</small>
                </button>
              ))}
            </div>
            <div className="wizard-fields stagger-5">
              <label className="field"><span>Account name</span><input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Everyday" /></label>
              <label className="field"><span>Bank or provider</span><input value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="DBS" /></label>
              <label className="field"><span>{["credit", "loan"].includes(accountType) ? `Amount owed (${currency})` : `Balance today (${currency})`}</span><input type="number" step="0.01" inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0.00" /></label>
            </div>
            <button type="button" className="primary-button wizard-primary stagger-6" onClick={advance} disabled={!accountReady}>Continue <ArrowRight size={17} /></button>
          </div>
        )}

        {step === "salary" && (
          <div className="wizard-panel">
            <span className="wizard-mark stagger-1"><Repeat2 size={26} /></span>
            <h1 className="stagger-2">When does money come in?</h1>
            <p className="stagger-3">Add your salary and Lifetime can tell you what is actually free to spend, instead of guessing from a few weeks of history.</p>
            <div className="wizard-fields stagger-4">
              <label className="field"><span>Take-home each month ({currency})</span><input type="number" step="0.01" inputMode="decimal" value={salaryAmount} onChange={(event) => setSalaryAmount(event.target.value)} placeholder="6,000" /></label>
              <label className="field"><span>Next pay date</span><input type="date" value={salaryDate} min={todayIso()} onChange={(event) => setSalaryDate(event.target.value)} /></label>
            </div>
            <div className="wizard-actions stagger-5">
              <button type="button" className="secondary-button" onClick={advance}>I&rsquo;ll do this later</button>
              <button type="button" className="primary-button" onClick={advance}>Continue <ArrowRight size={17} /></button>
            </div>
          </div>
        )}

        {step === "bill" && (
          <div className="wizard-panel">
            <span className="wizard-mark stagger-1"><BellRing size={26} /></span>
            <h1 className="stagger-2">And the one bill you must not miss?</h1>
            <p className="stagger-3">Rent, a mortgage, insurance. It appears on Today with the date, and turns overdue rather than quietly disappearing.</p>
            <div className="wizard-fields stagger-4">
              <label className="field"><span>What is it</span><input value={billName} onChange={(event) => setBillName(event.target.value)} placeholder="Rent" /></label>
              <label className="field"><span>Amount ({currency})</span><input type="number" step="0.01" inputMode="decimal" value={billAmount} onChange={(event) => setBillAmount(event.target.value)} placeholder="2,800" /></label>
              <label className="field"><span>Next due</span><input type="date" value={billDate} min={todayIso()} onChange={(event) => setBillDate(event.target.value)} /></label>
              <label className="field"><span>Category</span><select value={billCategory} onChange={(event) => setBillCategory(event.target.value)}>{allExpenseCategories([]).map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <div className="wizard-actions stagger-5">
              <button type="button" className="secondary-button" onClick={advance}>Skip</button>
              <button type="button" className="primary-button" onClick={advance}>Continue <ArrowRight size={17} /></button>
            </div>
          </div>
        )}

        {step === "goal" && (
          <div className="wizard-panel">
            <span className="wizard-mark stagger-1"><Target size={26} /></span>
            <h1 className="stagger-2">What are you working towards?</h1>
            <p className="stagger-3">One thing worth funding. Lifetime works out the date from what you actually keep each month, and tells you when a plan pushes it back.</p>
            <div className="wizard-fields stagger-4">
              <label className="field"><span>The goal</span><input value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="Japan, next spring" /></label>
              <label className="field"><span>How much ({currency})</span><input type="number" step="1" inputMode="decimal" value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} placeholder="12,000" /></label>
              <label className="field"><span>By when</span><input type="date" value={goalDate} min={todayIso()} onChange={(event) => setGoalDate(event.target.value)} /></label>
            </div>
            <div className="wizard-actions stagger-5">
              <button type="button" className="secondary-button" onClick={advance}>Skip</button>
              <button type="button" className="primary-button" onClick={advance}>Continue <ArrowRight size={17} /></button>
            </div>
          </div>
        )}

        {step === "device" && (
          <div className="wizard-panel">
            <span className="wizard-mark stagger-1"><LockKeyhole size={26} /></span>
            <h1 className="stagger-2">Two things for this device.</h1>
            <p className="stagger-3">Both are off unless you say so, and neither sends anything anywhere.</p>
            <div className="wizard-toggles stagger-4">
              <label className={appLock ? "wizard-toggle is-on" : "wizard-toggle"}>
                <input type="checkbox" checked={appLock} disabled={!biometryAvailable} onChange={(event) => setAppLock(event.target.checked)} />
                <span><strong>Require {biometryAvailable ? biometryLabel : "Face ID"} to open</strong><small>{biometryAvailable ? "Your accounts stay hidden if someone picks up an unlocked phone." : "Available in the iPhone and iPad app."}</small></span>
              </label>
              <label className={reminders ? "wizard-toggle is-on" : "wizard-toggle"}>
                <input type="checkbox" checked={reminders} onChange={(event) => setReminders(event.target.checked)} />
                <span><strong>Remind me before a bill is due</strong><small>A notification the day before and the morning of. Built on this device from your own dates.</small></span>
              </label>
            </div>
            <button type="button" className="primary-button wizard-primary stagger-5" onClick={advance}>Continue <ArrowRight size={17} /></button>
          </div>
        )}

        {step === "done" && (
          <div className="wizard-panel wizard-centred">
            <span className="wizard-mark is-done stagger-1"><Check size={30} /></span>
            <h1 className="stagger-2">That&rsquo;s your foundation.</h1>
            <p className="stagger-3">Lifetime will start drawing your net worth from today, and everything below is editable whenever you like.</p>
            <ul className="wizard-summary stagger-4">
              <li><Landmark size={16} /> {account.name} · {formatMoney(account.balance, false, currency)}</li>
              {Number(salaryAmount) > 0 && salaryDate && <li><Repeat2 size={16} /> Salary of {formatMoney(Number(salaryAmount), false, currency)} each month</li>}
              {Number(billAmount) > 0 && billDate && billName.trim() && <li><BellRing size={16} /> {billName.trim()} · {formatMoney(Number(billAmount), false, currency)}</li>}
              {Number(goalTarget) > 0 && goalName.trim() && <li><Target size={16} /> {goalName.trim()} · {formatMoney(Number(goalTarget), false, currency)}</li>}
            </ul>
            <button type="button" className="primary-button wizard-primary stagger-5" onClick={finish}>Open Lifetime <ArrowRight size={17} /></button>
          </div>
        )}
      </main>
    </div>
  );
}
