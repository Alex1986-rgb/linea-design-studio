#!/usr/bin/env bash
# LINEA · ОДНА КОМАНДА после восстановления Beget: включить боевой бэкап и проверить его.
#
#   ./tools/ops/after-beget-up.sh                 (запускает Александр с мака; ~5 минут)
#   ./tools/ops/after-beget-up.sh --only-script   только обновить ~/linea-ops/beget-dump.sh на Beget (после правки скрипта в репо)
#
# Шаги:
#   1. SSH с мака до Beget (beget-en0) — жив ли сервер.
#   2. beget-dump.sh → ~/linea-ops/beget-dump.sh на Beget (вне веб-корня, права 500), сверка sha256 с репозиторием.
#      Открытый ключ бэкапера SmartApe → ~/.ssh/authorized_keys с ПРИНУДИТЕЛЬНОЙ командой (ревью 02.11, В4):
#        command="nice -n 19 bash ~/linea-ops/beget-dump.sh",no-pty,no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-user-rc,from="94.198.55.117"
#      Ключ умеет только отдать дамп (режимы dump|check|version по белому списку) — оболочки на аккаунт Beget у SmartApe нет.
#      Старая строка ключа без command= заменяется (копия authorized_keys.bak-<дата-время> рядом, не перезаписывается).
#      Проверка с SmartApe: «check» проходит, произвольная команда («id») отвергается.
#      Это изменение доступа к боевому аккаунту — поэтому скрипт запускает владелец, а не автоматика.
#   3. Первый боевой бэкап на SmartApe (дамп MySQL + linea-private → 7z → C:\linea-ops\backups + gdrive:LINEA/Бэкапы).
#   4. Удался — задача LineaBackup в Планировщике SmartApe (каждый день 04:20, SYSTEM) и проверка свежести бэкапа в мониторе;
#      токен мониторинга (monitor_token из config Beget) → C:\linea-ops\secrets\monitor.token без вывода на экран (проверка cron).
#   5. Проверка восстановления на маке (restore-check.sh, временная MariaDB, всё удаляется).
#   6. Текущие DNS-записи домена и план записей почты (только печать, без изменений).
# Снять: ssh smartape-win "schtasks /delete /tn LineaBackup /f"; ключ — строка «linea-backup@smartape» в ~/.ssh/authorized_keys на Beget.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
B="${BEGET_SSH:-beget-en0}"; FROM="${BEGET_FROM:-94.198.55.117}"
ONLY_SCRIPT=0; [ "${1:-}" = --only-script ] && ONLY_SCRIPT=1
say() { printf '\n\033[1m» %s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*"; exit 1; }
NODE='"C:\Program Files\nodejs\node.exe"'

# beget-dump.sh → ~/linea-ops на Beget: временный файл + mv, затем сверка sha256 с репозиторием
put_script() {
  local want got
  want=$(shasum -a 256 "$REPO/tools/ops/beget-dump.sh" | cut -d' ' -f1)
  ssh -o BatchMode=yes "$B" 'mkdir -p ~/linea-ops && chmod 700 ~/linea-ops && cat > ~/linea-ops/.beget-dump.sh.new && chmod 500 ~/linea-ops/.beget-dump.sh.new && mv -f ~/linea-ops/.beget-dump.sh.new ~/linea-ops/beget-dump.sh' \
    < "$REPO/tools/ops/beget-dump.sh" || die "не удалось положить beget-dump.sh на Beget"
  got=$(ssh -o BatchMode=yes "$B" 'bash ~/linea-ops/beget-dump.sh version' | sed -n 's/^beget-dump //p')
  [ "$got" = "$want" ] || die "beget-dump.sh на Beget не совпал с репозиторием ($got)"
  echo "  ~/linea-ops/beget-dump.sh на месте, sha256 ${want:0:12}…"
}
if [ "$ONLY_SCRIPT" = 1 ]; then say "Обновление beget-dump.sh на Beget"; put_script; exit 0; fi

say "1/6 Beget отвечает?"
ssh -o BatchMode=yes -o ConnectTimeout=15 "$B" 'echo "  ok: $(hostname)"; command -v mysqldump >/dev/null && echo "  mysqldump есть" || echo "  mysqldump нет — будет PHP-дамп"; test -f ~/dizain-studiya-kvartir/linea-private/config.php && echo "  config.php на месте"' \
  || die "Beget по SSH не отвечает — DNS/сервер ещё лежат. Повторить позже."

say "2/6 beget-dump.sh на Beget и ключ бэкапера SmartApe с принудительной командой"
put_script
PUB=$(ssh -o BatchMode=yes smartape-win 'type C:\linea-ops\secrets\beget_ed25519.pub' | tr -d '\r')
case "$PUB" in ssh-ed25519\ *linea-backup@smartape) ;; *) die "на SmartApe нет ключа — сначала ./tools/ops/install-smartape.sh";; esac
RH=$(ssh -o BatchMode=yes "$B" 'echo $HOME')
LINE="command=\"nice -n 19 bash $RH/linea-ops/beget-dump.sh\",no-pty,no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-user-rc,from=\"$FROM\" $PUB"
# строка ровно такая — ничего не делаем; иначе копия (до секунд, без перезаписи), старые строки ключа убираются, новая — одна
printf '%s\n' "$LINE" | ssh -o BatchMode=yes "$B" 'set -e; mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys
  NEW=$(cat); AK=~/.ssh/authorized_keys
  if grep -qxF "$NEW" "$AK"; then echo "  ключ уже с принудительной командой"; exit 0; fi
  BK="$AK.bak-$(date +%Y%m%d-%H%M%S)"; n=1; while [ -e "$BK" ]; do BK="$AK.bak-$(date +%Y%m%d-%H%M%S)-$n"; n=$((n+1)); done
  cp -p "$AK" "$BK"
  { grep -vF "linea-backup@smartape" "$AK" || true; printf "%s\n" "$NEW"; } > "$AK.new" && chmod 600 "$AK.new" && mv -f "$AK.new" "$AK"
  echo "  ключ записан с command=…beget-dump.sh (копия $(basename "$BK"))"'
# проверка с SmartApe: разрешённый режим проходит, произвольная команда отвергается
SSHW='C:\Windows\System32\OpenSSH\ssh.exe -i C:\linea-ops\secrets\beget_ed25519 -o UserKnownHostsFile=C:\linea-ops\secrets\known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=30 -T'
BU=$(ssh -o BatchMode=yes "$B" 'whoami'); BH="${BEGET_HOST:-gandalf.beget.com}"
ssh -o BatchMode=yes smartape-win "$SSHW $BU@$BH check" | tr -d '\r' | grep -q '^ok ' && echo "  с SmartApe: check — ok" || die "с SmartApe режим check не прошёл (known_hosts? from=?)"
if ssh -o BatchMode=yes smartape-win "$SSHW $BU@$BH id" 2>/dev/null | tr -d '\r' | grep -q 'uid='; then die "ключ SmartApe выполняет произвольные команды — принудительная команда не действует"; fi
echo "  с SmartApe: произвольная команда отвергнута"

say "3/6 Первый боевой бэкап на SmartApe"
ssh -o BatchMode=yes smartape-win 'set LINEA_OPS_HOME=C:\linea-ops&& "C:\Program Files\nodejs\node.exe" C:\linea-ops\tools\bk.mjs backup 2>&1 & "C:\Program Files\nodejs\node.exe" C:\linea-ops\tools\bk.mjs status' | tee /dev/stderr | grep -q '"ok": true' \
  || die "бэкап не прошёл — см. вывод выше (C:\\linea-ops\\logs\\backup.log). Частая причина: SmartApe не достучался до Beget по SSH."

say "4/6 Задача LineaBackup (ежедневно 04:20) и проверка свежести в мониторе"
ssh -o BatchMode=yes smartape-win 'schtasks /create /tn LineaBackup /tr "C:\linea-ops\tools\run-backup.cmd" /sc daily /st 04:20 /ru SYSTEM /rl HIGHEST /f && "C:\Program Files\nodejs\node.exe" -e "const f=String.raw`C:\linea-ops\ops.json`,fs=require(`fs`);const j=JSON.parse(fs.readFileSync(f,`utf8`));j.expectBackup=true;fs.writeFileSync(f,JSON.stringify(j,null,2));console.log(`  expectBackup=true`)"'
# токен мониторинга: Beget → SmartApe по каналу ssh, на экран не выводится (нужен для проверки cron и подробностей ping.php)
if ssh -o BatchMode=yes "$B" '/usr/local/bin/php8.2 -r '\''$c = require getenv("HOME") . "/dizain-studiya-kvartir/linea-private/config.php"; $t = (string)($c["monitor_token"] ?? ""); if (strlen($t) < 24) exit(1); echo $t;'\''' \
   | ssh -o BatchMode=yes smartape-win "$NODE -e \"let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{d=d.trim();if(d.length<24)process.exit(1);require('fs').writeFileSync(String.raw\`C:\linea-ops\secrets\monitor.token\`,d);console.log('  monitor.token записан')})\""; then :; else
  echo "  токена мониторинга в config нет — сначала tools/vykladka-kabinety.sh, затем повторить этот скрипт (проверка cron пока «внимание»)"; fi

say "5/6 Проверка восстановления (мак, временная папка)"
"$REPO/tools/ops/restore-check.sh" || echo "  ВНИМАНИЕ: проверка восстановления не прошла — разобрать до первой оплаты"

say "6/6 DNS домена и план записей почты (без изменений)"
python3 -I "$REPO/tools/ops/dns-mail-plan.py" || true
echo
echo "Готово. Пароль архивов хранится только на SmartApe (C:\\linea-ops\\secrets\\backup.pass) — скопируйте его в менеджер паролей (см. docs/ops/bekapy-i-monitoring.md)."
