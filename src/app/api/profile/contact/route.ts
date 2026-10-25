import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/request-body";
import { contactApiError, contactUser } from "@/lib/contact-api-server";
import { saveIndividualProfile } from "@/lib/individual-registration-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { auth, db, user } = await contactUser(request);
    const body = await readJsonObject(request, false, 2048);
    // Existing business profiles retain all company and verification fields.
    const profile = await saveIndividualProfile(db, auth, user, { phone: body.phone }, true);
    return NextResponse.json({ phone: profile.phone });
  } catch (error) { return contactApiError(error); }
}
