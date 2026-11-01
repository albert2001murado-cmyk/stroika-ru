import { NextRequest } from "next/server";
import { accountActor, accountBody, accountFailure, accountJson } from "@/lib/account-api-server";
import { createPublication } from "@/lib/publication-create-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try { const actor = await accountActor(request, "publication-create"); return accountJson(await createPublication(actor.uid, await accountBody(request, 131072))); }
  catch (e) { return accountFailure(e); }
}
