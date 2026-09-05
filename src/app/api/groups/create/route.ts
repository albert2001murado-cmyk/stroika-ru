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
    const title = String(body?.title || "").trim().slice(0, 80);
    const avatarUrl = String(body?.avatarUrl || "").trim().slice(0, 1200);
    const avatarPath = String(body?.avatarPath || "").trim().slice(0, 600);
    if (title.length < 2) {
      return NextResponse.json({ error: "Введите название группы." }, { status: 400 });
    }

    const db = getAdminDb();
    const profileSnapshot = await db.collection("users").doc(decoded.uid).get();
    const profile = profileSnapshot.data() || {};
    const displayName = String(profile.displayName || profile.name || decoded.name || decoded.email || "Пользователь");
    const memberAvatar = String(profile.avatarUrl || profile.photoURL || decoded.picture || "");
    const inviteToken = randomUUID().replaceAll("-", "");

    const chatRef = await db.collection("chats").add({
      chatType: "group",
      isGroup: true,
      groupTitle: title,
      groupAvatarUrl: avatarUrl,
      groupAvatarPath: avatarPath,
      ownerId: decoded.uid,
      adminIds: [decoded.uid],
      adminPermissions: {
        [decoded.uid]: {
          editInfo: true,
          inviteMembers: true,
          kickMembers: true,
          manageTags: true,
        },
      },
      memberTags: {},
      participantIds: [decoded.uid],
      participants: {
        [decoded.uid]: { uid: decoded.uid, displayName, avatarUrl: memberAvatar },
      },
      users: {
        [decoded.uid]: { uid: decoded.uid, name: displayName, displayName, photoURL: memberAvatar, avatarUrl: memberAvatar },
      },
      memberCount: 1,
      inviteToken,
      inviteEnabled: true,
      lastMessageText: "Группа создана",
      lastMessageType: "text",
      pinnedBy: {},
      mutedBy: {},
      hiddenFor: {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, chatId: chatRef.id, inviteToken });
  } catch (error) {
    console.error("group create error", error);
    return NextResponse.json({ error: "Не получилось создать групповой чат." }, { status: 500 });
  }
}
