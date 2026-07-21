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
  try {
    const token = bearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Не передан токен пользователя." }, { status: 401 });
    }

    const body = (await request.json()) as Body;
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
    const authUser = await adminAuth.getUser(decoded.uid);
    const company = await lookupCompanyByInn(body.inn || "", body.accountType);
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

      const now = FieldValue.serverTimestamp();

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
          phone: body.phone?.trim() || "",
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

    await adminAuth.updateUser(decoded.uid, { displayName });

    return NextResponse.json({
      profile: {
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
        city: body.city?.trim() || "",
        phone: body.phone?.trim() || "",
        verified: false,
        isVerified: false,
        verificationStatus: "pending",
        avatarUrl: "",
        avatarPath: "",
      },
    });
  } catch (error) {
    console.error("Business registration error:", error);
    const message = error instanceof Error ? error.message : "Ошибка регистрации ИП или ООО.";

    if (message === "INN_ALREADY_CLAIMED") {
      return NextResponse.json(
        { error: "Этот ИНН уже привязан к другому аккаунту." },
        { status: 409 }
      );
    }

    const status = message.includes("FIREBASE_ADMIN") || message.includes("DADATA_API_KEY") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
