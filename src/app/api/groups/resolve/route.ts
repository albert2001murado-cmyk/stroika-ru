import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token")?.trim() || "";
    if (!/^[a-f0-9]{32}$/i.test(token)) {
      return NextResponse.json({ error: "Ссылка-приглашение недействительна." }, { status: 400 });
    }

    const snapshot = await getAdminDb()
      .collection("chats")
      .where("inviteToken", "==", token)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return NextResponse.json({ error: "Группа не найдена." }, { status: 404 });
    }

    const item = snapshot.docs[0];
    const data = item.data();
    if (data.chatType !== "group" || data.inviteEnabled === false) {
      return NextResponse.json({ error: "Приглашение больше не действует." }, { status: 410 });
    }

    return NextResponse.json({
      ok: true,
      group: {
        id: item.id,
        title: data.groupTitle || "Групповой чат",
        avatarUrl: data.groupAvatarUrl || "",
        memberCount: Array.isArray(data.participantIds)
          ? data.participantIds.length
          : Number(data.memberCount || 0),
      },
    });
  } catch (error) {
    console.error("group resolve error", error);
    return NextResponse.json({ error: "Не получилось открыть приглашение." }, { status: 500 });
  }
}
