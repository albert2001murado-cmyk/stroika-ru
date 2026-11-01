import { NextRequest } from "next/server";
import { accountActor, accountBody, accountFailure, accountJson } from "@/lib/account-api-server";
import { trackEngagementListing } from "@/lib/engagement-server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { try { const actor = await accountActor(request, "engagement-view"), body = await accountBody(request, 2048); if (body.source !== "mobile") return accountJson({ recorded: false }); return accountJson(await trackEngagementListing(actor.uid, String(body.listingId || ""))); } catch (e) { return accountFailure(e); } }
