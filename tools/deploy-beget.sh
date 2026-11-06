#!/usr/bin/env bash
#
# Выкладка сайта LINEA на Beget (аккаунт aleks2si, сайт «dizain-studiya-kvartir»).
#
#   ./tools/deploy-beget.sh                    # боевой https://дизайн-студия-квартир.рф (по умолчанию с 06.11.2026)
#   ./tools/deploy-beget.sh --site=preview     # сборка под технический адрес (robots закрыт!) — ОПАСНО: та же папка, что у домена,
#                                              # домен получит запрет индексации; скрипт требует LINEA_ALLOW_PREVIEW=1
#   ./tools/deploy-beget.sh --dry-run          # показать, что поедет, ничего не менять
#   ./tools/deploy-beget.sh --check            # только связь, папка и прозвон живого адреса
#   ./tools/deploy-beget.sh --prune            # убрать с сайта файлы, которых нет в выпуске (не удаляет: переносит в <docroot>_backup/<дата>/ вне веб-корня)
#
# Как устроено:
#   1. tools/site-rebase.js собирает копию site/ под нужный адрес в .deploy/<site>/ (canonical, sitemap, robots,
#      schema.org, .htaccess). Сама site/ остаётся под GitHub Pages — их можно держать одновременно.
#   2. Связь — одно SSH-соединение на весь прогон (Beget рвёт частые новые подключения), при включённом VPN
#      — в обход через en0 (BEGET_BIND).
#   3. Заливаются только изменившиеся файлы (сверка размера и времени со списком на сервере), ПАРТИЯМИ:
#      не больше BATCH_MB мегабайт / BATCH_N файлов, пауза BATCH_PAUSE с между партиями. Каждая партия —
#      rsync --files-from; если rsync оборвался (на Beget это бывает, см. память konsulcar-deploy-base64) —
#      повтор, потом tar | ssh той же партией. PDF альбомов по 20–30 МБ идут отдельными партиями.
#   4. Сверка: каждый файл выпуска есть на сервере с тем же размером. Потом прозвон адресов (и api/ping.php).
#   Приёмник брифа (server/api → public_html/api) кладёт данные в ~/dizain-studiya-kvartir/linea-private — ВНЕ DOCROOT:
#   ни заливка, ни --prune туда не заходят; config.php там правится руками (образец — server/config.example.php).
#
# Переменные: LINEA_SSH_HOST (beget-en0), LINEA_DOCROOT (dizain-studiya-kvartir/public_html),
#             BATCH_MB=40 BATCH_N=300 BATCH_PAUSE=3, BEGET_BIND=en0.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${LINEA_SSH_HOST:-beget-en0}"
DOCROOT="${LINEA_DOCROOT:-dizain-studiya-kvartir/public_html}"
BATCH_MB="${BATCH_MB:-40}" BATCH_N="${BATCH_N:-300}" BATCH_PAUSE="${BATCH_PAUSE:-3}"
MARK=".linea-deploy"

SITE=domain DRY=0 ONLY_CHECK=0 PRUNE=0
for a in "$@"; do
  case "$a" in
    --site=*) SITE="${a#--site=}" ;;
    --dry-run) DRY=1 ;;
    --check) ONLY_CHECK=1 ;;
    --prune) PRUNE=1 ;;
    -h|--help) awk 'NR>1 { if (/^#/) { sub(/^# ?/, ""); print } else exit }' "$0"; exit 0 ;;
    *) echo "Неизвестный ключ: $a (см. --help)" >&2; exit 2 ;;
  esac
done
if [ "$SITE" = preview ] && [ "${LINEA_ALLOW_PREVIEW:-0}" != 1 ]; then
  echo "Сборка preview закрывает сайт от поиска, а папка на Beget общая с доменом. Нужно — LINEA_ALLOW_PREVIEW=1 $0 --site=preview" >&2; exit 2
fi
OUT="$ROOT/.deploy/$SITE"
BASE=$(cd "$ROOT" && LINEA_SITE="$SITE" node -e "process.stdout.write(require('./tools/site-shell.js').BASE)") \
  || { echo "Нет адреса для --site=$SITE (см. SITE_BASES в tools/site-shell.js)" >&2; exit 2; }

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31mОстановился:\033[0m %s\n' "$*" >&2; exit 1; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/linea-deploy.XXXXXX")
CM="/tmp/linea-deploy-$$.sock"   # короткий путь: у unix-сокета предел ~104 знака
SSH_OPTS=(-o ControlMaster=auto -o "ControlPath=$CM" -o ControlPersist=300 -o ConnectTimeout=25
          -o ServerAliveInterval=10 -o ServerAliveCountMax=6 -o BatchMode=yes)
BIP=""
cleanup() { command ssh -o "ControlPath=$CM" -O exit "$HOST" 2>/dev/null; rm -rf "$TMP" "$CM"; }
trap cleanup EXIT

# ─────────────────────────────────────────────── 1. Копия под адрес
if [ "$ONLY_CHECK" = 1 ]; then
  say "1. Копию не собираю (режим проверки)"
else
  say "1. Собираю копию сайта под $BASE"
  ( cd "$ROOT" && node tools/site-rebase.js --site="$SITE" ) || die "site-rebase упал"
  [ -f "$OUT/index.html" ] || die "нет $OUT/index.html"
  grep -q "^Sitemap: $BASE/sitemap.xml" "$OUT/robots.txt" || [ "$SITE" = preview ] || die "robots.txt собран не под $BASE"
  grep -q "<loc>$BASE/" "$OUT/sitemap.xml" || die "sitemap.xml собран не под $BASE"
  ok "к заливке: $(find "$OUT" -type f | wc -l | tr -d ' ') файлов, $(du -sh "$OUT" | cut -f1 | tr -d ' ')"
fi

# ─────────────────────────────────────────────── 2. Связь
say "2. Связь с Beget"
IFACE=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
case "$IFACE" in
  utun*|ppp*|ipsec*|tun*)
    BIF="${BEGET_BIND:-en0}"; BIP=$(ipconfig getifaddr "$BIF" 2>/dev/null)
    if [ -n "$BIP" ]; then ok "включён VPN ($IFACE) — иду в обход через $BIF ($BIP)"
    else warn "трафик через туннель ($IFACE), у $BIF нет адреса — выключите VPN или задайте BEGET_BIND"; fi ;;
  *) ok "прямое подключение через ${IFACE:-?}" ;;
esac
[ -n "$BIP" ] && SSH_OPTS+=(-b "$BIP")
rssh() { command ssh "${SSH_OPTS[@]}" "$HOST" "$@"; }
ccurl() { if [ -n "$BIP" ]; then command curl --interface "$BIF" "$@"; else command curl "$@"; fi; }

for i in 1 2 3; do
  if rssh true 2>/dev/null; then ok "SSH до $HOST работает"; break; fi
  [ "$i" = 3 ] && die "SSH до $HOST не отвечает (ключ ~/.ssh/beget_myarredo_deploy в ~/.ssh/config, VPN?)"
  warn "SSH не ответил, повтор через $((i * 10)) с"; sleep $((i * 10))
done

rssh "test -d '$DOCROOT'" || die "на сервере нет папки $DOCROOT — сайт создаётся в панели/API Beget (site/add)"
ok "папка $DOCROOT на месте"

# Свежая папка Beget: заглушка index.php (у Apache она главнее index.html) и cgi-bin. Заглушку убираем
# только если папка ещё не наша и в ней ровно заглушка — чужое содержимое без спроса не трогаем.
if rssh "test -f '$DOCROOT/$MARK'"; then
  ok "в папке наш сайт (прошлая заливка: $(rssh "head -1 '$DOCROOT/$MARK'" | tr -d '\r'))"
else
  OTHER=$(rssh "cd '$DOCROOT' && ls -A | grep -v -x -e cgi-bin -e index.php" | tr -d '\r')
  if [ -n "$OTHER" ]; then
    warn "в папке чужие файлы:"; printf '%s\n' "$OTHER" | head -10 | sed 's/^/       /'
    [ "$DRY$ONLY_CHECK" = 00 ] && { printf '     Лить поверх? введите да: '; read -r ans; [ "$ans" = да ] || die "отменено"; }
  fi
  if rssh "test -f '$DOCROOT/index.php' && grep -qi beget '$DOCROOT/index.php'"; then
    if [ "$DRY$ONLY_CHECK" = 00 ]; then rssh "rm -f '$DOCROOT/index.php'" && ok "заглушка Beget index.php убрана"
    else warn "заглушка Beget index.php будет убрана при заливке"; fi
  fi
fi

# ─────────────────────────────────────────────── 3. Заливка партиями
if [ "$ONLY_CHECK" = 0 ]; then
  say "3. Что поменялось"
  # Список файлов: путь<TAB>размер<TAB>время (целые секунды). rsync -a и tar сохраняют время — по нему и сверяем.
  ( cd "$OUT" && find . -type f ! -name "$MARK" -print0 | xargs -0 stat -f '%N%t%z%t%m' | sed 's|^\./||' | LC_ALL=C sort ) > "$TMP/local.tsv"
  rssh "cd '$DOCROOT' && find . -type f -printf '%P\t%s\t%T@\n'" | tr -d '\r' | awk -F'\t' '{ sub(/\..*/, "", $3); print $1 "\t" $2 "\t" $3 }' | LC_ALL=C sort > "$TMP/remote.tsv" \
    || die "не прочитал список файлов на сервере"
  LC_ALL=C comm -23 "$TMP/local.tsv" "$TMP/remote.tsv" > "$TMP/todo.tsv"
  N=$(wc -l < "$TMP/todo.tsv" | tr -d ' ')
  MB=$(awk -F'\t' '{ s += $2 } END { printf "%.1f", s / 1048576 }' "$TMP/todo.tsv")
  ok "к отправке $N файлов, $MB МБ (на сервере уже $(wc -l < "$TMP/remote.tsv" | tr -d ' '))"

  # Партии: по объёму и числу файлов; большой файл (PDF) — сам себе партия.
  awk -F'\t' -v lim=$((BATCH_MB * 1048576)) -v maxn="$BATCH_N" -v dir="$TMP" '
    { if (n > 0 && (s + $2 > lim || n >= maxn)) { b++; s = 0; n = 0 }
      print $1 > (dir "/batch-" sprintf("%04d", b) ".lst"); s += $2; n++ }' "$TMP/todo.tsv"
  BATCHES=$(ls "$TMP"/batch-*.lst 2>/dev/null | wc -l | tr -d ' ')
  [ "$N" = 0 ] && BATCHES=0
  ok "партий: $BATCHES (≤ $BATCH_MB МБ / ≤ $BATCH_N файлов, пауза $BATCH_PAUSE с)"

  if [ "$DRY" = 1 ]; then
    head -20 "$TMP/todo.tsv" | cut -f1,2 | sed 's/^/       /'; [ "$N" -gt 20 ] && echo "       … и ещё $((N - 20))"
    say "Пробный прогон — на сервере ничего не изменилось."; exit 0
  fi

  say "4. Заливаю"
  RSH="ssh ${SSH_OPTS[*]}"
  k=0
  for lst in "$TMP"/batch-*.lst; do
    [ "$N" = 0 ] && break
    k=$((k + 1)); cnt=$(wc -l < "$lst" | tr -d ' ')
    sz=$(cd "$OUT" && tr '\n' '\0' < "$lst" | xargs -0 stat -f '%z' | awk '{ s += $1 } END { printf "%.1f", s / 1048576 }')
    done_ok=0
    for try in 1 2 3; do
      if rsync -a --files-from="$lst" -e "$RSH" "$OUT/" "$HOST:$DOCROOT/" 2>"$TMP/rsync.err"; then done_ok=1; break; fi
      warn "партия $k: rsync оборвался ($(tail -1 "$TMP/rsync.err")), повтор $try"; sleep $((try * 8))
    done
    if [ "$done_ok" = 0 ]; then
      for try in 1 2; do
        if ( cd "$OUT" && COPYFILE_DISABLE=1 tar --no-mac-metadata -cf - -T "$lst" ) | rssh "tar -xmf - -C '$DOCROOT' 2>/dev/null; cd '$DOCROOT' && true"; then
          # tar -m ставит время распаковки — выравниваем по исходнику, чтобы следующая заливка не гнала файл снова
          while IFS= read -r f; do printf '%s\t%s\n' "$(stat -f '%m' "$OUT/$f")" "$f"; done < "$lst" > "$TMP/mt.tsv"
          rssh "cd '$DOCROOT' && while IFS=\$(printf '\t') read -r t f; do touch -d @\$t \"\$f\"; done" < "$TMP/mt.tsv" && { done_ok=1; break; }
        fi
        warn "партия $k: tar | ssh не прошёл, повтор $try"; sleep 15
      done
    fi
    [ "$done_ok" = 1 ] || die "партия $k ($cnt файлов) не залилась ни rsync, ни tar. Повторите запуск — уже залитое не поедет второй раз"
    ok "партия $k/$BATCHES: $cnt файлов, $sz МБ"
    [ "$k" -lt "$BATCHES" ] && sleep "$BATCH_PAUSE"
  done

  # Сверка: всё ли легло, тем же размером
  rssh "cd '$DOCROOT' && find . -type f -printf '%P\t%s\n'" | tr -d '\r' | LC_ALL=C sort > "$TMP/remote2.tsv"
  cut -f1,2 "$TMP/local.tsv" | LC_ALL=C sort > "$TMP/local2.tsv"
  MISS=$(LC_ALL=C comm -23 "$TMP/local2.tsv" "$TMP/remote2.tsv" | wc -l | tr -d ' ')
  [ "$MISS" = 0 ] && ok "сверка: все $(wc -l < "$TMP/local2.tsv" | tr -d ' ') файлов на сервере, размеры совпали" \
    || die "сверка: $MISS файлов не совпали по размеру или отсутствуют — запустите ещё раз"

  # Лишнее на сервере (файлы, ушедшие из выпуска) — только по --prune и только внутри нашей папки
  cut -f1 "$TMP/local2.tsv" > "$TMP/lnames"; cut -f1 "$TMP/remote2.tsv" > "$TMP/rnames"
  LC_ALL=C comm -13 "$TMP/lnames" "$TMP/rnames" | grep -v -x -e "$MARK" -e 'cgi-bin/.*' > "$TMP/extra" || true
  EX=$(wc -l < "$TMP/extra" | tr -d ' ')
  if [ "$EX" -gt 0 ]; then
    if [ "$PRUNE" = 1 ]; then
      # не rm: переносим рядом с веб-корнем (правило «ничего не удалять на проде без бэкапа рядом»); снаружи — 404
      BK="${DOCROOT%/}_backup/$(date +%Y%m%d-%H%M%S)"
      rssh "while IFS= read -r f; do mkdir -p \"$BK/\$(dirname -- \"\$f\")\" && mv -f -- \"$DOCROOT/\$f\" \"$BK/\$f\"; done" < "$TMP/extra" \
        && ok "убрано лишних с сайта: $EX → ~/$BK (вне веб-корня; вернуть — mv обратно)" \
        || die "перенос лишних в $BK не прошёл"
      head -12 "$TMP/extra" | sed 's/^/       /'; [ "$EX" -gt 12 ] && echo "       … и ещё $((EX - 12))"
    else warn "на сервере $EX лишних файлов (нет в выпуске) — убрать: $0 --site=$SITE --prune"; fi
  fi

  printf '%s  %s  %s\n' "$(date '+%d.%m.%Y %H:%M')" "$(cd "$ROOT" && git rev-parse --short HEAD 2>/dev/null)" "$BASE" | rssh "cat > '$DOCROOT/$MARK'"
fi

# ─────────────────────────────────────────────── 5. Прозвон
say "5. Проверяю живой адрес $BASE"
FAIL=0
PDF=$(cd "${OUT}" 2>/dev/null && ls portfolio/gost-*/album.pdf 2>/dev/null | head -1)
for u in / /index.html /brief.html /review.html "/review.html?p=gost-kv3k" /portfolio-hub/ /portfolio/gost-kv3k/ \
         /portfolio/demo/index.html /catalog/ /journal/ /gost/ /css/main.css /js/review.js /sitemap.xml /robots.txt ${PDF:+/$PDF}; do
  code=$(ccurl -s -o /dev/null -w '%{http_code} %{content_type} %{size_download}' -m 60 "$BASE$u" 2>/dev/null || echo "000")
  case "$code" in
    200*) ok "$u — $code" ;;
    *) bad "$u — $code"; FAIL=1 ;;
  esac
done
# Приёмник брифа и заказов (server/api → api/): PHP жив, папка данных linea-private рядом с public_html доступна, конфиг на месте
if [ -d "$OUT/api" ] || [ "$ONLY_CHECK" = 1 ]; then
  PING=$(ccurl -s -m 25 "$BASE/api/ping.php" 2>/dev/null)
  case "$PING" in
    *'"ok":true'*'"private":true'*'"config":true'*) ok "api/ping.php — $PING" ;;
    *) bad "api/ping.php — ${PING:-нет ответа} (PHP 8.2+ у сайта? папка ~/dizain-studiya-kvartir/linea-private и config.php?)"; FAIL=1 ;;
  esac
  for u in /api/lib/boot.php /api/.htaccess; do
    c=$(ccurl -s -o /dev/null -w '%{http_code}' -m 25 "$BASE$u" 2>/dev/null)
    case "$c" in 403|404) ok "$u закрыт ($c)" ;; *) bad "$u отдаётся ($c)"; FAIL=1 ;; esac
  done
fi
code=$(ccurl -s -o /dev/null -w '%{http_code}' -m 25 "$BASE/takoy-stranicy-net/" 2>/dev/null || echo 000)
[ "$code" = 404 ] && ok "несуществующий адрес → 404" || { bad "несуществующий адрес → $code (ждали 404)"; FAIL=1; }
loc=$(ccurl -s -o /dev/null -w '%{http_code} %{redirect_url}' -m 25 "$BASE/catalog" 2>/dev/null)
case "$loc" in 301*"$BASE/catalog/") ok "папка без слеша → $loc" ;; *) warn "папка без слеша: $loc" ;; esac
BODY=$(ccurl -s --compressed -m 30 "$BASE/" 2>/dev/null)
grep -qF "rel=\"canonical\" href=\"$BASE/\"" <<< "$BODY" && ok "canonical главной = $BASE/" || { bad "canonical главной не $BASE/"; FAIL=1; }
if [ "$SITE" = domain ]; then
  r=$(ccurl -s -o /dev/null -w '%{http_code} %{redirect_url}' -m 25 "${BASE/https:/http:}/" 2>/dev/null)
  case "$r" in 301*https*) ok "http → https: $r" ;; *) warn "http → https не работает: $r (SSL выпущен?)" ;; esac
fi

[ "$FAIL" = 0 ] && say "Готово: $BASE/" || { say "Залито, но часть адресов не отвечает — см. выше"; exit 1; }
