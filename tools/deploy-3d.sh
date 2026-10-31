#!/usr/bin/env bash
#
# Выкладка 3D-просмотрщика заказчика на Beget: поддомен 3d.дизайн-студия-квартир.рф.
# ПО УМОЛЧАНИЮ — ПРОБНЫЙ ПРОГОН: ничего не отправляется и не меняется на сервере. Боевой запуск — только с --go.
#
#   ./tools/deploy-3d.sh --token <токен> --from-server D:/client-3d-out [--dry-run]   # забрать папку со SmartApe и показать план
#   ./tools/deploy-3d.sh --src <локальная папка с <токен>/ и <токен>.info.json> --all   # то же из локальной папки
#   ./tools/deploy-3d.sh … --go                                                         # реально залить (после «да» Александра)
#   ./tools/deploy-3d.sh --check                                                        # только связь и прозвон адреса
#
# Что делает (по образцу tools/deploy-beget.sh):
#   1. Берёт готовую папку заказчика (её собирает scripts/client-viewer/make-client-bundle.mjs на SmartApe: токен 32 знака,
#      пароль 6 знаков, шифрование AES-GCM) — локально, из --src или со SmartApe по ssh (tar, только чтение).
#   2. Проверяет папку: нужные файлы, нет *.info.json внутри (там пароль), нет внешних адресов, токен не «TEST…»
#      (тестовые сборки без --allow-test не публикуются).
#   3. На каждый проект делает карточку для альбома (tools/3d/card.mjs): QR со ссылкой, пароль, срок. Карточка с паролем
#      остаётся у студии (.deploy/3d/cards/<токен>/), на сервер НЕ едет.
#   4. Заливает ПАРТИЯМИ (≤ BATCH_MB МБ / ≤ BATCH_N файлов, пауза BATCH_PAUSE с): rsync --files-from, при обрыве — повтор,
#      потом tar | ssh. Корневые .htaccess (301 на https, запрет листинга, noindex) и robots.txt кладёт один раз.
#   5. Сверяет размеры каждого файла и прозванивает https-адрес (страница, scene.enc, config.json, чужой каталог закрыт),
#      http должен уводить на https.
#
# Просмотрщик работает только по https (WebCrypto): по http страница показывает понятное сообщение и кнопку «Открыть по https».
#
# Переменные: LINEA_SSH_HOST (beget-en0), LINEA_3D_DOCROOT (3d-linea/public_html — каталог сайта поддомена; создаётся в панели/API
#             Beget: site/add + привязка поддомена, это мутация аккаунта — только после «да»), LINEA_3D_HOST (3d.<punycode домена>),
#             SMARTAPE_HOST (smartape-win), BATCH_MB=40 BATCH_N=300 BATCH_PAUSE=3, BEGET_BIND=en0.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${LINEA_SSH_HOST:-beget-en0}"
DOCROOT="${LINEA_3D_DOCROOT:-3d-linea/public_html}"
WEB_HOST="${LINEA_3D_HOST:-$(node -e "process.stdout.write(require('url').domainToASCII('3d.дизайн-студия-квартир.рф'))")}"
SMARTAPE="${SMARTAPE_HOST:-smartape-win}"
BATCH_MB="${BATCH_MB:-40}" BATCH_N="${BATCH_N:-300}" BATCH_PAUSE="${BATCH_PAUSE:-3}"
WORK="$ROOT/.deploy/3d"

ORIG_ARGS=("$@")
GO=0 CHECK=0 ALL=0 ALLOW_TEST=0 SRC="" FROM_SERVER="" TOKENS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --go) GO=1 ;;
    --dry-run) GO=0 ;;
    --check) CHECK=1 ;;
    --all) ALL=1 ;;
    --allow-test) ALLOW_TEST=1 ;;
    --src) SRC="$2"; shift ;;
    --src=*) SRC="${1#--src=}" ;;
    --from-server) FROM_SERVER="$2"; shift ;;
    --from-server=*) FROM_SERVER="${1#--from-server=}" ;;
    --token) TOKENS+=("$2"); shift ;;
    --token=*) TOKENS+=("${1#--token=}") ;;
    -h|--help) awk 'NR>1 { if (/^#/) { sub(/^# ?/, ""); print } else exit }' "$0"; exit 0 ;;
    *) echo "Неизвестный ключ: $1 (см. --help)" >&2; exit 2 ;;
  esac
  shift
done

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31mОстановился:\033[0m %s\n' "$*" >&2; exit 1; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/linea-3d.XXXXXX")
CM="/tmp/linea-3d-$$.sock"
SSH_OPTS=(-o ControlMaster=auto -o "ControlPath=$CM" -o ControlPersist=300 -o ConnectTimeout=25
          -o ServerAliveInterval=10 -o ServerAliveCountMax=6 -o BatchMode=yes)
BIP="" BIF=""
cleanup() { command ssh -o "ControlPath=$CM" -O exit "$HOST" 2>/dev/null; rm -rf "$TMP" "$CM"; }
trap cleanup EXIT

if [ "$GO" = 1 ]; then say "РЕЖИМ: БОЕВОЙ (--go)"; else say "РЕЖИМ: пробный прогон (на Beget ничего не меняется; для заливки — --go)"; fi
echo "  поддомен:  https://$WEB_HOST/"
echo "  сервер:    ssh $HOST → ~/$DOCROOT"

# ─────────────────────────────────────────────── 1. Связь (только чтение)
say "1. Связь с Beget"
IFACE=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
case "$IFACE" in
  utun*|ppp*|ipsec*|tun*)
    BIF="${BEGET_BIND:-en0}"; BIP=$(ipconfig getifaddr "$BIF" 2>/dev/null)
    if [ -n "$BIP" ]; then ok "включён VPN ($IFACE) — иду в обход через $BIF ($BIP)"
    else warn "трафик через туннель ($IFACE), у $BIF нет адреса — выключите VPN или задайте BEGET_BIND"; fi ;;
  *) ok "прямое подключение через ${IFACE:-?}" ;;
esac
[ -n "$BIP" ] && SSH_OPTS+=(-b "$BIP")
rssh()  { command ssh "${SSH_OPTS[@]}" "$HOST" "$@"; }
ccurl() { if [ -n "$BIP" ]; then command curl --interface "$BIF" "$@"; else command curl "$@"; fi; }

REMOTE_OK=0
if rssh true 2>/dev/null; then
  ok "SSH до $HOST работает"; REMOTE_OK=1
  if rssh "test -d '$DOCROOT'"; then ok "каталог ~/$DOCROOT на месте"; DOCROOT_OK=1
  else
    DOCROOT_OK=0; warn "каталога ~/$DOCROOT на сервере ещё нет: поддомен не создан (site/add + привязка 3d.…) — это мутация аккаунта, нужно «да»"
    [ "$GO" = 1 ] && die "нет каталога ~/$DOCROOT — боевой запуск невозможен"
  fi
else
  DOCROOT_OK=0
  [ "$GO" = 1 ] && die "SSH до $HOST не отвечает"
  warn "SSH до $HOST не ответил — в пробном прогоне это не мешает, сверка с сервером пропущена"
fi

probe() {   # адрес → код и тип
  ccurl -s -o /dev/null -w '%{http_code} %{content_type} %{size_download}' -m 40 "$1" 2>/dev/null || echo "000"
}

if [ "$CHECK" = 1 ]; then
  say "Прозвон https://$WEB_HOST/"
  code=$(probe "https://$WEB_HOST/"); echo "  https://$WEB_HOST/ — $code"
  code=$(ccurl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' -m 40 "http://$WEB_HOST/" 2>/dev/null || echo 000); echo "  http://$WEB_HOST/ — $code"
  exit 0
fi

# ─────────────────────────────────────────────── 2. Папки заказчика
say "2. Папки заказчика"
IN="$WORK/in"; CARDS="$WORK/cards"; mkdir -p "$IN" "$CARDS"
if [ -n "$FROM_SERVER" ]; then
  [ "${#TOKENS[@]}" -gt 0 ] || die "с --from-server нужен хотя бы один --token"
  for t in "${TOKENS[@]}"; do
    [[ "$t" =~ ^[A-Za-z0-9_-]{22,}$ ]] || die "токен «$t» не похож на токен"
    rm -rf "$IN/$t" "$IN/$t.info.json"
    # только чтение на SmartApe: tar создаёт поток, ничего не пишет и не удаляет
    ssh -o BatchMode=yes -o ConnectTimeout=25 "$SMARTAPE" "tar -cf - -C $FROM_SERVER $t $t.info.json" | tar -xf - -C "$IN" 2>/dev/null \
      || die "не забрал $t из $SMARTAPE:$FROM_SERVER"
    ok "забрано со SmartApe: $t"
  done
  SRC="$IN"
fi
[ -n "$SRC" ] || die "нужен --src <папка> или --from-server <путь на SmartApe> --token …"
SRC=$(cd "$SRC" && pwd)
if [ "$ALL" = 1 ]; then
  TOKENS=(); for d in "$SRC"/*/; do [ -f "$d/scene.enc" ] && TOKENS+=("$(basename "$d")"); done
fi
[ "${#TOKENS[@]}" -gt 0 ] || die "нет папок заказчика (--token или --all)"

PASS=()
for t in "${TOKENS[@]}"; do
  D="$SRC/$t"
  [ -d "$D" ] || die "нет папки $D"
  [[ "$t" =~ ^[A-Za-z0-9_-]{22,}$ ]] || die "имя папки «$t» не похоже на токен (22+ знака base64url)"
  if [[ "$t" == TESTtoken* ]] && [ "$ALLOW_TEST" = 0 ]; then bad "$t — тестовая сборка, не публикую (нужен --allow-test)"; continue; fi
  for need in index.html scene.enc config.json .htaccess LICENSE; do [ -e "$D/$need" ] || die "$t: нет $need"; done
  find "$D" -name '*.info.json' | grep -q . && die "$t: внутри лежит *.info.json (пароль!) — публиковать нельзя"
  grep -rIl 'ZZTOKENZZ' "$D" >/dev/null 2>&1 && die "$t: остался маркер ZZTOKENZZ"
  EXT=$(grep -rIhoE 'https?://[A-Za-z0-9.-]+' "$D" --include=index.html --include=config.json 2>/dev/null | grep -v -E "localhost|127\.0\.0\.1|www\.w3\.org" | sort -u | head -3)
  [ -n "$EXT" ] && warn "$t: в index/config есть внешние адреса: $(echo $EXT | tr '\n' ' ')"
  [ -f "$SRC/$t.info.json" ] || die "$t: нет $t.info.json рядом (пароль и срок для карточки)"
  EXP=$(node -e "const i=require('$SRC/$t.info.json');process.stdout.write(i.expires||'')")
  [ -n "$EXP" ] || die "$t: в info.json нет срока"
  node -e "process.exit(Date.parse('$EXP')>Date.now()?0:1)" || die "$t: срок $EXP уже прошёл"
  N=$(find "$D" -type f | wc -l | tr -d ' '); S=$(du -sk "$D" | cut -f1)
  ok "$t: $N файлов, $((S / 1024)) МБ, срок до $(node -e "process.stdout.write(new Date('$EXP').toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'}))")"
  PASS+=("$t")
done
[ "${#PASS[@]}" -gt 0 ] || die "публиковать нечего"

# ─────────────────────────────────────────────── 3. QR и пароль
say "3. Карточки с QR и паролем (остаются у студии)"
for t in "${PASS[@]}"; do
  node "$ROOT/tools/3d/card.mjs" --info "$SRC/$t.info.json" --host "$WEB_HOST" --out "$CARDS/$t" | sed 's/^/  /'
done

# ─────────────────────────────────────────────── 4. План партий
say "4. План заливки"
ROOTFILES="$TMP/root"; mkdir -p "$ROOTFILES"
cat > "$ROOTFILES/.htaccess" <<'HT'
# LINEA 3D: только https (WebCrypto), без листинга и индексации.
Options -Indexes
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} off
  RewriteCond %{HTTP:X-Forwarded-Proto} !https
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteCond %{REQUEST_URI} !/$
  RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1/ [R=301,L]
</IfModule>
<IfModule mod_headers.c>
  Header set X-Robots-Tag "noindex, nofollow, noarchive"
</IfModule>
HT
printf 'User-agent: *\nDisallow: /\n' > "$ROOTFILES/robots.txt"

for t in "${PASS[@]}"; do
  ( cd "$SRC/$t" && find . -type f -print0 | xargs -0 stat -f '%N%t%z' | sed "s|^\./|$t/|" | LC_ALL=C sort ) >> "$TMP/all.tsv"
done
if [ "$REMOTE_OK" = 1 ] && [ "${DOCROOT_OK:-0}" = 1 ]; then
  rssh "cd '$DOCROOT' && find . -type f -printf '%P\t%s\n'" | tr -d '\r' | LC_ALL=C sort > "$TMP/remote.tsv"
else : > "$TMP/remote.tsv"; fi
LC_ALL=C sort "$TMP/all.tsv" | LC_ALL=C comm -23 - "$TMP/remote.tsv" > "$TMP/todo.tsv"
N=$(wc -l < "$TMP/todo.tsv" | tr -d ' ')
MB=$(awk -F'\t' '{ s += $2 } END { printf "%.1f", s / 1048576 }' "$TMP/todo.tsv")
ok "к отправке $N файлов, $MB МБ (на сервере уже $(wc -l < "$TMP/remote.tsv" | tr -d ' '))"
awk -F'\t' -v lim=$((BATCH_MB * 1048576)) -v maxn="$BATCH_N" -v dir="$TMP" '
  { if (n > 0 && (s + $2 > lim || n >= maxn)) { b++; s = 0; n = 0 }
    print $1 > (dir "/batch-" sprintf("%04d", b) ".lst"); s += $2; n++ }' "$TMP/todo.tsv"
BATCHES=$(ls "$TMP"/batch-*.lst 2>/dev/null | wc -l | tr -d ' ')
ok "партий: $BATCHES (≤ $BATCH_MB МБ / ≤ $BATCH_N файлов, пауза $BATCH_PAUSE с)"
echo "  корень поддомена: .htaccess (301 на https, без листинга, noindex) и robots.txt (Disallow: /) — если их ещё нет"
echo "  ссылки заказчикам:"; for t in "${PASS[@]}"; do echo "    https://$WEB_HOST/$t/"; done

if [ "$GO" = 0 ]; then
  say "Пробный прогон закончен. На Beget ничего не отправлено и не изменено."
  echo "  боевой запуск: $0 $(printf '%q ' "${ORIG_ARGS[@]}" | sed 's/--dry-run //') --go"
  exit 0
fi

# ─────────────────────────────────────────────── 5. Заливка
say "5. Заливаю"
for f in .htaccess robots.txt; do
  rssh "test -e '$DOCROOT/$f'" || rsync -a -e "ssh ${SSH_OPTS[*]}" "$ROOTFILES/$f" "$HOST:$DOCROOT/" || die "не лёг корневой $f"
done
RSH="ssh ${SSH_OPTS[*]}"
k=0
for lst in "$TMP"/batch-*.lst; do
  [ "$N" = 0 ] && break
  k=$((k + 1)); cnt=$(wc -l < "$lst" | tr -d ' '); done_ok=0
  for try in 1 2 3; do
    if rsync -a --files-from="$lst" -e "$RSH" "$SRC/" "$HOST:$DOCROOT/" 2>"$TMP/rsync.err"; then done_ok=1; break; fi
    warn "партия $k: rsync оборвался ($(tail -1 "$TMP/rsync.err")), повтор $try"; sleep $((try * 8))
  done
  if [ "$done_ok" = 0 ]; then
    for try in 1 2; do
      if ( cd "$SRC" && COPYFILE_DISABLE=1 tar --no-mac-metadata -cf - -T "$lst" ) | rssh "tar -xmf - -C '$DOCROOT'"; then done_ok=1; break; fi
      warn "партия $k: tar | ssh не прошёл, повтор $try"; sleep 15
    done
  fi
  [ "$done_ok" = 1 ] || die "партия $k ($cnt файлов) не залилась. Повторите запуск — залитое не поедет второй раз"
  ok "партия $k/$BATCHES: $cnt файлов"
  [ "$k" -lt "$BATCHES" ] && sleep "$BATCH_PAUSE"
done

# ─────────────────────────────────────────────── 6. Сверка и прозвон
say "6. Сверка размеров"
rssh "cd '$DOCROOT' && find . -type f -printf '%P\t%s\n'" | tr -d '\r' | LC_ALL=C sort > "$TMP/remote2.tsv"
MISS=$(LC_ALL=C sort "$TMP/all.tsv" | LC_ALL=C comm -23 - "$TMP/remote2.tsv" | wc -l | tr -d ' ')
[ "$MISS" = 0 ] && ok "все $(wc -l < "$TMP/all.tsv" | tr -d ' ') файлов на сервере, размеры совпали" || die "сверка: $MISS файлов не совпали по размеру или отсутствуют — запустите ещё раз"

say "7. Прозвон https://$WEB_HOST/"
FAIL=0
for t in "${PASS[@]}"; do
  for u in "/$t/" "/$t/config.json" "/$t/scene.enc"; do
    code=$(probe "https://$WEB_HOST$u")
    case "$code" in 200*) ok "$u — $code" ;; *) bad "$u — $code"; FAIL=1 ;; esac
  done
  code=$(probe "https://$WEB_HOST/$t/.htaccess"); case "$code" in 403*|404*) ok ".htaccess закрыт — $code" ;; *) bad ".htaccess открыт — $code"; FAIL=1 ;; esac
done
code=$(probe "https://$WEB_HOST/"); case "$code" in 403*|404*|200*) ok "корень — $code (листинга нет)" ;; *) bad "корень — $code"; FAIL=1 ;; esac
loc=$(ccurl -s -o /dev/null -w '%{http_code} %{redirect_url}' -m 40 "http://$WEB_HOST/${PASS[0]}/" 2>/dev/null)
case "$loc" in 301*https://*) ok "http уводит на https — $loc" ;; *) bad "http не уводит на https — $loc"; FAIL=1 ;; esac
[ "$FAIL" = 0 ] || die "прозвон нашёл проблемы (выше)"
say "Готово. Карточки с QR и паролем: $CARDS/<токен>/card.html"
