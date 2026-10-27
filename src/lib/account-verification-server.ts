import {
  FieldPath,
  FieldValue,
  type DocumentData,
} from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";
import { isDocumentId } from "./security-policy";
import { normalizeRussianPhone } from "./phone";
import {
  isAccountVerified,
  verificationFormError,
  type VerificationForm,
  type VerificationRequest,
} from "./accountVerification";

export class VerificationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
const text = (value: unknown, max = 3000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const millis = (value: any) =>
  typeof value?.toMillis === "function" ? value.toMillis() : 0;
export function verificationView(
  id: string,
  data: DocumentData,
  profile: DocumentData = {},
): VerificationRequest {
  return {
    id,
    userId: text(data.userId, 128),
    email: text(data.email || profile.email, 254),
    name: text(
      data.name ||
        data.representativeName ||
        data.companyName ||
        profile.displayName,
      120,
    ),
    phone: text(data.phone || profile.phone, 40),
    city: text(data.city || profile.city, 120),
    role:
      data.role === "customer" || data.role === "both"
        ? data.role
        : "contractor",
    category: text(data.category, 160),
    experience: text(data.experience, 80),
    message: text(data.message),
    status:
      data.status === "approved" || data.status === "rejected"
        ? data.status
        : "pending",
    accountType: text(
      data.accountType ||
        data.profileSnapshot?.accountType ||
        profile.accountType,
      30,
    ),
    companyName: text(data.companyName || profile.companyName, 300),
    inn: text(data.inn || profile.companyInn, 20),
    ogrn: text(data.ogrn || profile.companyOgrn, 20),
    legalAddress: text(data.legalAddress || profile.companyLegalAddress, 1000),
    moderatorComment: text(data.moderatorComment, 1000),
    createdAt: millis(data.createdAt),
    reviewedAt: millis(data.reviewedAt),
    profileSnapshot: {
      avatarUrl: text(
        data.profileSnapshot?.avatarUrl ||
          profile.avatarUrl ||
          profile.photoURL,
        2000,
      ),
      displayName: text(
        data.profileSnapshot?.displayName || profile.displayName,
        120,
      ),
      accountType: text(data.accountType || profile.accountType, 30),
    },
  };
}
export async function ownVerification(uid: string) {
  const db = getAdminDb(),
    profileDoc = await db.doc(`users/${uid}`).get(),
    profile = profileDoc.data() || {};
  let last;
  if (isDocumentId(text(profile.verificationRequestId, 128)))
    last = await db
      .doc(`verificationRequests/${profile.verificationRequestId}`)
      .get();
  if (!last?.exists || last.get("userId") !== uid) {
    const previous = await db
      .collection("verificationRequests")
      .where("userId", "==", uid)
      .limit(100)
      .get();
    last = previous.docs.sort(
      (a, b) => millis(b.get("createdAt")) - millis(a.get("createdAt")),
    )[0];
  }
  return {
    verified: isAccountVerified(profile),
    request: last?.exists
      ? verificationView(last.id, last.data() || {}, profile)
      : null,
  };
}
export async function submitVerification(
  uid: string,
  body: Record<string, unknown>,
) {
  const db = getAdminDb(),
    profileRef = db.doc(`users/${uid}`),
    requestRef = db.collection("verificationRequests").doc();
  await db.runTransaction(async (tx) => {
    const profileDoc = await tx.get(profileRef),
      profile = profileDoc.data() || {};
    if (!profileDoc.exists || profile.moderationStatus === "blocked")
      throw new VerificationError("Аккаунту недоступно это действие.", 403);
    if (isAccountVerified(profile)) return;
    const pending = await tx.get(
      db
        .collection("verificationRequests")
        .where("userId", "==", uid)
        .where("status", "==", "pending")
        .limit(1),
    );
    if (!pending.empty) {
      tx.update(profileRef, {
        verificationRequestId: pending.docs[0].id,
        verificationStatus: "pending",
      });
      return;
    }
    const form: VerificationForm = {
      name: text(body.name, 121),
      phone: normalizeRussianPhone(profile.phone),
      city: text(body.city, 121),
      role: body.role as VerificationForm["role"],
      category: text(body.category, 160),
      experience: text(body.experience, 81),
      message: text(body.message, 3001),
    };
    const error = verificationFormError(form);
    if (error) throw new VerificationError(error);
    if (form.role === "customer") {
      form.category = "";
      form.experience = "";
    }
    const now = FieldValue.serverTimestamp();
    tx.create(requestRef, {
      ...form,
      userId: uid,
      email: text(profile.email, 254),
      accountType: profile.accountType || "individual",
      companyName: text(profile.companyName, 300),
      inn: text(profile.companyInn, 20),
      ogrn: text(profile.companyOgrn, 20),
      legalAddress: text(profile.companyLegalAddress, 1000),
      profileSnapshot: {
        displayName: text(profile.displayName, 120),
        avatarUrl: text(profile.avatarUrl || profile.photoURL, 2000),
        accountType: profile.accountType || "individual",
      },
      schemaVersion: 2,
      status: "pending",
      moderatorComment: "",
      createdAt: now,
      updatedAt: now,
    });
    tx.update(profileRef, {
      verificationRequestId: requestRef.id,
      verificationStatus: "pending",
      updatedAt: now,
    });
  });
  return ownVerification(uid);
}
export async function verificationQueue(status: string, after = "") {
  if (
    !["pending", "approved", "rejected"].includes(status) ||
    (after && !isDocumentId(after))
  )
    throw new VerificationError("Некорректный фильтр заявок.");
  const db = getAdminDb();
  let query = db
    .collection("verificationRequests")
    .where("status", "==", status)
    .orderBy(FieldPath.documentId())
    .limit(31);
  if (after) query = query.startAfter(after);
  const snapshot = await query.get(),
    page = snapshot.docs.slice(0, 30);
  const uids = [
    ...new Set(
      page.map((doc) => text(doc.get("userId"), 128)).filter(isDocumentId),
    ),
  ];
  const profiles = uids.length
    ? await db.getAll(...uids.map((uid) => db.doc(`users/${uid}`)))
    : [];
  const byId = new Map(
    profiles.map((profile) => [profile.id, profile.data() || {}]),
  );
  return {
    items: page.map((doc) =>
      verificationView(doc.id, doc.data(), byId.get(doc.get("userId"))),
    ),
    nextCursor: snapshot.size > 30 ? page.at(-1)!.id : "",
  };
}
async function syncVerifiedPublications(uid: string) {
  const db = getAdminDb();
  for (const [collection, fields] of [
    [
      "listings",
      ["authorId", "userId", "ownerId", "creatorId", "uid", "sellerId"],
    ],
    [
      "customerRequests",
      ["customerId", "userId", "ownerId", "authorId", "uid"],
    ],
  ] as const) {
    const seen = new Set<string>();
    for (const field of fields) {
      let after = "";
      for (;;) {
        let query = db
          .collection(collection)
          .where(field, "==", uid)
          .orderBy(FieldPath.documentId())
          .limit(200);
        if (after) query = query.startAfter(after);
        const snapshot = await query.get();
        if (snapshot.empty) break;
        const batch = db.batch();
        let writes = 0;
        for (const doc of snapshot.docs) {
          const data = doc.data(),
            owner =
              data[collection === "listings" ? "authorId" : "customerId"] ||
              data.userId ||
              data.ownerId ||
              data.creatorId ||
              data.uid ||
              data.sellerId;
          if (seen.has(doc.id) || owner !== uid) continue;
          seen.add(doc.id);
          writes++;
          batch.update(doc.ref, {
            verified: true,
            isVerified: true,
            authorVerified: true,
            customerVerified: true,
            userVerified: true,
            verificationStatus: "approved",
            verifiedAt: FieldValue.serverTimestamp(),
          });
        }
        if (writes) await batch.commit();
        if (snapshot.size < 200) break;
        after = snapshot.docs.at(-1)!.id;
      }
    }
  }
}
export async function reviewVerification(
  actorId: string,
  body: Record<string, unknown>,
) {
  const id = text(body.requestId, 129),
    status = body.status,
    comment = text(body.comment, 1001);
  if (!isDocumentId(id) || !["approved", "rejected"].includes(String(status)))
    throw new VerificationError("Некорректное решение.");
  if (comment.length > 1000 || (status === "rejected" && comment.length < 5))
    throw new VerificationError(
      "Укажите понятную причину отказа — от 5 до 1000 символов.",
    );
  const db = getAdminDb(),
    ref = db.doc(`verificationRequests/${id}`);
  const uid = await db.runTransaction(async (tx) => {
    const requestDoc = await tx.get(ref);
    if (!requestDoc.exists)
      throw new VerificationError("Заявка не найдена.", 404);
    const request = requestDoc.data()!,
      uid = text(request.userId, 128);
    if (!isDocumentId(uid))
      throw new VerificationError("В заявке не указан пользователь.");
    const profileRef = db.doc(`users/${uid}`),
      profileDoc = await tx.get(profileRef),
      profile = profileDoc.data() || {};
    if (!profileDoc.exists || profile.moderationStatus === "blocked")
      throw new VerificationError("Аккаунт удалён или заблокирован.", 409);
    if (profile.verificationRequestId && profile.verificationRequestId !== id)
      throw new VerificationError(
        "У аккаунта уже другая заявка. Обновите список.",
        409,
      );
    if (request.status !== "pending") {
      if (
        request.status === status &&
        (status !== "approved" ||
          (isAccountVerified(profile) &&
            profile.verificationStatus === "approved"))
      ) {
        // Repair decisions made by older builds, without resetting a read or deleted event.
        if (!request.notificationCreatedAt) {
          const notificationRef = db.doc(
            `users/${uid}/notifications/verification_${id}`,
          );
          const notification = await tx.get(notificationRef);
          const now = FieldValue.serverTimestamp();
          if (!notification.exists)
            tx.create(
              notificationRef,
              verificationNotification(
                uid,
                status,
                text(request.moderatorComment, 1000),
                now,
              ),
            );
          tx.update(ref, { notificationCreatedAt: now });
        }
        return uid;
      }
      throw new VerificationError(
        "Другой модератор уже рассмотрел эту заявку. Обновите список.",
        409,
      );
    }
    if (status === "rejected" && isAccountVerified(profile))
      throw new VerificationError(
        "Профиль уже проверен. Эта заявка устарела.",
        409,
      );
    const notificationRef = db.doc(
      `users/${uid}/notifications/verification_${id}`,
    );
    const notification = await tx.get(notificationRef);
    const now = FieldValue.serverTimestamp(),
      approved = status === "approved";
    tx.update(profileRef, {
      verified: approved,
      isVerified: approved,
      verificationStatus: status,
      verificationRequestId: id,
      verifiedAt: approved ? now : null,
      verifiedBy: approved ? actorId : "",
      updatedAt: now,
    });
    tx.update(ref, {
      status,
      moderatorComment: comment,
      reviewedBy: actorId,
      reviewedAt: now,
      updatedAt: now,
      notificationCreatedAt: now,
    });
    if (!notification.exists)
      tx.create(
        notificationRef,
        verificationNotification(uid, status, comment, now),
      );
    return uid;
  });
  if (status === "approved") {
    await syncVerifiedPublications(uid);
    await ref.update({ badgesSyncedAt: FieldValue.serverTimestamp() });
  }
  return { ok: true, status };
}

function verificationNotification(
  uid: string,
  status: unknown,
  comment: string,
  now: FieldValue,
) {
  const approved = status === "approved";
  return {
    userId: uid,
    recipientId: uid,
    actorId: "system",
    actorName: "Строва",
    type: "verification",
    title: approved ? "Аккаунт проверен" : "Нужно уточнить данные",
    body: approved
      ? "Проверка пройдена! Теперь можно размещать анкеты и заявки. В объявлениях появилась отметка «Проверен»."
      : comment,
    url: "/verification",
    actionLabel: "Открыть проверку",
    read: false,
    createdAt: now,
    updatedAt: now,
  };
}
