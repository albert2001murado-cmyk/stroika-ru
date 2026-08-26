import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function safeType(value: unknown, chatId: string) {
  const candidate = String(value || "").trim().slice(0, 32);
  if (candidate) return candidate;
  return chatId ? "message" : "system";
}

export async function POST(request: NextRequest) {
  try {
    const idToken = bearer(request);
    if (!idToken) return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const body = await request.json();
    const recipientId = String(body?.recipientId || "");
    const title = String(body?.title || "Стройка.ру").slice(0, 80);
    const messageBody = String(body?.body || "Новое уведомление").slice(0, 240);
    const url = String(body?.url || "/notifications").slice(0, 300);
    const chatId = String(body?.chatId || "").slice(0, 160);
    const type = safeType(body?.type, chatId);
    const entityId = String(body?.entityId || chatId || "").slice(0, 160);

    if (!recipientId || recipientId === decoded.uid) {
      return NextResponse.json({ error: "Некорректный получатель." }, { status: 400 });
    }

    const db = getAdminDb();
    const senderProfile = await db.doc(`users/${decoded.uid}`).get();
    const senderData = senderProfile.data() || {};
    const isModerator =
      senderData.role === "moderator" ||
      senderData.role === "admin" ||
      senderData.isModerator === true ||
      senderData.isAdmin === true;

    if (!isModerator) {
      if (!chatId) return NextResponse.json({ error: "Не указан чат." }, { status: 403 });
      const chat = await db.doc(`chats/${chatId}`).get();
      const chatData = chat.data() || {};
      const participants = chatData.participantIds || chatData.participants || [];
      if (
        !Array.isArray(participants) ||
        !participants.includes(decoded.uid) ||
        !participants.includes(recipientId)
      ) {
        return NextResponse.json({ error: "Нет доступа." }, { status: 403 });
      }
    }

    const [blockedByRecipient, blockedBySender] = await Promise.all([
      db.doc(`users/${recipientId}/blocked/${decoded.uid}`).get(),
      db.doc(`users/${decoded.uid}/blocked/${recipientId}`).get(),
    ]);

    if (blockedByRecipient.exists || blockedBySender.exists) {
      return NextResponse.json({ ok: true, sent: 0, blocked: true });
    }

    // Центр уведомлений хранится в Firestore и работает даже когда push отключён.
    const notificationRef = db.collection(`users/${recipientId}/notifications`).doc();
    await notificationRef.set({
      userId: recipientId,
      actorId: decoded.uid,
      actorName:
        senderData.displayName ||
        senderData.name ||
        decoded.name ||
        decoded.email?.split("@")[0] ||
        "Пользователь",
      title,
      body: messageBody,
      url,
      type,
      entityId,
      chatId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const tokensSnapshot = await db
      .collection(`users/${recipientId}/pushTokens`)
      .where("enabled", "==", true)
      .get();

    const tokens = tokensSnapshot.docs
      .map((item) => String(item.data().token || ""))
      .filter(
        (token) =>
          token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")
      );

    if (!tokens.length) {
      return NextResponse.json({ ok: true, sent: 0, notificationId: notificationRef.id });
    }

    const messages = tokens.map((to) => ({
      to,
      sound: "default",
      channelId: type === "message" ? "messages" : "default",
      title,
      body: messageBody,
      data: { url, chatId, type, entityId, notificationId: notificationRef.id },
    }));

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Сервис push-уведомлений недоступен.",
          details: result,
          notificationId: notificationRef.id,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      sent: tokens.length,
      notificationId: notificationRef.id,
      result,
    });
  } catch (error) {
    console.error("push send route error:", error);
    return NextResponse.json({ error: "Не получилось отправить уведомление." }, { status: 500 });
  }
}
