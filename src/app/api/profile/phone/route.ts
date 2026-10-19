import { NextRequest, NextResponse } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { activeProfileGuard, limitRequests } from "@/lib/api-guard";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { callableProfilePhone } from "@/lib/profile-contact-policy";
import { readJsonObject, RequestBodyError } from "@/lib/request-body";
import { isDocumentId } from "@/lib/security-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Authorization");
  return response;
}

function json(body: Record<string, unknown>, status = 200) {
  return privateResponse(NextResponse.json(body, { status }));
}

export async function POST(request: NextRequest) {
  const totalLimit = limitRequests("profile/phone:total", 240);
  if (totalLimit) return privateResponse(totalLimit);

  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || header.length > 8192) {
    return json({ error: "Войдите в аккаунт, чтобы позвонить." }, 401);
  }

  let viewer: DecodedIdToken;
  try {
    viewer = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    return json({ error: "Сессия недействительна. Войдите снова." }, 401);
  }

  const userLimit = limitRequests(`profile/phone:${viewer.uid}`, 20);
  if (userLimit) return privateResponse(userLimit);

  try {
    const body = await readJsonObject(request, false, 1024);
    const uid = typeof body.uid === "string" ? body.uid : "";
    if (!isDocumentId(uid)) return json({ error: "Некорректный пользователь." }, 400);

    const db = getAdminDb();
    const revocation = await db.collection("authRevocations").doc(viewer.uid).get();
    if (revocation.exists && !(viewer.auth_time > revocation.data()?.validAfter)) {
      return json({ error: "Сессия недействительна. Войдите снова." }, 401);
    }
    const inactive = await activeProfileGuard(viewer.uid);
    if (inactive) return privateResponse(inactive);

    const targetRef = db.collection("users").doc(uid);
    const [target, blockedByViewer, blockedByTarget] = await Promise.all([
      targetRef.get(),
      db.collection("users").doc(viewer.uid).collection("blocked").doc(uid).get(),
      targetRef.collection("blocked").doc(viewer.uid).get(),
    ]);
    if (!target.exists) return json({ error: "Профиль не найден." }, 404);
    if (blockedByViewer.exists || blockedByTarget.exists) {
      return json({ error: "Звонок недоступен: один из пользователей заблокировал другого." }, 403);
    }

    const source = target.data() || {};
    if (source.moderationStatus === "blocked") {
      return json({ error: "Связь с этим пользователем недоступна." }, 403);
    }
    if (source.contactPreference === "messages") {
      return json({ error: "Пользователь принимает только сообщения." }, 403);
    }
    const phone = callableProfilePhone(source);
    if (!phone) return json({ error: "Пользователь не указал корректный номер телефона." }, 404);

    // Do not return email, bank details, or the private users document.
    return json({ phone });
  } catch (error) {
    if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
    return json({ error: "Не удалось получить номер телефона. Повторите попытку позже." }, 503);
  }
}
