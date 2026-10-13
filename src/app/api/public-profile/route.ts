import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { limitRequests } from "@/lib/api-guard";
import { isDocumentId } from "@/lib/security-policy";
import { publicProfile } from "@/lib/public-profile-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const throttled = limitRequests("public-profile:total", 300);
  if (throttled) return throttled;
  const uid = request.nextUrl.searchParams.get("uid") || "";
  if (!isDocumentId(uid)) return NextResponse.json({ error: "Некорректный пользователь." }, { status: 400 });
  try {
    const snapshot = await getAdminDb().collection("users").doc(uid).get();
    if (!snapshot.exists) return NextResponse.json({ profile: null }, { status: 404 });
    return NextResponse.json({ profile: publicProfile(uid, snapshot.data() || {}) });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить профиль." }, { status: 503 });
  }
}
