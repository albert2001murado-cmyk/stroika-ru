import { NextRequest } from "next/server";
import { accountActor, accountFailure, accountJson } from "@/lib/account-api-server";
import { billingState } from "@/lib/billing-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try { const actor = await accountActor(request, "billing-state"); return accountJson(await billingState(actor.uid)); }
  catch (error) { return accountFailure(error); }
}
