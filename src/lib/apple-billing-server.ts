import { readFileSync } from "node:fs";
import { AppStoreServerAPIClient, Environment, SignedDataVerifier, type JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { getAdminDb } from "./firebase-admin";
import { AccountApiError } from "./account-api-server";
import { appleConfigured, billingAccountRef, billingHash, settleBillingOrder, revokeBillingOrder } from "./billing-server";
import { APPLE_BILLING_PRODUCTS } from "./billing";

export const APPLE_BUNDLE_ID = "stroika-ru.ru";
export function appleBillingTools() {
  if (!appleConfigured() || !["Sandbox", "Production"].includes(process.env.APPLE_IAP_ENVIRONMENT || "")) throw new AccountApiError("Покупки App Store пока не подключены", 503);
  const environment = process.env.APPLE_IAP_ENVIRONMENT === "Production" ? Environment.PRODUCTION : Environment.SANDBOX;
  const roots = process.env.APPLE_IAP_ROOT_CERTIFICATES!.split(",").map(p => readFileSync(p.trim()));
  const verifier = new SignedDataVerifier(roots, true, environment, APPLE_BUNDLE_ID, environment === Environment.PRODUCTION ? Number(process.env.APPLE_IAP_APP_ID) : undefined);
  const client = new AppStoreServerAPIClient(process.env.APPLE_IAP_PRIVATE_KEY!.replace(/\\n/g, "\n"), process.env.APPLE_IAP_KEY_ID!, process.env.APPLE_IAP_ISSUER_ID!, APPLE_BUNDLE_ID, environment);
  return { client, verifier };
}
function validateTransaction(transaction: JWSTransactionDecodedPayload) {
  if (transaction.bundleId !== APPLE_BUNDLE_ID || !transaction.transactionId || !transaction.productId || !transaction.purchaseDate || !APPLE_BILLING_PRODUCTS.some(p => p.productId === transaction.productId) || transaction.type !== "Non-Renewing Subscription") throw new AccountApiError("Покупка App Store не соответствует тарифу", 403);
}
export async function verifyApplePurchase(uid: string, transactionId: string) {
  if (!/^[0-9]{6,40}$/.test(transactionId)) throw new AccountApiError("Некорректный номер покупки");
  if (process.env.APPLE_IAP_ENVIRONMENT === "Sandbox" && !(process.env.APPLE_IAP_SANDBOX_UIDS || "").split(",").map(s => s.trim()).includes(uid)) throw new AccountApiError("Тестовые покупки доступны только тестовым аккаунтам", 403);
  const { client, verifier } = appleBillingTools();
  const result = await client.getTransactionInfo(transactionId);
  if (!result.signedTransactionInfo) throw new AccountApiError("Не удалось подтвердить покупку", 409);
  const transaction = await verifier.verifyAndDecodeTransaction(result.signedTransactionInfo);
  validateTransaction(transaction);
  if (transaction.transactionId !== transactionId) throw new AccountApiError("Номер покупки не совпадает", 409);
  const db = getAdminDb(), account = await billingAccountRef(uid).get();
  if (!account.exists || !transaction.appAccountToken || transaction.appAccountToken.toLowerCase() !== String(account.get("appAccountToken")).toLowerCase()) throw new AccountApiError("Эта покупка относится к другому аккаунту Стровы", 403);
  const ledger = await db.doc(`billingTransactions/${billingHash(`apple:${transactionId}`)}`).get();
  let orderId: string;
  if (ledger.exists) {
    if (ledger.get("uid") !== uid) throw new AccountApiError("Эта покупка уже использована", 409);
    orderId = ledger.get("orderId");
  } else {
    const candidates = await db.collection("billingOrders").where("uid", "==", uid).get();
    const matching = candidates.docs.filter(d => d.get("provider") === "apple" && d.get("productId") === transaction.productId && ["created", "pending", "abandoned"].includes(d.get("status")) && d.get("createdAt") <= transaction.purchaseDate! + 60_000 && d.get("createdAt") >= transaction.purchaseDate! - 24 * 60 * 60_000);
    matching.sort((a, b) => b.get("createdAt") - a.get("createdAt"));
    if (!matching[0]) throw new AccountApiError("Покупка найдена, но её заказ требует проверки поддержки. Не оплачивайте повторно", 409, "purchase-review");
    orderId = matching[0].id;
  }
  if (transaction.revocationDate) {
    if (!ledger.exists) await settleBillingOrder(orderId, { provider: "apple", id: transactionId, paidAt: transaction.purchaseDate!, status: "canceled", productId: transaction.productId!, appAccountToken: transaction.appAccountToken! });
    await revokeBillingOrder(orderId, transactionId); return { status: "refunded", id: orderId };
  }
  const settled = await settleBillingOrder(orderId, { provider: "apple", id: transactionId, paidAt: transaction.purchaseDate!, status: "succeeded", productId: transaction.productId!, appAccountToken: transaction.appAccountToken! });
  return { id: orderId, status: settled.status };
}
export async function appleBillingNotification(signedPayload: string) {
  if (signedPayload.length > 64_000) throw new AccountApiError("Слишком большой запрос", 413);
  const { verifier } = appleBillingTools(), notification = await verifier.verifyAndDecodeNotification(signedPayload);
  if (notification.notificationType === "EXTERNAL_PURCHASE_TOKEN") {
    // The external-report worker also receives authenticated Apple token reminders.
    const token = notification.externalPurchaseToken;
    if (token?.externalPurchaseId) await getAdminDb().doc(`appleExternalTokens/${billingHash(token.externalPurchaseId)}`).set({ externalPurchaseId: token.externalPurchaseId, unrecognized: true, reminderAt: Date.now() }, { merge: true });
    return;
  }
  if (!notification.data?.signedTransactionInfo) return;
  const transaction = await verifier.verifyAndDecodeTransaction(notification.data.signedTransactionInfo);
  validateTransaction(transaction);
  const ledger = await getAdminDb().doc(`billingTransactions/${billingHash(`apple:${transaction.transactionId}`)}`).get();
  if (transaction.revocationDate && ledger.exists) await revokeBillingOrder(ledger.get("orderId"), transaction.transactionId!);
  else if (!ledger.exists && transaction.appAccountToken) {
    // Complete a genuine charge even if the app closed before sending its receipt.
    const accounts = await getAdminDb().collection("billingAccounts").where("appAccountToken", "==", transaction.appAccountToken.toLowerCase()).limit(1).get();
    if (!accounts.empty) await verifyApplePurchase(accounts.docs[0].id, transaction.transactionId!);
  }
}
