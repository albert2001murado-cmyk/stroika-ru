import type { ModerationFlag } from "@/lib/publication-policy";
import { serviceNotificationText } from "./brand";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/moderations";
const OPENAI_MODEL = "omni-moderation-latest";
const LOCAL_TIMEOUT_MS = 4.5 * 60 * 1000;
const MAX_CLASSIFIER_IMAGES = 15;

class ClassifierRequestError extends Error {
  constructor(readonly flagCode: string, readonly httpStatus?: number) {
    super("Moderation service request failed");
    this.name = "ClassifierRequestError";
  }
}

function httpFailure(status: number) {
  return new ClassifierRequestError(
    status === 401 || status === 403 ? "classifier-auth-error"
      : status === 422 ? "classifier-protocol-mismatch"
        : status === 429 || status === 503 ? "classifier-busy"
          : "classifier-http-error",
    status
  );
}

async function readClassifierResponse(response: Response, maxBytes = 256 * 1024): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new ClassifierRequestError("classifier-response-invalid");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ClassifierRequestError("classifier-response-invalid"); }
      chunks.push(value);
    }
    try {
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-shape");
      return value as Record<string, unknown>;
    } catch { throw new ClassifierRequestError("classifier-response-invalid"); }
  } finally { reader.releaseLock(); }
}

type MediaItem = { type: "image" | "video"; url: string };
type CatalogContext = {
  section?: string;
  category?: string;
  subcategory?: string;
  alternatives?: string[];
};
type ExternalModerationResult = {
  decision: "approved" | "manual_review" | "rejected";
  flags: ModerationFlag[];
  provider: "local-only" | "openai" | "stroika-local";
  mediaChecked: number;
};
export type MediaClassifierProvider = "none" | "openai" | "local";

function configuredApiKey() {
  return (
    process.env.MODERATION_AI_API_KEY || process.env.OPENAI_API_KEY || ""
  ).trim();
}

export function localModerationEndpoint() {
  const raw = String(process.env.LOCAL_MODERATION_URL || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname.replace(/^\[|\]$/g, ""));
    if (
      (!loopback && url.protocol !== "https:") ||
      (loopback && !["http:", "https:"].includes(url.protocol))
    ) {
      return "";
    }
    if (url.username || url.password || url.search || url.hash) return "";
    if (url.hostname === "localhost" && url.protocol === "http:") url.hostname = "127.0.0.1";
    // A base address is a common configuration mistake: the service's POST route is /moderate.
    if (url.pathname === "/") url.pathname = "/moderate";
    return url.toString();
  } catch {
    return "";
  }
}

export function mediaClassifierProvider(): MediaClassifierProvider {
  const requested = String(process.env.MODERATION_AI_PROVIDER || "")
    .trim()
    .toLowerCase();
  if ((requested === "local" || (!requested && localModerationEndpoint())) && localModerationEndpoint()) {
    return "local";
  }
  if ((requested === "openai" || (!requested && configuredApiKey())) && configuredApiKey()) {
    return "openai";
  }
  return "none";
}

let localFailure: { key: string; until: number; error: ClassifierRequestError } | null = null;
let legacyCatalogSchema: { key: string; until: number } | null = null;
const LOCAL_SCHEMA_CACHE_MS = 5 * 60 * 1000;

function rejectsCatalogAlternatives(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const detail = (value as Record<string, unknown>).detail;
  return Array.isArray(detail) && detail.length > 0 && detail.every(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const error = item as Record<string, unknown>;
    const location = error.loc;
    return error.type === "extra_forbidden" && Array.isArray(location)
      && location.length === 3 && location[0] === "body"
      && location[1] === "catalog" && location[2] === "alternatives";
  });
}

function localFailureKey() {
  // Internal comparison only. This value is never logged or returned to a client.
  return `${localModerationEndpoint()}\n${process.env.LOCAL_MODERATION_SECRET || ""}`;
}
function rememberLocalFailure(error: ClassifierRequestError) {
  const value = Number(process.env.LOCAL_MODERATION_RETRY_COOLDOWN_MS || 60_000);
  const cooldown = Number.isFinite(value) ? Math.max(5_000, Math.min(300_000, value)) : 60_000;
  localFailure = { key: localFailureKey(), until: Date.now() + cooldown, error };
}

/** Read-only, bounded check. A healthy response proves connectivity, not a completed classification. */
export async function inspectLocalModerationService() {
  const provider = mediaClassifierProvider();
  const endpoint = localModerationEndpoint();
  const common = { provider, endpointConfigured: Boolean(endpoint), secretConfigured: Boolean(String(process.env.LOCAL_MODERATION_SECRET || "").trim()), schedulerEnabled: process.env.MODERATION_SCHEDULER_ENABLED === "true" };
  if (provider !== "local" || !endpoint) return { ...common, state: "not-configured", message: "Локальная автопроверка не настроена. Проверьте переменные окружения сервера." };
  const health = new URL(endpoint);
  health.pathname = health.pathname.replace(/\/(?:moderate|classify)\/?$/, "/health");
  if (health.toString() === endpoint) return { ...common, state: "unknown-route", message: "В LOCAL_MODERATION_URL должен быть адрес /moderate сервиса модерации." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const secret = String(process.env.LOCAL_MODERATION_SECRET || "").trim();
    const response = await fetch(health, { cache: "no-store", signal: controller.signal, headers: { ...(secret ? { Authorization: `Bearer ${secret}` } : {}) } });
    if (!response.ok) return { ...common, state: "http-error", httpStatus: response.status, message: "Проверка состояния сервиса вернула HTTP " + response.status + "." };
    const value = await readClassifierResponse(response, 16 * 1024).catch(() => null);
    if (!value || value.status !== "ok") return { ...common, state: "invalid-response", message: "Сервис вернул неожиданный ответ /health. Проверьте адрес и контейнер." };
    return { ...common, state: value.busy === true ? "busy" : "reachable", protocolVersion: typeof value.protocolVersion === "number" ? value.protocolVersion : null, supportsCatalogAlternatives: value.supportsCatalogAlternatives === true, message: value.busy === true ? "Сервис отвечает и занят проверкой. Очередь повторит запрос позднее." : "Сервис отвечает. Это ещё не подтверждает успешную проверку объявления; её покажет диагностический тест /moderate." };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    return { ...common, state: timeout ? "timeout" : "unreachable", message: timeout ? "Сервис не ответил за 5 секунд. Проверьте загрузку контейнера и память." : "Сайт не смог соединиться с сервисом. Проверьте порт, адрес и сеть Docker." };
  } finally { clearTimeout(timer); }
}

export function mediaClassifierConfigured() {
  return mediaClassifierProvider() !== "none";
}

function allowedHosts() {
  return new Set(
    String(process.env.MODERATION_ALLOWED_MEDIA_HOSTS || "")
      .split(",")
      .map((item) => item.trim().toLocaleLowerCase("en-US"))
      .filter(Boolean)
  );
}

function trustedMediaUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase("en-US");
    if (url.protocol !== "https:" || url.username || url.password) return false;
    return (
      host === "strovaru.ru" ||
      host === "www.strovaru.ru" ||
      host === "stroika-ru.ru" ||
      host === "www.stroika-ru.ru" ||
      (!!process.env.YANDEX_S3_BUCKET &&
        host === `${process.env.YANDEX_S3_BUCKET}.storage.yandexcloud.net`) ||
      allowedHosts().has(host)
    );
  } catch {
    return false;
  }
}

function unavailableFlag(
  message = "Автоматическая проверка временно недоступна. Система повторит попытку; заново создавать объявление не нужно.",
  code = "classifier-unavailable"
): ModerationFlag {
  return {
    code,
    field: "content",
    severity: "review",
    message,
    legalBasis: "Правила публикации Строва.ру",
  };
}

function categoryValue(source: unknown, key: string) {
  if (!source || typeof source !== "object") return false;
  return Boolean((source as Record<string, unknown>)[key]);
}

function scoreValue(source: unknown, key: string) {
  if (!source || typeof source !== "object") return 0;
  const value = Number((source as Record<string, unknown>)[key]);
  return Number.isFinite(value) ? value : 0;
}

function validDecision(value: unknown): value is ExternalModerationResult["decision"] {
  return value === "approved" || value === "manual_review" || value === "rejected";
}

function validSeverity(value: unknown): value is ModerationFlag["severity"] {
  return value === "critical" || value === "changes" || value === "review";
}

function safeClassifierFlags(value: unknown): ModerationFlag[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const flag = item as Record<string, unknown>;
    if (!validSeverity(flag.severity)) return [];
    const code = String(flag.code || "local-review").slice(0, 80);
    const field = String(flag.field || "content").slice(0, 80);
    const message = serviceNotificationText(String(
      flag.message || "Материал требует дополнительной проверки."
    ), "moderation").slice(0, 500);
    const legalBasis = serviceNotificationText(String(
      flag.legalBasis || "Правила публикации Строва.ру"
    ), "moderation").slice(0, 500);
    return [{ code, field, severity: flag.severity, message, legalBasis }];
  });
}

async function evaluateWithLocalClassifier(input: {
  text: string;
  title?: string;
  description?: string;
  media: MediaItem[];
  catalog?: CatalogContext;
}): Promise<ExternalModerationResult> {
  const endpoint = localModerationEndpoint();
  const trusted = input.media.filter((item) => trustedMediaUrl(item.url));
  if (trusted.length !== input.media.length) {
    return {
      decision: "manual_review",
      provider: "stroika-local",
      mediaChecked: 0,
      flags: [
        {
          code: "untrusted-media-url",
          field: "media",
          severity: "review",
          message: "Одно из вложений находится на неподтверждённом сервере.",
          legalBasis: "Правила публикации Строва.ру",
        },
      ],
    };
  }

  const controller = new AbortController();
  if (localFailure?.key === localFailureKey() && localFailure.until > Date.now()) throw localFailure.error;
  const configuredTimeout = String(process.env.LOCAL_MODERATION_TIMEOUT_MS || "").trim() ? Number(process.env.LOCAL_MODERATION_TIMEOUT_MS) : NaN;
  const timeout = Number.isFinite(configuredTimeout)
    ? Math.max(30_000, Math.min(290_000, configuredTimeout))
    : LOCAL_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const secret = String(process.env.LOCAL_MODERATION_SECRET || "").trim();
    const schemaKey = localFailureKey();
    let withAlternatives = !(legacyCatalogSchema?.key === schemaKey && legacyCatalogSchema.until > Date.now());
    let learnedLegacySchema = false;
    const catalog = {
      section: String(input.catalog?.section || "").slice(0, 80),
      category: String(input.catalog?.category || "").slice(0, 180),
      subcategory: String(input.catalog?.subcategory || "").slice(0, 180),
    };
    const alternatives = (input.catalog?.alternatives || [])
      .filter((value) => typeof value === "string" && value.trim())
      .slice(0, 800)
      .map((value) => value.trim().slice(0, 180));
    const post = (includeAlternatives: boolean) => fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        title: String(input.title || "").slice(0, 120),
        description: String(input.description || input.text || "").slice(0, 5_000),
        catalog: { ...catalog, ...(includeAlternatives ? { alternatives } : {}) },
        media: trusted,
      }),
      signal: controller.signal,
    });
    let response = await post(withAlternatives);
    if (response.status === 422 && withAlternatives) {
      const validation = await readClassifierResponse(response).catch(() => null);
      if (!rejectsCatalogAlternatives(validation)) throw httpFailure(422);
      // Older strict schemas reject this optional comparison list. Retry once with
      // the same text, selected catalog and all media, under the original deadline.
      withAlternatives = false;
      learnedLegacySchema = true;
      response = await post(false);
    }
    if (!response.ok) {
      throw httpFailure(response.status);
    }
    const payload = await readClassifierResponse(response);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ClassifierRequestError("classifier-response-invalid");
    }
    if (!validDecision(payload.decision)) {
      throw new ClassifierRequestError("classifier-response-invalid");
    }
    if (!Array.isArray(payload.flags) || payload.flags.some(item => !item || typeof item !== "object" || !validSeverity(item.severity))) {
      throw new ClassifierRequestError("classifier-response-invalid");
    }
    const flags = safeClassifierFlags(payload.flags);
    localFailure = null;
    if (flags.some(flag => flag.code === "local-model-error")) rememberLocalFailure(new ClassifierRequestError("local-model-error"));
    if (payload.decision !== "approved" && flags.length === 0) {
      throw new ClassifierRequestError("classifier-response-invalid");
    }
    if (learnedLegacySchema) legacyCatalogSchema = { key: schemaKey, until: Date.now() + LOCAL_SCHEMA_CACHE_MS };
    else if (withAlternatives && legacyCatalogSchema?.key === schemaKey) legacyCatalogSchema = null;
    const decisionFromFlags: ExternalModerationResult["decision"] = flags.some(
      (flag) => flag.severity === "critical" || flag.severity === "changes"
    )
      ? "rejected"
      : flags.some((flag) => flag.severity === "review")
        ? "manual_review"
        : "approved";
    const decisionRank = { approved: 0, manual_review: 1, rejected: 2 } as const;
    const decision = decisionRank[decisionFromFlags] > decisionRank[payload.decision]
      ? decisionFromFlags
      : payload.decision;
    const checked = Number(payload.mediaChecked);
    return {
      decision,
      flags,
      provider: "stroika-local",
      mediaChecked: Number.isFinite(checked)
        ? Math.max(0, Math.floor(checked))
        : 0,
    };
  } catch (error) {
    const failure = controller.signal.aborted ? new ClassifierRequestError("classifier-timeout") : error instanceof ClassifierRequestError ? error : new ClassifierRequestError(error instanceof Error && error.name === "AbortError" ? "classifier-timeout" : "classifier-unavailable");
    rememberLocalFailure(failure);
    throw failure;
  } finally {
    clearTimeout(timer);
  }
}

async function evaluateWithOpenAI(input: {
  text: string;
  media: MediaItem[];
}): Promise<ExternalModerationResult> {
  const images = input.media
    .filter((item) => item.type === "image" && trustedMediaUrl(item.url))
    .slice(0, MAX_CLASSIFIER_IMAGES)
    .map((item) => item.url);
  const videoFailed =
    input.media.some((item) => item.type === "video") ||
    images.length !== input.media.length;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(
      process.env.MODERATION_AI_URL || OPENAI_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${configuredApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.MODERATION_AI_MODEL || OPENAI_MODEL,
          input: [
            ...(input.text ? [{ type: "text", text: input.text }] : []),
            ...images.map((url) => ({
              type: "image_url",
              image_url: { url },
            })),
          ],
        }),
        signal: controller.signal,
      }
    );
    if (!response.ok) throw httpFailure(response.status);
    const payload = (await response.json()) as {
      results?: Array<{
        flagged?: boolean;
        categories?: Record<string, boolean>;
        category_scores?: Record<string, number>;
      }>;
    };
    const results = Array.isArray(payload.results) ? payload.results : [];
    if (
      !results.length ||
      results.some(
        (result) =>
          typeof result.flagged !== "boolean" ||
          !result.categories ||
          typeof result.categories !== "object"
      )
    ) {
      throw new Error("Classifier returned invalid results");
    }

    const hardCategoryThresholds: Record<string, number> = {
      sexual: 0.7,
      "sexual/minors": 0.5,
      "illicit/violent": 0.9,
      "hate/threatening": 0.9,
      "self-harm/instructions": 0.9,
    };
    const detectedHardCategories = Object.keys(hardCategoryThresholds).filter(key =>
      results.some(result =>
          categoryValue(result.categories, key) ||
          scoreValue(result.category_scores, key) >= hardCategoryThresholds[key]
      )
    );
    const hard = detectedHardCategories.length > 0;
    const categoryLabels: Record<string, string> = {
      sexual: "порнографии, обнажённого тела или сексуальных действий",
      "sexual/minors": "сексуального содержания с несовершеннолетними",
      "illicit/violent": "призыва к незаконным насильственным действиям",
      "hate/threatening": "угроз и разжигания ненависти",
      "self-harm/instructions": "инструкций по причинению вреда себе",
    };
    const flagged = results.some((result) => result.flagged === true);
    const flags: ModerationFlag[] = [];
    if (hard) {
      flags.push({
        code: "ai-high-risk-content",
        field: "content",
        severity: "critical",
        message: `Автопроверка обнаружила признаки ${detectedHardCategories.map(key => categoryLabels[key]).join(", ")}. Удалите соответствующий текст или вложения перед повторной отправкой.`,
        legalBasis:
          "149-ФЗ «Об информации, информационных технологиях и о защите информации»; Правила публикации Строва.ру",
      });
    } else if (flagged) {
      flags.push({
        code: "ai-content-review",
        field: "content",
        severity: "review",
        message: "Содержание требует проверки модератором.",
        legalBasis: "Правила публикации Строва.ру",
      });
    }
    if (videoFailed) {
      flags.push({
        code: "video-frame-unavailable",
        field: "media",
        severity: "review",
        message:
          "Видео или недоступное вложение требует полной проверки модератором.",
        legalBasis: "Правила публикации Строва.ру",
      });
    }
    return {
      decision: hard
        ? "rejected"
        : flagged || videoFailed
          ? "manual_review"
          : "approved",
      flags,
      provider: "openai",
      mediaChecked: images.length,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function evaluateWithExternalClassifier(input: {
  text: string;
  title?: string;
  description?: string;
  media: MediaItem[];
  catalog?: CatalogContext;
}): Promise<ExternalModerationResult> {
  const provider = mediaClassifierProvider();
  const needsCatalogCheck = Boolean(input.catalog?.subcategory);
  if (provider === "none") {
    return {
      decision: input.media.length || needsCatalogCheck ? "manual_review" : "approved",
      provider: "local-only",
      mediaChecked: 0,
      flags: input.media.length || needsCatalogCheck
        ? [
            {
              code: input.media.length ? "media-classifier-not-configured" : "catalog-classifier-not-configured",
              field: input.media.length ? "media" : "category",
              severity: "review",
              message:
                "Публикация ожидает проверки соответствия каталогу: локальная модель пока не настроена.",
              legalBasis: "Правила публикации Строва.ру",
            },
          ]
        : [],
    };
  }

  try {
    const result = provider === "local"
      ? await evaluateWithLocalClassifier(input)
      : await evaluateWithOpenAI(input);
    if (provider === "openai" && needsCatalogCheck && result.decision !== "rejected") {
      result.decision = "manual_review";
      result.flags.push({
        code: "catalog-classifier-not-configured", field: "category", severity: "review",
        message: "Проверка безопасности пройдена, но соответствие фото и текста подкатегории должен подтвердить модератор. Для автоматической проверки подключите локальную модель.",
      });
    }
    if (result.decision === "approved" && result.mediaChecked < input.media.length) {
      result.decision = "manual_review";
      result.flags.push(unavailableFlag("Не все вложения были проверены. До полной проверки объявление не публикуется.", "classifier-response-invalid"));
    }
    return result;
  } catch (error) {
    const failure = error instanceof ClassifierRequestError ? error : null;
    const code = failure?.flagCode || (
      error instanceof Error && error.name === "AbortError"
        ? "classifier-timeout" : "classifier-unavailable"
    );
    // Only machine codes and HTTP status: never log URLs, request bodies or credentials.
    console.error("moderation classifier unavailable", {
      provider, code, ...(failure?.httpStatus ? { httpStatus: failure.httpStatus } : {}),
    });
    return {
      decision: "manual_review",
      provider: provider === "local" ? "stroika-local" : "openai",
      mediaChecked: 0,
      flags: [unavailableFlag(undefined, code)],
    };
  }
}
