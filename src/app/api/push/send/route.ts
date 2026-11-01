import { hasModeratorClaim, safeInternalUrl, isDocumentId } from "@/lib/security-policy";
import { limitRequests } from "@/lib/api-guard";
import { getAdminDb } from "@/lib/firebase-admin";
import { accountActor, accountBody, accountFailure } from "@/lib/account-api-server";
import { deliverServerNotification } from "@/lib/server-notifications";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const totalLimit = limitRequests("push/send:total", 120);
  if (totalLimit) return totalLimit;
  try {
    const decoded = await accountActor(request, "push-send"), body = await accountBody(request, 8192);
    const recipientId = String(body.recipientId || ""), chatId = String(body.chatId || "").slice(0, 160);
    if (!isDocumentId(recipientId) || (chatId && !isDocumentId(chatId)) || recipientId === decoded.uid) return NextResponse.json({ error: "Некорректный получатель" }, { status: 400 });
    const db = getAdminDb(), sender = (await db.doc(`users/${decoded.uid}`).get()).data() || {};
    const isModerator = hasModeratorClaim(decoded);
    if (!isModerator) {
      if (!chatId) return NextResponse.json({ error: "Не указан чат" }, { status: 403 });
      const chat = (await db.doc(`chats/${chatId}`).get()).data() || {}, participants = chat.participantIds || chat.participants || [];
      if (!Array.isArray(participants) || !participants.includes(decoded.uid) || !participants.includes(recipientId)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    return NextResponse.json(await deliverServerNotification({
      recipientId, actorId: decoded.uid, actorName: sender.displayName || sender.name || decoded.name || "Пользователь",
      title: String(body.title || "Строва").slice(0, 80), body: String(body.body || "Новое уведомление").slice(0, 240),
      url: safeInternalUrl(body.url), type: isModerator ? String(body.type || (chatId ? "message" : "system")).slice(0, 32) : "message",
      entityId: String(body.entityId || chatId || "").slice(0, 160), chatId,
    }));
  } catch (error) { return accountFailure(error); }
}
