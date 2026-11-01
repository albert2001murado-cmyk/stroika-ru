import { NextRequest } from "next/server";
import { accountActor, accountBody, accountFailure, accountJson } from "@/lib/account-api-server";
import { verifyApplePurchase } from "@/lib/apple-billing-server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const actor = await accountActor(request, "apple-verify"), body = await accountBody(request, 4096); return accountJson(await verifyApplePurchase(actor.uid, String(body.transactionId || ""))); }
  catch (error) { return accountFailure(error); }
}
