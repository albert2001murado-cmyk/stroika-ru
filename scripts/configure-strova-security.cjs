#!/usr/bin/env node
/* Configure the existing Next.js project without replacing its package.json or SDK versions. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd(), manifest = path.join(root, 'package.json');
if (!fs.existsSync(manifest) || !fs.existsSync(path.join(root, 'src/lib/firebase-admin.ts'))) {
  console.error('Запустите команду из папки сайта, где находится package.json'); process.exit(1);
}
if (process.argv.includes('--check')) {
  try { require('@next/env').loadEnvConfig(root); } catch { /* Environment may be injected by the host. */ }
  const missing = ['NEXT_PUBLIC_FIREBASE_API_KEY', 'FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY', 'STROVA_MFA_ENCRYPTION_KEY'].filter(key => !process.env[key]);
  const encoded = process.env.STROVA_MFA_ENCRYPTION_KEY || '', key = Buffer.from(encoded, 'base64');
  if (missing.length || key.length !== 32 || key.toString('base64') !== encoded) {
    console.error('Настройки не готовы. Отсутствуют: ' + (missing.join(', ') || 'корректный STROVA_MFA_ENCRYPTION_KEY')); process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.error('В production нельзя использовать Auth Emulator'); process.exit(1);
  }
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== process.env.FIREBASE_ADMIN_PROJECT_ID) {
    console.error('NEXT_PUBLIC_FIREBASE_PROJECT_ID и FIREBASE_ADMIN_PROJECT_ID должны указывать на один проект'); process.exit(1);
  }
  console.log('Настройки найдены. Проверьте вход и Firestore rules на тестовом аккаунте перед выпуском');
  process.exit(0);
}
const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
pkg.dependencies = { ...pkg.dependencies, otpauth: '9.5.2' };
pkg.scripts = { ...pkg.scripts, 'security:check': 'node scripts/configure-strova-security.cjs --check', 'security:test': 'npx firebase-tools@14.27.0 emulators:exec --config firebase.security-tests.json --project demo-strova-own-mfa --only auth,firestore "node tests/account-security.emulator.cjs"' };
const encoded = JSON.stringify(pkg, null, 2) + '\n';
if (fs.readFileSync(manifest, 'utf8') !== encoded) {
  const backup = manifest + '.before-strova-security';
  if (!fs.existsSync(backup)) fs.copyFileSync(manifest, backup, fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(manifest, encoded);
}
const envPath = path.join(root, '.env.local');
const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
if (!/^\s*STROVA_MFA_ENCRYPTION_KEY\s*=/m.test(current) && !process.env.STROVA_MFA_ENCRYPTION_KEY) {
  fs.appendFileSync(envPath, '\n# Permanent server-only MFA key. Back up securely; never rename to NEXT_PUBLIC_.\nSTROVA_MFA_ENCRYPTION_KEY=' + crypto.randomBytes(32).toString('base64') + '\n', { mode: 0o600 });
  console.log('Постоянный ключ создан в .env.local. Сохраните защищённую резервную копию файла');
} else console.log('Существующий ключ сохранён без изменений');
console.log('Далее: npm install, затем npm run security:check и npm run build');
console.log('Этот скрипт не подключает Identity Platform, оплату или SMS и не меняет Firebase в облаке');
