/* Run from the website project on your server. Never prints service-account credentials. */
const fs = require('node:fs');
function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) digits = '7' + digits;
  if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1);
  return /^7\d{10}$/.test(digits) ? '+' + digits : '';
}
function collectPhones(profiles, authUsers) {
  const phones = new Map(), emails = new Map(), invalidProfileUids = [];
  function add(phone, uid) {
    if (!phone) return;
    if (!phones.has(phone)) phones.set(phone, new Set());
    phones.get(phone).add(uid);
  }
  for (const item of profiles) {
    const phone = normalizePhone(item.phone);
    if (item.phone && !phone) invalidProfileUids.push(item.uid);
    add(phone, item.uid);
  }
  for (const user of authUsers) {
    add(normalizePhone(user.phoneNumber), user.uid);
    const email = String(user.email || '').trim().toLowerCase();
    if (email) { if (!emails.has(email)) emails.set(email, new Set()); emails.get(email).add(user.uid); }
  }
  const conflicts = [...phones].filter(([, ids]) => ids.size > 1).map(([phone, ids]) => ({ phone, uids: [...ids] }));
  const emailConflicts = [...emails].filter(([, ids]) => ids.size > 1).map(([email, ids]) => ({ email, uids: [...ids] }));
  return { phones, conflicts, emailConflicts, invalidProfileUids };
}
async function main() {
  require('@next/env').loadEnvConfig(process.cwd());
  const { cert, getApps, initializeApp } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  const { getFirestore, FieldValue, FieldPath } = require('firebase-admin/firestore');
  const apply = process.argv.includes('--apply');
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
  if (!getApps().length) {
    if (emulator) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-strova-unique' });
    else {
      if (!projectId || !clientEmail || !privateKey) throw Error('В .env.local не хватает существующих FIREBASE_ADMIN_* настроек сайта.');
      initializeApp({ projectId, credential: cert({ projectId, clientEmail, privateKey }) });
    }
  }
  const db = getFirestore(), auth = getAuth(), gate = db.doc('identityGuards/phones');
  if (apply) await gate.set({ ready: false, version: 1, updatedAt: FieldValue.serverTimestamp() });
  const profiles = [], authUsers = [];
  let cursor;
  for (;;) {
    let query = db.collection('users').orderBy(FieldPath.documentId()).limit(400);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    profiles.push(...page.docs.map(doc => ({ uid: doc.id, phone: doc.get('phone') })));
    if (page.size < 400) break;
    cursor = page.docs.at(-1);
  }
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    authUsers.push(...page.users.map(user => ({ uid: user.uid, email: user.email, phoneNumber: user.phoneNumber })));
    pageToken = page.pageToken;
  } while (pageToken);
  const index = collectPhones(profiles, authUsers);
  const report = { profileCount: profiles.length, authCount: authUsers.length, uniqueNumbers: index.phones.size,
    conflicts: index.conflicts, emailConflicts: index.emailConflicts, invalidProfileUids: index.invalidProfileUids };
  const reportPath = 'phone-uniqueness-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(`Аккаунтов: ${authUsers.length}; номеров: ${index.phones.size}; повторяющихся номеров: ${index.conflicts.length}.`);
  console.log(`Подробности сохранены в ${reportPath}. Пользовательские аккаунты не изменяются и не удаляются.`);
  if (!apply) { console.log('Только проверка. Для заполнения реестра: node scripts/seed-phone-claims.cjs --apply'); return; }
  let batch = db.batch(), count = 0;
  const commit = async () => { if (count) await batch.commit(); batch = db.batch(); count = 0; };
  for (const [phone, ids] of index.phones) {
    const owners = [...ids];
    batch.set(db.collection('phoneClaims').doc(phone), { ownerUid: owners.length === 1 ? owners[0] : null, owners, updatedAt: FieldValue.serverTimestamp() });
    if (++count === 400) await commit();
  }
  await commit();
  cursor = undefined;
  for (;;) {
    let query = db.collection('phoneClaims').orderBy(FieldPath.documentId()).limit(400);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const doc of page.docs) if (!index.phones.has(doc.id)) { batch.delete(doc.ref); if (++count === 400) await commit(); }
    if (page.size < 400) break;
    cursor = page.docs.at(-1);
  }
  await commit();
  await gate.set({ ready: true, version: 1, conflictCount: index.conflicts.length, updatedAt: FieldValue.serverTimestamp() });
  console.log('Реестр готов. Повторные номера закрыты для новой регистрации, существующие аккаунты сохранены.');
}
module.exports = { normalizePhone, collectPhones };
if (require.main === module) main().catch(error => { console.error('Реестр не завершён:', error.code || error.message); process.exitCode = 1; });
