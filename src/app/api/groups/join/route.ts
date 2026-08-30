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
    const authToken = bearerToken(request);
    if (!authToken) return NextResponse.json({ error: "Нужно войти в аккаунт." }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(authToken);
    const body = await request.json();
    const inviteToken = String(body?.token || "").trim();
    if (!/^[a-f0-9]{32}$/i.test(inviteToken)) {
      return NextResponse.json({ error: "Ссылка-приглашение недействительна." }, { status: 400 });
    }

    const db = getAdminDb();
    const groupSnapshot = await db.collection("chats").where("inviteToken", "==", inviteToken).limit(1).get();
    if (groupSnapshot.empty) return NextResponse.json({ error: "Группа не найдена." }, { status: 404 });

    const groupRef = groupSnapshot.docs[0].ref;
    const profileSnapshot = await db.collection("users").doc(decoded.uid).get();
    const profile = profileSnapshot.data() || {};
    const displayName = String(profile.displayName || profile.name || decoded.name || decoded.email || "Пользователь");
    const avatarUrl = String(profile.avatarUrl || profile.photoURL || decoded.picture || "");

    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(groupRef);
      const data = fresh.data() || {};
      if (data.chatType !== "group" || data.inviteEnabled === false || data.inviteToken !== inviteToken) {
        throw new Error("INVITE_DISABLED");
      }

      const participantIds = Array.isArray(data.participantIds) ? data.participantIds : [];
      const participants = typeof data.participants === "object" && !Array.isArray(data.participants) ? data.participants : {};
      const users = typeof data.users === "object" && !Array.isArray(data.users) ? data.users : {};

      transaction.update(groupRef, {
        participantIds: FieldValue.arrayUnion(decoded.uid),
        participants: {
          ...participants,
          [decoded.uid]: { uid: decoded.uid, displayName, avatarUrl },
        },
        users: {
          ...users,
          [decoded.uid]: { uid: decoded.uid, name: displayName, displayName, photoURL: avatarUrl, avatarUrl },
        },
        memberCount: new Set([...participantIds, decoded.uid]).size,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true, chatId: groupRef.id });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITE_DISABLED") {
      return NextResponse.json({ error: "Приглашение больше не действует." }, { status: 410 });
    }
    console.error("group join error", error);
    return NextResponse.json({ error: "Не получилось присоединиться к группе." }, { status: 500 });
  }
}
