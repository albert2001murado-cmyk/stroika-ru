// Server-only utility. Never put Admin credentials in EXPO_PUBLIC_ or NEXT_PUBLIC_ variables.
import nextEnv from '@next/env';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() { console.error('Не удалось прочитать окружение сайта. Проверьте формат .env.local.'); } });
const [uid, role = 'check'] = process.argv.slice(2);
if (!uid || uid.length > 128 || /[\/\u0000-\u001f\u007f]/.test(uid) || !['check', 'moderator', 'admin', 'remove'].includes(role)) {
  console.error('Использование: node scripts/set-moderator-claim.mjs <Firebase UID> <check|moderator|admin|remove>');
  process.exit(1);
}

async function run() {
  const { FIREBASE_ADMIN_PROJECT_ID: projectId, FIREBASE_ADMIN_CLIENT_EMAIL: clientEmail, FIREBASE_ADMIN_PRIVATE_KEY: privateKey } = process.env;
  if (!projectId || !clientEmail || !privateKey) throw new Error('admin-not-configured');
  const publicProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (publicProject && publicProject !== projectId) throw new Error('firebase-project-mismatch');
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }), projectId });
  const auth = getAuth();
  const account = await auth.getUser(uid);
  const db = getFirestore();
  const profile = db.collection('users').doc(uid);
  const snapshot = await profile.get();
  if (!snapshot.exists) throw new Error('profile-not-found');
  if (role === 'check') {
    const storedRole = snapshot.data()?.role;
    console.log(JSON.stringify({ admin: account.customClaims?.admin === true, moderator: account.customClaims?.moderator === true, disabled: account.disabled, profileRole: ['admin', 'moderator', 'user'].includes(storedRole) ? storedRole : 'unknown', blocked: snapshot.data()?.moderationStatus === 'blocked' }, null, 2));
    console.log('Это проверка: аккаунт и права не изменены. Секреты и токены не выводятся.');
    return;
  }
  const claims = { ...account.customClaims };
  delete claims.admin;
  delete claims.moderator;
  if (role !== 'remove') claims[role] = true;
  await auth.setCustomUserClaims(uid, claims);
  await auth.revokeRefreshTokens(uid);
  const refreshed = await auth.getUser(uid);
  await db.collection('authRevocations').doc(uid).set({ validAfter: Math.floor(Date.parse(refreshed.tokensValidAfterTime) / 1000) }, { merge: true });
  await profile.update({ role: role === 'remove' ? 'user' : role, isAdmin: role === 'admin', isModerator: role === 'moderator' });
  console.log('Права обновлены. В приложении и на сайте выйдите из аккаунта и войдите снова. Остальные custom claims сохранены.');
}

run().catch(error => {
  const message = error?.message;
  const known = {
    'admin-not-configured': 'В окружении сервера не заданы FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL или FIREBASE_ADMIN_PRIVATE_KEY.',
    'firebase-project-mismatch': 'Проект Firebase Admin не совпадает с проектом сайта. Исправьте конфигурацию до назначения прав.',
    'profile-not-found': 'Профиль не найден. Используйте UID своего аккаунта из Firebase Authentication.',
  };
  console.error(known[message] || 'Не удалось проверить или обновить права. Проверьте UID и доступ сервисного аккаунта к Firebase Auth и Firestore.');
  if (typeof error?.code === 'string') console.error('Код:', error.code.slice(0, 80));
  process.exitCode = 1;
});
