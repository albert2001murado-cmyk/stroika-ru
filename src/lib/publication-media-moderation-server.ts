import type { ModerationFlag } from "@/lib/publication-policy";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/moderations";
const OPENAI_MODEL = "omni-moderation-latest";
const LOCAL_TIMEOUT_MS = 4.5 * 60 * 1000;
const MAX_CLASSIFIER_IMAGES = 15;

type MediaItem = { type: "image" | "video"; url: string };
type CatalogContext = {
  section?: string;
  category?: string;
  subcategory?: string;
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

function localEndpoint() {
  const raw = String(process.env.LOCAL_MODERATION_URL || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
    if (
      (!loopback && url.protocol !== "https:") ||
      (loopback && !["http:", "https:"].includes(url.protocol))
    ) {
      return "";
    }
    if (url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function mediaClassifierProvider(): MediaClassifierProvider {
  const requested = String(process.env.MODERATION_AI_PROVIDER || "")
    .trim()
    .toLowerCase();
  if ((requested === "local" || (!requested && localEndpoint())) && localEndpoint()) {
    return "local";
  }
  if ((requested === "openai" || (!requested && configuredApiKey())) && configuredApiKey()) {
    return "openai";
  }
  return "none";
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
  message = "Автоматическая проверка временно недоступна; публикация передана модератору."
): ModerationFlag {
  return {
    code: "classifier-unavailable",
    field: "content",
    severity: "review",
    message,
    legalBasis: "Правила публикации Стройка.ру",
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
    const message = String(
      flag.message || "Материал требует дополнительной проверки."
    ).slice(0, 500);
    const legalBasis = String(
      flag.legalBasis || "Правила публикации Стройка.ру"
    ).slice(0, 500);
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
  const endpoint = localEndpoint();
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
          legalBasis: "Правила публикации Стройка.ру",
        },
      ],
    };
  }

  const controller = new AbortController();
  const configuredTimeout = Number(process.env.LOCAL_MODERATION_TIMEOUT_MS);
  const timeout = Number.isFinite(configuredTimeout)
    ? Math.max(30_000, Math.min(290_000, configuredTimeout))
    : LOCAL_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const secret = String(process.env.LOCAL_MODERATION_SECRET || "").trim();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        title: String(input.title || "").slice(0, 120),
        description: String(input.description || input.text || "").slice(0, 5_000),
        catalog: {
          section: String(input.catalog?.section || "").slice(0, 80),
          category: String(input.catalog?.category || "").slice(0, 180),
          subcategory: String(input.catalog?.subcategory || "").slice(0, 180),
        },
        media: trusted,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Local classifier returned ${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    if (!validDecision(payload.decision)) {
      throw new Error("Local classifier returned invalid decision");
    }
    const flags = safeClassifierFlags(payload.flags);
    if (payload.decision !== "approved" && flags.length === 0) {
      throw new Error("Local classifier returned an unexplained decision");
    }
    const checked = Number(payload.mediaChecked);
    return {
      decision: payload.decision,
      flags,
      provider: "stroika-local",
      mediaChecked: Number.isFinite(checked)
        ? Math.max(0, Math.floor(checked))
        : 0,
    };
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
    if (!response.ok) throw new Error(`Classifier returned ${response.status}`);
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

    const hardCategories = [
      "sexual/minors",
      "illicit/violent",
      "hate/threatening",
      "self-harm/instructions",
    ];
    const hard = results.some((result) =>
      hardCategories.some(
        (key) =>
          categoryValue(result.categories, key) ||
          scoreValue(result.category_scores, key) >= 0.9
      )
    );
    const flagged = results.some((result) => result.flagged === true);
    const flags: ModerationFlag[] = [];
    if (hard) {
      flags.push({
        code: "ai-high-risk-content",
        field: "content",
        severity: "critical",
        message: "Система обнаружила материал высокой категории риска.",
        legalBasis:
          "149-ФЗ «Об информации, информационных технологиях и о защите информации»; Правила публикации Стройка.ру",
      });
    } else if (flagged) {
      flags.push({
        code: "ai-content-review",
        field: "content",
        severity: "review",
        message: "Содержание требует проверки модератором.",
        legalBasis: "Правила публикации Стройка.ру",
      });
    }
    if (videoFailed) {
      flags.push({
        code: "video-frame-unavailable",
        field: "media",
        severity: "review",
        message:
          "Видео или недоступное вложение требует полной проверки модератором.",
        legalBasis: "Правила публикации Стройка.ру",
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
  if (provider === "none") {
    return {
      decision: input.media.length ? "manual_review" : "approved",
      provider: "local-only",
      mediaChecked: 0,
      flags: input.media.length
        ? [
            {
              code: "media-classifier-not-configured",
              field: "media",
              severity: "review",
              message:
                "Фото или видео ожидают дополнительной проверки: серверный анализ медиа пока не настроен.",
              legalBasis: "Правила публикации Стройка.ру",
            },
          ]
        : [],
    };
  }

  try {
    return provider === "local"
      ? await evaluateWithLocalClassifier(input)
      : await evaluateWithOpenAI(input);
  } catch {
    return {
      decision: "manual_review",
      provider: provider === "local" ? "stroika-local" : "openai",
      mediaChecked: 0,
      flags: [unavailableFlag()],
    };
  }
}
