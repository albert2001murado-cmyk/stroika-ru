import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "./firebase-admin";
import { hasModeratorClaim, isDocumentId } from "./security-policy";

export class ModerationConsoleError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const PUBLICATION_STATUSES = ["pending", "manual_review", "approved", "rejected"];
const REPORT_STATUSES = ["open", "in_progress", "resolved", "rejected"];
const COLLECTIONS = { listing: "listings", request: "customerRequests", report: "reports" } as const;
const text = (value: unknown, maximum = 500) => typeof value === "string" ? value.slice(0, maximum) : "";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function time(value: unknown): number {
  const timestamp = value as { toMillis?: () => number } | undefined;
  if (typeof timestamp?.toMillis === "function") return timestamp.toMillis();
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function publication(id: string, kind: "listing" | "request", value: Record<string, unknown>) {
  return {
    id, kind, title: text(value.title, 120), description: text(value.description, 5000),
    category: text(value.category, 180), subcategory: text(value.subcategory, 180), city: text(value.city, 160),
    ownerId: text(kind === "listing" ? value.authorId : value.customerId, 128),
    ownerName: text(kind === "listing" ? value.authorName : value.customerName, 180),
    moderationStatus: text(value.moderationStatus, 30) || "approved",
    moderationReason: text(value.moderationReason, 11000),
    moderationFlags: Array.isArray(value.moderationFlags) ? value.moderationFlags.slice(0, 30).map(flag => {
      const item = object(flag);
      return { code: text(item.code, 80), field: text(item.field, 80), message: text(item.message, 1000) };
    }) : [],
    nextRetryAt: time(value.moderationNextRetryAt), updatedAt: time(value.updatedAt),
  };
}

function report(id: string, value: Record<string, unknown>) {
  return {
    id, reporterName: text(value.reporterName, 180), targetType: text(value.targetType, 30),
    targetId: text(value.targetId, 128), targetOwnerId: text(value.targetOwnerId, 128),
    targetTitle: text(value.targetTitle, 250), reason: text(value.reason, 1000), comment: text(value.comment, 3000),
    source: text(value.source, 30), status: text(value.status, 30) || "open",
    targetSnapshot: { text: text(object(value.targetSnapshot).text, 3000) }, createdAt: time(value.createdAt),
  };
}

export async function loadModerationConsolePage(input: { kind: string; status: string; after?: string; limit?: number }) {
  if (!(input.kind in COLLECTIONS) || !Object.hasOwn(COLLECTIONS, input.kind)) throw new ModerationConsoleError("Некорректный раздел модерации.");
  const kind = input.kind as keyof typeof COLLECTIONS;
  if (!(kind === "report" ? REPORT_STATUSES : PUBLICATION_STATUSES).includes(input.status)) throw new ModerationConsoleError("Некорректный статус.");
  if (input.after && !isDocumentId(input.after)) throw new ModerationConsoleError("Некорректная страница.");
  const limit = Math.max(1, Math.min(50, Math.floor(input.limit || 30)));
  const field = kind === "report" ? "status" : "moderationStatus";
  const legacyStatus = kind === "report" ? "open" : "approved";
  if (input.status === legacyStatus) {
    // Firestore cannot query missing fields. Keep old approved ads/open reports visible
    // with a bounded scan, without rewriting their stored moderation decisions.
    const items = [];
    let cursor = input.after || "", scanned = 0, hasMore = true;
    while (items.length <= limit && scanned < 300 && hasMore) {
      let query = getAdminDb().collection(COLLECTIONS[kind]).orderBy(FieldPath.documentId()).limit(50);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.get();
      hasMore = snapshot.size === 50;
      for (const document of snapshot.docs) {
        scanned++; cursor = document.id;
        const value = object(document.data());
        if ((value[field] || legacyStatus) === input.status) items.push(document);
        if (items.length > limit) break;
      }
    }
    const page = items.slice(0, limit);
    return {
      items: page.map(document => kind === "report" ? report(document.id, object(document.data())) : publication(document.id, kind, object(document.data()))),
      nextCursor: items.length > limit ? page.at(-1)!.id : hasMore ? cursor : "",
    };
  }
  let query = getAdminDb().collection(COLLECTIONS[kind]).where(field, "==", input.status).orderBy(FieldPath.documentId()).limit(limit + 1);
  if (input.after) query = query.startAfter(input.after);
  const snapshot = await query.get();
  const documents = snapshot.docs.slice(0, limit);
  return {
    items: documents.map(document => kind === "report" ? report(document.id, object(document.data())) : publication(document.id, kind, object(document.data()))),
    nextCursor: snapshot.size > limit ? documents.at(-1)!.id : "",
  };
}

async function reportedOwner(value: Record<string, unknown>): Promise<string> {
  const id = text(value.targetId, 128);
  const kind = value.targetType;
  if (!isDocumentId(id)) throw new ModerationConsoleError("В жалобе указан некорректный объект.");
  if (kind === "profile" || kind === "user") return id;
  if (kind === "listing" || kind === "request") {
    const target = await getAdminDb().collection(kind === "listing" ? "listings" : "customerRequests").doc(id).get();
    if (!target.exists) throw new ModerationConsoleError("Объект жалобы удалён. Проверьте аккаунт отдельно.", 409);
    const owner = text(target.data()?.[kind === "listing" ? "authorId" : "customerId"], 128);
    if (!isDocumentId(owner)) throw new ModerationConsoleError("Не удалось установить автора жалобы.", 409);
    return owner;
  }
  // For chat/message reports the moderator explicitly sees the reported account.
  const owner = text(value.targetOwnerId, 128);
  if (!isDocumentId(owner)) throw new ModerationConsoleError("В жалобе не указан пользователь.");
  return owner;
}

export async function updateModerationReport(input: { reportId: string; action: string; status?: string }, actorId: string) {
  if (!isDocumentId(input.reportId)) throw new ModerationConsoleError("Некорректная жалоба.");
  const db = getAdminDb();
  const reference = db.collection("reports").doc(input.reportId);
  if (input.action === "report-status") {
    if (!REPORT_STATUSES.includes(input.status || "")) throw new ModerationConsoleError("Некорректный статус жалобы.");
    await db.runTransaction(async transaction => {
      if (!(await transaction.get(reference)).exists) throw new ModerationConsoleError("Жалоба не найдена.", 404);
      transaction.update(reference, { status: input.status, reviewedBy: actorId, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    return { ok: true };
  }
  if (input.action !== "block-account") throw new ModerationConsoleError("Некорректное действие.");
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new ModerationConsoleError("Жалоба не найдена.", 404);
  const owner = await reportedOwner(object(snapshot.data()));
  if (owner === actorId) throw new ModerationConsoleError("Нельзя заблокировать свой аккаунт из жалобы.", 409);
  const account = await getAdminAuth().getUser(owner);
  if (hasModeratorClaim(account.customClaims || {})) throw new ModerationConsoleError("Служебные аккаунты управляются через Firebase Admin.", 409);
  await db.runTransaction(async transaction => {
    const latest = await transaction.get(reference);
    const profile = await transaction.get(db.collection("users").doc(owner));
    if (!latest.exists || !profile.exists) throw new ModerationConsoleError("Пользователь или жалоба больше не доступны.", 409);
    if (JSON.stringify([latest.data()?.targetType, latest.data()?.targetId, latest.data()?.targetOwnerId]) !== JSON.stringify([snapshot.data()?.targetType, snapshot.data()?.targetId, snapshot.data()?.targetOwnerId])) throw new ModerationConsoleError("Жалоба изменилась. Обновите список.", 409);
    transaction.update(profile.ref, { moderationStatus: "blocked", moderationBlockedAt: FieldValue.serverTimestamp(), moderationBlockedBy: actorId, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(reference, { status: "resolved", reviewedBy: actorId, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  await db.collection("moderationLogs").add({ action: "block-account", reportId: input.reportId, targetOwnerId: owner, reviewedBy: actorId, createdAt: FieldValue.serverTimestamp() });
  return { ok: true };
}
