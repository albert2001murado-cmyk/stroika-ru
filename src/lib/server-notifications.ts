import { createHash } from "crypto";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

export type ServerNotificationInput = {
  recipientId: string;
  actorId?: string;
  actorName?: string;
  title: string;
  body: string;
  url: string;
  type: string;
  entityId?: string;
  chatId?: string;
  dedupeKey?: string;
  durableDedupe?: boolean;
  /** Discovery belongs only on the phone; it must not create website inbox entries. */
  pushOnly?: boolean;
  reviewTarget?: { collection: "listings" | "customerRequests" | "reviews" | "verificationRequests"; id: string; revision: string };
  match?: { requestId: string; listingId: string; distanceKm: number };
};

function clean(value: unknown, maximum: number) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, maximum);
}

function safeUrl(value: unknown) {
  const candidate = clean(value, 300);
  return candidate.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : "/notifications";
}

function notificationId(input: ServerNotificationInput) {
  if (!input.dedupeKey) return "";
  return createHash("sha256")
    .update(`${input.recipientId}:${input.dedupeKey}`)
    .digest("hex")
    .slice(0, 48);
}

async function blocked(recipientId: string, actorId: string) {
  if (!actorId || actorId === "system" || actorId === recipientId) return false;
  const db = getAdminDb();
  const [byRecipient, byActor] = await Promise.all([
    db.doc(`users/${recipientId}/blocked/${actorId}`).get(),
    db.doc(`users/${actorId}/blocked/${recipientId}`).get(),
  ]);
  return byRecipient.exists || byActor.exists;
}

export async function deliverServerNotification(
  raw: ServerNotificationInput,
  guard?: (transaction: Transaction) => Promise<boolean>
) {
  const recipientId = clean(raw.recipientId, 160);
  const actorId = clean(raw.actorId || "system", 160) || "system";
  const title = clean(raw.title || "Строва", 80) || "Строва";
  const body = clean(raw.body || "Новое уведомление", 240) || "Новое уведомление";
  const url = safeUrl(raw.url);
  const type = clean(raw.type || "system", 32) || "system";
  const entityId = clean(raw.entityId, 160);
  const chatId = clean(raw.chatId, 160);

  if (!recipientId || recipientId.includes("/")) {
    return { ok: false, sent: 0, error: "invalid-recipient" } as const;
  }
  if (await blocked(recipientId, actorId)) {
    return { ok: true, sent: 0, blocked: true } as const;
  }

  const db = getAdminDb();
  const stableId = notificationId(raw);
  const reference = stableId
    ? db.doc(`users/${recipientId}/notifications/${stableId}`)
    : db.collection(`users/${recipientId}/notifications`).doc();
  const receipt = raw.durableDedupe && stableId
    ? db.doc(`${type.startsWith("engagement_") ? "engagementDeliveries" : type.startsWith("moderator_") ? "moderatorNotificationDeliveries" : "nearbyMatchDeliveries"}/${stableId}`) : null;
  const pushJob = db.doc(`notificationPushJobs/${createHash("sha256").update(`${recipientId}:${reference.id}`).digest("hex")}`);

  const created = await db.runTransaction(async (transaction) => {
    const [profile, recipientDeletion, actorDeletion] = await Promise.all([
      transaction.get(db.doc(`users/${recipientId}`)),
      transaction.get(db.doc(`accountDeletionJobs/${recipientId}`)),
      actorId && actorId !== "system" ? transaction.get(db.doc(`accountDeletionJobs/${actorId}`)) : null,
    ]);
    if (!profile.exists || profile.get("moderationStatus") === "blocked" || recipientDeletion.exists || actorDeletion?.exists) return false;
    if (receipt && (await transaction.get(receipt)).exists) return false;
    if (stableId && !raw.pushOnly) {
      const existing = await transaction.get(reference);
      if (existing.exists) return false;
    }
    if (guard && !(await guard(transaction))) return false;
    if (!raw.pushOnly) transaction.create(reference, {
      userId: recipientId,
      actorId,
      actorName: clean(raw.actorName || (actorId === "system" ? "Строва" : "Пользователь"), 120),
      title,
      body,
      url,
      type,
      entityId,
      chatId,
      read: false,
      dedupeKey: clean(raw.dedupeKey, 300),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(raw.match ? { match: raw.match } : {}),
    });
    if (receipt) transaction.create(receipt, {
      recipientId, entityId, notificationId: raw.pushOnly ? "" : reference.id,
      createdAt: FieldValue.serverTimestamp(),
    });
    // An atomic outbox survives process restarts and temporary Expo failures.
    transaction.create(pushJob, {
      recipientId, actorId, title, body, url, type, entityId, chatId,
      notificationId: raw.pushOnly ? "" : reference.id,
      receiptPath: receipt?.path || "", attempts: 0, accepted: 0,
      nextAttemptAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
      expiresAt: Date.now() + (type.startsWith("engagement_") ? 30 * 60_000 : 24 * 60 * 60_000),
      ...(raw.reviewTarget ? { reviewTarget: raw.reviewTarget } : {}),
    });
    return true;
  });

  if (!created) {
    return { ok: true, sent: 0, duplicate: true, notificationId: reference.id } as const;
  }

  const { processNotificationPushJob } = await import("./notification-push-server");
  const sent = await processNotificationPushJob(pushJob.id).catch(() => 0);
  return { ok: true, sent, notificationId: reference.id } as const;
}
