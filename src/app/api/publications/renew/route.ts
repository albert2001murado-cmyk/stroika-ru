import { NextRequest } from "next/server";
import { accountActor, accountBody, accountFailure, accountJson, AccountApiError } from "@/lib/account-api-server";
import { PublicationRenewalError, renewOwnedPublication } from "@/lib/publication-renewal-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const actor = await accountActor(request, "publication-renew"), body = await accountBody(request, 2048);
    const kind = body.kind, publicationId = String(body.publicationId || ""), expectedExpiresAt = Number(body.expectedExpiresAt), funding = body.funding;
    if ((kind !== "listing" && kind !== "request") || !/^[A-Za-z0-9_-]{1,128}$/.test(publicationId) || !Number.isFinite(expectedExpiresAt) || expectedExpiresAt <= 0 || (funding !== "free" && funding !== "plan")) throw new AccountApiError("Проверьте объявление и способ продления");
    return accountJson(await renewOwnedPublication({ uid: actor.uid, authTime: actor.auth_time, kind, publicationId, expectedExpiresAt, funding }));
  } catch (error) {
    if (error instanceof PublicationRenewalError) return accountJson({ error: error.message }, error.status);
    return accountFailure(error);
  }
}
