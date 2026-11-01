import { NextRequest } from "next/server";
import { accountActor, accountBody, accountFailure, accountJson } from "@/lib/account-api-server";
import { ensureBillingAccount } from "@/lib/billing-server";
import { registerAppleExternalToken } from "@/lib/apple-external-server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { try { const actor = await accountActor(request, "apple-external-token"), body = await accountBody(request, 12_000); await ensureBillingAccount(actor.uid); return accountJson(await registerAppleExternalToken(actor.uid, String(body.token || ""))); } catch (e) { return accountFailure(e); } }
