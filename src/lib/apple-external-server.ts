import { createPrivateKey, randomUUID, sign } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { DocumentReference } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";
import { AccountApiError } from "./account-api-server";
import { appleConfigured, billingAccountRef, billingHash, yookassaConfigured } from "./billing-server";
import { APPLE_BUNDLE_ID } from "./apple-billing-server";

function appleExternalReportingConfigured() {
  return appleConfigured() && yookassaConfigured() && /^\d{1,5}$/.test(process.env.APPLE_EXTERNAL_VAT_BPS || "") && Number(process.env.APPLE_EXTERNAL_VAT_BPS) <= 10_000 && process.env.APPLE_EXTERNAL_TAX_COUNTRY === "RUS" && /^\d{1,3}$/.test(process.env.APPLE_EXTERNAL_ATTRIBUTION_DAYS || "") && Number(process.env.APPLE_EXTERNAL_ATTRIBUTION_DAYS) > 0;
}
export function appleExternalConfigured() { return process.env.APPLE_EXTERNAL_PURCHASE_APPROVED === "true" && appleExternalReportingConfigured(); }
function appleAuthorization() {
  const now = Math.floor(Date.now() / 1000), encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const unsigned = `${encode({ alg: "ES256", kid: process.env.APPLE_IAP_KEY_ID, typ: "JWT" })}.${encode({ iss: process.env.APPLE_IAP_ISSUER_ID, iat: now, exp: now + 300, aud: "appstoreconnect-v1", bid: APPLE_BUNDLE_ID })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key: createPrivateKey(process.env.APPLE_IAP_PRIVATE_KEY!.replace(/\\n/g, "\n")), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${unsigned}.${signature}`;
}
async function appleReportRequest(sandbox: boolean, method: string, requestId?: string, payload?: unknown) {
  if (!appleExternalReportingConfigured()) throw new AccountApiError("Отчётность Apple пока не подключена", 503);
  const origin = sandbox ? "https://api.storekit-sandbox.apple.com" : "https://api.storekit.apple.com";
  return fetch(`${origin}/externalPurchase/v1/reports${requestId ? `/${requestId}` : ""}`, { method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(18_000), headers: { Authorization: `Bearer ${appleAuthorization()}`, "Content-Type": "application/json" }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
}
async function queueReport(key: string, externalPurchaseId: string, sandbox: boolean, lineItems?: Record<string, unknown>[], unknownToken = false) {
  const ref = getAdminDb().doc(`appleExternalReports/${billingHash(key)}`);
  await getAdminDb().runTransaction(async tx => {
    const previous = await tx.get(ref); if (previous.exists) return;
    tx.create(ref, { sandbox, status: "pending", payload: { requestIdentifier: randomUUID(), externalPurchaseId, status: lineItems ? "LINE_ITEM" : unknownToken ? "UNRECOGNIZED_TOKEN" : "NO_LINE_ITEM", ...(lineItems ? { lineItems } : {}) }, createdAt: Date.now(), attempts: 0 });
  });
  return ref;
}
export async function submitAppleExternalReport(id: string) {
  const ref = getAdminDb().doc(`appleExternalReports/${id}`), saved = await ref.get();
  if (!saved.exists || saved.get("status") === "reported") return true;
  const payload = saved.get("payload"), response = await appleReportRequest(saved.get("sandbox"), "PUT", undefined, payload);
  let accepted = response.ok;
  if (response.status === 400) {
    // A retry after a lost HTTP response can be a duplicate. Confirm the stored report independently.
    const existing = await appleReportRequest(saved.get("sandbox"), "GET", payload.requestIdentifier);
    if (existing.ok) { const body = await existing.json(); accepted = body.requestIdentifier === payload.requestIdentifier || body.externalPurchaseReport?.requestIdentifier === payload.requestIdentifier; }
  }
  if (accepted) await ref.update({ status: "reported", reportedAt: Date.now(), lastHttpStatus: response.status });
  else await ref.update({ attempts: FieldValue.increment(1), lastHttpStatus: response.status, lastAttemptAt: Date.now(), ...(response.status >= 400 && response.status < 500 && response.status !== 429 ? { status: "needs_review" } : {}) });
  return accepted;
}
/** Apple tokens are reporting identifiers, not proof of payment or permission to grant a tariff. */
export async function registerAppleExternalToken(uid: string, encoded: string) {
  if (!appleExternalConfigured()) throw new AccountApiError("Оплата по ссылке Apple пока недоступна", 503);
  if (encoded.length > 8192 || !/^[A-Za-z0-9_+/=-]+$/.test(encoded)) throw new AccountApiError("Некорректная ссылка оплаты");
  let token; try { token = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw new AccountApiError("Некорректная ссылка оплаты"); }
  const now = Date.now(), sandbox = String(token.externalPurchaseId || "").startsWith("SANDBOX");
  if (token.bundleId !== APPLE_BUNDLE_ID || Number(token.appAppleId) !== Number(process.env.APPLE_IAP_APP_ID) || !/^(?:SANDBOX[_-])?[a-fA-F0-9-]{36}$/.test(token.externalPurchaseId || "") || !Number.isFinite(token.tokenCreationDate) || token.tokenCreationDate > now + 60_000 || token.tokenCreationDate < now - 86_400_000 || token.tokenType || token.tokenExpirationDate) throw new AccountApiError("Ссылка устарела или относится к другому приложению. Откройте оплату из Стровы заново", 409);
  if (sandbox !== (process.env.YOOKASSA_TEST_MODE === "true")) throw new AccountApiError("Тестовая сборка использует только бесплатные тестовые платежи. Для реальной оплаты откройте сайт самостоятельно", 409, "testflight-checkout");
  const db = getAdminDb(), id = billingHash(token.externalPurchaseId), ref = db.doc(`appleExternalTokens/${id}`);
  await db.runTransaction(async tx => { const previous = await tx.get(ref); if (previous.get("uid") && previous.get("uid") !== uid) throw new AccountApiError("Ссылка уже открыта в другом аккаунте", 403); tx.set(ref, { uid, externalPurchaseId: token.externalPurchaseId, sandbox, tokenCreationDate: token.tokenCreationDate, receivedAt: now, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); });
  const report = await queueReport(`token:${id}`, token.externalPurchaseId, sandbox);
  if (!await submitAppleExternalReport(report.id)) throw new AccountApiError("Не удалось подтвердить ссылку оплаты у Apple. Повторите позже", 503);
  await db.runTransaction(async tx => { const account = await tx.get(billingAccountRef(uid)); if (!account.exists) throw new AccountApiError("Сначала откройте раздел тарифов", 409); tx.update(billingAccountRef(uid), { externalTokenId: id, externalTokenLinkedAt: now }); tx.update(ref, { validated: true }); });
  return { id };
}
export async function externalTokenForCheckout(uid: string) {
  if (!appleExternalReportingConfigured()) return null;
  const account = await billingAccountRef(uid).get(), id = account.get("externalTokenId");
  if (!id || Number(account.get("externalTokenLinkedAt")) < Date.now() - Number(process.env.APPLE_EXTERNAL_ATTRIBUTION_DAYS) * 86_400_000) return null;
  const token = await getAdminDb().doc(`appleExternalTokens/${id}`).get();
  if (!token.exists || token.get("uid") !== uid || !token.get("validated")) throw new AccountApiError("Повторно откройте оплату из приложения", 409);
  return { id, externalPurchaseId: token.get("externalPurchaseId"), sandbox: token.get("sandbox") === true };
}
function amounts(kopeks: number, bps: number) { const net = Math.round(kopeks * 10_000 / (10_000 + bps)); return { amountTaxInclusive: kopeks, amountTaxExclusive: net, taxAmount: kopeks - net, netAmountTaxExclusive: net, reportingCurrency: "RUB", pricingCurrency: "RUB", taxCountry: "RUS" }; }
async function finishOrderReports(ref: DocumentReference, observedStatus: string) {
  await getAdminDb().runTransaction(async tx => {
    const latest = await tx.get(ref), data = latest.data() || {};
    if (data.status !== observedStatus || data.status === "refund_due" || !data.appleExternalBuyReported) return;
    if (Array.isArray(data.externalRefunds) && data.externalRefunds.length) {
      if (!data.externalRefunds.every((r: { id: string }) => (data.appleReportedRefundIds || []).includes(r.id))) return;
    } else if (data.status === "refunded" && !data.appleExternalRefundReported) return;
    tx.update(ref, { externalReporting: false });
  });
}
/** Run every 5 minutes, with the same cron secret. Includes transactionless and Apple-reminded tokens. */
export async function runAppleExternalReports() {
  if (!appleExternalReportingConfigured()) return { enabled: false, submitted: 0 };
  const db = getAdminDb(), deadline = Date.now() + 210_000;
  const orders = await db.collection("billingOrders").where("externalReporting", "==", true).limit(100).get();
  for (const order of orders.docs) {
    if (Date.now() >= deadline) break;
    const data = order.data();
    if (!["succeeded", "refunded", "refund_due"].includes(data.status) || !data.remoteId) continue;
    const hash = billingHash(`line:${order.id}`), stableLineId = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
    const lineId = data.appleExternalLineId || stableLineId;
    if (!data.appleExternalLineId) await order.ref.update({ appleExternalLineId: lineId });
    const net = amounts(data.priceKopeks, data.externalVatBps);
    if (!data.appleExternalBuyReported) {
      const report = await queueReport(`buy:${order.id}`, data.externalPurchaseId, data.externalSandbox, [{ lineItemId: lineId, creationDate: data.paidAt || data.updatedAt, eventType: "BUY", productType: "ONE_TIME_BUY", productIdentifier: data.productId, ...net, quantity: 1 }]);
      if (!await submitAppleExternalReport(report.id)) continue;
      await order.ref.update({ appleExternalBuyReported: true });
    }
    if (Array.isArray(data.externalRefunds) && data.externalRefunds.length) {
      const done: string[] = Array.isArray(data.appleReportedRefundIds) ? data.appleReportedRefundIds : [];
      const refunds = [...data.externalRefunds].sort((a, b) => a.createdAt - b.createdAt);
      let total = 0, complete = true;
      for (const refund of refunds) {
        total += refund.amountKopeks;
        if (done.includes(refund.id)) continue;
        const report = await queueReport(`refund:${order.id}:${refund.id}`, data.externalPurchaseId, data.externalSandbox, [{ lineItemId: randomUUID(), creationDate: refund.createdAt, eventType: "REFUND", ...amounts(refund.amountKopeks, data.externalVatBps), netAmountTaxExclusive: Math.max(0, net.netAmountTaxExclusive - amounts(total, data.externalVatBps).netAmountTaxExclusive), referenceLineItemId: lineId }]);
        if (await submitAppleExternalReport(report.id)) { done.push(refund.id); await order.ref.update({ appleReportedRefundIds: done }); }
        else { complete = false; break; }
      }
      if (complete) await finishOrderReports(order.ref, data.status);
    } else if (data.status === "refunded") {
      const report = await queueReport(`refund:${order.id}`, data.externalPurchaseId, data.externalSandbox, [{ lineItemId: data.appleExternalRefundId || randomUUID(), creationDate: data.refundedAt, eventType: "REFUND", ...net, netAmountTaxExclusive: 0, referenceLineItemId: lineId }]);
      if (await submitAppleExternalReport(report.id)) { await order.ref.update({ appleExternalRefundReported: true }); await finishOrderReports(order.ref, data.status); }
    } else if (data.status === "succeeded") await finishOrderReports(order.ref, data.status);
  }
  const reminders = await db.collection("appleExternalTokens").where("unrecognized", "==", true).limit(50).get();
  for (const token of reminders.docs) {
    if (Date.now() >= deadline) break;
    const data = token.data();
    const ref = await queueReport(`reminder:${token.id}`, data.externalPurchaseId, String(data.externalPurchaseId).startsWith("SANDBOX"), undefined, !data.uid);
    if (await submitAppleExternalReport(ref.id)) await token.ref.update({ unrecognized: false });
  }
  const pending = await db.collection("appleExternalReports").where("status", "==", "pending").limit(50).get();
  let submitted = 0;
  for (const report of pending.docs) { if (Date.now() >= deadline) break; if (await submitAppleExternalReport(report.id)) submitted++; }
  return { enabled: true, submitted };
}
