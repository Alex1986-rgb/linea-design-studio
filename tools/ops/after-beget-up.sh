#!/usr/bin/env bash
# LINEA · ОДНА КОМАНДА после восстановления Beget: включить боевой бэкап и проверить его.
#
#   ./tools/ops/after-beget-up.sh                 (запускает Александр с мака; ~5 минут)
#   ./tools/ops/after-beget-up.sh --only-script   только обновить ~/linea-ops/beget-dump.sh на Beget (после правки скрипта в репо)
#   ./tools/ops/after-beget-up.sh --target=vps [--only-script]
#       то же для VPS SmartApe (переезд, ноябрь 2026): ssh sm-vps (root), скрипт → /srv/beget/linea-ops/beget-dump.sh,
#       ключ бэкапера с принудительной командой → /root/.ssh/authorized_keys (LINEA_ROOT=/srv/beget/dizain-studiya-kvartir;
#       дамп базы aleks2si_linea под root через сокет MariaDB — см. beget-dump.sh), ops.json на SmartApe получает
#       "source": "vps", первый бэкап снимается уже с VPS. Шаг 6 (DNS) — одинаков. То же: DEPLOY_TARGET=vps.
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
FROM="${BEGET_FROM:-94.198.55.117}"
TARGET="${DEPLOY_TARGET:-beget}"; ONLY_SCRIPT=0
for a in "$@"; do case "$a" in --only-script) ONLY_SCRIPT=1;; --target=*) TARGET="${a#--target=}";; *) echo "ключи: --only-script | --target=beget|vps"; exit 2;; esac; done
say() { printf '\n\033[1m» %s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*"; exit 1; }
NODE='"C:\Program Files\nodejs\node.exe"'
# Источник дампа. Beget: пути от домашней папки аккаунта («~» раскрывает удалённая оболочка), php 8.2 Beget, хост для
# ключа SmartApe — gandalf.beget.com. VPS: ssh root-ом на sm-vps, копия в /srv/beget, системный php 8.3, SmartApe ходит
# по IP; принудительная команда ключа задаёт LINEA_ROOT, чтобы beget-dump.sh не искал ~/dizain-studiya-kvartir у root.
case "$TARGET" in
  # shellcheck disable=SC2088  # тильду раскрывает удалённая оболочка Beget
  beget) B="${BEGET_SSH:-beget-en0}"; SRC_NAME=Beget; OPS_DIR='~/linea-ops'; PRIV='~/dizain-studiya-kvartir/linea-private'; PHP=/usr/local/bin/php8.2
         BH="${BEGET_HOST:-gandalf.beget.com}"; FORCED_PREFIX="" ;;
  vps)   B="${VPS_SSH_HOST:-sm-vps}"; SRC_NAME=VPS; OPS_DIR="${VPS_ROOT:-/srv/beget}/linea-ops"; PRIV="${VPS_ROOT:-/srv/beget}/dizain-studiya-kvartir/linea-private"; PHP=php
         BH="${VPS_IP:-45.154.185.168}"; FORCED_PREFIX="LINEA_ROOT=${VPS_ROOT:-/srv/beget}/dizain-studiya-kvartir " ;;
  *) die "неизвестная цель --target=$TARGET (знаю beget и vps)" ;;
esac
# VPS при включённом VPN (маршрут через utun): ssh в обход через en0, иначе туннель рвёт соединение (у beget-en0 это в ~/.ssh/config)
BIND=()
if [ "$TARGET" = vps ]; then case "$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')" in
  utun*|ppp*|ipsec*|tun*) ip=$(ipconfig getifaddr "${BEGET_BIND:-en0}" 2>/dev/null || true); [ -n "$ip" ] && BIND=(-b "$ip") ;; esac; fi

# После аварии 02–03.11 Beget рвёт частые SSH-подключения («Connection closed by … port 22»). Поэтому к Beget держим ОДНО
# соединение (ControlMaster) на весь скрипт: открываем его заранее с повторами, все ssh к "$B" идут по нему без новых рукопожатий.
# Повтор отдельных команд не делаем — часть из них передаёт файл через stdin, и повтор отправил бы пустой файл.
CM="/tmp/linea-ab-$$"
# через общее соединение — только команды, где хост (первый аргумент не-опция) — Beget; к SmartApe — обычный ssh
ssh() { local a host="" skip=0; for a in "$@"; do
          if [ "$skip" = 1 ]; then skip=0; continue; fi
          case "$a" in -o|-i|-p|-l|-F|-b) skip=1 ;; -*) ;; *) host="$a"; break ;; esac; done
        if [ "$host" = "$B" ]; then
          command ssh "${BIND[@]}" -o ControlMaster=auto -o ControlPath="$CM" -o ControlPersist=600 -o ServerAliveInterval=15 "$@"
        else command ssh "$@"; fi; }
open_master() { local i; for i in 1 2 3 4 5; do
    command ssh "${BIND[@]}" -o BatchMode=yes -o ConnectTimeout=20 -o ControlMaster=yes -o ControlPath="$CM" -o ControlPersist=600 -fN "$B" && return 0
    echo "  ! SSH до $SRC_NAME не открылся (попытка $i), повтор через $((i*15)) с" >&2; sleep $((i*15)); done; return 1; }
trap 'command ssh -o ControlPath="$CM" -O exit "$B" 2>/dev/null || true' EXIT
open_master || die "SSH до $SRC_NAME не открывается — повторить позже"

# beget-dump.sh → $OPS_DIR на сервере: временный файл + mv, затем сверка sha256 с репозиторием
put_script() {
  local want got
  want=$(shasum -a 256 "$REPO/tools/ops/beget-dump.sh" | cut -d' ' -f1)
  ssh -o BatchMode=yes "$B" "mkdir -p $OPS_DIR && chmod 700 $OPS_DIR && cat > $OPS_DIR/.beget-dump.sh.new && chmod 500 $OPS_DIR/.beget-dump.sh.new && mv -f $OPS_DIR/.beget-dump.sh.new $OPS_DIR/beget-dump.sh" \
    < "$REPO/tools/ops/beget-dump.sh" || die "не удалось положить beget-dump.sh на $SRC_NAME"
  got=$(ssh -o BatchMode=yes "$B" "bash $OPS_DIR/beget-dump.sh version" | sed -n 's/^beget-dump //p')
  [ "$got" = "$want" ] || die "beget-dump.sh на $SRC_NAME не совпал с репозиторием ($got)"
  echo "  $OPS_DIR/beget-dump.sh на месте, sha256 ${want:0:12}…"
}
if [ "$ONLY_SCRIPT" = 1 ]; then say "Обновление beget-dump.sh на $SRC_NAME"; put_script; exit 0; fi

say "1/6 $SRC_NAME отвечает?"
ssh -o BatchMode=yes -o ConnectTimeout=15 "$B" "echo \"  ok: \$(hostname)\"; command -v mysqldump >/dev/null && echo '  mysqldump есть' || echo '  mysqldump нет — будет PHP-дамп'; test -f $PRIV/config.php && echo '  config.php на месте' || echo '  ! config.php НЕ найден: $PRIV'" \
  || die "$SRC_NAME по SSH не отвечает — DNS/сервер ещё лежат. Повторить позже."
# на VPS дамп базы идёт под root через сокет — проверяем, что сокет отвечает (иначе beget-dump.sh возьмёт пароль из config.php)
[ "$TARGET" = vps ] && { ssh -o BatchMode=yes "$B" "mysql --protocol=socket -N -e 'SELECT 1' >/dev/null 2>&1 && echo '  MariaDB под root через сокет отвечает' || echo '  ! MariaDB через сокет не отвечает — дамп пойдёт с паролем из config.php'"; }

say "2/6 beget-dump.sh на $SRC_NAME и ключ бэкапера SmartApe с принудительной командой"
put_script
PUB=$(ssh -o BatchMode=yes smartape-win 'type C:\linea-ops\secrets\beget_ed25519.pub' | tr -d '\r')
case "$PUB" in ssh-ed25519\ *linea-backup@smartape) ;; *) die "на SmartApe нет ключа — сначала ./tools/ops/install-smartape.sh";; esac
RH=$(ssh -o BatchMode=yes "$B" 'echo $HOME')
if [ "$TARGET" = vps ]; then SCRIPT_PATH="$OPS_DIR/beget-dump.sh"; else SCRIPT_PATH="$RH/linea-ops/beget-dump.sh"; fi
LINE="command=\"${FORCED_PREFIX}nice -n 19 bash $SCRIPT_PATH\",no-pty,no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-user-rc,from=\"$FROM\" $PUB"
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
BU=$(ssh -o BatchMode=yes "$B" 'whoami')
ssh -o BatchMode=yes smartape-win "$SSHW $BU@$BH check" | tr -d '\r' | grep -q '^ok ' && echo "  с SmartApe: check — ok" || die "с SmartApe режим check не прошёл (known_hosts для $BH? from=?)"
if ssh -o BatchMode=yes smartape-win "$SSHW $BU@$BH id" 2>/dev/null | tr -d '\r' | grep -q 'uid='; then die "ключ SmartApe выполняет произвольные команды — принудительная команда не действует"; fi
echo "  с SmartApe: произвольная команда отвергнута"

say "3/6 Первый боевой бэкап на SmartApe (источник: $SRC_NAME)"
# бэкапер берёт источник из ops.json → source; на VPS переключаем его перед первым прогоном (host/user — умолчания lib.mjs)
if [ "$TARGET" = vps ]; then
  ssh -o BatchMode=yes smartape-win "$NODE -e \"const f=String.raw\`C:\linea-ops\ops.json\`,fs=require('fs');const j=JSON.parse(fs.readFileSync(f,'utf8'));j.source='vps';fs.writeFileSync(f,JSON.stringify(j,null,2));console.log('  ops.json: source=vps')\""
fi
ssh -o BatchMode=yes smartape-win 'set LINEA_OPS_HOME=C:\linea-ops&& "C:\Program Files\nodejs\node.exe" C:\linea-ops\tools\bk.mjs backup 2>&1 & "C:\Program Files\nodejs\node.exe" C:\linea-ops\tools\bk.mjs status' | tee /dev/stderr | grep -q '"ok": true' \
  || die "бэкап не прошёл — см. вывод выше (C:\\linea-ops\\logs\\backup.log). Частая причина: SmartApe не достучался до Beget по SSH."

say "4/6 Задача LineaBackup (ежедневно 04:20) и проверка свежести в мониторе"
ssh -o BatchMode=yes smartape-win 'schtasks /create /tn LineaBackup /tr "C:\linea-ops\tools\run-backup.cmd" /sc daily /st 04:20 /ru SYSTEM /rl HIGHEST /f && "C:\Program Files\nodejs\node.exe" -e "const f=String.raw`C:\linea-ops\ops.json`,fs=require(`fs`);const j=JSON.parse(fs.readFileSync(f,`utf8`));j.expectBackup=true;fs.writeFileSync(f,JSON.stringify(j,null,2));console.log(`  expectBackup=true`)"'
# токен мониторинга: Beget → SmartApe по каналу ssh, на экран не выводится (нужен для проверки cron и подробностей ping.php)
if ssh -o BatchMode=yes "$B" "cd $PRIV && $PHP -r "\''$c = require "config.php"; $t = (string)($c["monitor_token"] ?? ""); if (strlen($t) < 24) exit(1); echo $t;'\' \
   | ssh -o BatchMode=yes smartape-win "$NODE -e \"let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{d=d.trim();if(d.length<24)process.exit(1);require('fs').writeFileSync(String.raw\`C:\linea-ops\secrets\monitor.token\`,d);console.log('  monitor.token записан')})\""; then :; else
  echo "  токена мониторинга в config нет — сначала tools/vykladka-kabinety.sh${TARGET:+ --target=$TARGET}, затем повторить этот скрипт (проверка cron пока «внимание»)"; fi

say "5/6 Проверка восстановления (мак, временная папка)"
"$REPO/tools/ops/restore-check.sh" || echo "  ВНИМАНИЕ: проверка восстановления не прошла — разобрать до первой оплаты"

say "6/6 DNS домена и план записей почты (без изменений)"
python3 -I "$REPO/tools/ops/dns-mail-plan.py" || true
echo
echo "Готово. Пароль архивов хранится только на SmartApe (C:\\linea-ops\\secrets\\backup.pass) — скопируйте его в менеджер паролей (см. docs/ops/bekapy-i-monitoring.md)."
