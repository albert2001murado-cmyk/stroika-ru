import type { ModerationFlag } from "./publication-policy";

const retryableCodes = new Set([
  "media-classifier-not-configured", "catalog-classifier-not-configured",
  "classifier-unavailable", "classifier-timeout", "classifier-busy",
  "classifier-auth-error", "classifier-protocol-mismatch",
  "classifier-http-error", "classifier-response-invalid",
  "local-model-error", "media-download-failed",
]);

/** Infrastructure failures are retryable; content findings always stay with the moderator. */
export function onlyTemporaryModerationFlags(flags: unknown): boolean {
  return Array.isArray(flags) && flags.length > 0 && flags.every(value => {
    if (!value || typeof value !== "object") return false;
    const flag = value as ModerationFlag;
    return flag.severity === "review" && retryableCodes.has(flag.code);
  });
}

export function moderationRetryDelay(attempt: unknown): number {
  const count = Number(attempt);
  const exponent = Math.min(3, Math.max(0, (Number.isFinite(count) ? Math.floor(count) : 1) - 1));
  return Math.min(5 * 60_000, 60_000 * 2 ** exponent);
}

export function moderationRetryAttempt(data: Record<string, unknown>, inputFingerprint: string): number {
  const previous = Number(data.moderationRetryCount);
  return data.moderationRetryFingerprint === inputFingerprint && Number.isFinite(previous)
    ? Math.min(1_000_000, Math.max(0, Math.floor(previous))) + 1
    : 1;
}
