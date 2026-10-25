import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { limitRequests } from "@/lib/api-guard";
import { readJsonObject } from "@/lib/request-body";
import { checkPhoneAvailable } from "@/lib/unique-phone-server";
import { contactApiError, contactUser } from "@/lib/contact-api-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const limited = limitRequests("registration:phone-check:total", 120);
    if (limited) return limited;
    const ip = (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").slice(0, 80);
    const perIp = limitRequests(`registration:phone-check:${ip}`, 20);
    if (perIp) return perIp;
    const body = await readJsonObject(request, false, 2048);
    const current = request.headers.has("authorization") ? await contactUser(request) : null;
    await checkPhoneAvailable(getAdminDb(), getAdminAuth(), body.phone, current?.user.uid);
    return NextResponse.json({ available: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return contactApiError(error); }
}
