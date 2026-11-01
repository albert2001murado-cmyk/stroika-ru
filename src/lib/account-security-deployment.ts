import { getFirebaseAdminApp } from "./firebase-admin";
import { assertSecurityConfigured } from "./account-security-crypto";
import { SecurityError } from "./account-security-session";
import { AUTH_PROTOCOL, AUTH_RELEASE } from "./account-security-protocol";

export function assertAuthDeployment(clientProject?: string | null) {
  const projectId = getFirebaseAdminApp().options.projectId;
  const publicProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId || !process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
      (publicProject && publicProject !== projectId) ||
      (clientProject && clientProject !== projectId)) {
    throw new SecurityError("Настройки входа на сайте и сервере не совпадают. Обратитесь в поддержку", "security/project-mismatch", 503);
  }
  if (process.env.NODE_ENV === "production" &&
      (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST)) {
    throw new SecurityError("Сервис входа ещё не настроен для сайта. Обратитесь в поддержку", "security/not-configured", 503);
  }
  return projectId;
}

export function authDeploymentHealth() {
  const projectId = assertAuthDeployment();
  assertSecurityConfigured();
  return { protocol: AUTH_PROTOCOL, release: AUTH_RELEASE, projectId, ready: true };
}
