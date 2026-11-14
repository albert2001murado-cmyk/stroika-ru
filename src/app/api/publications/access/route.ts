import { NextRequest } from "next/server";
import { accountActor, accountBody, accountFailure, accountJson, AccountApiError } from "@/lib/account-api-server";
import { activateFreeCatalog, getFreePlacement } from "@/lib/free-placement-server";
import { isFreeCatalog } from "@/lib/free-placement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await accountActor(request, "publication-access");
    return accountJson(await getFreePlacement(actor.uid));
  } catch (error) { return accountFailure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await accountActor(request, "publication-activate");
    const body = await accountBody(request, 2048);
    if (!isFreeCatalog(body.catalog)) throw new AccountApiError("Выберите каталог");
    return accountJson(await activateFreeCatalog(actor.uid, body.catalog));
  } catch (error) { return accountFailure(error); }
}
