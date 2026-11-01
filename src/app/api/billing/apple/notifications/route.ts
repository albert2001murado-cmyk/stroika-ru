import { NextRequest } from "next/server";
import { accountBody, accountFailure, accountJson } from "@/lib/account-api-server";
import { appleBillingNotification } from "@/lib/apple-billing-server";
import { limitRequests } from "@/lib/api-guard";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const limited = limitRequests("apple-notifications", 180); if (limited) return limited; const body = await accountBody(request, 70_000); await appleBillingNotification(String(body.signedPayload || "")); return accountJson({ received: true }); }
  catch (error) { return accountFailure(error); }
}
