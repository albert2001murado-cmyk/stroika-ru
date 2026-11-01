import { createHash, createHmac, randomUUID } from "node:crypto";
import { FieldValue, type DocumentData, type Transaction } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "./firebase-admin";
import { AccountApiError } from "./account-api-server";
import { normalizeRussianPhone } from "./phone";
import { publicationExpiryMillis, isPublicationExpired } from "./publication-lifetime";
import { canonicalCatalogFields, catalogTextKey } from "../data/catalogUpdates";
import { getCatalogFormCategories, type CatalogSectionId } from "../data/catalogForm";
import {
  BILLING_CATALOGS, BILLING_PLANS, BILLING_PERIOD_MS, INTRO_LIMITS, getBillingPlan, billingQuote, isBillingCatalog,
  type BillingCatalog, type BillingQuote, type BillingState, type BillingSubscription, type BillingTier, type BillingOrderView,
} from "./billing";

export const billingHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const billingAccountRef = (uid: string) => getAdminDb().doc(`billingAccounts/${uid}`);
export const billingMillis = (v: any): number => typeof v?.toMillis === "function" ? v.toMillis() : Number(v || 0);
export function activeSubscription(data: DocumentData, catalog: BillingCatalog, now = Date.now()): BillingSubscription | undefined {
  const value = data.subscriptions?.[catalog] as BillingSubscription | undefined;
  return value && !value.revoked && value.endsAt > now ? value : undefined;
}
export async function requireBillingLaunch() {
  const snapshot = await getAdminDb().doc("billingConfiguration/main").get();
  if (!snapshot.exists || snapshot.get("enabled") !== true || billingMillis(snapshot.get("newAccountsFrom")) <= 0)
    throw new AccountApiError("Тарифы готовятся к запуску. Повторите немного позже", 503, "billing-not-configured");
  return { newAccountsFrom: billingMillis(snapshot.get("newAccountsFrom")) };
}

/** Eligibility is issued once, including across account deletion/re-registration. */
export async function ensureBillingAccount(uid: string) {
  const launch = await requireBillingLaunch(), db = getAdminDb(), ref = billingAccountRef(uid);
  if ((await ref.get()).exists) return;
  const user = await getAdminAuth().getUser(uid);
  const registeredAt = Date.parse(user.metadata.creationTime);
  await db.runTransaction(async tx => {
    const [saved, profile] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`))]);
    if (saved.exists) return;
    if (!profile.exists || profile.get("moderationStatus") === "blocked") throw new AccountApiError("Аккаунту недоступны тарифы", 403);
    const phone = normalizeRussianPhone(profile.get("phone")), email = (user.email || "").trim().toLowerCase();
    const identities = [phone && `phone:${phone}`, email && `email:${email}`].filter(Boolean) as string[];
    const identitySecret = process.env.BILLING_IDENTITY_SECRET || "";
    if (identitySecret.length < 32) throw new AccountApiError("Стартовые подарки пока не настроены", 503);
    const claims = identities.map(value => db.doc(`billingIntroIdentities/${createHmac("sha256", identitySecret).update(value).digest("hex")}`));
    const previous = claims.length ? await tx.getAll(...claims) : [];
    const eligible = Number.isFinite(registeredAt) && registeredAt >= launch.newAccountsFrom && identities.length > 0 && previous.every(d => !d.exists);
    tx.create(ref, { uid, introEligible: eligible, introClaimed: {}, freeRenewalUsed: false, subscriptions: {}, pendingOrders: {}, appAccountToken: randomUUID(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (eligible) for (const claim of claims) tx.create(claim, { firstUid: uid, issuedAt: FieldValue.serverTimestamp() });
  });
}

export function orderView(id: string, data: DocumentData): BillingOrderView {
  return { id, catalog: data.catalog, tier: data.tier, provider: data.provider, status: String(data.status || "created"), priceKopeks: Number(data.priceKopeks || 0), productId: String(data.productId || ""), confirmationUrl: String(data.confirmationUrl || ""), createdAt: billingMillis(data.createdAt) };
}
export function yookassaConfigured() {
  return Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY && /^\d{1,2}$/.test(process.env.YOOKASSA_VAT_CODE || "") && process.env.YOOKASSA_PAYMENT_MODE && process.env.YOOKASSA_PAYMENT_SUBJECT && ["true", "false"].includes(process.env.YOOKASSA_TEST_MODE || ""));
}
export function appleConfigured() {
  return Boolean(process.env.APPLE_IAP_ROOT_CERTIFICATES && process.env.APPLE_IAP_KEY_ID && process.env.APPLE_IAP_ISSUER_ID && process.env.APPLE_IAP_PRIVATE_KEY && process.env.APPLE_IAP_ENVIRONMENT && (process.env.APPLE_IAP_ENVIRONMENT === "Sandbox" || process.env.APPLE_IAP_APP_ID));
}
export async function billingState(uid: string): Promise<BillingState> {
  let enabled = true;
  try { await requireBillingLaunch(); } catch (e) { if (e instanceof AccountApiError && e.code === "billing-not-configured") enabled = false; else throw e; }
  if (!enabled) return { enabled: false, introEligible: false, freeRenewalAvailable: false, introClaimed: {}, subscriptions: {}, pending: [], yookassaReady: false, appleReady: false };
  await ensureBillingAccount(uid);
  const [account, orders] = await Promise.all([billingAccountRef(uid).get(), getAdminDb().collection("billingOrders").where("uid", "==", uid).get()]);
  const data = account.data()!;
  const yookassaReady = yookassaConfigured() && (process.env.YOOKASSA_TEST_MODE === "false" || (process.env.YOOKASSA_TEST_UIDS || "").split(",").map(s => s.trim()).includes(uid));
  const appleReady = appleConfigured() && (process.env.APPLE_IAP_ENVIRONMENT === "Production" || (process.env.APPLE_IAP_SANDBOX_UIDS || "").split(",").map(s => s.trim()).includes(uid));
  return {
    enabled: true, introEligible: data.introEligible === true, freeRenewalAvailable: data.introEligible === true && !data.freeRenewalUsed,
    introClaimed: data.introClaimed || {}, subscriptions: data.subscriptions || {},
    pending: orders.docs.filter(d => ["created", "pending", "refund_due", "requires_review"].includes(d.get("status")))
      .sort((a, b) => billingMillis(b.get("createdAt")) - billingMillis(a.get("createdAt"))).slice(0, 12).map(d => orderView(d.id, d.data())),
    yookassaReady, appleReady, appleExternalReady: yookassaReady && (await import("./apple-external-server")).appleExternalConfigured(),
  };
}
export async function activateIntro(uid: string, catalog: BillingCatalog) {
  await ensureBillingAccount(uid);
  const ref = billingAccountRef(uid), now = Date.now();
  await getAdminDb().runTransaction(async tx => {
    const saved = await tx.get(ref), data = saved.data()!;
    if (data.introClaimed?.[catalog]) return;
    if (!data.introEligible) throw new AccountApiError("Стартовый подарок доступен только при первой регистрации", 403);
    if (activeSubscription(data, catalog, now) || data.pendingOrders?.[catalog]) throw new AccountApiError("Сначала завершите действующий тариф или оплату", 409);
    tx.update(ref, { introClaimed: { ...data.introClaimed, [catalog]: true }, subscriptions: { ...data.subscriptions, [catalog]: { periodId: randomUUID(), tier: "intro", limit: INTRO_LIMITS[catalog], used: 0, startsAt: now, endsAt: now + BILLING_PERIOD_MS, orderId: "" } }, updatedAt: FieldValue.serverTimestamp() });
  });
  return billingState(uid);
}

export type OwnedPublication = { id: string; kind: "listing" | "request"; data: DocumentData };
/** Both publication types share the catalog allowance. No private profiles are enumerated. */
export async function ownPublications(tx: Transaction, uid: string): Promise<OwnedPublication[]> {
  const db = getAdminDb();
  const fields = ["title", "description", "city", "category", "subcategory", "catalogSection", "catalogCategoryId", "catalogGroupId", "createdAt", "expiresAt", "publishedAt", "publicationTermDays", "moderationStatus", "status", "deleted", "isDeleted", "hidden", "isHidden", "archived", "isActive"];
  const [listings, requests] = await Promise.all([
    tx.get(db.collection("listings").where("authorId", "==", uid).select(...fields)),
    tx.get(db.collection("customerRequests").where("customerId", "==", uid).select(...fields)),
  ]);
  return [...listings.docs.map(d => ({ id: d.id, kind: "listing" as const, data: d.data() })), ...requests.docs.map(d => ({ id: d.id, kind: "request" as const, data: d.data() }))];
}
export function publicationActive(data: DocumentData, now = Date.now()) {
  return !data.deleted && !data.isDeleted && !data.hidden && !data.isHidden && !data.archived && data.isActive !== false &&
    !["closed", "archived", "deleted", "canceled", "completed", "inactive"].includes(String(data.status || "")) &&
    !["rejected", "blocked", "deleted", "payment_required"].includes(String(data.moderationStatus || "")) &&
    !isPublicationExpired(data, now);
}
export function publicationBillingPath(input: DocumentData) {
  const canonical = canonicalCatalogFields(input);
  const subcategory = canonical.subcategory;
  const category = catalogTextKey(canonical.category);
  const matches = BILLING_CATALOGS.flatMap(catalog => getCatalogFormCategories(catalog as CatalogSectionId).flatMap(option =>
    option.subcategories.some(s => catalogTextKey(s) === catalogTextKey(subcategory)) &&
    (!category || catalogTextKey(option.category) === category || catalogTextKey(option.title) === category)
      ? [{ catalog, option }] : []));
  const selected = matches.find(m => m.catalog === canonical.catalogSection && (m.option.id === canonical.catalogCategoryId || m.option.groupId === canonical.catalogGroupId)) || matches[0];
  if (!selected || !subcategory) throw new AccountApiError("Выберите действующие каталог, категорию и подкатегорию", 400, "invalid-catalog");
  if (canonical.catalogSection && canonical.catalogSection !== selected.catalog) throw new AccountApiError("Каталог не соответствует выбранному направлению", 400, "invalid-catalog");
  return { catalogSection: selected.catalog, catalogCategoryId: selected.option.id, catalogCategoryTitle: selected.option.title, catalogGroupId: selected.option.groupId || null, catalogGroupTitle: selected.option.groupId ? selected.option.title : "", category: selected.option.category,
    subcategory: selected.option.subcategories.find(s => catalogTextKey(s) === catalogTextKey(subcategory))!,
    catalogPath: [({ materials: "Материалы", services: "Услуги", equipment: "Техника", solutions: "Комплексные решения" } as const)[selected.catalog], selected.option.title, subcategory] };
}
export function assertPublicationSlot(owned: OwnedPublication[], next: DocumentData, kind: "listing" | "request", limit: number, exceptId = "", now = Date.now()) {
  const catalog = publicationBillingPath(next).catalogSection;
  const active = owned.filter(item => !(item.id === exceptId && item.kind === kind) && publicationActive(item.data, now));
  const inCatalog = active.filter(item => {
    try { return publicationBillingPath(item.data).catalogSection === catalog; } catch { return item.data.catalogSection === catalog; }
  });
  if (inCatalog.length >= limit) throw new AccountApiError(`Достигнут лимит ${limit} активных объявлений в этом каталоге`, 402, "active-limit");
  for (const item of inCatalog) {
    const old = canonicalCatalogFields(item.data);
    if (catalog === "equipment" && catalogTextKey(old.subcategory) === catalogTextKey(next.subcategory)) throw new AccountApiError("В этой подкатегории техники уже есть активное объявление. Несколько машин одного типа укажите в одной анкете", 409, "equipment-duplicate");
    if (item.kind !== kind) continue;
    const identical = catalogTextKey(item.data.title) === catalogTextKey(next.title) && catalogTextKey(item.data.description) === catalogTextKey(next.description);
    if (identical && (catalog === "materials" || (catalogTextKey(old.subcategory) === catalogTextKey(next.subcategory) && catalogTextKey(item.data.city) === catalogTextKey(next.city))))
      throw new AccountApiError("Такое объявление уже активно. Одинаковые объявления размещать нельзя", 409, "duplicate-publication");
  }
}
export function consumePublicationAllowance(data: DocumentData, catalog: BillingCatalog, allowFreeRenewal: boolean, now = Date.now()) {
  if (allowFreeRenewal && data.introEligible === true && !data.freeRenewalUsed) return {
    account: { ...data, freeRenewalUsed: true, updatedAt: FieldValue.serverTimestamp() }, funding: "free-renewal", periodId: "", orderId: "", limit: Math.max(...BILLING_PLANS.filter(p => p.catalog === catalog).map(p => p.limit)),
  };
  const subscription = activeSubscription(data, catalog, now);
  if (!subscription || subscription.used >= subscription.limit) throw new AccountApiError("Для размещения выберите тариф или активируйте стартовый подарок", 402, "allowance-required");
  return { account: { ...data, subscriptions: { ...data.subscriptions, [catalog]: { ...subscription, used: subscription.used + 1 } }, updatedAt: FieldValue.serverTimestamp() }, funding: subscription.tier === "intro" ? "intro" : "paid", periodId: subscription.periodId, orderId: subscription.orderId, limit: subscription.limit };
}

export async function createBillingOrder(uid: string, input: Record<string, unknown>, provider: "yookassa" | "apple"): Promise<DocumentData & { id: string }> {
  await ensureBillingAccount(uid);
  if (!isBillingCatalog(input.catalog) || !getBillingPlan(input.catalog, input.tier)) throw new AccountApiError("Выберите тариф");
  if (input.acceptRules !== true) throw new AccountApiError("Подтвердите условия тарифа");
  const requestId = String(input.requestId || "");
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) throw new AccountApiError("Обновите страницу оплаты");
  const db = getAdminDb(), ref = db.doc(`billingOrders/${billingHash(`${uid}:${provider}:${requestId}`)}`), accountRef = billingAccountRef(uid), now = Date.now();
  await db.runTransaction(async tx => {
    const [account, previous, profile] = await Promise.all([tx.get(accountRef), tx.get(ref), tx.get(db.doc(`users/${uid}`))]);
    const data = account.data()!;
    if (!profile.exists || profile.get("moderationStatus") === "blocked") throw new AccountApiError("Аккаунту недоступна оплата", 403);
    if (previous.exists) {
      if (previous.get("catalog") !== input.catalog || previous.get("tier") !== input.tier) throw new AccountApiError("Этот запрос уже относится к другой оплате", 409);
      return;
    }
    const catalog = input.catalog as BillingCatalog, pendingId = data.pendingOrders?.[catalog];
    if (pendingId) throw new AccountApiError("В этом каталоге уже есть незавершённая оплата. Откройте её ниже", 409, "pending-payment");
    let quote: BillingQuote;
    try { quote = billingQuote(catalog, input.tier as BillingTier, data.subscriptions?.[catalog], now); }
    catch (e) { throw new AccountApiError((e as Error).message, 409, "tariff-changed"); }
    if (input.expectedPriceKopeks !== quote.priceKopeks) throw new AccountApiError("Цена или текущий тариф изменились. Проверьте условия ещё раз", 409, "price-changed");
    const receiptEmail = String(input.receiptEmail || profile.get("email") || "").trim().toLowerCase();
    if (provider === "yookassa" && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiptEmail) || receiptEmail.length > 254)) throw new AccountApiError("Укажите почту для чека");
    const owned = await ownPublications(tx, uid);
    const activeCount = owned.filter(p => publicationActive(p.data, now) && (() => { try { return publicationBillingPath(p.data).catalogSection === catalog; } catch { return p.data.catalogSection === catalog; } })()).length;
    if (activeCount > getBillingPlan(catalog, input.tier)!.limit) throw new AccountApiError("Активных объявлений больше лимита этого тарифа. Выберите тариф выше", 409);
    tx.create(ref, { ...quote, uid, provider, status: "created", receiptEmail, appAccountToken: data.appAccountToken, acceptRules: true, rulesVersion: 1, rulesAcceptedAt: now, remoteId: "", confirmationUrl: "", transactionId: "", createdAt: now, updatedAt: now, targetPeriodId: quote.action === "upgrade" ? quote.periodId : randomUUID() });
    tx.update(accountRef, { pendingOrders: { ...data.pendingOrders, [catalog]: ref.id }, updatedAt: FieldValue.serverTimestamp() });
  });
  return { id: ref.id, ...(await ref.get()).data()! };
}

/** Called only with independently verified provider data, never the browser return URL. */
export async function settleBillingOrder(orderId: string, remote: { provider: "yookassa" | "apple"; id: string; paidAt: number; status: "succeeded" | "canceled"; productId?: string; appAccountToken?: string; priceKopeks?: number }) {
  const db = getAdminDb(), ref = db.doc(`billingOrders/${orderId}`);
  return db.runTransaction(async tx => {
    const orderDoc = await tx.get(ref);
    if (!orderDoc.exists) throw new AccountApiError("Платёж не найден", 404);
    const order = orderDoc.data()!, accountRef = billingAccountRef(order.uid), accountDoc = await tx.get(accountRef), data = accountDoc.data()!;
    if (order.provider !== remote.provider || (order.remoteId && order.remoteId !== remote.id)) throw new AccountApiError("Платёж не соответствует заказу", 409);
    if (remote.provider === "apple" && (String(remote.appAccountToken || "").toLowerCase() !== String(data.appAccountToken).toLowerCase() || remote.productId !== order.productId)) throw new AccountApiError("Покупка относится к другому аккаунту или тарифу", 403);
    if (remote.priceKopeks !== undefined && remote.priceKopeks !== order.priceKopeks) throw new AccountApiError("Сумма платежа не соответствует заказу", 409);
    const ledgerRef = db.doc(`billingTransactions/${billingHash(`${remote.provider}:${remote.id}`)}`);
    const notice = db.doc(`users/${order.uid}/notifications/billing_${orderId}`);
    const [ledger, existingNotice] = await Promise.all([tx.get(ledgerRef), tx.get(notice)]);
    if (ledger.exists && (ledger.get("uid") !== order.uid || ledger.get("orderId") !== orderId)) throw new AccountApiError("Эта покупка уже использована", 409);
    if (["succeeded", "refunded", "refund_due", "requires_review"].includes(order.status)) return { status: order.status, uid: order.uid };
    const pending = { ...data.pendingOrders };
    if (pending[order.catalog] === orderId) delete pending[order.catalog];
    if (remote.status === "canceled") {
      tx.update(ref, { status: "canceled", remoteId: remote.id, updatedAt: Date.now() });
      tx.update(accountRef, { pendingOrders: pending, updatedAt: FieldValue.serverTimestamp() });
      return { status: "canceled", uid: order.uid };
    }
    const now = Date.now(), current = data.subscriptions?.[order.catalog] as BillingSubscription | undefined;
    const target = getBillingPlan(order.catalog, order.tier)!;
    const staleUpgrade = order.action === "upgrade" && (!current || current.periodId !== order.periodId || current.tier !== order.oldTier || current.revoked || remote.paidAt >= current.endsAt);
    const changedPurchase = order.action === "purchase" && current && current.tier !== "intro" && !current.revoked && current.endsAt > remote.paidAt && current.periodId !== order.targetPeriodId;
    if (!Number.isFinite(remote.paidAt) || remote.paidAt <= 0 || remote.paidAt > now + 60_000 || staleUpgrade || changedPurchase) {
      const status = remote.provider === "yookassa" ? "refund_due" : "requires_review";
      tx.update(ref, { status, remoteId: remote.id, paidAt: remote.paidAt, reviewReason: "tariff-changed-before-payment", updatedAt: now });
      if (!ledger.exists) tx.create(ledgerRef, { uid: order.uid, orderId, provider: remote.provider, transactionId: remote.id, createdAt: FieldValue.serverTimestamp() });
      tx.update(accountRef, { pendingOrders: pending, updatedAt: FieldValue.serverTimestamp() });
      return { status, uid: order.uid };
    }
    const next: BillingSubscription = order.action === "upgrade" ? { ...current!, tier: target.tier, limit: target.limit, orderId } : {
      periodId: order.targetPeriodId, tier: target.tier, limit: target.limit, used: 0, startsAt: remote.paidAt, endsAt: remote.paidAt + BILLING_PERIOD_MS, orderId,
    };
    if (!ledger.exists) tx.create(ledgerRef, { uid: order.uid, orderId, provider: remote.provider, transactionId: remote.id, periodId: next.periodId, createdAt: FieldValue.serverTimestamp() });
    tx.update(accountRef, { subscriptions: { ...data.subscriptions, [order.catalog]: next }, pendingOrders: pending, updatedAt: FieldValue.serverTimestamp() });
    tx.update(ref, { status: "succeeded", remoteId: remote.id, paidAt: remote.paidAt, periodId: next.periodId, previousSubscription: current || null, updatedAt: now });
    if (!existingNotice.exists) tx.create(notice, { userId: order.uid, recipientId: order.uid, actorId: "system", actorName: "Строва", type: "billing", title: "Тариф активирован", body: "Оплата подтверждена. Размещения доступны в разделе «Тарифы»", url: "/plans", read: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { status: "succeeded", uid: order.uid, notificationAlreadyExists: existingNotice.exists };
  });
}

/** A local cancellation unlocks checkout; it never asserts that a PSP has canceled a payment. */
export async function abandonBillingOrder(uid: string, orderId: string) {
  const db = getAdminDb(), ref = db.doc(`billingOrders/${orderId}`);
  await db.runTransaction(async tx => {
    const order = await tx.get(ref);
    if (!order.exists || order.get("uid") !== uid) throw new AccountApiError("Платёж не найден", 404);
    if (!["created", "pending", "abandoned"].includes(order.get("status"))) return;
    const accountRef = billingAccountRef(uid), account = await tx.get(accountRef), pending = { ...account.get("pendingOrders") };
    if (pending[order.get("catalog")] === orderId) delete pending[order.get("catalog")];
    tx.update(ref, { status: "abandoned", updatedAt: Date.now() });
    tx.update(accountRef, { pendingOrders: pending, updatedAt: FieldValue.serverTimestamp() });
  });
}

/** Refunds revoke only the affected paid period / upgrade. Intro gifts are never reset. */
export async function revokeBillingOrder(orderId: string, remoteId: string) {
  const db = getAdminDb(), ref = db.doc(`billingOrders/${orderId}`);
  await db.runTransaction(async tx => {
    const orderDoc = await tx.get(ref);
    if (!orderDoc.exists || orderDoc.get("remoteId") !== remoteId) throw new AccountApiError("Покупка не найдена", 404);
    const order = orderDoc.data()!, accountRef = billingAccountRef(order.uid), account = await tx.get(accountRef), data = account.data()!;
    if (order.status === "refunded") return;
    const periodId = order.periodId || order.targetPeriodId;
    const usages = await tx.get(db.collection("billingUsages").where("uid", "==", order.uid));
    const affected = usages.docs.filter(d => order.action === "upgrade" ? d.get("orderId") === orderId : d.get("periodId") === periodId);
    // Bound transaction writes; the catalog ceiling is 25, so a normal period stays well below 400.
    if (affected.length > 350) throw new AccountApiError("Возврат требует проверки поддержки", 409);
    const refs = affected.map(d => db.doc(`${d.get("kind") === "request" ? "customerRequests" : "listings"}/${d.get("publicationId")}`));
    const publications = refs.length ? await tx.getAll(...refs) : [];
    const current = data.subscriptions?.[order.catalog] as BillingSubscription | undefined;
    let subscriptions = data.subscriptions || {};
    if (current && current.periodId === periodId) {
      if (order.action === "upgrade" && current.orderId === orderId && order.previousSubscription) {
        subscriptions = { ...subscriptions, [order.catalog]: { ...order.previousSubscription, used: current.used } };
      } else subscriptions = { ...subscriptions, [order.catalog]: { ...current, revoked: true } };
    }
    // A later renewal may have new funding: hide only the term funded by this purchase.
    for (let i = 0; i < publications.length; i++) {
      const p = publications[i], usage = affected[i];
      if (p.exists && Number(p.get("renewalCount") || 0) === Number(usage.get("renewalCount") || 0))
        tx.update(p.ref, { status: "inactive", moderationStatus: "payment_required", moderationReason: "Оплата размещения возвращена", updatedAt: FieldValue.serverTimestamp() });
    }
    const pending = { ...data.pendingOrders };
    if (pending[order.catalog] === orderId) delete pending[order.catalog];
    tx.update(accountRef, { subscriptions, pendingOrders: pending, updatedAt: FieldValue.serverTimestamp() });
    tx.update(ref, { status: "refunded", refundedAt: Date.now(), updatedAt: Date.now(), ...(order.externalPurchaseId ? { externalReporting: true } : {}) });
    tx.set(db.doc(`users/${order.uid}/notifications/billing_refund_${orderId}`), { userId: order.uid, recipientId: order.uid, actorId: "system", actorName: "Строва", type: "billing", title: "Оплата возвращена", body: "Размещения по возвращённой оплате приостановлены. Подробности — в разделе «Тарифы»", url: "/plans", read: false, createdAt: FieldValue.serverTimestamp() });
  });
}
