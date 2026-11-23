import { FieldValue, Timestamp, type DocumentData } from "@/lib/database/admin-values";
import { getAdminDb } from "./firebase-admin";
import { AccountApiError } from "./account-api-server";
import { publicationVerificationFields } from "./accountVerification";
import { normalizeRussianPhone } from "./phone";
import { isPublicationExpired as isExpired, oneCalendarMonthAfter } from "./publication-lifetime";
import { FREE_LIMIT } from "./free-placement";
import { freePlacementRef, assertFreeCatalog, recordFreePlacement } from "./free-placement-server";
import { publicationHash, publicationCatalogPath, ownPublications, assertPublicationSlot } from "./publication-slot-server";

const text = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
function money(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e12) throw new AccountApiError("Проверьте цену или бюджет");
  return n;
}
function mediaUrl(value: unknown) {
  const url = text(value, 2001);
  if (url.length > 2000 || /[\u0000-\u0020\\]/u.test(url)) throw new AccountApiError("Некорректная ссылка на файл");
  if (url.startsWith("/uploads/") && !url.includes("..")) return url;
  try { if (new URL(url).protocol === "https:") return url; } catch {}
  throw new AccountApiError("Некорректная ссылка на файл");
}
function payloadFor(kind: "listing" | "request", body: DocumentData, profile: DocumentData, uid: string) {
  const title = text(body.title, 161), description = text(body.description, 6001), city = text(body.city, 201);
  if (title.length < 5 || title.length > 160 || description.length < 20 || description.length > 6000 || city.length < 2 || city.length > 200) throw new AccountApiError("Название — 5–160 символов, описание — 20–6000; укажите город");
  const catalog = publicationCatalogPath(body);
  const phone = normalizeRussianPhone(profile.phone);
  if (!phone) throw new AccountApiError("Сохраните телефон в настройках профиля");
  const images = Array.isArray(body.imageUrls) ? body.imageUrls : [], videos = Array.isArray(body.videoUrls) ? body.videoUrls : [];
  if (images.length + videos.length > 20 || (Array.isArray(body.media) && body.media.length > 20)) throw new AccountApiError("Можно прикрепить до 20 фото и видео");
  const imageUrls = images.map(mediaUrl), videoUrls = videos.map(mediaUrl);
  const media = Array.isArray(body.media) ? body.media.map((m: DocumentData) => {
    if (!m || !["image", "video"].includes(m.type)) throw new AccountApiError("Проверьте тип файла");
    return { type: m.type, url: mediaUrl(m.url), name: text(m.name, 180), path: text(m.path || m.storagePath, 600) };
  }) : imageUrls.map(url => ({ type: "image", url }));
  const lat = body.location?.lat ?? body.lat, lng = body.location?.lng ?? body.lng;
  const hasLocation = typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (body.acceptsVat !== undefined && typeof body.acceptsVat !== "boolean") throw new AccountApiError("Проверьте отметку оплаты с НДС");
  const common = {
    acceptsVat: body.acceptsVat === true,
    title, description, city, address: text(body.address, 600), ...catalog,
    location: hasLocation ? { lat, lng, address: text(body.location?.address || body.geocodedAddress, 600) } : null,
    lat: hasLocation ? lat : null, lng: hasLocation ? lng : null,
    imageUrls, videoUrls, media, status: "active", moderationStatus: "pending", moderationStage: "queued",
    moderationReason: "", moderationSource: body.moderationSource === "mobile" ? "mobile" : "web",
    moderationSubmittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    ...publicationVerificationFields(profile),
    searchText: [title, description, catalog.category, catalog.subcategory, city].join(" ").slice(0, 10000),
    engagementTopicKey: publicationHash(`${catalog.catalogSection}:${catalog.catalogCategoryId}:${catalog.subcategory}`),
  };
  const name = text(profile.displayName || profile.name || profile.companyName, 180) || "Пользователь", avatar = text(profile.avatarUrl || profile.photoURL, 2000);
  if (kind === "request") {
    const from = money(body.budgetFrom), to = money(body.budgetTo);
    if (from !== null && to !== null && from > to) throw new AccountApiError("Бюджет «от» не может превышать бюджет «до»");
    return { ...common, customerId: uid, customerName: name, customerAvatar: avatar, customerPhone: phone, accountType: profile.accountType || "individual", latitude: hasLocation ? lat : null, longitude: hasLocation ? lng : null, budget: from, budgetFrom: from, budgetTo: to, deadline: text(body.deadline, 200), urgency: body.urgency === "urgent" ? "urgent" : "normal", contactPreference: ["both", "messages", "calls"].includes(body.contactPreference) ? body.contactPreference : "both", offersCount: 0, responsesCount: 0, viewsCount: 0 };
  }
  const features = Object.fromEntries(Object.entries(body.offerFeatures || {}).slice(0, 30).filter(([key, value]) => /^[a-zA-Z0-9_-]{1,80}$/.test(key) && typeof value === "boolean"));
  const strings = (value: unknown, max: number) => Array.isArray(value) ? value.slice(0, max).filter(v => typeof v === "string" && v.length <= 100) : [];
  return {
    ...common, authorId: uid, authorName: name, authorAvatarUrl: avatar, accountType: profile.accountType || "individual", phone,
    priceFrom: money(body.priceFrom), minimumWorkAmount: money(body.minimumWorkAmount), minimumWorkUnit: text(body.minimumWorkUnit, 80),
    searchGroup: catalog.catalogSection === "materials" ? "materials" : catalog.catalogSection === "equipment" ? "equipment" : "services",
    capabilities: strings(body.capabilities, 30), offerAction: text(body.offerAction, 80), offerActions: strings(body.offerActions, 15),
    offerActionLabel: text(body.offerActionLabel, 400), offerFeatures: features, searchTags: strings(body.searchTags, 50), searchVersion: 1,
    viewsCount: 0, favoritesCount: 0,
  };
}

export async function editAccountPublication(uid: string, input: Record<string, any>) {
  if (!["listing", "request"].includes(input.kind) || !/^[A-Za-z0-9_-]{1,128}$/.test(input.id || "") || !input.publication || typeof input.publication !== "object") throw new AccountApiError("Проверьте объявление");
  const db = getAdminDb(), kind = input.kind as "listing" | "request", ref = db.doc(`${kind === "listing" ? "listings" : "customerRequests"}/${input.id}`);
  await db.runTransaction(async tx => {
    const [previous, profile] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`))]);
    if (!previous.exists || previous.get(kind === "listing" ? "authorId" : "customerId") !== uid) throw new AccountApiError("Объявление не найдено", 404);
    if (!profile.exists || profile.get("moderationStatus") === "blocked" || previous.get("moderationStatus") === "blocked") throw new AccountApiError("Изменение объявления недоступно", 403);
    const source = previous.data()!, canonical = publicationCatalogPath(source);
    const payload = payloadFor(kind, { ...source, ...input.publication, ...canonical }, profile.data()!, uid);
    const owned = await ownPublications(tx, uid);
    if (!isExpired(source)) assertPublicationSlot(owned, payload, kind, kind === "listing" && ["rejected", "payment_required"].includes(String(source.moderationStatus || "")) ? FREE_LIMIT : Number.MAX_SAFE_INTEGER, input.id);
    // Owner may edit content, but cannot restart the placement or move it to another catalog.
    const counters = kind === "listing" ? ["viewsCount", "favoritesCount"] : ["viewsCount", "offersCount", "responsesCount"];
    for (const key of counters) delete (payload as DocumentData)[key];
    tx.update(ref, { ...payload, ...(kind === "listing" ? { paymentMethods: FieldValue.delete(), paymentSchemaVersion: FieldValue.delete(), bankDetails: FieldValue.delete(), bankDetailsConfirmed: FieldValue.delete(), bankDetailsConfirmedAt: FieldValue.delete() } : {}), status: kind === "request" && source.moderationStatus === "payment_required" && !isExpired(source) ? "active" : source.status || "active" });
  });
  return { id: input.id, kind };
}
export async function createPublication(uid: string, input: Record<string, unknown>) {
  if (input.kind !== "listing" && input.kind !== "request") throw new AccountApiError("Укажите тип объявления");
  const kind = input.kind, requestId = String(input.requestId || "");
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId) || !input.publication || typeof input.publication !== "object" || Array.isArray(input.publication)) throw new AccountApiError("Обновите форму публикации");
  const db = getAdminDb(), id = publicationHash(`${uid}:${kind}:${requestId}`).slice(0, 40), ref = db.doc(`${kind === "listing" ? "listings" : "customerRequests"}/${id}`), accountRef = freePlacementRef(uid);
  await db.runTransaction(async tx => {
    const [existing, profile, saved] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`)), kind === "listing" ? tx.get(accountRef) : Promise.resolve(null)]);
    if (existing.exists) return; // A lost response never consumes another slot.
    if (!profile.exists || profile.get("moderationStatus") === "blocked") throw new AccountApiError("Аккаунту недоступна публикация", 403);
    const payload = payloadFor(kind, input.publication as DocumentData, profile.data()!, uid), now = Date.now();
    if (kind === "listing") assertFreeCatalog(saved?.data(), payload.catalogSection, true);
    const owned = await ownPublications(tx, uid);
    assertPublicationSlot(owned, payload, kind, kind === "listing" ? FREE_LIMIT : Number.MAX_SAFE_INTEGER, "", now);
    tx.create(ref, { ...payload, createdAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(oneCalendarMonthAfter(now)), renewalCount: 0 });
    if (kind === "listing") recordFreePlacement(tx, uid, payload.catalogSection, true);
  });
  return { id, kind };
}
