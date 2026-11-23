import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "@/lib/database/admin-values";
import { databaseBackend, getPostgresDb } from "./database/postgres";
import { assertAccountSession } from "./account-security-session";

let adminApp: App | null = null;

function getPrivateKey(): string {
  const value = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!value) throw new Error("Не задан FIREBASE_ADMIN_PRIVATE_KEY.");
  return value.replace(/\\n/g, "\n");
}

export function getFirebaseAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

  if (!projectId || !clientEmail) {
    throw new Error(
      "Не настроены FIREBASE_ADMIN_PROJECT_ID и FIREBASE_ADMIN_CLIENT_EMAIL."
    );
  }

  adminApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey: getPrivateKey() }),
    projectId,
  });

  return adminApp;
}

/** Raw verification must be followed by assertAccountSession before private data access. */
export function getRawAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

let guardedAuth: ReturnType<typeof getAuth> | null = null;
export function getAdminAuth() {
  if (!guardedAuth) {
    const raw = getRawAdminAuth();
    guardedAuth = new Proxy(raw, {
      get(target, property) {
        if (property === "verifyIdToken") return async (token: string, checkRevoked = true) => {
          const decoded = await target.verifyIdToken(token, checkRevoked);
          await assertAccountSession(getAdminDb(), decoded);
          return decoded;
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  return guardedAuth;
}

export function getAdminDb() {
  return databaseBackend() === "postgres" ? getPostgresDb() : getFirestore(getFirebaseAdminApp());
}
