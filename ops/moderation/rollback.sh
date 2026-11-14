#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Запустите от root'; exit 1; }
SITE=/var/www/stroika-ru
BACKUP=$(cat /var/backups/strova/last-moderation-backup)
[[ "$BACKUP" == /var/backups/strova/moderation-* && "$BACKUP" != *..* && -f "$BACKUP/restore-manifest.json" ]] || exit 1
[[ -d "$BACKUP/.next" && -d "$BACKUP/node_modules" ]] || { echo 'Резервная сборка уже восстановлена или отсутствует'; exit 1; }
exec 9>/run/lock/strova-moderation-install.lock
flock -n 9 || { echo 'Дождитесь окончания установки'; exit 1; }
SAVED="$BACKUP/replaced-$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$SAVED"
systemctl stop strova
for name in .next node_modules; do
  [[ ! -e "$SITE/$name" ]] || mv "$SITE/$name" "$SAVED/$name"
  mv "$BACKUP/$name" "$SITE/$name"
done
python3 "$(dirname -- "$0")/overlay.py" restore "$BACKUP" "$SITE"
GITDIR=$(git -C "$SITE" rev-parse --absolute-git-dir)
[[ ! -f "$BACKUP/git-index" ]] || cp -a "$BACKUP/git-index" "$GITDIR/index"
for spec in 'dropin:/etc/systemd/system/strova.service.d/60-moderation.conf' 'environment:/etc/strova/moderation.env'; do
  key=${spec%%:*}; destination=${spec#*:}
  if [[ -f "$BACKUP/$key" ]]; then cp -a "$BACKUP/$key" "$destination"; else rm -f -- "$destination"; fi
done
systemctl daemon-reload
systemctl restart strova
echo 'Предыдущая сборка сайта восстановлена. Данные Firebase и ключ MFA не менялись'
