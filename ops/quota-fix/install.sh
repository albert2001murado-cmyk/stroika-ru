#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
APP=${1:-/var/www/stroika-ru}
[[ $EUID -eq 0 ]] || { echo 'Установку сайта нужно запустить от root'; exit 1; }
[[ -d "$APP" && -f "$APP/package.json" && -f "$APP/server.js" ]] || { echo 'Не найдена папка работающего сайта'; exit 1; }
for command in node npm python3 systemctl flock curl; do command -v "$command" >/dev/null || { echo "Не найдена команда $command"; exit 1; }; done
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<20||major===20&&minor<9)throw Error("Требуется Node.js 20.9 или новее")'
systemctl cat strova.service >/dev/null || { echo 'Не найден сервис strova.service. Порядок ручного обновления есть в README_RU.md'; exit 1; }
RUN_USER=$(systemctl show -p User --value strova.service)
RUN_USER=${RUN_USER:-root}
RUN_GROUP=$(id -gn "$RUN_USER")
exec 9>/var/lock/strova-account-update.lock
flock -n 9 || { echo 'Обновление уже выполняется'; exit 1; }
python3 "$ROOT/ops/quota-fix/bundle.py" check "$ROOT" "$APP"
install -d -m 0700 -o root -g root /var/backups/strova
BACKUP=$(mktemp -d /var/backups/strova/quota-20261122-XXXXXXXX)
STAGE=$(mktemp -d "$(dirname "$APP")/.strova-quota-stage.XXXXXXXX")
SWITCHING=0
rollback_on_error() {
 local code=${1:-$?}
 trap - ERR INT TERM
 if [[ $SWITCHING -eq 1 ]]; then
   systemctl stop strova.service || true
   python3 "$ROOT/ops/quota-fix/bundle.py" restore "$BACKUP" "$APP" || true
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
printf '\n1/4 Собираю сайт в отдельной папке\n'
python3 - "$APP" "$STAGE" <<'PY'
import shutil,sys
from pathlib import Path
src,dst=map(Path,sys.argv[1:])
shutil.copytree(src,dst,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.git','.next','node_modules','*-debug.log','*.tsbuildinfo'))
PY
python3 "$ROOT/ops/quota-fix/bundle.py" apply "$ROOT" "$STAGE"
(
 cd "$STAGE"
 npm ci --no-audit --no-fund
 npm run typecheck
 node --test tests/background-workers.test.cjs
 npm run build
) >"$BACKUP/build.log" 2>&1 || { tail -70 "$BACKUP/build.log"; false; }
printf '\n2/4 Сохраняю текущую сборку\n'
python3 "$ROOT/ops/quota-fix/bundle.py" check "$ROOT" "$APP"
python3 "$ROOT/ops/quota-fix/bundle.py" backup "$ROOT" "$APP" "$BACKUP"
printf '\n3/4 Подключаю обновление\n'
SWITCHING=1
systemctl stop strova.service
python3 "$ROOT/ops/quota-fix/bundle.py" apply "$ROOT" "$APP"
[[ ! -e "$APP/.next" ]] || mv "$APP/.next" "$BACKUP/previous.next"
[[ ! -e "$APP/node_modules" ]] || mv "$APP/node_modules" "$BACKUP/previous.node_modules"
mv "$STAGE/.next" "$APP/.next"
mv "$STAGE/node_modules" "$APP/node_modules"
chown -R "$RUN_USER:$RUN_GROUP" "$APP/.next" "$APP/node_modules"
systemctl start strova.service
printf '\n4/4 Проверяю сервис входа\n'
READY=0
for attempt in {1..60}; do
 if curl -fsS --max-time 3 http://127.0.0.1:3000/api/security/health -o "$BACKUP/health.json" && node - "$BACKUP/health.json" <<'JS'
const fs=require('node:fs');const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));if(value.ready!==true||value.release!=='2026-11-22.quota-1')process.exit(1);
JS
 then READY=1; break; fi
 sleep 1
done
[[ "$READY" -eq 1 ]]
systemctl is-active --quiet strova.service
SWITCHING=0
trap - ERR INT TERM
rm -rf -- "$STAGE"
printf '\nКод сайта обновлён. Сокращены фоновые обращения к Firestore\n'
printf 'Резервная копия и журнал сборки: %s\n' "$BACKUP"
printf 'Исчерпанная квота должна восстановиться в Firebase. Установка кода не обнуляет лимит\n'
