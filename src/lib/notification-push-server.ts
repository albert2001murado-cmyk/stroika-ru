import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type DocumentData, type DocumentReference } from "@/lib/database/admin-values";
import { getAdminDb, getRawAdminAuth } from "./firebase-admin";
import { activeAppPushTokens } from "./app-notifications-server";
import { hasModeratorClaim, pushPreview } from "./security-policy";
import { DEFAULT_ENGAGEMENT, inEngagementQuietHours } from "./engagement";
import { eligiblePublication } from "./nearby-match-policy";

export function reviewRevision(data: DocumentData, verification = false): string {
  if (verification) return String(data.submittedAt?.toMillis?.() || data.createdAt?.toMillis?.() || "initial");
  return String(data.moderationRunId || data.moderationSubmittedAt?.toMillis?.() || data.updatedAt?.toMillis?.() || "initial");
}
export async function reviewStillPending(target: DocumentData): Promise<boolean> {
  if (!["listings", "customerRequests", "reviews", "verificationRequests"].includes(target.collection) || typeof target.id !== "string" || !target.id || target.id.includes("/")) return false;
  const doc = await getAdminDb().doc(`${target.collection}/${target.id}`).get();
  const verification = target.collection === "verificationRequests";
  return doc.exists && doc.get(verification ? "status" : "moderationStatus") === (verification ? "pending" : "manual_review")
    && reviewRevision(doc.data()!, verification) === target.revision;
}
async function finish(job: DocumentReference, lease: string, state: DocumentData, status: string) {
  const db = getAdminDb();
  const record = state.notificationId ? db.doc(`users/${state.recipientId}/notifications/${state.notificationId}`)
    : state.receiptPath ? db.doc(state.receiptPath) : null;
  await db.runTransaction(async tx => {
    const current = await tx.get(job);
    const saved = record ? await tx.get(record) : null;
    if (!current.exists || current.get("lease") !== lease) return;
    if (record && saved?.exists) tx.update(record, { pushStatus: status, pushSentCount: Number(current.get("accepted") || 0), pushAttemptedAt: FieldValue.serverTimestamp() });
    tx.delete(job);
  });
}
export async function processNotificationPushJob(id: string) {
  const db = getAdminDb(), job = db.doc(`notificationPushJobs/${id}`), lease = randomUUID(), now = Date.now();
  const state = await db.runTransaction(async tx => {
    const saved = await tx.get(job);
    if (!saved.exists || Number(saved.get("leaseUntil") || 0) > now || saved.get("nextAttemptAt")?.toMillis() > now) return null;
    tx.update(job, { lease, leaseUntil: now + 90_000 });
    return saved.data()!;
  });
  if (!state) return 0;
  let accepted = 0;
  try {
    if (state.expiresAt < now || Number(state.attempts) >= 8) { await finish(job, lease, state, "expired"); return 0; }
    const recipient = await db.doc(`users/${state.recipientId}`).get();
    if (!recipient.exists || (await db.doc(`accountDeletionJobs/${state.recipientId}`).get()).exists || recipient.get("moderationStatus") === "blocked") {
      await finish(job, lease, state, "suppressed"); return 0;
    }
    if (state.actorId && state.actorId !== "system" && (await db.doc(`accountDeletionJobs/${state.actorId}`).get()).exists) {
      await finish(job, lease, state, "suppressed"); return 0;
    }
    if (state.type.startsWith("engagement_")) {
      const preferences = (await db.doc(`engagementProfiles/${state.recipientId}`).get()).data();
      if (preferences?.enabled !== true || preferences.consentVersion !== 2 || inEngagementQuietHours(DEFAULT_ENGAGEMENT)) {
        await finish(job, lease, state, "suppressed"); return 0;
      }
      if (state.type === "engagement_new") {
        const publication = await db.doc(`listings/${state.entityId}`).get();
        if (!publication.exists || !eligiblePublication(publication.data()!, "listing")) { await finish(job, lease, state, "suppressed"); return 0; }
      }
    }
    if (state.type.startsWith("moderator_")) {
      let account;
      try { account = await getRawAdminAuth().getUser(state.recipientId); }
      catch (error) { if ((error as { code?: string }).code !== "auth/user-not-found") throw error; }
      if (!account || account.disabled || !hasModeratorClaim(account.customClaims || {}) || !state.reviewTarget || !await reviewStillPending(state.reviewTarget)) {
        await finish(job, lease, state, "suppressed"); return 0;
      }
    }
    const active = await activeAppPushTokens(state.recipientId);
    const tokens = Array.isArray(state.pendingTokens) ? state.pendingTokens.filter((token: string) => active.includes(token)) : active;
    if (!tokens.length) { await finish(job, lease, state, Number(state.accepted || 0) > 0 ? "accepted" : "no-active-device"); return 0; }
    const pending = new Set<string>(tokens);
    for (let offset = 0; offset < tokens.length; offset += 100) {
      const chunk = tokens.slice(offset, offset + 100);
      const engagement = state.type.startsWith("engagement_");
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
        body: JSON.stringify(chunk.map((to: string) => ({ to, sound: "default",
          ...pushPreview(state.type, state.title, state.body),
          ...(engagement ? { ttl: 1800, categoryId: "STROVA_RECOMMENDATIONS" } : {}),
          channelId: engagement ? "recommendations" : state.type.startsWith("moderator_") ? "moderation" : state.type === "message" ? "messages" : state.type === "nearby_request" ? "nearby-orders" : "default",
          data: { url: state.url, type: state.type, entityId: state.entityId, chatId: state.chatId, notificationId: state.notificationId, recipientId: state.recipientId },
        }))), signal: AbortSignal.timeout(10_000), cache: "no-store",
      });
      if (!response.ok) throw new Error("push/provider-unavailable");
      const value = await response.json(), tickets = Array.isArray(value.data) ? value.data : [];
      for (let i = 0; i < chunk.length; i++) {
        const ticket = tickets[i];
        if (ticket?.status === "ok") { pending.delete(chunk[i]); accepted++; }
        else if (["DeviceNotRegistered", "MessageTooBig"].includes(ticket?.details?.error)) {
          pending.delete(chunk[i]);
          if (ticket.details.error === "DeviceNotRegistered") {
            const tokenId = encodeURIComponent(chunk[i]).replace(/\./g, "%2E");
            await db.doc(`users/${state.recipientId}/pushTokens/${tokenId}`).set({ enabled: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          }
        }
      }
      // Accepted tokens are removed before retrying failures on other devices.
      await job.update({ pendingTokens: [...pending], accepted: Number(state.accepted || 0) + accepted });
    }
    if (pending.size) throw new Error("push/temporary-ticket-error");
    await finish(job, lease, state, accepted ? "accepted" : "unavailable-device");
    return accepted;
  } catch {
    await db.runTransaction(async tx => {
      const current = await tx.get(job);
      if (!current.exists || current.get("lease") !== lease) return;
      const attempts = Number(current.get("attempts") || 0) + 1;
      tx.update(job, { attempts, nextAttemptAt: Timestamp.fromMillis(Date.now() + Math.min(900_000, 15_000 * 2 ** Math.min(attempts, 6))) });
    });
    return accepted;
  } finally {
    await db.runTransaction(async tx => {
      const current = await tx.get(job);
      if (current.exists && current.get("lease") === lease) tx.update(job, { lease: FieldValue.delete(), leaseUntil: FieldValue.delete() });
    });
  }
}
export async function runNotificationPushBatch() {
  const jobs = await getAdminDb().collection("notificationPushJobs").where("nextAttemptAt", "<=", Timestamp.now()).orderBy("nextAttemptAt").limit(20).get();
  for (const job of jobs.docs) await processNotificationPushJob(job.id);
}
