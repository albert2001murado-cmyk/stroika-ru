#!/usr/bin/env bash
# Restores the recovered local worker and a reviewed source overlay. Beget VPS / systemd.
set -Eeuo pipefail
umask 077
SITE=/var/www/stroika-ru
BUNDLE=$(cd -- "$(dirname -- "$0")/../.." && pwd)
MANIFEST="$BUNDLE/restore-manifest.json"
[[ $EUID -eq 0 ]] || { echo 'Запустите от root в Termius'; exit 1; }
[[ -f "$MANIFEST" && -f "$SITE/package-lock.json" && -f /usr/local/lib/strova/start.cjs ]] || {
  echo 'Не найдена ожидаемая установка Стровы. Ничего не изменено'; exit 1;
}
exec 9>/run/lock/strova-moderation-install.lock
flock -n 9 || { echo 'Установка уже выполняется'; exit 1; }
id strova >/dev/null
systemctl is-active --quiet strova
[[ $(df -Pk /var/www | awk 'NR==2 {print $4}') -gt 18874368 ]] || {
  echo 'Нужно минимум 18 ГБ свободного диска для моделей, сборки и резервной копии'; exit 1;
}

echo '[1/7] Проверяю версии файлов, действующий сайт пока работает'
python3 "$BUNDLE/ops/moderation/overlay.py" check "$BUNDLE" "$SITE"
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP="/var/backups/strova/moderation-$STAMP"
STAGE=$(mktemp -d /var/www/.strova-moderation-build.XXXXXXXX)
WORKER=/opt/strova-moderation/20261114
DROPIN=/etc/systemd/system/strova.service.d/60-moderation.conf
ENVFILE=/etc/strova/moderation.env
GITDIR=$(git -C "$SITE" rev-parse --absolute-git-dir)
ACTIVATING=0
REUSE_WORKER=0
mkdir -p "$BACKUP" "$WORKER" /etc/strova /etc/systemd/system/strova.service.d
chmod 700 "$BACKUP" /etc/strova
cleanup() {
  local status=$?
  trap - EXIT
  if [[ $status -ne 0 ]]; then
    echo 'Установка остановлена. Не меняйте ключ MFA и не удаляйте объявления'
    if [[ $ACTIVATING -eq 1 ]]; then
      echo 'Возвращаю предыдущую сборку сайта'
      systemctl stop strova || true
      for name in .next node_modules; do
        if [[ -d "$BACKUP/$name" ]]; then
          [[ ! -e "$SITE/$name" ]] || mv "$SITE/$name" "$BACKUP/failed-$name"
          mv "$BACKUP/$name" "$SITE/$name"
        fi
      done
      python3 "$BUNDLE/ops/moderation/overlay.py" restore "$BACKUP" "$SITE" || true
      [[ ! -f "$BACKUP/git-index" ]] || cp -a "$BACKUP/git-index" "$GITDIR/index"
      for spec in "dropin:$DROPIN" "environment:$ENVFILE"; do
        local key=${spec%%:*} destination=${spec#*:}
        if [[ -f "$BACKUP/$key" ]]; then cp -a "$BACKUP/$key" "$destination"; else rm -f -- "$destination"; fi
      done
      systemctl daemon-reload
      systemctl start strova || true
    fi
    echo "Резервная копия и журнал сборки: $BACKUP"
    echo 'Пришлите последние строки ошибки, без содержимого .env'
  fi
  # The generated staging directory holds copied secrets; remove it after use.
  if [[ "$STAGE" == /var/www/.strova-moderation-build.* ]]; then rm -rf -- "$STAGE"; fi
  exit "$status"
}
trap cleanup EXIT

echo '[2/7] Собираю обновление в отдельной папке'
tar -C "$SITE" --exclude='./.git' --exclude='./node_modules' --exclude='./.next' \
  --exclude='./.npm-cache' --exclude='./moderation-service' -cf - . | tar -C "$STAGE" -xf -
python3 "$BUNDLE/ops/moderation/overlay.py" apply "$BUNDLE" "$STAGE"
chown -R strova:strova "$STAGE"
# $1 intentionally expands in the child shell, not in this installer.
# shellcheck disable=SC2016
runuser -u strova -- env npm_config_cache="$STAGE/.npm-cache" \
  bash -c 'set -Eeuo pipefail; cd "$1"; npm ci --include=dev --no-audit --no-fund; NODE_ENV=production npm run security:check; npm run typecheck; node --test tests/moderation.test.cjs; MODERATION_SCHEDULER_ENABLED=false npm run build' -- "$STAGE" \
  >"$BACKUP/build.log" 2>&1 || { tail -n 35 "$BACKUP/build.log"; exit 1; }
[[ -s "$STAGE/.next/standalone/server.js" ]]

echo '[3/7] Подготавливаю Docker и закрытые настройки модератора'
if ! command -v docker >/dev/null; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2
elif ! docker compose version >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-v2
fi
systemctl enable --now docker
if docker inspect stroika-local-moderation >/dev/null 2>&1; then
  LABEL=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' stroika-local-moderation)
  [[ "$LABEL" == strova-moderation ]] || { echo 'Найден другой модератор. Ничего не перезапускаю; сначала нужна проверка его настроек'; exit 1; }
  [[ -f "$WORKER/.selftest-passed" && -f "$WORKER/.env" ]] || { echo 'Найдена незавершённая установка модератора. Нужна проверка журнала'; exit 1; }
  REUSE_WORKER=1
  echo 'Повторное подключение уже проверенного модератора'
fi
cp -a "$BUNDLE/moderation-service/." "$WORKER/"
node "$BUNDLE/ops/moderation/configure.cjs" "$SITE" "$BACKUP/config" "$WORKER/.env"
install -m 600 "$BACKUP/config/worker.env" "$WORKER/.env"
dc() { docker compose --project-name strova-moderation --project-directory "$WORKER" -f "$WORKER/docker-compose.yml" "$@"; }

echo '[4/7] Устанавливаю модели. Первая загрузка может занять 15–45 минут'
if [[ $REUSE_WORKER -eq 0 ]]; then
  dc build
  dc run --rm --no-deps moderation python -m unittest discover -s tests
  # Model inference, FFmpeg, OCR and speech must all succeed before changing the site.
  dc run --rm --no-deps moderation python selftest.py
  touch "$WORKER/.selftest-passed"
fi

echo '[5/7] Запускаю модератор с автоматическим перезапуском'
dc up -d
READY=0
for ((attempt=1; attempt<=120; attempt++)); do
  if curl -fsS --max-time 3 http://127.0.0.1:8091/health >"$BACKUP/health.json" 2>/dev/null; then READY=1; break; fi
  if (( attempt % 6 == 0 )); then echo 'Модели загружаются в память…'; fi
  sleep 5
done
[[ $READY -eq 1 ]] || { echo 'Модератор не стал готов. Сайт остаётся на прежней сборке'; dc logs --tail=35; exit 1; }
python3 -c 'import json,sys; h=json.load(open(sys.argv[1])); assert h["status"]=="ok" and h["policyVersion"]=="2026-11-14.1"' "$BACKUP/health.json"
# Run the classification probe before starting the site's scheduler, so a real
# pending video cannot occupy the single worker and cause a false rollback.
(cd "$STAGE" && node --env-file="$BACKUP/config/website.env" scripts/diagnose-moderation.mjs --timeout=120)

echo '[6/7] Сохраняю прежнюю сборку и переключаю сайт'
python3 "$BUNDLE/ops/moderation/overlay.py" check "$BUNDLE" "$SITE"
python3 "$BUNDLE/ops/moderation/overlay.py" backup "$BUNDLE" "$SITE" "$BACKUP"
cp -a "$GITDIR/index" "$BACKUP/git-index"
[[ ! -f "$DROPIN" ]] || cp -a "$DROPIN" "$BACKUP/dropin"
[[ ! -f "$ENVFILE" ]] || cp -a "$ENVFILE" "$BACKUP/environment"
printf '%s\n' "$BACKUP" > /var/backups/strova/last-moderation-backup
ACTIVATING=1
systemctl stop strova
mv "$SITE/.next" "$BACKUP/.next"
mv "$SITE/node_modules" "$BACKUP/node_modules"
mv "$STAGE/.next" "$SITE/.next"
mv "$STAGE/node_modules" "$SITE/node_modules"
python3 "$BUNDLE/ops/moderation/overlay.py" apply "$BUNDLE" "$SITE"
chown -R strova:strova "$SITE/.next"
install -o root -g strova -m 640 "$BACKUP/config/website.env" "$ENVFILE"
cat >"$DROPIN" <<'UNIT'
[Service]
EnvironmentFile=/etc/strova/moderation.env
UNIT
systemctl daemon-reload
systemctl restart strova

echo '[7/7] Проверяю сайт, связь с модератором и доступ к очередям'
READY=0
for ((attempt=1; attempt<=30; attempt++)); do
  if curl -fsS --max-time 5 -H 'Host: strovaru.ru' http://127.0.0.1:3000/ >/dev/null; then READY=1; break; fi
  sleep 2
done
[[ $READY -eq 1 ]] || { echo 'Новая сборка не прошла проверку'; exit 1; }
cd "$SITE"
node --env-file="$ENVFILE" ops/moderation/check-queues.cjs
systemctl is-active --quiet strova
# Stage only the known patch, without committing or pushing. Once the same
# changes are pushed from VS Code, git pull can fast-forward without discarding
# the server patch. Other staged changes remain intact.
python3 - "$SITE" "$MANIFEST" <<'GIT_STAGE'
import json,subprocess,sys
paths=[item['path'] for item in json.load(open(sys.argv[2]))['files']]
subprocess.run(['git','-C',sys.argv[1],'add','--force','--',*paths],check=True)
GIT_STAGE
ACTIVATING=0
printf '%s\n' "$BACKUP" > /var/backups/strova/last-moderation-backup
echo 'МОДЕРАЦИЯ ЗАПУЩЕНА: сайт, очередь отзывов и локальный модератор отвечают'
echo 'Теперь проверьте тестовое объявление с фото и отзыв в приложении и на сайте'
echo "Прежняя сборка сохранена: $BACKUP"
