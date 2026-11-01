import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";
import { AccountApiError } from "./account-api-server";
import { createBillingOrder, settleBillingOrder, revokeBillingOrder, yookassaConfigured } from "./billing-server";
import { CATALOG_TITLES, getBillingPlan } from "./billing";
import { externalTokenForCheckout } from "./apple-external-server";

type Payment = { id: string; status: string; paid?: boolean; test?: boolean; amount: { value: string; currency: string }; recipient?: { account_id?: string }; metadata?: Record<string, string>; captured_at?: string; created_at?: string; confirmation?: { confirmation_url?: string } };
export async function yookassaRequest(path: string, method = "GET", body?: unknown, key?: string) {
  if (!yookassaConfigured()) throw new AccountApiError("Оплата пока не подключена. Повторите позже", 503);
  const response = await fetch(`https://api.yookassa.ru/v3/${path}`, {
    method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(18_000),
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`).toString("base64")}`, "Content-Type": "application/json", ...(key ? { "Idempotence-Key": key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new AccountApiError("Не удалось подтвердить оплату. Проверьте её статус перед повторной попыткой", 503, `payment-provider-${response.status}`);
  return response.json();
}
function validatePayment(payment: Payment, orderId: string, order: Record<string, any>) {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(payment.id) || payment.metadata?.orderId !== orderId || payment.metadata?.uid !== order.uid || payment.recipient?.account_id !== process.env.YOOKASSA_SHOP_ID || payment.amount?.currency !== "RUB" || payment.amount.value !== (order.priceKopeks / 100).toFixed(2) || payment.test !== (process.env.YOOKASSA_TEST_MODE === "true"))
    throw new AccountApiError("Не удалось сопоставить платёж с заказом", 409);
}
export async function startYookassaPayment(uid: string, input: Record<string, unknown>) {
  if (!yookassaConfigured()) throw new AccountApiError("Оплата пока не подключена", 503);
  if (process.env.YOOKASSA_TEST_MODE === "true" && !(process.env.YOOKASSA_TEST_UIDS || "").split(",").map(s => s.trim()).includes(uid)) throw new AccountApiError("Тестовая оплата доступна только тестовым аккаунтам", 403);
  const order = await createBillingOrder(uid, input, "yookassa"), ref = getAdminDb().doc(`billingOrders/${order.id}`);
  const token = await externalTokenForCheckout(uid);
  if (input.externalTokenId && token?.id !== input.externalTokenId) throw new AccountApiError("Повторно откройте страницу оплаты из приложения", 409);
  if (token && !order.externalPurchaseId && !["succeeded", "refunded", "refund_due"].includes(order.status)) await ref.update({ externalTokenId: token.id, externalPurchaseId: token.externalPurchaseId, externalSandbox: token.sandbox, externalVatBps: Number(process.env.APPLE_EXTERNAL_VAT_BPS), externalReporting: true });
  if (order.remoteId) return refreshYookassaPayment(order.id, uid);
  if (!["created", "pending"].includes(order.status)) return { id: order.id, status: order.status };
  // Provider idempotency expires after 24 hours. Unknown old attempts require reconciliation.
  if (Date.now() - order.createdAt > 23 * 60 * 60_000) throw new AccountApiError("Проверьте старый платёж через поддержку перед новой оплатой", 409);
  const description = `Строва · ${CATALOG_TITLES[order.catalog as keyof typeof CATALOG_TITLES]} · ${getBillingPlan(order.catalog, order.tier)!.title}${order.action === "upgrade" ? " · повышение тарифа" : " · 30 дней"}`;
  const amount = { value: (order.priceKopeks / 100).toFixed(2), currency: "RUB" };
  const payload = {
    amount, capture: true, save_payment_method: false, description,
    confirmation: { type: "redirect", return_url: `https://strovaru.ru/plans?order=${order.id}` },
    metadata: { uid, orderId: order.id },
    receipt: { customer: { email: order.receiptEmail }, ...(process.env.YOOKASSA_TAX_SYSTEM_CODE ? { tax_system_code: Number(process.env.YOOKASSA_TAX_SYSTEM_CODE) } : {}),
      items: [{ description, quantity: "1.00", amount, vat_code: Number(process.env.YOOKASSA_VAT_CODE), payment_mode: process.env.YOOKASSA_PAYMENT_MODE, payment_subject: process.env.YOOKASSA_PAYMENT_SUBJECT }] },
  };
  // Persist the exact PSP body so retries never change an idempotent request.
  const requestBody = await getAdminDb().runTransaction(async tx => {
    const saved = await tx.get(ref);
    if (saved.get("providerRequest")) return saved.get("providerRequest");
    tx.update(ref, { providerRequest: payload, providerAttemptAt: Date.now() });
    return payload;
  });
  const payment = await yookassaRequest("payments", "POST", requestBody, `strova-${order.id}`) as Payment;
  validatePayment(payment, order.id, order);
  const url = payment.confirmation?.confirmation_url || "";
  if (url && !/^https:\/\/(?:[a-zA-Z0-9-]+\.)*(?:yookassa\.ru|yoomoney\.ru)\//.test(url)) throw new AccountApiError("Не удалось открыть страницу оплаты", 503);
  await ref.update({ remoteId: payment.id, confirmationUrl: url, status: payment.status === "pending" ? "pending" : order.status, updatedAt: Date.now() });
  return refreshYookassaPayment(order.id, uid);
}
export async function refreshYookassaPayment(orderId: string, uid?: string) {
  const ref = getAdminDb().doc(`billingOrders/${orderId}`), saved = await ref.get(), order = saved.data();
  if (!order || order.provider !== "yookassa" || (uid && order.uid !== uid)) throw new AccountApiError("Платёж не найден", 404);
  if (!order.remoteId) return { id: orderId, status: order.status, confirmationUrl: "" };
  const payment = await yookassaRequest(`payments/${encodeURIComponent(order.remoteId)}`) as Payment;
  validatePayment(payment, orderId, order);
  if (payment.id !== order.remoteId) throw new AccountApiError("Платёж не соответствует заказу", 409);
  let status = order.status;
  if (payment.status === "succeeded" && payment.paid === true) {
    const result = await settleBillingOrder(orderId, { provider: "yookassa", id: payment.id, status: "succeeded", paidAt: Date.parse(payment.captured_at || ""), priceKopeks: order.priceKopeks });
    status = result.status;
    if (status === "refund_due") {
      if (order.refundAttemptAt && !order.refundId && Date.now() - order.refundAttemptAt > 23 * 60 * 60_000) {
        await ref.update({ status: "requires_review", reviewReason: "refund-result-unknown", updatedAt: Date.now() });
        return { id: orderId, status: "requires_review", confirmationUrl: "" };
      }
      if (!order.refundAttemptAt) await ref.update({ refundAttemptAt: Date.now() });
      const refund = order.refundId ? await yookassaRequest(`refunds/${order.refundId}`) : await yookassaRequest("refunds", "POST", { payment_id: payment.id, amount: payment.amount, description: "Тариф изменился до подтверждения оплаты", ...(order.providerRequest?.receipt ? { receipt: order.providerRequest.receipt } : {}) }, `strova-refund-${orderId}`);
      if (refund.payment_id !== payment.id || refund.amount?.value !== payment.amount.value || refund.amount?.currency !== "RUB") throw new AccountApiError("Возврат требует проверки поддержки", 409);
      await ref.update({ refundId: refund.id, refundRequestedAt: Date.now() });
      if (refund.status === "succeeded") { await revokeBillingOrder(orderId, payment.id); status = "refunded"; }
    }
  } else if (payment.status === "canceled") status = (await settleBillingOrder(orderId, { provider: "yookassa", id: payment.id, status: "canceled", paidAt: 0 })).status;
  return { id: orderId, status, confirmationUrl: order.confirmationUrl || "" };
}

/** Recover a lost PSP response with the identical request, only inside its idempotency window. */
export async function reconcileYookassaPayments() {
  if (!yookassaConfigured()) return { enabled: false, checked: 0, hasMore: false };
  const db = getAdminDb(), started = Date.now(), ref = db.doc("jobLeases/billingReconcile");
  const lease = await db.runTransaction(async tx => { const previous = await tx.get(ref); if (Number(previous.get("until") || 0) > started) return null; const cursor = String(previous.get("cursor") || ""); tx.set(ref, { cursor, until: started + 300_000 }); return { cursor }; });
  if (!lease) return { enabled: true, running: true, checked: 0, hasMore: false };
  let checked = 0, processed = 0, cursor = lease.cursor;
  try {
    let query = db.collection("billingOrders").where("provider", "==", "yookassa").where("status", "in", ["created", "pending", "refund_due", "abandoned"]).orderBy(FieldPath.documentId()).limit(60);
    if (cursor) query = query.startAfter(cursor);
    const orders = await query.get();
    for (const saved of orders.docs) {
      if (Date.now() - started > 215_000) break;
      const order = saved.data(); cursor = saved.id; processed++;
      if (!order.remoteId && order.providerRequest && Date.now() - order.createdAt < 23 * 60 * 60_000) {
        const payment = await yookassaRequest("payments", "POST", order.providerRequest, `strova-${saved.id}`) as Payment;
        validatePayment(payment, saved.id, order);
        const url = payment.confirmation?.confirmation_url || "";
        if (url && !/^https:\/\/(?:[a-zA-Z0-9-]+\.)*(?:yookassa\.ru|yoomoney\.ru)\//.test(url)) throw new AccountApiError("Не удалось подтвердить страницу оплаты", 503);
        await saved.ref.update({ remoteId: payment.id, confirmationUrl: url, updatedAt: Date.now() });
      } else if (!order.remoteId && Date.now() - order.createdAt >= 23 * 60 * 60_000 && order.providerRequest) {
        await saved.ref.update({ status: "requires_review", reviewReason: "payment-result-unknown", updatedAt: Date.now() });
        continue;
      } else if (!order.remoteId) continue;
      await refreshYookassaPayment(saved.id); checked++;
    }
    const hasMore = processed < orders.size || orders.size === 60;
    await ref.set({ until: 0, cursor: hasMore ? cursor : "", lastRunAt: FieldValue.serverTimestamp() });
    return { enabled: true, checked, hasMore };
  } catch (error) { await ref.set({ until: 0, cursor, lastErrorAt: FieldValue.serverTimestamp() }); throw error; }
}

export async function yookassaWebhook(input: Record<string, unknown>) {
  if (input.type !== "notification" || !input.object || typeof input.object !== "object") throw new AccountApiError("Некорректное уведомление");
  const object = input.object as Record<string, any>;
  if (input.event === "refund.succeeded") {
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(String(object.id || ""))) throw new AccountApiError("Некорректный платёж");
    const refund = await yookassaRequest(`refunds/${object.id}`);
    if (refund.status !== "succeeded") return;
    const orders = await getAdminDb().collection("billingOrders").where("remoteId", "==", refund.payment_id).limit(1).get();
    if (orders.empty) return;
    const order = orders.docs[0];
    await refreshYookassaPayment(order.id); // Check merchant ownership independently.
    const refundedKopeks = Math.round(Number(refund.amount?.value) * 100);
    if (!Number.isSafeInteger(refundedKopeks) || refundedKopeks <= 0 || refundedKopeks > order.get("priceKopeks") || refund.amount?.currency !== "RUB") throw new AccountApiError("Возврат требует проверки поддержки", 409);
    const refundedTotal = await getAdminDb().runTransaction(async tx => {
      const current = await tx.get(order.ref), refunds = Array.isArray(current.get("externalRefunds")) ? current.get("externalRefunds") : [];
      const previousTotal = refunds.reduce((sum: number, item: { amountKopeks: number }) => sum + item.amountKopeks, 0);
      if (refunds.some((r: { id: string }) => r.id === refund.id)) return previousTotal;
      if (previousTotal + refundedKopeks > current.get("priceKopeks")) throw new AccountApiError("Сумма возвратов требует проверки", 409);
      tx.update(order.ref, { externalRefunds: [...refunds, { id: refund.id, amountKopeks: refundedKopeks, createdAt: Date.parse(refund.created_at || "") || Date.now() }], ...(current.get("externalPurchaseId") ? { externalReporting: true } : {}), updatedAt: Date.now() });
      return previousTotal + refundedKopeks;
    });
    if (refundedTotal < order.get("priceKopeks")) {
      await order.ref.update({ partialRefundReview: true, updatedAt: Date.now() });
      return;
    }
    await revokeBillingOrder(order.id, refund.payment_id);
    return;
  }
  if (!["payment.succeeded", "payment.canceled", "payment.waiting_for_capture"].includes(String(input.event))) return;
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(String(object.id || ""))) throw new AccountApiError("Некорректный платёж");
  // Never trust notification amounts, metadata or payment status.
  const payment = await yookassaRequest(`payments/${object.id}`) as Payment;
  const orderId = payment.metadata?.orderId || "";
  if (!/^[a-f0-9]{64}$/.test(orderId)) return;
  const ref = getAdminDb().doc(`billingOrders/${orderId}`), saved = await ref.get();
  if (!saved.exists) return;
  validatePayment(payment, orderId, saved.data()!);
  if (!saved.get("remoteId")) await ref.update({ remoteId: payment.id });
  await refreshYookassaPayment(orderId);
}
