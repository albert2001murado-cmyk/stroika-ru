import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";
import { deliverServerNotification } from "./server-notifications";
import { resolveNearbyPoint } from "./nearby-geocode-server";
import {
  distanceKm, matchingPair, eligiblePublication, publicationAddress,
  nearbyDeliveryKey, readableDistance, NEARBY_MATCH_RADIUS_KM,
  type MatchPublication,
} from "./nearby-match-policy";

const PAGE_SIZE = 30;
const cleanTitle = (value: unknown) => String(value || "Заявка заказчика").replace(/[\u0000-\u001f]/g, " ").slice(0, 90);

export async function notifyNearbyRequestMatches(
  kind: "listing" | "request", id: string, data: MatchPublication, cursor = ""
) {
  if (process.env.NEARBY_MATCH_NOTIFICATIONS_ENABLED === "false" ||
      !eligiblePublication(data, kind) || !publicationAddress(data)) {
    return { matched: 0, cursor: "", done: true };
  }
  const sourcePoint = await resolveNearbyPoint(data);
  if (!sourcePoint) return { matched: 0, cursor: "", done: true };
  const db = getAdminDb();
  const collection = kind === "request" ? "listings" : "customerRequests";
  // Document-ID pagination also includes old listings without normalized fields.
  // The cursor and durable delivery ledger make restarts and parallel PM2 workers safe.
  let query = db.collection(collection).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  let matched = 0;
  let last = cursor;
  const started = Date.now();
  for (let offset = 0; offset < snapshot.docs.length; offset += 5) {
    const chunk = snapshot.docs.slice(offset, offset + 5);
    const results = await Promise.all(chunk.map(async (candidate) => {
      const request = kind === "request" ? data : candidate.data();
      const listing = kind === "listing" ? data : candidate.data();
      if (!matchingPair(request, listing)) return 0;
      const recipientId = String(listing.authorId);
      const [recipient, customer] = await db.getAll(db.doc(`users/${recipientId}`), db.doc(`users/${request.customerId}`));
      if (!recipient.exists || !customer.exists || recipient.data()?.matchNotificationsEnabled === false ||
          recipient.data()?.moderationStatus === "blocked" || customer.data()?.moderationStatus === "blocked") return 0;
      const point = await resolveNearbyPoint(candidate.data());
      if (!point) return 0;
      const km = distanceKm(sourcePoint, point);
      // Compare unrounded distance. 10.01 km must not become an eligible 10 km.
      if (km > NEARBY_MATCH_RADIUS_KM) return 0;
      const requestId = kind === "request" ? id : candidate.id;
      const listingId = kind === "listing" ? id : candidate.id;
      const result = await deliverServerNotification({
        recipientId,
        actorId: String(request.customerId),
        actorName: String(request.customerName || "Заказчик"),
        title: request.urgency === "urgent" ? "Срочный заказ рядом" : "Новый заказ рядом",
        body: `«${cleanTitle(request.title)}» — ${readableDistance(km)} по прямой от адреса вашей анкеты. Предложите свои услуги.`,
        url: `/requests/${requestId}`,
        type: "nearby_request",
        entityId: requestId,
        dedupeKey: nearbyDeliveryKey(requestId, recipientId),
        durableDedupe: true,
        match: { requestId, listingId, distanceKm: Math.round(km * 100) / 100 },
      }, async (transaction) => {
        // A publication can be edited/closed while geocoding. Recheck in the
        // same transaction as notification creation, including both profiles.
        const [currentRequest, currentListing, currentRecipient, currentCustomer] = await Promise.all([
          transaction.get(db.doc(`customerRequests/${requestId}`)),
          transaction.get(db.doc(`listings/${listingId}`)),
          transaction.get(recipient.ref), transaction.get(customer.ref),
        ]);
        const r = currentRequest.data() || {};
        const l = currentListing.data() || {};
        return currentRequest.exists && currentListing.exists && matchingPair(r, l) &&
          r.customerId === request.customerId && l.authorId === recipientId &&
          publicationAddress(r) === publicationAddress(request) && publicationAddress(l) === publicationAddress(listing) &&
          currentRecipient.exists && currentCustomer.exists &&
          currentRecipient.data()?.matchNotificationsEnabled !== false &&
          currentRecipient.data()?.moderationStatus !== "blocked" && currentCustomer.data()?.moderationStatus !== "blocked";
      });
      return result.ok && "notificationId" in result && !("duplicate" in result) ? 1 : 0;
    }));
    matched += results.reduce<number>((sum, value) => sum + value, 0);
    last = chunk[chunk.length - 1].id;
    if (Date.now() - started > 12000 && offset + 5 < snapshot.docs.length) {
      return { matched, cursor: last, done: false };
    }
  }
  return { matched, cursor: last, done: snapshot.size < PAGE_SIZE };
}
