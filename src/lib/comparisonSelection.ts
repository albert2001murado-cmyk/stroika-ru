import { collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { auth, db } from "./firebase";
import { getApiUrl } from "./getApiUrl";
import { isPublicationApproved, isReviewApproved } from "./moderation";
import { publicationExpiryMillis } from "./publication-lifetime";
import { comparisonListing, comparisonListingIds, comparisonOwnerId, nextComparisonIds, validComparisonId, type ComparisonListing } from "./listingComparison";

export function watchComparisonSelection(uid: string, next: (ids: string[]) => void, error: (error: unknown) => void) {
  return onSnapshot(doc(db, "comparisonSelections", uid), snapshot => next(comparisonListingIds(snapshot.data())), error);
}

/** A transaction keeps three slots consistent across devices and concurrent taps. */
export async function changeComparisonSelection(uid: string, action: "add" | "remove" | "clear", id = "") {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error("Войдите в аккаунт, чтобы сохранить сравнение");
  const ref = doc(db, "comparisonSelections", uid);
  return runTransaction(db, async transaction => {
    const previous = await transaction.get(ref);
    const ids = nextComparisonIds(comparisonListingIds(previous.data()), action, id);
    if (action === "add") {
      const publication = await transaction.get(doc(db, "listings", id));
      if (!publication.exists() || !isPublicationApproved(publication.data())) throw new Error("Это объявление сейчас недоступно для сравнения");
    }
    if (auth.currentUser?.uid !== uid) throw new Error("Аккаунт изменился. Откройте сравнение заново");
    // Replace the document: no legacy userIds or private profile snapshots remain.
    transaction.set(ref, { schemaVersion: 2, listingIds: ids, updatedAt: serverTimestamp() });
    return ids;
  });
}

async function publicAuthor(uid: string) {
  if (!uid) return null;
  const response = await fetch(getApiUrl(`/api/public-profile?uid=${encodeURIComponent(uid)}`), { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;
  return (await response.json()).profile || null;
}

export type ComparisonEntry = { id: string; listing: ComparisonListing | null; error: string; expiresAt?: number };

/** Fetch only explicitly selected publications and their public author details. */
export async function loadComparisonEntries(ids: string[]): Promise<ComparisonEntry[]> {
  const authorRequests = new Map<string, ReturnType<typeof publicAuthor>>();
  return Promise.all(ids.filter(validComparisonId).slice(0, 3).map(async id => {
    try {
      const snapshot = await getDoc(doc(db, "listings", id));
      if (!snapshot.exists() || !isPublicationApproved(snapshot.data())) return { id, listing: null, error: "Анкета больше не опубликована" };
      const data = snapshot.data();
      const owner = comparisonOwnerId(data);
      if (!authorRequests.has(owner)) authorRequests.set(owner, publicAuthor(owner).catch(() => null));
      const [author, reviews] = await Promise.all([
        authorRequests.get(owner)!,
        getDocs(query(collection(db, "reviews"), where("listingId", "==", id))).then(result => result.docs.map(item => item.data()).filter(isReviewApproved)).catch(() => null),
      ]);
      const listing = comparisonListing(id, data, author, reviews || []);
      if (!reviews) listing.rating = "Не удалось загрузить";
      return { id, listing, error: "", expiresAt: publicationExpiryMillis(data) };
    } catch {
      return { id, listing: null, error: "Не удалось загрузить анкету. Повторите попытку" };
    }
  }));
}
