type Worker = { timer?: ReturnType<typeof setTimeout>; running: boolean; failures: number };
type QuotaState = { until: number; observedAt: number };
declare global {
  var __strovaBackgroundWorkersV2: Map<string, Worker> | undefined;
  var __strovaFirestoreQuotaPause: QuotaState | undefined;
}

export const QUOTA_PAUSE_MS = 15 * 60_000;
export const BACKGROUND_INTERVALS = {
  deletion: 60_000, ownerNotifications: 60_000, reviews: 60_000,
  publications: 60_000, avatars: 300_000, push: 30_000,
  moderator: 60_000, recommendations: 900_000,
} as const;

export function backgroundWorkersEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NEXT_PHASE !== "phase-production-build" && env.STROVA_BACKGROUND_WORKERS_ENABLED !== "false"
    && (env.NODE_ENV === "production" || env.STROVA_RUN_LOCAL_WORKERS === "true");
}
export function isFirestoreQuotaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = (error as { code?: unknown }).code;
  return value === 8 || value === "8" || value === "resource-exhausted" || value === "RESOURCE_EXHAUSTED";
}
export function noteFirestoreQuota(error: unknown, now = Date.now()) {
  if (!isFirestoreQuotaError(error)) return false;
  const previous = globalThis.__strovaFirestoreQuotaPause;
  if (!previous || previous.until <= now) {
    globalThis.__strovaFirestoreQuotaPause = { until: now + QUOTA_PAUSE_MS, observedAt: now };
    console.error("Firestore quota exhausted; background workers paused", { code: 8, retryAfterSeconds: QUOTA_PAUSE_MS / 1000 });
  }
  return true;
}
export function firestoreQuotaPause(now = Date.now()) {
  const state = globalThis.__strovaFirestoreQuotaPause;
  return { lastQuotaErrorAt: state?.observedAt || null, backgroundPauseUntil: state && state.until > now ? state.until : null };
}

/** Scheduling and backoff themselves never read or write Firestore. */
export function startBackgroundWorker(name: string, interval: number, delay: number, run: () => Promise<unknown>) {
  if (!backgroundWorkersEnabled()) return;
  const workers = globalThis.__strovaBackgroundWorkersV2 ||= new Map();
  if (workers.has(name)) return;
  const state: Worker = { running: false, failures: 0 };
  workers.set(name, state);
  const schedule = (wait: number) => {
    state.timer = setTimeout(() => void tick(), Math.max(1, wait));
    state.timer.unref?.();
  };
  const tick = async () => {
    if (!backgroundWorkersEnabled()) { workers.delete(name); return; }
    const paused = (globalThis.__strovaFirestoreQuotaPause?.until || 0) - Date.now();
    if (paused > 0) { schedule(paused + delay); return; }
    if (state.running) return;
    state.running = true;
    try { await run(); state.failures = 0; }
    catch (error) {
      state.failures++;
      if (!noteFirestoreQuota(error)) console.error("Background worker will retry", { worker: name, attempt: state.failures });
    } finally {
      state.running = false;
      const quotaWait = (globalThis.__strovaFirestoreQuotaPause?.until || 0) - Date.now();
      schedule(quotaWait > 0 ? quotaWait + delay
        : Math.max(interval, Math.min(600_000, interval * 2 ** Math.min(state.failures, 4))));
    }
  };
  schedule(delay);
}
