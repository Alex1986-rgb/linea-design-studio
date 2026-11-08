#!/usr/bin/env bash
# LINEA · установка бэкапа и мониторинга на SmartApe (запуск с мака). Повторный запуск безопасен: обновляет скрипты,
# секреты и ops.json НЕ перезаписывает.
#
#   ./tools/ops/install-smartape.sh            скрипты → C:\linea-ops\tools, пароль архива, ключ SSH до Beget, самопроверка,
#                                              задача LineaMonitor (раз в 5 минут) — только если прогон монитора прошёл
#   ./tools/ops/install-smartape.sh --no-task  то же без постановки задачи
#
# Задачу LineaBackup ставит tools/ops/after-beget-up.sh — после первого удачного боевого бэкапа (нужен доступ к Beget).
# Снять всё: ssh smartape-win "schtasks /delete /tn LineaMonitor /f & schtasks /delete /tn LineaBackup /f"
# Секреты (C:\linea-ops\secrets) доступны только SYSTEM и Administrators; пароль архива скрипт не печатает.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
H=smartape-win; NOTASK=0; [ "${1:-}" = --no-task ] && NOTASK=1
say() { printf '\033[1m» %s\033[0m\n' "$*"; }
rs() { ssh -o BatchMode=yes "$H" "$@"; }

say "1/6 Папки C:\\linea-ops"
rs 'for %d in (tools secrets logs state selftest\secrets) do @(if not exist C:\linea-ops\%d mkdir C:\linea-ops\%d)' && echo "  ok" 

say "2/6 Скрипты"
scp -q -o BatchMode=yes "$REPO"/tools/ops/{lib.mjs,bk.mjs,monitor.mjs,beget-dump.sh,run-backup.cmd,run-monitor.cmd,ops.example.json} "$H":C:/linea-ops/tools/
rs '(if not exist C:\linea-ops\ops.json copy /y C:\linea-ops\tools\ops.example.json C:\linea-ops\ops.json >NUL) & type C:\linea-ops\ops.json >NUL' && echo "  ops.json на месте" 

say "3/6 Секреты: пароль архива, ключ SSH, known_hosts Beget"
rs 'if not exist C:\linea-ops\secrets\backup.pass ("C:\Program Files\nodejs\node.exe" -e "require(\"fs\").writeFileSync(\"C:/linea-ops/secrets/backup.pass\", require(\"crypto\").randomBytes(30).toString(\"base64url\"))" && echo backup.pass created) else (echo backup.pass exists)'
rs 'if not exist C:\linea-ops\secrets\beget_ed25519 (ssh-keygen -q -t ed25519 -N "" -C linea-backup@smartape -f C:\linea-ops\secrets\beget_ed25519 && echo key created) else (echo key exists)'
# Ключи хостов обоих источников дампа — Beget и VPS SmartApe (45.154.185.168, после переезда): бэкапер проверяет их строго.
VPS_IP="${VPS_IP:-45.154.185.168}"
KH=$(grep -E "^(gandalf\.beget\.com|$VPS_IP) " ~/.ssh/known_hosts | head -6 || true)
W="${LINEA_SCRATCH:-${TMPDIR:-/tmp}}/linea-install.$$"; mkdir -p "$W"; trap 'rm -rf "$W"' EXIT
if [ -n "$KH" ]; then printf '%s\n' "$KH" > "$W/known_hosts"; scp -q -o BatchMode=yes "$W/known_hosts" "$H":C:/linea-ops/secrets/known_hosts
  echo "  known_hosts: ключи хостов перенесены с мака ($(printf '%s\n' "$KH" | cut -d' ' -f1 | sort -u | tr '\n' ' '))"; fi
# права на всю C:\linea-ops: только SYSTEM и Administrators (иначе OpenSSH для Windows отвергает ключ, а пароль видели бы другие учётки)
rs 'icacls C:\linea-ops /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" /Q >NUL && icacls C:\linea-ops\* /reset /T /Q >NUL && echo acl ok'
echo "  открытый ключ для Beget (его добавит after-beget-up.sh):"
rs 'type C:\linea-ops\secrets\beget_ed25519.pub' | sed 's/^/    /'

say "4/6 Самопроверка бэкапа на макете (без Beget): шифрование, 7z t, ротация, загрузка в gdrive:LINEA/Бэкапы/_проверка"
"$REPO/tools/ops/mock-beget.sh" "$W/mock" >/dev/null 2>&1
scp -q -o BatchMode=yes "$W/mock/mock-backup.tgz" "$H":C:/linea-ops/work-selftest.tgz
printf '{"gdrive":"gdrive:LINEA/Бэкапы/_проверка","backupMaxAgeHours":0}\n' > "$W/selftest.json"
rs 'copy /y C:\linea-ops\secrets\backup.pass C:\linea-ops\selftest\secrets\ >NUL'
scp -q -o BatchMode=yes "$W/selftest.json" "$H":C:/linea-ops/selftest/ops.json
rs 'set LINEA_OPS_HOME=C:\linea-ops\selftest&& "C:\Program Files\nodejs\node.exe" C:\linea-ops\tools\bk.mjs backup --from-file=C:\linea-ops\work-selftest.tgz 2>&1 && set LINEA_OPS_HOME=C:\linea-ops\selftest&& "C:\Program Files\nodejs\node.exe" C:\linea-ops\tools\bk.mjs test && del C:\linea-ops\work-selftest.tgz && rmdir /s /q C:\linea-ops\selftest && echo   selftest ok, removed'

say "5/6 Пробный прогон монитора"
rs 'set LINEA_OPS_HOME=C:\linea-ops&& "C:\Program Files\nodejs\node.exe" C:\linea-ops\tools\monitor.mjs --print'

say "6/6 Задача LineaMonitor"
if [ "$NOTASK" = 1 ]; then echo "  пропущено (--no-task)"; else
  rs 'schtasks /create /tn LineaMonitor /tr "C:\linea-ops\tools\run-monitor.cmd" /sc minute /mo 5 /ru SYSTEM /rl HIGHEST /f'
  rs 'schtasks /run /tn LineaMonitor >NUL & schtasks /query /tn LineaMonitor /fo list' | grep -a -E 'TaskName|Next Run|Status'
fi
echo "Готово. Журналы: C:\\linea-ops\\logs, состояние: C:\\linea-ops\\state (ALERT.txt — флаг сбоя)."
