import { NextRequest, NextResponse } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { limitRequests } from "@/lib/api-guard";
import { isDocumentId } from "@/lib/security-policy";
import { publicProfile } from "@/lib/public-profile-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const throttled = limitRequests("public-profiles:total", 120);
  if (throttled) return throttled;
  const cursor = request.nextUrl.searchParams.get("cursor") || "";
  if (cursor && !isDocumentId(cursor)) return NextResponse.json({ error: "Некорректный курсор." }, { status: 400 });
  try {
    let query = getAdminDb().collection("users").orderBy(FieldPath.documentId()).limit(100);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    return NextResponse.json({
      profiles: snapshot.docs.map(item => publicProfile(item.id, item.data())),
      cursor: snapshot.size === 100 ? snapshot.docs[snapshot.size - 1].id : null,
    });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить профили." }, { status: 503 });
  }
}
