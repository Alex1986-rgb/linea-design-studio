#!/usr/bin/env bash
# LINEA · ОДНА КОМАНДА после восстановления Beget: включить боевой бэкап и проверить его.
#
#   ./tools/ops/after-beget-up.sh            (запускает Александр с мака; ~5 минут)
#
# Шаги:
#   1. SSH с мака до Beget (beget-en0) — жив ли сервер.
#   2. Открытый ключ бэкапера SmartApe → ~/.ssh/authorized_keys на Beget с ограничениями
#      from="94.198.55.117",no-port-forwarding,no-pty… (копия authorized_keys.bak-<дата> рядом). Повторно не дописывает.
#      Это изменение доступа к боевому аккаунту — поэтому скрипт запускает владелец, а не автоматика.
#   3. Первый боевой бэкап на SmartApe (дамп MySQL + linea-private → 7z → C:\linea-ops\backups + gdrive:LINEA/Бэкапы).
#   4. Удался — задача LineaBackup в Планировщике SmartApe (каждый день 04:20, SYSTEM) и проверка свежести бэкапа в мониторе.
#   5. Проверка восстановления на маке (restore-check.sh, временная MariaDB, всё удаляется).
#   6. Текущие DNS-записи домена и план записей почты (только печать, без изменений).
# Снять: ssh smartape-win "schtasks /delete /tn LineaBackup /f"; ключ — строка «linea-backup@smartape» в ~/.ssh/authorized_keys на Beget.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
B="${BEGET_SSH:-beget-en0}"; FROM="${BEGET_FROM:-94.198.55.117}"
say() { printf '\n\033[1m» %s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*"; exit 1; }

say "1/6 Beget отвечает?"
ssh -o BatchMode=yes -o ConnectTimeout=15 "$B" 'echo "  ok: $(hostname)"; command -v mysqldump >/dev/null && echo "  mysqldump есть" || echo "  mysqldump нет — будет PHP-дамп"; test -f ~/dizain-studiya-kvartir/linea-private/config.php && echo "  config.php на месте"' \
  || die "Beget по SSH не отвечает — DNS/сервер ещё лежат. Повторить позже."

say "2/6 Ключ бэкапера SmartApe → authorized_keys на Beget"
PUB=$(ssh -o BatchMode=yes smartape-win 'type C:\linea-ops\secrets\beget_ed25519.pub' | tr -d '\r')
case "$PUB" in ssh-ed25519\ *linea-backup@smartape) ;; *) die "на SmartApe нет ключа — сначала ./tools/ops/install-smartape.sh";; esac
LINE="from=\"$FROM\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $PUB"
printf '%s\n' "$LINE" | ssh -o BatchMode=yes "$B" 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys &&
  if grep -q "linea-backup@smartape" ~/.ssh/authorized_keys; then echo "  ключ уже есть"; else
  cp -p ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak-$(date +%Y%m%d-%H%M) && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo "  ключ добавлен (копия authorized_keys.bak-… рядом)"; fi'

say "3/6 Первый боевой бэкап на SmartApe"
ssh -o BatchMode=yes smartape-win 'set LINEA_OPS_HOME=C:\linea-ops&& "C:\Program Files\nodejs\node.exe" C:\linea-ops\tools\bk.mjs backup 2>&1 & "C:\Program Files\nodejs\node.exe" C:\linea-ops\tools\bk.mjs status' | tee /dev/stderr | grep -q '"ok": true' \
  || die "бэкап не прошёл — см. вывод выше (C:\\linea-ops\\logs\\backup.log). Частая причина: SmartApe не достучался до Beget по SSH."

say "4/6 Задача LineaBackup (ежедневно 04:20) и проверка свежести в мониторе"
ssh -o BatchMode=yes smartape-win 'schtasks /create /tn LineaBackup /tr "C:\linea-ops\tools\run-backup.cmd" /sc daily /st 04:20 /ru SYSTEM /rl HIGHEST /f && "C:\Program Files\nodejs\node.exe" -e "const f=String.raw`C:\linea-ops\ops.json`,fs=require(`fs`);const j=JSON.parse(fs.readFileSync(f,`utf8`));j.expectBackup=true;fs.writeFileSync(f,JSON.stringify(j,null,2));console.log(`  expectBackup=true`)"'

say "5/6 Проверка восстановления (мак, временная папка)"
"$REPO/tools/ops/restore-check.sh" || echo "  ВНИМАНИЕ: проверка восстановления не прошла — разобрать до первой оплаты"

say "6/6 DNS домена и план записей почты (без изменений)"
python3 -I "$REPO/tools/ops/dns-mail-plan.py" || true
echo
echo "Готово. Пароль архивов хранится только на SmartApe (C:\\linea-ops\\secrets\\backup.pass) — скопируйте его в менеджер паролей (см. docs/ops/bekapy-i-monitoring.md)."
