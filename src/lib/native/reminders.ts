import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { ReminderPlan } from "@/lib/reminders";

export type ReminderSyncResult =
  | { status: "scheduled"; count: number }
  | { status: "unsupported" }
  | { status: "denied" }
  | { status: "failed"; message: string };

/**
 * Replaces the pending schedule with `plans`. Everything already pending is cancelled first
 * so a removed or rescheduled bill cannot leave a stale reminder behind; ids are stable, so
 * re-running this with an unchanged horizon is a no-op from the user's point of view.
 */
export async function syncReminders(plans: ReminderPlan[]): Promise<ReminderSyncResult> {
  if (!Capacitor.isNativePlatform()) return { status: "unsupported" };
  try {
    const permission = await LocalNotifications.checkPermissions();
    const granted = permission.display === "granted"
      ? true
      : (await LocalNotifications.requestPermissions()).display === "granted";
    if (!granted) return { status: "denied" };

    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((item) => ({ id: item.id })) });
    }
    if (!plans.length) return { status: "scheduled", count: 0 };

    await LocalNotifications.schedule({
      notifications: plans.map((plan) => ({
        id: plan.id,
        title: plan.title,
        body: plan.body,
        schedule: { at: plan.at, allowWhileIdle: true },
      })),
    });
    return { status: "scheduled", count: plans.length };
  } catch (error) {
    return { status: "failed", message: error instanceof Error ? error.message : "Reminders could not be scheduled." };
  }
}

export async function clearReminders() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((item) => ({ id: item.id })) });
    }
  } catch {
    // Nothing actionable — the schedule is rebuilt from scratch next time reminders are on.
  }
}
