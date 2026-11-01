import { NextRequest } from "next/server";
import { accountActor, accountBody, accountFailure, accountJson, AccountApiError } from "@/lib/account-api-server";
import { activateIntro } from "@/lib/billing-server";
import { isBillingCatalog } from "@/lib/billing";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const actor = await accountActor(request, "billing-intro"), body = await accountBody(request, 2048); if (!isBillingCatalog(body.catalog) || body.acceptRules !== true) throw new AccountApiError("Выберите каталог и подтвердите условия"); return accountJson(await activateIntro(actor.uid, body.catalog)); }
  catch (error) { return accountFailure(error); }
}
