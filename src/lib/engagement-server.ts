import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { getAdminDb } from "./firebase-admin";
import { AccountApiError } from "./account-api-server";
import { DEFAULT_ENGAGEMENT, DISCOVERY_PROMPTS, ENGAGEMENT_INTERVAL_MS, inEngagementQuietHours, type EngagementPreferences } from "./engagement";
import { appNotificationSettingsRef, activeAppPushTokens, saveAppNotificationPreferences } from "./app-notifications-server";
import { billingHash, publicationBillingPath } from "./billing-server";
import { publicationDateMillis, publicationExpiryMillis } from "./publication-lifetime";
import { eligiblePublication } from "./nearby-match-policy";
import { catalogTextKey } from "../data/catalogUpdates";
import { deliverServerNotification, type ServerNotificationInput } from "./server-notifications";

const MAX_TOPIC_AGE = 7 * 86_400_000;
export const engagementRef = (uid: string) => getAdminDb().doc(`engagementProfiles/${uid}`);
function mobileConsent(data: DocumentData) { return data.source === "mobile" && data.consentVersion === 2 && data.enabled === true; }
function prefs(data: DocumentData = {}): EngagementPreferences {
  return { ...DEFAULT_ENGAGEMENT, enabled: mobileConsent(data), expiryReminders: mobileConsent(data),
    topics: Array.isArray(data.topics) ? data.topics.filter(t => t && typeof t.key === "string" && typeof t.label === "string" && typeof t.city === "string" && t.viewedAt > Date.now() - MAX_TOPIC_AGE).slice(0, 6).map(t => ({ key: t.key, label: t.label, city: t.city, viewedAt: t.viewedAt })) : [],
  };
}
export async function engagementPreferences(uid: string) { return prefs((await engagementRef(uid).get()).data()); }
/** Old clients cannot recreate a website recommendation subscription. */
export async function saveEngagementPreferences(uid: string, input: Record<string, unknown>) {
  if (input.action !== "mute-all") throw new AccountApiError("Управление уведомлениями доступно в настройках приложения", 410);
  await saveAppNotificationPreferences(uid, { source: "mobile", enabled: false });
  return engagementPreferences(uid);
}
export async function trackEngagementListing(uid: string, listingId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(listingId)) throw new AccountApiError("Объявление не найдено", 404);
  const db = getAdminDb(), ref = engagementRef(uid), now = Date.now();
  await db.runTransaction(async tx => {
    const [preferences, listing, settings] = await Promise.all([tx.get(ref), tx.get(db.doc(`listings/${listingId}`)), tx.get(appNotificationSettingsRef(uid))]);
    if (!mobileConsent(preferences.data() || {}) || settings.get("enabled") === false || !listing.exists || listing.get("authorId") === uid || !eligiblePublication(listing.data()!, "listing")) return;
    const path = publicationBillingPath(listing.data()!), key = billingHash(`${path.catalogSection}:${path.catalogCategoryId}:${path.subcategory}`), data = preferences.data()!;
    const topics = Array.isArray(data.topics) ? data.topics.filter((t: any) => t.key !== key && t.viewedAt > now - MAX_TOPIC_AGE).slice(0, 5) : [];
    topics.unshift({ key, label: path.subcategory, city: String(listing.get("city") || "").slice(0, 200), viewedAt: now });
    tx.update(ref, { topics, updatedAt: FieldValue.serverTimestamp() });
  });
  return { recorded: true };
}
export function authorizeEngagementJob(authorization: string) {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 32) throw new AccountApiError("Планировщик не настроен", 503);
  const actual = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new AccountApiError("Нет доступа", 401);
}
type Candidate = { kind: "listing" | "request"; topicKey?: string; expiry?: number } | { kind: "discovery"; index: number };
async function recommend(uid: string, data: DocumentData, now: number) {
  const preference = prefs(data);
  if (!preference.enabled || inEngagementQuietHours(preference, now) || Number(data.lastSentAt || 0) > now - ENGAGEMENT_INTERVAL_MS) return false;
  if (!(await activeAppPushTokens(uid)).length) return false;
  const db = getAdminDb(), ref = engagementRef(uid);
  const seen: string[] = Array.isArray(data.seen) ? data.seen.slice(-100) : [];
  const send = async (input: Omit<ServerNotificationInput, "recipientId">, item: string, candidate: Candidate) => {
    const result = await deliverServerNotification({ ...input, recipientId: uid, durableDedupe: true, pushOnly: true }, async tx => {
      const [current, profile, settings] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`)), tx.get(appNotificationSettingsRef(uid))]);
      const latest = current.data() || {};
      if (!profile.exists || profile.get("moderationStatus") === "blocked" || settings.get("enabled") === false || !mobileConsent(latest) || inEngagementQuietHours(prefs(latest), now) || Number(latest.lastSentAt || 0) > now - ENGAGEMENT_INTERVAL_MS || (Array.isArray(latest.seen) && latest.seen.includes(item))) return false;
      if (candidate.kind !== "discovery") {
        const publication = await tx.get(db.doc(`${candidate.kind === "listing" ? "listings" : "customerRequests"}/${input.entityId}`));
        if (!publication.exists || !eligiblePublication(publication.data()!, candidate.kind)) return false;
        if (candidate.topicKey) {
          const topic = prefs(latest).topics.find(t => t.key === candidate.topicKey);
          if (!topic || publication.get("authorId") === uid || publication.get("engagementTopicKey") !== topic.key || catalogTextKey(publication.get("city")) !== catalogTextKey(topic.city) || publicationDateMillis(publication.get("createdAt")) <= topic.viewedAt) return false;
        } else if (candidate.expiry !== publicationExpiryMillis(publication.data()) || publication.get(candidate.kind === "listing" ? "authorId" : "customerId") !== uid) return false;
      }
      tx.update(ref, { lastSentAt: now, lastRecommendationKind: candidate.kind === "discovery" ? "discovery" : candidate.topicKey ? "new" : "expiry",
        ...(candidate.kind === "discovery" ? { discoveryCursor: candidate.index + 1 } : {}),
        seen: [...(Array.isArray(latest.seen) ? latest.seen.slice(-99) : []), item], updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
    return Boolean(result.ok && !("duplicate" in result) && !("blocked" in result));
  };
  // A useful account reminder takes priority over a general invitation.
  const [listings, requests] = await Promise.all([db.collection("listings").where("authorId", "==", uid).get(), db.collection("customerRequests").where("customerId", "==", uid).get()]);
  for (const [snapshot, kind] of [[listings, "listing"], [requests, "request"]] as const) for (const publication of snapshot.docs) {
    const expiry = publicationExpiryMillis(publication.data()), item = `expiry:${kind}:${publication.id}:${expiry}`;
    if (!expiry || expiry <= now || expiry > now + 3 * 86_400_000 || seen.includes(item) || !eligiblePublication(publication.data(), kind)) continue;
    if (await send({ title: "Срок объявления скоро закончится", body: `${String(publication.get("title") || "Ваше объявление").slice(0, 130)} · до ${new Date(expiry).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}`, url: "/(tabs)/profile", type: "engagement_expiry", actorId: "system", entityId: publication.id, dedupeKey: `engagement:v2:${item}` }, item, { kind, expiry })) return true;
  }
  // Alternate real new offers with discovery prompts instead of repeating one kind all day.
  if (data.lastRecommendationKind !== "new") for (const topic of preference.topics) {
    const candidates = await db.collection("listings").where("engagementTopicKey", "==", topic.key).where("createdAt", ">", Timestamp.fromMillis(topic.viewedAt)).orderBy("createdAt", "desc").limit(20).get();
    for (const listing of candidates.docs) {
      const item = `new:${listing.id}:${publicationDateMillis(listing.get("createdAt"))}`;
      if (seen.includes(item) || listing.get("authorId") === uid || !eligiblePublication(listing.data(), "listing") || catalogTextKey(listing.get("city")) !== catalogTextKey(topic.city)) continue;
      if (await send({ title: `Новое в разделе «${topic.label}»`, body: `${String(listing.get("title") || "Новое предложение").slice(0, 140)} · ${topic.city}`, url: `/listing/${listing.id}`, type: "engagement_new", actorId: listing.get("authorId") || "system", entityId: listing.id, dedupeKey: `engagement:v2:${item}` }, item, { kind: "listing", topicKey: topic.key })) return true;
    }
  }
  const day = Math.floor((now + 3 * 60 * 60_000) / 86_400_000), start = Number.isSafeInteger(data.discoveryCursor) ? data.discoveryCursor : 0;
  for (let offset = 0; offset < DISCOVERY_PROMPTS.length; offset++) {
    const index = (start + offset) % DISCOVERY_PROMPTS.length, prompt = DISCOVERY_PROMPTS[index], item = `discovery:${prompt.id}:${day}`;
    if (!seen.includes(item) && await send({ title: prompt.title, body: prompt.body, url: prompt.url, type: "engagement_discovery", actorId: "system", entityId: prompt.id, dedupeKey: `engagement:v2:${item}` }, item, { kind: "discovery", index })) return true;
  }
  return false;
}
/** Persisted cursor + a lease keep overlapping cron invocations from producing duplicate pushes. */
export async function runEngagementJob(batchSize = 60) {
  const db = getAdminDb(), leaseRef = db.doc("jobLeases/engagement"), token = randomUUID(), now = Date.now();
  const lease = await db.runTransaction(async tx => { const saved = await tx.get(leaseRef); if (Number(saved.get("until") || 0) > now) return null; const cursor = String(saved.get("cursor") || ""); tx.set(leaseRef, { token, cursor, until: now + 5 * 60_000 }); return { cursor }; });
  if (!lease) return { running: true, sent: 0, processed: 0, hasMore: false };
  let sent = 0, processed = 0, cursor = lease.cursor;
  try {
    let query = db.collection("engagementProfiles").orderBy("__name__").limit(Math.min(100, Math.max(1, batchSize)));
    if (cursor) query = query.startAfter(cursor);
    const profiles = await query.get();
    for (const profile of profiles.docs) {
      if (Date.now() - now > 220_000) break;
      if (await recommend(profile.id, profile.data(), Date.now())) sent++;
      cursor = profile.id; processed++;
    }
    const hasMore = processed < profiles.size || profiles.size === Math.min(100, Math.max(1, batchSize));
    await leaseRef.set({ token, until: 0, cursor: hasMore ? cursor : "", lastRunAt: FieldValue.serverTimestamp() });
    return { sent, processed, hasMore };
  } catch (error) { await leaseRef.set({ token, until: 0, cursor, lastErrorAt: FieldValue.serverTimestamp() }, { merge: true }); throw error; }
}
