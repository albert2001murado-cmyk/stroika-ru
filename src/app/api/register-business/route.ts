import { ContactError, checkPhoneAvailable, contactPhone, preparePhoneChange } from "@/lib/unique-phone-server";
import { contactResponseData, contactApiError } from "@/lib/contact-api-server";
import { normalizeRussianPhone } from "@/lib/phone";
import { readJsonObject, RequestBodyError } from "@/lib/request-body";
import { limitRequests, activeProfileGuard } from "@/lib/api-guard";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { lookupCompanyByInn } from "@/lib/company-registry-server";
import type { AccountType } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  accountType?: AccountType;
  inn?: string;
  representativeName?: string;
  city?: string;
  phone?: string;
};

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function POST(request: Request) {
  let hasProfile: boolean | undefined;
  let committed = false;
  try {
    const token = bearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Не передан токен пользователя." }, { status: 401 });
    }

    const body = (await readJsonObject(request)) as Body;
    if (body.accountType !== "ip" && body.accountType !== "ooo") {
      return NextResponse.json({ error: "Выберите ИП или ООО." }, { status: 400 });
    }

    const representativeName = body.representativeName?.trim();
    if (!representativeName) {
      return NextResponse.json({ error: "Укажите имя представителя." }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    const decoded = await adminAuth.verifyIdToken(token, true);
    const inactive = await activeProfileGuard(decoded.uid, true);
    if (inactive) return inactive;
    const throttled = limitRequests("register-business:" + decoded.uid, 6);
    if (throttled) return throttled;
    const authUser = await adminAuth.getUser(decoded.uid);
    const existingProfile = await adminDb.collection("users").doc(decoded.uid).get();
    hasProfile = Boolean(existingProfile.get("accountType") || existingProfile.get("createdAt"));
    const phone = contactPhone(body.phone);
    await checkPhoneAvailable(adminDb, adminAuth, phone, decoded.uid);
    const company = await lookupCompanyByInn(body.inn || "", body.accountType).catch(error => {
      const message = error instanceof Error ? error.message : "Не получилось проверить ИНН.";
      const temporary = /недоступ|вовремя|DADATA_API_KEY/.test(message);
      throw new ContactError("registration/business", message, temporary ? 503 : 400);
    });
    const displayName = company.shortName || company.officialName;

    const userRef = adminDb.collection("users").doc(decoded.uid);
    const claimRef = adminDb.collection("companyInnClaims").doc(company.inn);
    const verificationRef = adminDb.collection("verificationRequests").doc(decoded.uid);

    await adminDb.runTransaction(async (transaction) => {
      const [claimSnapshot, userSnapshot] = await Promise.all([
        transaction.get(claimRef),
        transaction.get(userRef),
      ]);

      if (
        claimSnapshot.exists &&
        claimSnapshot.get("ownerUid") !== decoded.uid
      ) {
        throw new Error("INN_ALREADY_CLAIMED");
      }

      const phoneChange = await preparePhoneChange(adminDb, adminAuth, transaction, authUser, phone);
      // Retrying after a lost response must not reset an already verified company.
      if (userSnapshot.get("companyInn") === company.inn && userSnapshot.get("accountType") === body.accountType
        && normalizeRussianPhone(userSnapshot.get("phone")) === phone) {
        phoneChange.apply();
        transaction.set(userRef, { phone }, { merge: true });
        return;
      }

      const now = FieldValue.serverTimestamp();
      phoneChange.apply();

      transaction.set(
        claimRef,
        {
          inn: company.inn,
          ownerUid: decoded.uid,
          accountType: body.accountType,
          officialName: company.officialName,
          shortName: company.shortName,
          ogrn: company.ogrn,
          status: "pending",
          updatedAt: now,
          ...(claimSnapshot.exists ? {} : { createdAt: now }),
        },
        { merge: true }
      );

      transaction.set(
        userRef,
        {
          uid: decoded.uid,
          email: authUser.email || decoded.email || null,
          displayName,
          representativeName,
          accountType: body.accountType,
          companyName: displayName,
          companyOfficialName: company.officialName,
          companyShortName: company.shortName,
          companyInn: company.inn,
          companyKpp: company.kpp || "",
          companyOgrn: company.ogrn,
          companyLegalAddress: company.legalAddress || "",
          companyRegistryType: company.registryType,
          companyRegistryStatus: company.registryStatus,
          companyManagementName: company.managementName || "",
          companyManagementPost: company.managementPost || "",
          companyLookupProvider: "dadata",
          companyRegistryCheckedAt: now,
          city: body.city?.trim() || "",
          phone,
          avatarUrl: "",
          avatarPath: "",
          verified: false,
          isVerified: false,
          verificationStatus: "pending",
          verifiedAt: null,
          verifiedBy: "",
          updatedAt: now,
          ...(userSnapshot.exists ? {} : { createdAt: now }),
        },
        { merge: true }
      );

      transaction.set(
        verificationRef,
        {
          userId: decoded.uid,
          email: authUser.email || decoded.email || null,
          accountType: body.accountType,
          representativeName,
          companyName: displayName,
          companyOfficialName: company.officialName,
          inn: company.inn,
          kpp: company.kpp || "",
          ogrn: company.ogrn,
          legalAddress: company.legalAddress || "",
          registryType: company.registryType,
          registryStatus: company.registryStatus,
          status: "pending",
          source: "web-registration",
          updatedAt: now,
          createdAt: now,
        },
        { merge: true }
      );
    });

    committed = true;
    await adminAuth.updateUser(decoded.uid, { displayName }).catch(() => undefined);
    const saved = await userRef.get();
    return NextResponse.json({ profile: contactResponseData(saved.data()) });
  } catch (error) {
    if (error instanceof ContactError) return contactApiError(error, !committed && hasProfile === false);
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Business registration error:", error);
    const message = error instanceof Error ? error.message : "Ошибка регистрации ИП или ООО.";

    if (message === "INN_ALREADY_CLAIMED") {
      return NextResponse.json(
        { error: "Этот ИНН уже привязан к другому аккаунту.", code: "registration/inn-already-in-use", notCommitted: !committed && hasProfile === false },
        { status: 409 }
      );
    }

    // A failed/uncertain transaction response must never authorize deleting Auth.
    return contactApiError(error, false);
  }
}
