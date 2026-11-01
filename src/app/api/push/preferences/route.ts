import { NextRequest } from "next/server";
import { accountActor, accountBody, accountFailure, accountJson } from "@/lib/account-api-server";
import { appNotificationPreferences, saveAppNotificationPreferences } from "@/lib/app-notifications-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try { const actor = await accountActor(request, "app-push-preferences"); return accountJson(await appNotificationPreferences(actor.uid)); }
  catch (error) { return accountFailure(error); }
}
export async function POST(request: NextRequest) {
  try { const actor = await accountActor(request, "app-push-preferences"); return accountJson(await saveAppNotificationPreferences(actor.uid, await accountBody(request, 4096))); }
  catch (error) { return accountFailure(error); }
}
