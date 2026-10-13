// Read-only: no Firebase writes, no publications, no configuration edits, no secrets in output.
import nextEnv from '@next/env';
import { execFileSync } from 'node:child_process';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() { console.error('Не удалось прочитать окружение сайта. Проверьте формат .env.local.'); } });
const timeoutArgument = process.argv.find(value => value.startsWith('--timeout='));
const timeout = Math.max(5, Math.min(290, Number(timeoutArgument?.split('=')[1]) || 60)) * 1000;
const secret = String(process.env.LOCAL_MODERATION_SECRET || '').trim();
const provider = String(process.env.MODERATION_AI_PROVIDER || '').trim().toLowerCase();
const scheduler = process.env.MODERATION_SCHEDULER_ENABLED === 'true';
console.log('Секреты, токены и тексты пользовательских объявлений не выводятся. Настройки файлов и окружения этой команды могут отличаться от старого окружения PM2/systemd.');
console.log('Провайдер local:', provider === 'local');
console.log('Планировщик включён:', scheduler);
console.log('Ключ сайта задан:', Boolean(secret));

function endpoint() {
  try {
    const url = new URL(String(process.env.LOCAL_MODERATION_URL || '').trim());
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname.replace(/^\[|\]$/g, ''));
    if ((!loopback && url.protocol !== 'https:') || (loopback && !['http:', 'https:'].includes(url.protocol)) || url.username || url.password || url.search || url.hash) return null;
    if (url.hostname === 'localhost' && url.protocol === 'http:') url.hostname = '127.0.0.1';
    if (url.pathname === '/') url.pathname = '/moderate';
    return url;
  } catch { return null; }
}

async function request(url, body, duration) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), duration);
  try {
    const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Accept: 'application/json', ...(secret ? { Authorization: 'Bearer ' + secret } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal });
    const reader = response.body?.getReader();
    let size = 0;
    const chunks = [];
    if (reader) {
      try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 256 * 1024) { await reader.cancel(); return { status: response.status, payload: null, diagnostic: 'oversized-response' }; } chunks.push(part.value); } }
      finally { reader.releaseLock(); }
    }
    try { return { status: response.status, payload: JSON.parse(Buffer.concat(chunks).toString('utf8')) }; }
    catch { return { status: response.status, payload: null, diagnostic: 'invalid-response' }; }
  } catch { return { status: 0, diagnostic: controller.signal.aborted ? 'timeout' : 'connection-failed', payload: null }; }
  finally { clearTimeout(timer); }
}

async function main() {
  let runtimeSecret = '';
  const name = process.argv.find(value => value.startsWith('--container='))?.slice('--container='.length) || 'stroika-local-moderation';
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)) throw new Error('invalid-container');
  try {
    // Capture Docker's environment privately; print only specific comparisons and state.
    const containers = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8', timeout: 10_000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
    const container = containers[0];
    const state = container.State || {};
    console.log('Контейнер:', state.Status || 'unknown', 'health:', state.Health?.Status || 'не задан', 'OOM:', state.OOMKilled === true, 'перезапусков:', container.RestartCount || 0);
    const variables = new Map((container.Config?.Env || []).map(value => { const at = value.indexOf('='); return [value.slice(0, at), value.slice(at + 1)]; }));
    runtimeSecret = String(variables.get('MODERATION_SHARED_SECRET') || '').trim();
    console.log('Ключ в работающем контейнере задан:', Boolean(runtimeSecret));
    console.log('Ключ сайта совпадает с работающим контейнером:', Boolean(secret && runtimeSecret && secret === runtimeSecret));
    if (secret && runtimeSecret && secret !== runtimeSecret) console.log('Причина найдена: сервис и сайт используют разные ключи. Согласуйте LOCAL_MODERATION_SECRET и MODERATION_SHARED_SECRET и пересоздайте контейнер, сохранив volume моделей.');
    const ports = Object.values(container.NetworkSettings?.Ports || {}).flatMap(value => Array.isArray(value) ? value.map(binding => binding.HostPort) : []);
    console.log('Опубликованные порты контейнера:', ports.filter(value => /^\d+$/.test(value)).join(', ') || 'не найдены');
  } catch { console.log('Состояние Docker недоступно: проверьте имя контейнера и права на Docker. Проверка HTTP продолжается.'); }

  const url = endpoint();
  if (!url) { console.log('LOCAL_MODERATION_URL отсутствует или некорректен. Для сервиса из нашего Compose: http://127.0.0.1:8091/moderate.'); return 1; }
  console.log('Порт из настройки сайта:', url.port || (url.protocol === 'https:' ? '443' : '80'));
  const healthUrl = new URL(url);
  healthUrl.pathname = healthUrl.pathname.replace(/\/(?:moderate|classify)\/?$/, '/health');
  if (healthUrl.toString() === url.toString()) { console.log('Нестандартный маршрут. Проверьте, что LOCAL_MODERATION_URL заканчивается на /moderate.'); return 1; }
  const health = await request(healthUrl, null, 5000);
  console.log('Health HTTP:', health.status, health.diagnostic || '');
  if (health.status !== 200 || health.payload?.status !== 'ok') { console.log('Сайт не получает корректный /health. Проверьте адрес, порт, сеть и готовность моделей. Если сайт тоже в Docker, его 127.0.0.1 относится к контейнеру сайта.'); return 1; }
  console.log('Протокол:', typeof health.payload.protocolVersion === 'number' ? health.payload.protocolVersion : 'не указан', 'сравнение каталога:', health.payload.supportsCatalogAlternatives === true, 'занят:', health.payload.busy === true);
  if (health.payload.busy === true) { console.log('Сервис отвечает, но занят. Повторите тест после завершения текущей проверки.'); return 1; }
  if (!secret) { console.log('У сайта нет LOCAL_MODERATION_SECRET. Заполните серверную настройку; ключ в приложение не переносится.'); return 1; }
  const result = await request(url, {
    title: 'Укладка асфальта', description: 'Выполняем асфальтирование дорожек и площадок. Подготавливаем основание и укладываем дорожное покрытие.',
    catalog: { section: 'services', category: 'Участок и благоустройство', subcategory: 'Асфальтирование', alternatives: ['Асфальтирование', 'Экскаваторы', 'Окна ПВХ'] }, media: [],
  }, timeout);
  console.log('Проверка /moderate HTTP:', result.status, result.diagnostic || '');
  if ([401, 403].includes(result.status)) { console.log('Причина: ключ доступа не принят. Проверьте ключ в запущенном контейнере и перезапуск сайта с новым окружением.'); return 1; }
  if (result.status === 404) { console.log('Причина: маршрут запроса не найден. Укажите /moderate, а не /health или адрес сайта.'); return 1; }
  if (result.status === 422) {
    console.log('Причина: сайт и модель используют разные схемы запроса. Нужны актуальные файлы локальной модерации; отключать проверку не требуется.');
    for (const error of Array.isArray(result.payload?.detail) ? result.payload.detail.slice(0, 10) : []) console.log('Поле:', Array.isArray(error.loc) ? error.loc.filter(value => typeof value === 'string' || typeof value === 'number').join('.') : 'unknown', 'тип:', typeof error.type === 'string' ? error.type : 'unknown');
    return 1;
  }
  if ([429, 503].includes(result.status)) { console.log('Сервис занят или временно не готов. Нужны логи контейнера; объявление не следует создавать повторно.'); return 1; }
  if (result.status !== 200 || !['approved', 'manual_review', 'rejected'].includes(result.payload?.decision) || !Array.isArray(result.payload?.flags)) { console.log('Причина: сервис не завершил проверку или вернул некорректный формат. Нужны логи контейнера.'); return 1; }
  const codes = result.payload.flags.map(flag => typeof flag?.code === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(flag.code) ? flag.code : 'unknown');
  console.log('Тестовое решение:', result.payload.decision, 'коды:', codes.join(', ') || 'нет замечаний');
  if (codes.some(code => ['local-model-error', 'classifier-unavailable', 'classifier-timeout'].includes(code))) { console.log('HTTP доступен, но сама модель не завершила проверку. Посмотрите docker compose logs --tail=80.'); return 1; }
  console.log('Модель отвечает на запрос сайта. Тест не публиковал объявление и не проверял реальные фото.');
  if (!scheduler) { console.log('Очередь не запущена этим окружением. Включите MODERATION_SCHEDULER_ENABLED=true либо проверьте существующий cron /api/moderation/run.'); return 1; }
  if (provider && provider !== 'local') { console.log('Сайт выбирает другой провайдер. Для локального сервиса нужен MODERATION_AI_PROVIDER=local.'); return 1; }
  return 0;
}

main().then(code => { process.exitCode = code; }).catch(() => { console.error('Не удалось выполнить диагностику. Запустите из папки сайта после npm install. Секреты не выведены.'); process.exitCode = 1; });
