import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/request-body";
import { contactApiError, contactResponseData, contactUser } from "@/lib/contact-api-server";
import { ContactError } from "@/lib/unique-phone-server";
import { saveIndividualProfile } from "@/lib/individual-registration-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let hasProfile: boolean | undefined;
  let committed = false;
  try {
    const { auth, db, user } = await contactUser(request);
    const existing = await db.collection("users").doc(user.uid).get();
    hasProfile = Boolean(existing.get("accountType") || existing.get("createdAt"));
    const body = await readJsonObject(request, false, 4096);
    const profile = await saveIndividualProfile(db, auth, user, body);
    committed = true;
    // A failed optional Auth display-name sync must not roll back a committed profile.
    await auth.updateUser(user.uid, { displayName: String(profile.displayName || "Пользователь") }).catch(() => undefined);
    const saved = await db.collection("users").doc(user.uid).get();
    return NextResponse.json({ profile: contactResponseData(saved.data()) });
  } catch (error) { return contactApiError(error, !committed && hasProfile === false && error instanceof ContactError); }
}
