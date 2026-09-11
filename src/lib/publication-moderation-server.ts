import { createHash, randomUUID } from "crypto";
import {
  FieldValue,
  FieldPath,
  Timestamp,
  type DocumentData,
} from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  evaluatePublicationLocally,
  MODERATION_POLICY_VERSION,
  normalizeCityKey,
  normalizeModerationText,
  normalizePublicationCatalog,
  type ModerationFlag,
  type PublicationKind,
  type PublicationModerationStatus,
} from "@/lib/publication-policy";
import {
  evaluateWithExternalClassifier,
  mediaClassifierConfigured,
  mediaClassifierProvider,
} from "@/lib/publication-media-moderation-server";
import { deliverServerNotification } from "@/lib/server-notifications";

const LEASE_MS = 6 * 60 * 1000;
const BATCH_LIMIT = 30;
const MATCH_LIMIT = 100;

const CONFIG = {
  listing: {
    collection: "listings",
    ownerField: "authorId",
    oppositeCollection: "customerRequests",
    oppositeOwnerField: "customerId",
  },
  request: {
    collection: "customerRequests",
    ownerField: "customerId",
    oppositeCollection: "listings",
    oppositeOwnerField: "authorId",
  },
} as const;

type FinalDecision = "approved" | "manual_review" | "rejected";

function dataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeText(value: unknown, maximum = 240) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, maximum)
    : "";
}

function timestampMillis(value: unknown) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof (value as { toMillis?: unknown })?.toMillis === "function") {
    const result = (value as { toMillis(): number }).toMillis();
    return Number.isFinite(result) ? result : 0;
  }
  const seconds = Number((value as { seconds?: unknown })?.seconds);
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}

function ownerId(kind: PublicationKind, data: Record<string, unknown>) {
  return safeText(data[CONFIG[kind].ownerField], 160);
}

function fingerprint(data: Record<string, unknown>) {
  const catalog = normalizePublicationCatalog(data);
  const source = JSON.stringify({
    title: normalizeModerationText(data.title),
    description: normalizeModerationText(data.description),
    city: normalizeCityKey(data.city),
    catalog: catalog.catalogKey,
    subcategory: catalog.subcategoryKey,
  });
  return createHash("sha256").update(source).digest("hex");
}

function moderationInputFingerprint(data: Record<string, unknown>) {
  const media = [
    ...(Array.isArray(data.media)
      ? data.media.map((item) => {
          const value = dataObject(item);
          return `${safeText(value.type, 20)}:${safeText(value.url, 2_000)}`;
        })
      : []),
    ...(Array.isArray(data.imageUrls)
      ? data.imageUrls.map((url) => `image:${safeText(url, 2_000)}`)
      : []),
    ...(Array.isArray(data.videoUrls)
      ? data.videoUrls.map((url) => `video:${safeText(url, 2_000)}`)
      : []),
  ]
    .filter(Boolean)
    .sort();
  return createHash("sha256")
    .update(JSON.stringify({
      title: data.title, description: data.description, city: data.city,
      category: data.category, subcategory: data.subcategory, catalogSection: data.catalogSection,
      catalogCategoryId: data.catalogCategoryId, catalogGroupId: data.catalogGroupId,
      authorId: data.authorId, customerId: data.customerId, status: data.status,
      priceFrom: data.priceFrom, budgetFrom: data.budgetFrom, budgetTo: data.budgetTo,
      media,
    }))
    .digest("hex");
}

function documentPrecedes(
  candidateId: string,
  candidateData: Record<string, unknown>,
  currentId: string,
  currentData: Record<string, unknown>
) {
  const candidateTime = timestampMillis(candidateData.createdAt);
  const currentTime = timestampMillis(currentData.createdAt);
  if (candidateTime && currentTime && candidateTime !== currentTime) {
    return candidateTime < currentTime;
  }
  return candidateId.localeCompare(currentId) < 0;
}

async function duplicateFlag(
  kind: PublicationKind,
  id: string,
  data: Record<string, unknown>,
  currentFingerprint: string
): Promise<ModerationFlag | null> {
  const config = CONFIG[kind];
  const owner = ownerId(kind, data);
  if (!owner) return null;
  const snapshot = await getAdminDb()
    .collection(config.collection)
    .where(config.ownerField, "==", owner)
    .limit(60)
    .get();

  const duplicate = snapshot.docs.find((document) => {
    if (document.id === id) return false;
    const candidate = dataObject(document.data());
    const status = safeText(candidate.moderationStatus, 32);
    if (status === "rejected") return false;
    if (kind === "request" && candidate.status === "closed") return false;
    const candidateFingerprint =
      fingerprint(candidate);
    return (
      candidateFingerprint === currentFingerprint &&
      documentPrecedes(document.id, candidate, id, data)
    );
  });

  return duplicate
    ? {
        code: "duplicate-publication",
        field: "content",
        severity: "changes",
        message: "Такая публикация уже существует. Не создавайте дубликаты для увеличения охвата.",
        legalBasis: "Правила публикации Стройка.ру",
      }
    : null;
}

function finalReason(decision: FinalDecision, flags: ModerationFlag[]) {
  const messages = [...new Set(flags.map((flag) => flag.message))].slice(0, 3);
  if (messages.length) return messages.join(" ");
  if (decision === "approved") return "Автоматическая проверка пройдена.";
  if (decision === "manual_review") {
    return "Публикация направлена модератору для дополнительной проверки.";
  }
  return "Исправьте публикацию и отправьте её повторно.";
}

function combineDecision(
  local: FinalDecision,
  external: FinalDecision
): FinalDecision {
  if (local === "rejected" || external === "rejected") return "rejected";
  if (local === "manual_review" || external === "manual_review") {
    return "manual_review";
  }
  return "approved";
}

async function notifyOwner(input: {
  kind: PublicationKind;
  id: string;
  data: Record<string, unknown>;
  decision: FinalDecision;
  reason: string;
  fingerprint: string;
}) {
  const recipientId = ownerId(input.kind, input.data);
  if (!recipientId) return;
  const title = safeText(input.data.title, 80) || "Публикация";
  const url = input.kind === "listing" ? `/listing/${input.id}` : `/requests/${input.id}`;
  const heading =
    input.decision === "approved"
      ? "Публикация одобрена"
      : input.decision === "manual_review"
        ? "Нужна дополнительная проверка"
        : "Публикацию нужно исправить";
  const body =
    input.decision === "approved"
      ? `«${title}» прошла проверку и опубликована.`
      : input.decision === "manual_review"
        ? `«${title}» проверит модератор. Мы сообщим о решении.`
        : `«${title}»: ${input.reason}`;
  await deliverServerNotification({
    recipientId,
    actorId: "system",
    actorName: "Стройка.ру",
    title: heading,
    body,
    url,
    type: "moderation",
    entityId: input.id,
    dedupeKey: `moderation:${input.kind}:${input.id}:${input.fingerprint}:${input.decision}`,
  });
}

function approvedStatus(data: Record<string, unknown>) {
  const status = safeText(data.moderationStatus, 32);
  return status === "approved" || status === "";
}

function matchesPublication(
  source: Record<string, unknown>,
  candidate: Record<string, unknown>
) {
  const sourceCatalog = normalizePublicationCatalog(source);
  const candidateCatalog = normalizePublicationCatalog(candidate);
  if (!sourceCatalog.valid || !candidateCatalog.valid) return false;
  return (
    normalizeCityKey(source.city) !== "" &&
    normalizeCityKey(source.city) === normalizeCityKey(candidate.city) &&
    sourceCatalog.catalogKey === candidateCatalog.catalogKey &&
    (!["materials", "equipment"].includes(sourceCatalog.section) ||
      sourceCatalog.subcategoryKey === candidateCatalog.subcategoryKey)
  );
}

async function notifyMatches(
  kind: PublicationKind,
  id: string,
  data: Record<string, unknown>,
  cursor = ""
) {
  const config = CONFIG[kind];
  const sourceOwner = ownerId(kind, data);
  if (!sourceOwner) return { matched: 0, cursor: "", done: true };
  const cityKey = normalizeCityKey(data.city);
  if (!cityKey) return { matched: 0, cursor: "", done: true };
  // Cursor survives retries; legacy publications without cityKey are included.
  let query = getAdminDb().collection(config.oppositeCollection)
    .orderBy(FieldPath.documentId()).limit(MATCH_LIMIT);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  const documents = snapshot.docs;
  const page = {
    cursor: documents.at(-1)?.id || cursor,
    done: documents.length < MATCH_LIMIT,
  };
  const recipientPublications = new Map<
    string,
    { id: string; data: Record<string, unknown> }
  >();

  documents.forEach((document) => {
    const candidate = dataObject(document.data());
    const recipientId = safeText(candidate[config.oppositeOwnerField], 160);
    if (!recipientId || recipientId === sourceOwner || !approvedStatus(candidate)) return;
    if (kind === "listing" && candidate.status !== "active") return;
    if (!matchesPublication(data, candidate)) return;
    if (!recipientPublications.has(recipientId)) {
      recipientPublications.set(recipientId, { id: document.id, data: candidate });
    }
  });

  const entries = [...recipientPublications.entries()];
  if (!entries.length) return { matched: 0, ...page };
  const profiles = await getAdminDb().getAll(
    ...entries.map(([recipientId]) => getAdminDb().doc(`users/${recipientId}`))
  );
  const allowed = entries.filter(([recipientId], index) => {
    const profile = dataObject(profiles[index]?.data());
    return (
      profiles[index]?.exists &&
      profile.matchNotificationsEnabled !== false &&
      profile.moderationStatus !== "blocked" &&
      recipientId !== sourceOwner
    );
  });
  const sourceTitle = safeText(data.title, 80) || "Новая публикация";
  const city = safeText(data.city, 80) || "вашем городе";
  const url = kind === "request" ? `/requests/${id}` : `/listing/${id}`;
  let matched = 0;

  for (let offset = 0; offset < allowed.length; offset += 5) {
    const chunk = allowed.slice(offset, offset + 5);
    const results = await Promise.all(
      chunk.map(([recipientId]) =>
        deliverServerNotification({
          recipientId,
          actorId: sourceOwner,
          actorName:
            safeText(
              kind === "request" ? data.customerName : data.authorName,
              100
            ) || "Пользователь",
          title:
            kind === "request"
              ? "Новый подходящий заказ"
              : "Новый подходящий исполнитель",
          body:
            kind === "request"
              ? `В городе ${city} опубликована заявка «${sourceTitle}». Можно предложить свои услуги.`
              : `В городе ${city} появилась анкета «${sourceTitle}», подходящая под вашу заявку.`,
          url,
          type: "match",
          entityId: id,
          dedupeKey: `match:${kind}:${id}:${recipientId}`,
        })
      )
    );
    matched += results.filter(
      (result) => result.ok && "notificationId" in result && !("duplicate" in result)
    ).length;
  }
  return { matched, ...page };
}

async function claimPublication(kind: PublicationKind, id: string, runId: string) {
  const db = getAdminDb();
  const reference = db.collection(CONFIG[kind].collection).doc(id);
  const now = Date.now();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return null;
    const data = dataObject(snapshot.data());
    if (safeText(data.moderationStatus, 32) !== "pending") return null;
    const leaseUntil = timestampMillis(data.moderationLeaseUntil);
    if (data.moderationStage === "checking" && leaseUntil > now) return null;
    transaction.update(reference, {
      moderationStage: "checking",
      moderationRunId: runId,
      moderationStartedAt: FieldValue.serverTimestamp(),
      moderationLeaseUntil: Timestamp.fromMillis(now + LEASE_MS),
      moderationAttempt: FieldValue.increment(1),
    });
    return data;
  });
}

export async function processPublication(kind: PublicationKind, idValue: string) {
  const id = safeText(idValue, 160);
  if (!id || id.includes("/")) throw new Error("Некорректный идентификатор публикации.");
  const runId = randomUUID();
  const data = await claimPublication(kind, id, runId);
  if (!data) return { state: "skipped" as const, kind, id };
  const reference = getAdminDb().collection(CONFIG[kind].collection).doc(id);

  try {
    const local = evaluatePublicationLocally(kind, data);
    const currentFingerprint = fingerprint(data);
    const inputFingerprint = moderationInputFingerprint(data);
    const duplicate = await duplicateFlag(kind, id, data, currentFingerprint);
    if (duplicate) local.flags.push(duplicate);
    const owner = ownerId(kind, data);
    const profile = owner && !owner.includes("/")
      ? await getAdminDb().doc(`users/${owner}`).get() : null;
    const blockedOwner = !profile?.exists || profile.data()?.moderationStatus === "blocked";
    if (blockedOwner) local.flags.push({ code: "owner-unavailable", field: "owner", severity: "review",
      message: "Необходимо проверить статус автора публикации." });
    const localDecision: FinalDecision = duplicate ? "rejected" : blockedOwner ? "manual_review" : local.decision;
    const external =
      localDecision === "rejected"
        ? { decision: "approved" as const, flags: [], provider: "local-only" as const, mediaChecked: 0 }
        : await evaluateWithExternalClassifier({
            text: local.textForClassifier,
            title: safeText(data.title, 120),
            description: safeText(data.description, 5_000),
            media: local.media,
            catalog: {
              section: local.catalog.section,
              category: local.catalog.categoryTitle || local.catalog.category,
              subcategory: local.catalog.subcategory,
            },
          });
    const flags = [...local.flags, ...external.flags];
    const decision = combineDecision(localDecision, external.decision);
    const reason = finalReason(decision, flags);
    const reviewedAt = FieldValue.serverTimestamp();

    const committed = await getAdminDb().runTransaction(async (transaction) => {
      const latest = await transaction.get(reference);
      if (!latest.exists) return false;
      const latestData = dataObject(latest.data());
      if (
        safeText(latestData.moderationStatus, 32) !== "pending" ||
        safeText(latestData.moderationRunId, 160) !== runId
      ) {
        return false;
      }
      if (moderationInputFingerprint(latestData) !== inputFingerprint) {
        transaction.update(reference, {
          moderationStage: "queued",
          moderationLeaseUntil: FieldValue.delete(),
          moderationRunId: FieldValue.delete(),
        });
        return false;
      }

      transaction.set(getAdminDb().collection("publicationNotificationJobs").doc(`${kind}_${id}_${runId}`), {
        kind, publicationId: id, runId, done: false, cursor: "",
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(reference, {
        moderationStatus: decision,
        moderationStage: decision === "manual_review" ? "manual_review" : "complete",
        moderationReason: decision === "approved" ? "" : reason,
        moderationReasonCode: flags[0]?.code || "",
        moderationFlags: flags.map((flag) => ({
          code: flag.code,
          field: flag.field,
          severity: flag.severity,
          message: flag.message,
          legalBasis: flag.legalBasis || "",
        })),
        moderationPolicyVersion: MODERATION_POLICY_VERSION,
        moderationProvider: external.provider,
        moderationMediaChecked: external.mediaChecked,
        moderationReviewedBy: "system",
        moderationReviewedAt: reviewedAt,
        moderationLeaseUntil: FieldValue.delete(),
        moderationRunId: runId,
        contentFingerprint: currentFingerprint,
        catalogKey: local.catalog.catalogKey,
        subcategoryKey: local.catalog.subcategoryKey,
        cityKey: local.cityKey,
        catalogCategoryId:
          local.catalog.categoryId || safeText(data.catalogCategoryId, 80),
        catalogCategoryTitle:
          local.catalog.categoryTitle || safeText(data.catalogCategoryTitle, 180),
        catalogGroupId: local.catalog.groupId || null,
        catalogGroupTitle: local.catalog.groupId ? local.catalog.categoryTitle : "",
        publishedAt: decision === "approved" ? reviewedAt : null,
        updatedAt: reviewedAt,
      });
      return true;
    });

    if (!committed) {
      return { state: "superseded" as const, kind, id };
    }

    await getAdminDb().collection("moderationLogs").doc(`${kind}_${id}_${runId}`).set({
      kind,
      publicationId: id,
      ownerId: ownerId(kind, data),
      decision,
      reason,
      flagCodes: flags.map((flag) => flag.code),
      policyVersion: MODERATION_POLICY_VERSION,
      provider: external.provider,
      contentFingerprint: currentFingerprint,
      createdAt: FieldValue.serverTimestamp(),
    }).catch((error) => console.error("moderation log write failed", error));
    return { state: "processed" as const, kind, id, decision, matched: 0 };
  } catch (error) {
    await getAdminDb().runTransaction(async (transaction) => {
      const latest = await transaction.get(reference);
      if (!latest.exists || latest.data()?.moderationStatus !== "pending" || latest.data()?.moderationRunId !== runId) return;
      transaction.update(reference, {
        moderationStage: "queued",
        moderationLeaseUntil: FieldValue.delete(),
        moderationLastErrorAt: FieldValue.serverTimestamp(),
        moderationLastError: "temporary-processing-error",
      });
    });
    console.error("publication moderation failed", { kind, id });
    throw error;
  }
}

async function requeueMediaWaitingForClassifier(perKind: number) {
  if (!mediaClassifierConfigured()) return 0;

  const retryableCodes = new Set([
    "media-classifier-not-configured",
    "classifier-unavailable",
    "local-model-error",
    "media-download-failed",
  ]);

  const snapshots = await Promise.all(
    (["listing", "request"] as const).map((kind) =>
      getAdminDb()
        .collection(CONFIG[kind].collection)
        .where("moderationStatus", "==", "manual_review")
        .limit(Math.min(250, perKind * 5))
        .get()
        .then((snapshot) => ({ kind, snapshot }))
    )
  );

  let requeued = 0;
  for (const { snapshot } of snapshots) {
    const batch = getAdminDb().batch();
    let changed = 0;

    snapshot.docs.forEach((document) => {
      const data = dataObject(document.data());
      const flags = Array.isArray(data.moderationFlags)
        ? data.moderationFlags.map(dataObject)
        : [];
      const onlyRetryableFlags =
        flags.length > 0 &&
        flags.every(
          (flag) => retryableCodes.has(safeText(flag.code, 80))
        );
      const reasonCode = safeText(data.moderationReasonCode, 80);
      const attempt = Number(data.moderationAttempt || 0);
      const mayRetry =
        reasonCode === "media-classifier-not-configured" ||
        !Number.isFinite(attempt) ||
        attempt < 30;

      if (!onlyRetryableFlags || !mayRetry) return;
      batch.update(document.ref, {
        moderationStatus: "pending",
        moderationStage: "queued",
        moderationReason: "",
        moderationReasonCode: "",
        moderationFlags: [],
        moderationRunId: FieldValue.delete(),
        moderationLeaseUntil: FieldValue.delete(),
        moderationAutoRetryAt: FieldValue.serverTimestamp(),
      });
      changed += 1;
    });

    if (changed > 0) {
      await batch.commit();
      requeued += changed;
    }
  }
  return requeued;
}

export async function runModerationBatch(maximum = BATCH_LIMIT) {
  const perKind = Math.max(1, Math.min(50, Math.ceil(maximum / 2)));
  const requeuedMedia = await requeueMediaWaitingForClassifier(perKind);
  const snapshots = await Promise.all(
    (["listing", "request"] as const).map((kind) =>
      getAdminDb()
        .collection(CONFIG[kind].collection)
        .where("moderationStatus", "==", "pending")
        .limit(perKind)
        .get()
        .then((snapshot) => ({ kind, snapshot }))
    )
  );
  const jobs = snapshots.flatMap(({ kind, snapshot }) =>
    snapshot.docs.map((document) => ({ kind, id: document.id }))
  );
  const results: Array<Awaited<ReturnType<typeof processPublication>> | { state: "failed"; kind: PublicationKind; id: string }> = [];

  const concurrency = mediaClassifierProvider() === "local" ? 1 : 4;
  for (let offset = 0; offset < jobs.length; offset += concurrency) {
    const chunk = jobs.slice(offset, offset + concurrency);
    results.push(
      ...(await Promise.all(
        chunk.map(async (job) => {
          try {
            return await processPublication(job.kind, job.id);
          } catch {
            return { state: "failed" as const, ...job };
          }
        })
      ))
    );
  }
  const deliveries = await runPublicationNotificationJobs();
  return {
    deliveries,
    requeuedMedia,
    // Kept for compatibility with an older admin response shape.
    requeuedPhotos: requeuedMedia,
    found: jobs.length,
    processed: results.filter((item) => item.state === "processed").length,
    skipped: results.filter((item) => item.state === "skipped").length,
    superseded: results.filter((item) => item.state === "superseded").length,
    failed: results.filter((item) => item.state === "failed").length,
    results,
  };
}

export async function applyManualModerationDecision(input: {
  kind: PublicationKind;
  id: string;
  status: Extract<PublicationModerationStatus, "approved" | "rejected">;
  reason?: string;
  reviewerId: string;
}) {
  const id = safeText(input.id, 160);
  if (!id || id.includes("/")) throw new Error("Некорректная публикация.");
  const reference = getAdminDb().collection(CONFIG[input.kind].collection).doc(id);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new Error("Публикация не найдена.");
  const data = dataObject(snapshot.data());
  const currentFingerprint = fingerprint(data);
  const catalog = normalizePublicationCatalog(data);
  const reason =
    input.status === "rejected"
      ? safeText(input.reason, 500) || "Публикация не соответствует правилам размещения."
      : "";
  const reviewedAt = FieldValue.serverTimestamp();
  const runId = randomUUID();
  await getAdminDb().runTransaction(async (transaction) => {
    const latest = await transaction.get(reference);
    if (!latest.exists || moderationInputFingerprint(dataObject(latest.data())) !== moderationInputFingerprint(data)) {
      throw new Error("Публикация изменилась. Обновите страницу перед решением.");
    }
    transaction.set(getAdminDb().collection("publicationNotificationJobs").doc(`${input.kind}_${id}_${runId}`), {
      kind: input.kind, publicationId: id, runId, done: false, cursor: "", createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(reference, {
    moderationRunId: runId,
    moderationStatus: input.status,
    moderationStage: "complete",
    moderationReason: reason,
    moderationReasonCode: input.status === "rejected" ? "manual-rejection" : "",
    moderationPolicyVersion: MODERATION_POLICY_VERSION,
    moderationProvider: "manual",
    moderationReviewedBy: input.reviewerId,
    moderationReviewedAt: reviewedAt,
    moderationLeaseUntil: FieldValue.delete(),
    contentFingerprint: currentFingerprint,
    catalogKey: catalog.catalogKey,
    subcategoryKey: catalog.subcategoryKey,
    cityKey: normalizeCityKey(data.city),
    publishedAt: input.status === "approved" ? reviewedAt : null,
    updatedAt: reviewedAt,
  });
  });
  await getAdminDb().collection("moderationLogs").doc(`${input.kind}_${id}_${runId}`).set({
    kind: input.kind,
    publicationId: id,
    ownerId: ownerId(input.kind, data),
    decision: input.status,
    reason,
    flagCodes: input.status === "rejected" ? ["manual-rejection"] : [],
    policyVersion: MODERATION_POLICY_VERSION,
    provider: "manual",
    reviewerId: input.reviewerId,
    contentFingerprint: currentFingerprint,
    createdAt: FieldValue.serverTimestamp(),
  }).catch((error) => console.error("manual moderation log write failed", error));
  return { state: "reviewed" as const, status: input.status, matched: 0 };
}

// Job data is written only by Admin SDK. Firestore clients have no access.
export async function runPublicationNotificationJobs() {
  const jobs = await getAdminDb().collection("publicationNotificationJobs")
    .where("done", "==", false).limit(10).get();
  let completed = 0;
  for (const job of jobs.docs) {
    try {
      const value = job.data();
      const kind = value.kind as PublicationKind;
      if (kind !== "listing" && kind !== "request") continue;
      const reference = getAdminDb().collection(CONFIG[kind].collection).doc(value.publicationId);
      const publication = await reference.get();
      const data = dataObject(publication.data());
      const decision = data.moderationStatus as FinalDecision;
      if (!publication.exists || data.moderationRunId !== value.runId ||
          !["approved", "manual_review", "rejected"].includes(decision)) {
        await job.ref.update({ done: true, obsolete: true });
        continue;
      }
      await notifyOwner({ kind, id: publication.id, data, decision,
        reason: safeText(data.moderationReason, 500), fingerprint: fingerprint(data) });
      const sourceProfile = await getAdminDb().doc(`users/${ownerId(kind, data)}`).get();
      const canMatch = decision === "approved" && sourceProfile.exists &&
        sourceProfile.data()?.moderationStatus !== "blocked" && (kind !== "request" || data.status === "active");
      const result = canMatch
        ? await notifyMatches(kind, publication.id, data, safeText(value.cursor, 160))
        : { matched: 0, cursor: "", done: true };
      // Prevent an overlapping worker from moving the cursor backwards.
      await getAdminDb().runTransaction(async (transaction) => {
        const latest = await transaction.get(job.ref);
        if (!latest.exists || latest.data()?.cursor !== value.cursor || latest.data()?.done) return;
        transaction.update(job.ref, { cursor: result.cursor, done: result.done,
          updatedAt: FieldValue.serverTimestamp() });
      });
      if (result.done) completed++;
    } catch (error) {
      console.error("publication notification job will retry", job.id, error);
    }
  }
  return { inspected: jobs.size, completed };
}

export function publicationOwnerId(kind: PublicationKind, data: DocumentData) {
  return ownerId(kind, dataObject(data));
}
