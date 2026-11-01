import { NextRequest } from "next/server";
import { accountActor, accountBody, accountFailure, accountJson, AccountApiError } from "@/lib/account-api-server";
import { createBillingOrder, appleConfigured } from "@/lib/billing-server";
import { startYookassaPayment } from "@/lib/yookassa-server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const actor = await accountActor(request, "billing-checkout"), body = await accountBody(request, 4096);
    if (body.provider === "yookassa") return accountJson(await startYookassaPayment(actor.uid, body));
    if (body.provider !== "apple" || !appleConfigured()) throw new AccountApiError("Этот способ оплаты пока не подключён", 503);
    if (process.env.APPLE_IAP_ENVIRONMENT === "Sandbox" && !(process.env.APPLE_IAP_SANDBOX_UIDS || "").split(",").map(s => s.trim()).includes(actor.uid)) throw new AccountApiError("Тестовые покупки доступны только тестовым аккаунтам", 403);
    const order = await createBillingOrder(actor.uid, body, "apple");
    return accountJson({ id: order.id, productId: order.productId, appAccountToken: order.appAccountToken, status: order.status, createdAt: order.createdAt });
  } catch (error) { return accountFailure(error); }
}
