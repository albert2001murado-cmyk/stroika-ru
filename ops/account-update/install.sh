#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
APP=${1:-/var/www/stroika-ru}
[[ $EUID -eq 0 ]] || { echo 'Установку сайта нужно запустить от root'; exit 1; }
[[ -d "$APP" && -f "$APP/package.json" && -f "$APP/server.js" ]] || { echo 'Не найдена папка работающего сайта'; exit 1; }
for command in node npm python3 systemctl flock curl runuser; do command -v "$command" >/dev/null || { echo "Не найдена команда $command"; exit 1; }; done
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<20||major===20&&minor<9)throw Error("Требуется Node.js 20.9 или новее")'
systemctl cat strova.service >/dev/null || { echo 'Не найден сервис strova.service. Порядок ручного обновления есть в README_RU.md'; exit 1; }
exec 9>/var/lock/strova-account-update.lock
flock -n 9 || { echo 'Обновление уже выполняется'; exit 1; }
python3 "$ROOT/ops/account-update/bundle.py" check "$ROOT" "$APP"
install -d -m 0700 -o root -g root /var/backups/strova
BACKUP=$(mktemp -d /var/backups/strova/accounts-20261122-XXXXXXXX)
STAGE=$(mktemp -d "$(dirname "$APP")/.strova-accounts-stage.XXXXXXXX")
SWITCHING=0
rollback_on_error() {
 local code=${1:-$?}
 trap - ERR INT TERM
 if [[ $SWITCHING -eq 1 ]]; then
   systemctl stop strova.service || true
   python3 "$ROOT/ops/account-update/bundle.py" restore "$BACKUP" "$APP" || true
   if [[ -d "$BACKUP/previous.next" ]]; then
     [[ ! -e "$APP/.next" ]] || mv "$APP/.next" "$BACKUP/failed.next"
     mv "$BACKUP/previous.next" "$APP/.next"
   fi
   if [[ -d "$BACKUP/previous.node_modules" ]]; then
     [[ ! -e "$APP/node_modules" ]] || mv "$APP/node_modules" "$BACKUP/failed.node_modules"
     mv "$BACKUP/previous.node_modules" "$APP/node_modules"
   fi
   systemctl start strova.service || true
   echo 'Возвращена предыдущая сборка сайта'
 fi
 echo "Обновление остановлено. Журнал и резервная копия: $BACKUP"
 exit "$code"
}
trap rollback_on_error ERR
trap 'rollback_on_error 130' INT
trap 'rollback_on_error 143' TERM
printf '\n1/5 Собираю сайт в отдельной папке\n'
python3 - "$APP" "$STAGE" <<'PY'
import shutil,sys
from pathlib import Path
src,dst=map(Path,sys.argv[1:])
shutil.copytree(src,dst,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.git','.next','node_modules','*-debug.log','*.tsbuildinfo'))
PY
python3 "$ROOT/ops/account-update/bundle.py" apply "$ROOT" "$STAGE"
(
 cd "$STAGE"
 npm ci --no-audit --no-fund
 npm run typecheck
 node --test tests/account-policy.test.cjs
 npm run build
) >"$BACKUP/build.log" 2>&1 || { tail -70 "$BACKUP/build.log"; false; }
printf '\n2/5 Проверяю папку документов\n'
[[ -f /usr/local/lib/strova/start.cjs ]] || { echo 'Не найден существующий запускатель сайта /usr/local/lib/strova/start.cjs'; false; }
STORAGE=$(cd "$APP" && node /usr/local/lib/strova/start.cjs --storage-path)
case "$STORAGE" in
 /var/lib/strova/verification|/var/lib/strova-private/verification|/var/www/strova-private/verification)
   install -d -m 0700 -o strova -g strova "$STORAGE"
   python3 - "$STORAGE" <<'PY'
import os,pwd,re,sys
from pathlib import Path
uid=pwd.getpwnam('strova').pw_uid;gid=pwd.getpwnam('strova').pw_gid
for p in Path(sys.argv[1]).iterdir():
 if re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',p.name) and p.is_file() and not p.is_symlink():os.chown(p,uid,gid);p.chmod(0o600)
PY
   ;;
 *) echo 'Используется своя папка документов, проверяю существующие права' ;;
esac
runuser -u strova -- node - "$STORAGE" < "$STAGE/scripts/check-verification-storage.cjs"
printf '\n3/5 Сохраняю текущую сборку\n'
python3 "$ROOT/ops/account-update/bundle.py" check "$ROOT" "$APP"
python3 "$ROOT/ops/account-update/bundle.py" backup "$ROOT" "$APP" "$BACKUP"
printf '\n4/5 Подключаю обновление\n'
SWITCHING=1
systemctl stop strova.service
python3 "$ROOT/ops/account-update/bundle.py" apply "$ROOT" "$APP"
[[ ! -e "$APP/.next" ]] || mv "$APP/.next" "$BACKUP/previous.next"
[[ ! -e "$APP/node_modules" ]] || mv "$APP/node_modules" "$BACKUP/previous.node_modules"
mv "$STAGE/.next" "$APP/.next"
mv "$STAGE/node_modules" "$APP/node_modules"
chown -R strova:strova "$APP/.next"
systemctl start strova.service
printf '\n5/5 Проверяю сайт и просмотр PDF\n'
READY=0
for attempt in {1..60}; do
 if curl -fsS --max-time 3 http://127.0.0.1:3000/api/security/health -o "$BACKUP/health.json" && node - "$BACKUP/health.json" <<'JS'
const fs=require('node:fs');const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));if(value.ready!==true||value.release!=='2026-11-22.accounts-1')process.exit(1);
JS
 then READY=1; break; fi
 sleep 1
done
[[ "$READY" -eq 1 ]]
curl -fsS --max-time 10 http://127.0.0.1:3000/verification-viewer/index.html -o "$BACKUP/viewer.html"
curl -fsS --max-time 10 http://127.0.0.1:3000/verification-viewer/pdf.mjs -o /dev/null
systemctl is-active --quiet strova.service
SWITCHING=0
trap - ERR INT TERM
rm -rf -- "$STAGE"
printf '\nСайт обновлён. Вход по телефону и паролю подключён, фоновые уведомления запущены\n'
printf 'Резервная копия и журнал сборки: %s\n' "$BACKUP"
printf 'Приложение обновите файлами из папки mobile в ZIP и выпустите версию 1.0.1\n'
