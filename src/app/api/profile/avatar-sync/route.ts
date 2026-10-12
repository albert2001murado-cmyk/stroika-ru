import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { queueProfileAvatarSync, syncProfileAvatar } from "@/lib/profile-avatar-sync-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token, true)).uid;
  } catch {
    return NextResponse.json({ error: "Войдите в аккаунт повторно." }, { status: 401 });
  }
  try {
    // No body is accepted: the owner and avatar come from the verified account.
    const pending = await queueProfileAvatarSync(uid);
    const result = pending
      ? await syncProfileAvatar(uid)
      : { pending: false, updated: 0 };
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("profile avatar sync route failed", error);
    return NextResponse.json(
      { error: "Фото профиля сохранено. Обновление аватаров в объявлениях будет повторено." },
      { status: 503 }
    );
  }
}

