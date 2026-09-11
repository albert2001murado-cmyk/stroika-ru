import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
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

async function sendExpoPush(
  tokens: string[],
  input: Required<Pick<ServerNotificationInput, "title" | "body" | "url" | "type">> & {
    entityId: string;
    chatId: string;
    notificationId: string;
  }
) {
  let sent = 0;
  for (let offset = 0; offset < tokens.length; offset += 100) {
    const chunk = tokens.slice(offset, offset + 100);
    const messages = chunk.map((to) => ({
      to,
      sound: "default",
      channelId: input.type === "message" ? "messages" : "default",
      title: input.title,
      body: input.body,
      data: {
        url: input.url,
        chatId: input.chatId,
        type: input.type,
        entityId: input.entityId,
        notificationId: input.notificationId,
      },
    }));
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        const result = await response.json();
        const tickets = Array.isArray(result.data) ? result.data : [];
        sent += tickets.filter((ticket: { status?: string }) => ticket.status === "ok").length;
      }
    } catch {
      // The in-app event has already been stored and remains visible.
    }
  }
  return sent;
}

export async function deliverServerNotification(raw: ServerNotificationInput) {
  const recipientId = clean(raw.recipientId, 160);
  const actorId = clean(raw.actorId || "system", 160) || "system";
  const title = clean(raw.title || "Стройка.ру", 80) || "Стройка.ру";
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

  const created = await db.runTransaction(async (transaction) => {
    if (stableId) {
      const existing = await transaction.get(reference);
      if (existing.exists) return false;
    }
    transaction.create(reference, {
      userId: recipientId,
      actorId,
      actorName: clean(raw.actorName || (actorId === "system" ? "Стройка.ру" : "Пользователь"), 120),
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
    });
    return true;
  });

  if (!created) {
    return { ok: true, sent: 0, duplicate: true, notificationId: reference.id } as const;
  }

  const tokensSnapshot = await db
    .collection(`users/${recipientId}/pushTokens`)
    .where("enabled", "==", true)
    .get();
  const tokens = [
    ...new Set(
      tokensSnapshot.docs
        .map((item) => clean(item.data().token, 220))
        .filter(
          (token) =>
            token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")
        )
    ),
  ];
  const sent = await sendExpoPush(tokens, {
    title,
    body,
    url,
    type,
    entityId,
    chatId,
    notificationId: reference.id,
  });
  await reference.set(
    {
      pushAttemptedAt: FieldValue.serverTimestamp(),
      pushTokenCount: tokens.length,
      pushSentCount: sent,
    },
    { merge: true }
  );
  return { ok: true, sent, notificationId: reference.id } as const;
}
