import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { NextRequest, NextResponse } from "next/server";

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const idToken = bearer(request);
    if (!idToken) return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const body = await request.json();
    const recipientId = String(body?.recipientId || "");
    const title = String(body?.title || "Стройка.ру").slice(0, 80);
    const messageBody = String(body?.body || "Новое уведомление").slice(0, 180);
    const url = String(body?.url || "/messages");
    const chatId = String(body?.chatId || "");

    if (!recipientId || recipientId === decoded.uid) {
      return NextResponse.json({ error: "Некорректный получатель." }, { status: 400 });
    }

    const db = getAdminDb();
    const senderProfile = await db.doc(`users/${decoded.uid}`).get();
    const senderData = senderProfile.data() || {};
    const isModerator = senderData.role === "moderator" || senderData.role === "admin" || senderData.isModerator === true || senderData.isAdmin === true;

    if (!isModerator) {
      if (!chatId) return NextResponse.json({ error: "Не указан чат." }, { status: 403 });
      const chat = await db.doc(`chats/${chatId}`).get();
      const chatData = chat.data() || {};
      const participants = chatData.participantIds || chatData.participants || [];
      if (!Array.isArray(participants) || !participants.includes(decoded.uid) || !participants.includes(recipientId)) {
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

    const tokensSnapshot = await db.collection(`users/${recipientId}/pushTokens`).where("enabled", "==", true).get();
    const tokens = tokensSnapshot.docs.map((item) => String(item.data().token || "")).filter((token) => token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));
    if (!tokens.length) return NextResponse.json({ ok: true, sent: 0 });

    const messages = tokens.map((to) => ({
      to,
      sound: "default",
      channelId: "messages",
      title,
      body: messageBody,
      data: { url, chatId },
    }));

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) return NextResponse.json({ error: "Сервис push-уведомлений недоступен.", details: result }, { status: 502 });
    return NextResponse.json({ ok: true, sent: tokens.length, result });
  } catch (error) {
    console.error("push route error:", error);
    return NextResponse.json({ error: "Не получилось отправить уведомление." }, { status: 500 });
  }
}
