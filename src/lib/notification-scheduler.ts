declare global {
  var __strovaNotificationWorkers: Map<string, { timer: ReturnType<typeof setInterval>; running: boolean }> | undefined;
}
/** VPS workers do not depend on a browser being open or on a separately
 * configured cron service. Firestore leases also protect multiple processes. */
export function startNotificationSchedulers() {
  const workers = globalThis.__strovaNotificationWorkers ||= new Map();
  const start = (name: string, interval: number, delay: number, run: () => Promise<unknown>) => {
    if (workers.has(name)) return;
    const state = { timer: undefined as unknown as ReturnType<typeof setInterval>, running: false };
    const tick = async () => {
      if (state.running) return;
      state.running = true;
      try { await run(); }
      catch { console.error(`Notification worker ${name} will retry`); }
      finally { state.running = false; }
    };
    state.timer = setInterval(() => void tick(), interval);
    state.timer.unref?.(); workers.set(name, state);
    setTimeout(() => void tick(), delay).unref?.();
  };
  start("push", 20_000, 5_000, async () => (await import("./notification-push-server")).runNotificationPushBatch());
  start("moderator", 15_000, 8_000, async () => (await import("./moderator-notifications-server")).runModeratorNotificationBatch());
  start("recommendations", 60_000, 30_000, async () => (await import("./engagement-server")).runEngagementJob());
}
