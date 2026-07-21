import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

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

export function getAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getAdminDb() {
  return getFirestore(getFirebaseAdminApp());
}
