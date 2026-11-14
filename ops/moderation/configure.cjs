// Executed as root on the user's VPS. Never print or shell-source secrets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [site, output, priorWorker] = process.argv.slice(2);
if (!path.isAbsolute(site || '') || !path.isAbsolute(output || '')) throw new Error('Absolute directories required');
process.env.NODE_ENV = 'production';
require(path.join(site, 'node_modules/@next/env')).loadEnvConfig(site, false, { info() {}, error() { throw new Error('Invalid environment file'); } });
for (const name of ['FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY', 'STROVA_MFA_ENCRYPTION_KEY']) {
  if (!process.env[name]) throw new Error('Missing required server setting: ' + name);
}
if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== process.env.FIREBASE_ADMIN_PROJECT_ID) {
  throw new Error('Website and moderation must use the same Firebase project');
}
// Preserve an existing moderation token when it can safely be represented in systemd env files.
const previousWorkerToken = priorWorker && fs.existsSync(priorWorker)
  ? /^MODERATION_SHARED_SECRET=([A-Za-z0-9_+/=-]{32,256})$/m.exec(fs.readFileSync(priorWorker, 'utf8'))?.[1] : '';
const existing = previousWorkerToken || process.env.LOCAL_MODERATION_SECRET || '';
const secret = /^[A-Za-z0-9_+/=-]{32,256}$/.test(existing) ? existing : crypto.randomBytes(48).toString('hex');
const hosts = new Set(['strovaru.ru', 'www.strovaru.ru', 'stroika-ru.ru', 'www.stroika-ru.ru']);
const bucket = process.env.YANDEX_S3_BUCKET || '';
if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Check YANDEX_S3_BUCKET before restoring photo moderation');
hosts.add(bucket + '.storage.yandexcloud.net');
for (const host of (process.env.MODERATION_ALLOWED_MEDIA_HOSTS || '').split(',')) {
  const clean = host.trim().toLowerCase();
  if (clean && /^[a-z0-9.-]+$/.test(clean) && !clean.includes('..')) hosts.add(clean);
}
const list = [...hosts].join(',');
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(output, 'worker.env'), [
  'MODERATION_SHARED_SECRET=' + secret, 'MODERATION_ALLOWED_MEDIA_HOSTS=' + list,
  'MODEL_THREADS=4', 'OCR_ENABLED=true', 'VIDEO_AUDIO_ENABLED=true', 'WHISPER_MODEL=tiny',
  'MAX_VIDEO_SECONDS=180', 'MAX_VIDEO_FRAMES=48', 'PROCESS_TIMEOUT_SECONDS=200',
].join('\n') + '\n', { mode: 0o600 });
fs.writeFileSync(path.join(output, 'website.env'), [
  'MODERATION_AI_PROVIDER=local', 'LOCAL_MODERATION_URL=http://127.0.0.1:8091/moderate',
  'LOCAL_MODERATION_SECRET=' + secret, 'MODERATION_ALLOWED_MEDIA_HOSTS=' + list,
  'MODERATION_SCHEDULER_ENABLED=true', 'LOCAL_MODERATION_TIMEOUT_MS=270000',
].join('\n') + '\n', { mode: 0o600 });
console.log('Настройки подготовлены; ключ MFA сохранён без изменений');
