// Read-only end-to-end check using the same project and server identity as the site.
process.env.NODE_ENV = 'production';
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
async function main() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  if (projectId !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) throw new Error('project-mismatch');
  const app = initializeApp({ credential: cert({ projectId, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: String(process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n') }) });
  const db = getFirestore(app);
  for (const collection of ['listings', 'customerRequests', 'reviews']) {
    const result = await db.collection(collection).where('moderationStatus', '==', 'pending').limit(1).get();
    console.log(collection + ': очередь доступна' + (result.empty ? ', ожидающих в проверочной выборке нет' : ', есть ожидающие записи'));
  }
  await db.terminate();
}
const timer = setTimeout(() => { console.error('Проверка очередей превысила 30 секунд'); process.exit(1); }, 30000);
main().catch(error => { console.error('Нет подтверждения доступа к очередям:', String(error?.code || 'unavailable')); process.exitCode = 1; }).finally(() => clearTimeout(timer));
