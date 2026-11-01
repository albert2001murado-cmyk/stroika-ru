import { NextRequest } from "next/server";
import { accountActor, accountBody, accountFailure, accountJson } from "@/lib/account-api-server";
import { editAccountPublication } from "@/lib/publication-create-server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const actor = await accountActor(request, "publication-edit"); return accountJson(await editAccountPublication(actor.uid, await accountBody(request, 131_072))); }
  catch (error) { return accountFailure(error); }
}
