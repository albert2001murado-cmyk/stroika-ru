import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const token = bearerToken(request);
    if (!token) return NextResponse.json({ error: "Нужно войти в аккаунт." }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token);
    const body = await request.json();
    const chatId = String(body?.chatId || "").trim();
    const action = String(body?.action || "update");
    if (!chatId) return NextResponse.json({ error: "Группа не указана." }, { status: 400 });

    const ref = getAdminDb().collection("chats").doc(chatId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ error: "Группа не найдена." }, { status: 404 });
    const data = snapshot.data() || {};
    const admins = Array.isArray(data.adminIds) ? data.adminIds : [];
    if (data.chatType !== "group" || (data.ownerId !== decoded.uid && !admins.includes(decoded.uid))) {
      return NextResponse.json({ error: "Недостаточно прав для изменения группы." }, { status: 403 });
    }

    if (action === "new-invite") {
      const inviteToken = randomUUID().replaceAll("-", "");
      await ref.update({ inviteToken, inviteEnabled: true, updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true, inviteToken });
    }

    const title = String(body?.title || "").trim().slice(0, 80);
    if (title.length < 2) return NextResponse.json({ error: "Введите название группы." }, { status: 400 });
    await ref.update({
      groupTitle: title,
      groupAvatarUrl: String(body?.avatarUrl || "").trim().slice(0, 1200),
      groupAvatarPath: String(body?.avatarPath || "").trim().slice(0, 600),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("group update error", error);
    return NextResponse.json({ error: "Не получилось сохранить настройки группы." }, { status: 500 });
  }
}
