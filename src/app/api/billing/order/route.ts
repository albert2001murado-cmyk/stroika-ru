import { NextRequest } from "next/server";
import { accountActor, accountBody, accountFailure, accountJson, AccountApiError } from "@/lib/account-api-server";
import { abandonBillingOrder } from "@/lib/billing-server";
import { refreshYookassaPayment } from "@/lib/yookassa-server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const actor = await accountActor(request, "billing-order"), body = await accountBody(request, 2048); const id = String(body.id || ""); if (!/^[a-f0-9]{64}$/.test(id)) throw new AccountApiError("Платёж не найден", 404); if (body.action === "abandon") { await abandonBillingOrder(actor.uid, id); return accountJson({ status: "abandoned" }); } return accountJson(await refreshYookassaPayment(id, actor.uid)); }
  catch (error) { return accountFailure(error); }
}
