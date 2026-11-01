import { NextRequest } from "next/server";
import { accountActor, accountBody, accountFailure, accountJson } from "@/lib/account-api-server";
import { engagementPreferences, saveEngagementPreferences } from "@/lib/engagement-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { try { const actor = await accountActor(request, "engagement-preferences"); return accountJson(await engagementPreferences(actor.uid)); } catch (e) { return accountFailure(e); } }
export async function POST(request: NextRequest) { try { const actor = await accountActor(request, "engagement-preferences"); return accountJson(await saveEngagementPreferences(actor.uid, await accountBody(request, 4096))); } catch (e) { return accountFailure(e); } }
