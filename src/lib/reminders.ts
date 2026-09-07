import { formatMoney, type CurrencyCode, type HorizonItem } from "@/lib/finance";

export interface ReminderPlan {
  /** Stable across reschedules so the platform replaces a reminder instead of duplicating it. */
  id: number;
  title: string;
  body: string;
  at: Date;
}

export interface ReminderSettings {
  /** Local hour of day to fire, 0-23. */
  hour: number;
  /** Also remind this many days ahead. 0 disables the early nudge. */
  leadDays: number;
}

export const defaultReminderSettings: ReminderSettings = { hour: 9, leadDays: 1 };

/**
 * A small deterministic hash. Notification ids must be 32-bit ints on iOS, and they have to
 * be reproducible: the same bill on the same day must map to the same id every time the
 * schedule is rebuilt, otherwise rescheduling stacks duplicates on the lock screen.
 */
export function reminderId(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  // Keep it positive and inside the 32-bit signed range the platform accepts.
  return Math.abs(hash | 0);
}

function atLocalHour(date: string, hour: number) {
  const stamp = new Date(`${date}T00:00:00`);
  stamp.setHours(hour, 0, 0, 0);
  return stamp;
}

/**
 * Turns the horizon into a notification schedule. Only moments still in the future are
 * returned — a platform cannot fire a notification for a time that has passed, and asking
 * it to would either throw or deliver immediately, which reads as a bug to the user.
 */
export function planReminders(
  items: HorizonItem[],
  currency: CurrencyCode,
  settings: ReminderSettings = defaultReminderSettings,
  now: Date = new Date(),
): ReminderPlan[] {
  const plans: ReminderPlan[] = [];

  for (const item of items) {
    const noun = item.kind === "event" ? "Planned event" : "Payment";
    const amount = formatMoney(item.amount, false, currency);

    const dueAt = atLocalHour(item.date, settings.hour);
    if (dueAt > now) {
      plans.push({
        id: reminderId(`${item.key}:due`),
        title: `${item.name} is due today`,
        body: `${noun} of ${amount}. Mark it paid once it leaves your account.`,
        at: dueAt,
      });
    }

    if (settings.leadDays > 0) {
      const leadDate = new Date(`${item.date}T00:00:00`);
      leadDate.setDate(leadDate.getDate() - settings.leadDays);
      leadDate.setHours(settings.hour, 0, 0, 0);
      if (leadDate > now) {
        const dayWord = settings.leadDays === 1 ? "tomorrow" : `in ${settings.leadDays} days`;
        plans.push({
          id: reminderId(`${item.key}:lead`),
          title: `${item.name} is due ${dayWord}`,
          body: `${noun} of ${amount}.`,
          at: leadDate,
        });
      }
    }
  }

  return plans.sort((a, b) => a.at.getTime() - b.at.getTime());
}
