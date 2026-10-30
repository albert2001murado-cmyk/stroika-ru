import { validatePayment, validateBankOwner } from "./payments";
import { isPublicationExpired, publicationExpiryMillis } from "./publication-lifetime";
import { moderationReasonDetails, publicationModerationReason, publicationModerationNotice, validateManualModerationReason } from "./publication-moderation-feedback";
import { createHash, randomUUID } from "crypto";
import {
  FieldValue,
  FieldPath,
  Timestamp,
  type DocumentData,
} from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { canAccountPublish, publicationVerificationFields } from "./accountVerification";
import {
  evaluatePublicationLocally,
  MODERATION_POLICY_VERSION,
  normalizeCityKey,
  normalizeModerationText,
  normalizePublicationCatalog,
  moderationCatalogAlternatives,
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
import { notifyNearbyRequestMatches } from "@/lib/nearby-request-matches-server";
import { onlyTemporaryModerationFlags, moderationRetryAttempt, moderationRetryDelay } from "./publication-moderation-retry";

const LEASE_MS = 6 * 60 * 1000;
const BATCH_LIMIT = 30;
export class PublicationVerificationError extends Error {}

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
      title: data.title, description: data.description, city: data.city, address: data.address,
      category: data.category, subcategory: data.subcategory, catalogSection: data.catalogSection,
      catalogCategoryId: data.catalogCategoryId, catalogGroupId: data.catalogGroupId,
      authorId: data.authorId, customerId: data.customerId, status: data.status,
      placementDate: timestampMillis(data.createdAt), renewalCount: data.renewalCount || 0,
      priceFrom: data.priceFrom, budgetFrom: data.budgetFrom, budgetTo: data.budgetTo,
      paymentMethods: data.paymentMethods, bankDetails: data.bankDetails, bankDetailsConfirmed: data.bankDetailsConfirmed,
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
    if (status === "rejected" || isPublicationExpired(candidate)) return false;
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
        legalBasis: "Правила публикации Строва",
      }
    : null;
}

function finalReason(decision: FinalDecision, flags: ModerationFlag[]) {
  return publicationModerationReason(decision, flags);
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
  if (!recipientId) return null;
  const temporaryFailure = input.decision === "manual_review" && onlyTemporaryModerationFlags(input.data.moderationFlags);
  const notice = publicationModerationNotice({ ...input, title: input.data.title, flags: input.data.moderationFlags });
  return deliverServerNotification({
    recipientId,
    actorId: "system",
    actorName: "Строва",
    ...notice,
    ...(input.decision === "approved" && isPublicationExpired(input.data) ? {
      title: "Срок размещения истёк",
      body: "Объявление проверено, но месяц размещения уже закончился. Оно доступно в вашем профиле; для нового срока создайте новое объявление.",
    } : {}),
    type: "moderation",
    entityId: input.id,
    dedupeKey: temporaryFailure
      ? `moderation:${input.kind}:${input.id}:${moderationInputFingerprint(input.data)}:temporary-wait`
      : `moderation:${input.kind}:${input.id}:${safeText(input.data.moderationRunId, 160) || input.fingerprint}:${input.decision}`,
  }, async transaction => {
    const current = await transaction.get(getAdminDb().collection(CONFIG[input.kind].collection).doc(input.id));
    return current.exists && current.data()?.moderationRunId === input.data.moderationRunId
      && current.data()?.moderationStatus === input.decision;
  });
}

async function deliverPublicationOwnerNotice(kind: PublicationKind, id: string, runId: string) {
  const db = getAdminDb();
  const reference = db.collection(CONFIG[kind].collection).doc(id);
  const job = db.collection("publicationNotificationJobs").doc(`${kind}_${id}_${runId}`);
  const publication = await reference.get();
  const data = dataObject(publication.data());
  const decision = data.moderationStatus as FinalDecision;
  if (!publication.exists || data.moderationRunId !== runId ||
    !["approved", "manual_review", "rejected"].includes(decision)) {
    await job.update({ done: true, obsolete: true });
    return false;
  }
  const result = await notifyOwner({ kind, id, data, decision,
    reason: typeof data.moderationReason === "string" ? data.moderationReason.slice(0, 11000)
      : "Причина пока не указана. Обратитесь в поддержку.", fingerprint: fingerprint(data) });
  if (!result?.ok) throw new Error("Owner notification has not been stored");
  await job.update({ ownerNotified: true, ownerNotifiedAt: FieldValue.serverTimestamp() });
  return true;
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
    if (data.moderationRetryFingerprint === moderationInputFingerprint(data)
      && timestampMillis(data.moderationNextRetryAt) > now) return null;
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
    const blockedOwner = !profile?.exists || !canAccountPublish(profile.data());
    if (blockedOwner) local.flags.push({ code: "owner-unavailable", field: "owner", severity: "review",
      message: "Аккаунту автора недоступна публикация. Обратитесь в поддержку." });
    const ownerPaymentError = kind === "listing" && Array.isArray(data.paymentMethods) && data.paymentMethods.includes("bank_account")
      ? validatePayment(data.paymentMethods, data.bankDetails, profile?.data()?.accountType, data.bankDetailsConfirmed)
        || validateBankOwner(data.paymentMethods, data.bankDetails, profile?.data()) : null;
    if (ownerPaymentError) local.flags.push({ code: "bank-recipient-mismatch", field: "payment", severity: "changes", message: ownerPaymentError });
    const localDecision: FinalDecision = duplicate || ownerPaymentError ? "rejected" : blockedOwner ? "manual_review" : local.decision;
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
              alternatives: moderationCatalogAlternatives(local.catalog),
            },
          });
    const flags = [...local.flags, ...external.flags];
    let decision = combineDecision(localDecision, external.decision);
    if (decision === "rejected" && !moderationReasonDetails(decision, flags).length) {
      decision = "manual_review";
      flags.push({ code: "missing-rejection-reason", field: "content", severity: "review",
        message: "Автоматическая проверка не вернула конкретную причину. Публикацию проверит модератор." });
    }
    const reason = finalReason(decision, flags);
    const reviewedAt = FieldValue.serverTimestamp();
    const temporaryFailure = decision === "manual_review" && onlyTemporaryModerationFlags(flags);
    const retryFingerprint = moderationInputFingerprint({
      ...data,
      catalogCategoryId: local.catalog.categoryId || safeText(data.catalogCategoryId, 80),
      catalogGroupId: local.catalog.groupId || null,
    });
    const retryCount = temporaryFailure ? moderationRetryAttempt(data, retryFingerprint) : 0;

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

      let verificationFields = {};
      if (decision === "approved") {
        const currentOwner = await transaction.get(getAdminDb().doc(`users/${owner}`));
        if (!currentOwner.exists || !canAccountPublish(currentOwner.data())) {
          transaction.update(reference, { moderationStatus: "manual_review", moderationStage: "complete",
            moderationReason: "Аккаунту автора недоступна публикация. Обратитесь в поддержку.",
            moderationFlags: [{ code: "owner-unavailable", field: "owner", severity: "review", message: "Аккаунт автора отсутствует или заблокирован." }],
            moderationLeaseUntil: FieldValue.delete(), moderationRunId: FieldValue.delete() });
          return false;
        }
        verificationFields = publicationVerificationFields(currentOwner.data());
      }
      transaction.set(getAdminDb().collection("publicationNotificationJobs").doc(`${kind}_${id}_${runId}`), {
        kind, publicationId: id, runId, done: false, ownerNotified: false, cursor: "",
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(reference, {
        ...verificationFields,
        moderationStatus: decision,
        ...(decision === "approved" && publicationExpiryMillis(latestData)
          ? { expiresAt: Timestamp.fromMillis(publicationExpiryMillis(latestData)) } : {}),
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
        moderationRetryCount: retryCount,
        moderationRetryFingerprint: temporaryFailure ? retryFingerprint : FieldValue.delete(),
        moderationNextRetryAt: temporaryFailure
          ? Timestamp.fromMillis(Date.now() + moderationRetryDelay(retryCount)) : FieldValue.delete(),
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

    // The decision is already durable. Do not wait for other publications or geocoding.
    await deliverPublicationOwnerNotice(kind, id, runId).catch(() => {
      console.error("publication owner notification queued for retry", { kind, id });
    });

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
    let changed = 0;

    for (const document of snapshot.docs) {
      const data = dataObject(document.data());
      if (!onlyTemporaryModerationFlags(data.moderationFlags)) continue;
      // Only the local model can finish catalog alignment; OpenAI safety checking cannot.
      if (Array.isArray(data.moderationFlags) && data.moderationFlags.some(flag =>
        dataObject(flag).code === "catalog-classifier-not-configured") && mediaClassifierProvider() !== "local") continue;
      const changedInput = Boolean(data.moderationRetryFingerprint)
        && data.moderationRetryFingerprint !== moderationInputFingerprint(data);
      if (!changedInput && timestampMillis(data.moderationNextRetryAt) > Date.now()) continue;
      // A moderator may have made a decision since the query. Check it in the transaction.
      const queued = await getAdminDb().runTransaction(async (transaction) => {
        const latest = await transaction.get(document.ref);
        const current = dataObject(latest.data());
        if (!latest.exists || current.moderationStatus !== "manual_review"
          || current.moderationReviewedBy !== "system"
          || !onlyTemporaryModerationFlags(current.moderationFlags)) return false;
        const sameInput = current.moderationRetryFingerprint === moderationInputFingerprint(current);
        if (sameInput && timestampMillis(current.moderationNextRetryAt) > Date.now()) return false;
        transaction.update(document.ref, {
          moderationStatus: "pending", moderationStage: "queued",
          moderationRunId: FieldValue.delete(), moderationLeaseUntil: FieldValue.delete(),
          moderationAutoRetryAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (queued) changed += 1;
    }
    requeued += changed;
  }
  return requeued;
}

export async function runModerationBatch(maximum = BATCH_LIMIT) {
  await runPublicationOwnerNotificationJobs().catch(() => {
    console.error("publication owner notification recovery will retry");
  });
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
  if (input.status === "rejected") {
    const reasonError = validateManualModerationReason(input.reason);
    if (reasonError) throw new Error(reasonError);
  }
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
      ? safeText(input.reason, 1000)
      : "";
  const reviewedAt = FieldValue.serverTimestamp();
  const runId = randomUUID();
  await getAdminDb().runTransaction(async (transaction) => {
    const latest = await transaction.get(reference);
    if (!latest.exists || moderationInputFingerprint(dataObject(latest.data())) !== moderationInputFingerprint(data)) {
      throw new Error("Публикация изменилась. Обновите страницу перед решением.");
    }
    let verificationFields = {};
    if (input.status === "approved") {
      const uid = ownerId(input.kind, dataObject(latest.data()));
      if (!uid || uid.includes("/")) throw new Error("Не указан автор публикации.");
      const profile = await transaction.get(getAdminDb().doc(`users/${uid}`));
      if (!profile.exists || !canAccountPublish(profile.data())) throw new PublicationVerificationError("Аккаунту автора недоступна публикация. Обратитесь в поддержку.");
      verificationFields = publicationVerificationFields(profile.data());
    }
    transaction.set(getAdminDb().collection("publicationNotificationJobs").doc(`${input.kind}_${id}_${runId}`), {
      kind: input.kind, publicationId: id, runId, done: false, ownerNotified: false, cursor: "", createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(reference, {
    ...verificationFields,
    moderationRunId: runId,
    ...(input.status === "approved" && publicationExpiryMillis(latest.data())
      ? { expiresAt: Timestamp.fromMillis(publicationExpiryMillis(latest.data())) } : {}),
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
  await deliverPublicationOwnerNotice(input.kind, id, runId).catch(() => {
    console.error("manual moderation owner notification queued for retry", { kind: input.kind, id });
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

// Round-robin prevents one geocoder outage from starving newer notifications.
let notificationJobCursor = "";
let ownerNotificationJobCursor = "";

/** Lightweight retry queue: never calls an ML model or geocoder. */
export async function runPublicationOwnerNotificationJobs() {
  const base = getAdminDb().collection("publicationNotificationJobs")
    .where("done", "==", false).orderBy(FieldPath.documentId()).limit(25);
  let jobs = await (ownerNotificationJobCursor ? base.startAfter(ownerNotificationJobCursor) : base).get();
  if (jobs.empty && ownerNotificationJobCursor) {
    ownerNotificationJobCursor = "";
    jobs = await base.get();
  }
  let delivered = 0;
  for (const job of jobs.docs) {
    ownerNotificationJobCursor = job.id;
    const value = job.data();
    if (value.ownerNotified === true) continue;
    const kind = value.kind as PublicationKind;
    if (kind !== "listing" && kind !== "request") continue;
    try {
      if (await deliverPublicationOwnerNotice(kind, safeText(value.publicationId, 160), safeText(value.runId, 160))) delivered++;
    } catch {
      console.error("publication owner notification will retry", { jobId: job.id });
    }
  }
  return { inspected: jobs.size, delivered };
}
// Job data is written only by Admin SDK. Firestore clients have no access.
export async function runPublicationNotificationJobs() {
  const base = getAdminDb().collection("publicationNotificationJobs")
    .where("done", "==", false).orderBy(FieldPath.documentId()).limit(10);
  let jobs = await (notificationJobCursor ? base.startAfter(notificationJobCursor) : base).get();
  if (jobs.empty && notificationJobCursor) {
    notificationJobCursor = "";
    jobs = await base.get();
  }
  let completed = 0;
  const started = Date.now();
  for (const job of jobs.docs) {
    notificationJobCursor = job.id;
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
      if (value.ownerNotified !== true && !(await deliverPublicationOwnerNotice(kind, publication.id, value.runId))) continue;
      const sourceProfile = await getAdminDb().doc(`users/${ownerId(kind, data)}`).get();
      const canMatch = decision === "approved" && sourceProfile.exists &&
        sourceProfile.data()?.moderationStatus !== "blocked" && (kind !== "request" || data.status === "active");
      const result = canMatch
        ? await notifyNearbyRequestMatches(kind, publication.id, data, safeText(value.cursor, 160))
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
    if (Date.now() - started > 25000) break;
  }
  return { inspected: jobs.size, completed };
}

export function publicationOwnerId(kind: PublicationKind, data: DocumentData) {
  return ownerId(kind, dataObject(data));
}
