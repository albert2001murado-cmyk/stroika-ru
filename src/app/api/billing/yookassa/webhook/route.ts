import { NextRequest } from "next/server";
import { accountBody, accountFailure, accountJson } from "@/lib/account-api-server";
import { yookassaWebhook } from "@/lib/yookassa-server";
import { limitRequests } from "@/lib/api-guard";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const limited = limitRequests("yookassa-webhooks", 180); if (limited) return limited; await yookassaWebhook(await accountBody(request, 32_768)); return accountJson({ received: true }); }
  catch (error) { return accountFailure(error); }
}
