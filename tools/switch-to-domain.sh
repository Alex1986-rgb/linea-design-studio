#!/usr/bin/env bash
#
# Переезд LINEA на дизайн-студия-квартир.рф — одной командой, когда домен зарегистрирован.
#
#   ./tools/switch-to-domain.sh              # проверить домен → привязать → https и вебхук → переписать адрес → проверить копию → залить → прозвон
#   ./tools/switch-to-domain.sh --check      # только сказать, на каком шаге домен (ничего не меняет; API Beget и curl к домену)
#   ./tools/switch-to-domain.sh --dry-run    # репетиция без сети: шаг 4 на копиях, проверка копии .deploy/domain, страницы-переходы
#   ./tools/switch-to-domain.sh --check --host=<хост>   # шаг 3 (https, вебхук) против другого хоста — проверить сам скрипт
#
# Шаги:
#   0. Готовность без сети: правка SITE_DEFAULT срабатывает (на копии site-shell.js), генераторы с SITE_DEFAULT = 'domain'
#      дают Punycode-адрес, site/ переписывается на домен без остатков (на копии), копия .deploy/domain чистая
#      (tools/check-domain-copy.js: ссылки, canonical, robots, sitemap — всё на домене, ни одного github.io/beget.tech),
#      страницы-переходы для GitHub Pages собираются в .deploy/pages-redirect/ (tools/gen-pages-redirect.js, не применяются).
#   1. API Beget: домен вышел из ESIA (регистрация подтверждена через Госуслуги) и получил id.
#   2. Домен привязан к сайту dizain-studiya-kvartir (site/linkDomain), если ещё не привязан.
#   3. HTTPS: сертификат действителен (Let's Encrypt выпускается в панели Beget: «Сайты» → домен → SSL), срок;
#      вебхук ЮKassa api/pay-notify.php: GET → 405 (обработчик на месте), POST «{}» по https → 200 (PHP видит https —
#      ЮKassa шлёт уведомления только на https, по http обработчик отвечает 403). В ЮKassa ничего не уходит: пустое тело
#      обработчик закрывает до запроса к API. Признак https, подделанный заголовком по http, — предупреждение.
#   4. SITE_DEFAULT = 'domain' в tools/site-shell.js; site/ переписывается на домен (site-rebase --in-place) — тогда и копия
#      на GitHub Pages несёт canonical домена; копия .deploy/domain проверяется до заливки.
#   5. Выкладка: ./tools/deploy-beget.sh --site=domain --prune.
#   6. Прозвон после заливки: http → 301 на https, canonical главной, robots, sitemap, нет noindex, вебхук ещё раз.
# Коммит, push и страницы-переходы на GitHub Pages — руками: docs/kb/pereezd-domena-vebmaster.md.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE_ID=9469516
FQDN="дизайн-студия-квартир.рф"
PUNY="xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai"
CHECK=0 DRY=0 HOST=""
for a in "$@"; do
  case "$a" in
    --check) CHECK=1 ;;
    --dry-run) DRY=1 ;;
    --host=*) HOST="${a#--host=}" ;;
    -h|--help) awk 'NR>1 { if (/^#/) { sub(/^# ?/, ""); print } else exit }' "$0"; exit 0 ;;
    *) echo "Неизвестный ключ: $a (см. --help)" >&2; exit 2 ;;
  esac
done
[ -n "$HOST" ] && [ "$CHECK" = 0 ] && { echo "--host= только вместе с --check" >&2; exit 2; }
H="${HOST:-$PUNY}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; WARNS=$((WARNS+1)); }
die()  { printf '\n\033[31mОстановился:\033[0m %s\n' "$*" >&2; exit 1; }
api()  { python3 -I "$ROOT/tools/beget-api.py" "$@"; }
WARNS=0

# curl мимо VPN (Happ ломает TLS к .рф и Beget), как в deploy-beget.sh
IFACE=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
CI=(); case "$IFACE" in utun*|ppp*|ipsec*|tun*) CI=(--interface "${BEGET_BIND:-en0}") ;; esac
code() { curl "${CI[@]}" -s -o /dev/null -w '%{http_code}' -m 25 "$@" 2>/dev/null || true; }

# ── 0. Готовность без сети ─────────────────────────────────────────────────────────────────────────────
ready_offline() {
  say "0. Готовность без сети (на копиях: site/, tools/ и git не меняются)"
  local T; T=$(mktemp -d "${TMPDIR:-/tmp}/linea-switch.XXXXXX")
  # 0а. правка SITE_DEFAULT — та же команда, что в шаге 4, на копии каркаса
  mkdir -p "$T/root/tools"
  cp "$ROOT"/tools/*.js "$T/root/tools/"
  sed -i '' "s/^const SITE_DEFAULT = '[a-z]*';/const SITE_DEFAULT = 'domain';/" "$T/root/tools/site-shell.js"
  grep -q "^const SITE_DEFAULT = 'domain';" "$T/root/tools/site-shell.js" || { rm -rf "$T"; die "правка SITE_DEFAULT не находит строку в tools/site-shell.js"; }
  local B; B=$(cd "$T/root" && node -e "process.stdout.write(require('./tools/site-shell.js').BASE)")
  [ "$B" = "https://$PUNY" ] || { rm -rf "$T"; die "после правки BASE = $B, ждали https://$PUNY"; }
  ok "SITE_DEFAULT = 'domain' ставится, генераторы пишут https://$PUNY"
  # 0б. переписать site/ насовсем — на копии (без картинок и PDF: адрес только в текстах)
  rsync -a --exclude '*.pdf' --exclude '*.jpg' --exclude '*.webp' --exclude '*.png' --exclude '*.svg' "$ROOT/site/" "$T/root/site/"
  ( cd "$T/root" && node tools/site-rebase.js --site=domain --in-place >"$T/inplace.log" 2>&1 ) \
    || { cat "$T/inplace.log"; rm -rf "$T"; die "site-rebase --in-place на копии упал"; }
  local left; left=$(grep -rlE 'github\.io|beget\.tech' "$T/root/site" | wc -l | tr -d ' ')
  [ "$left" = 0 ] || { rm -rf "$T"; die "после --in-place старый адрес остался в $left файлах"; }
  ok "site/ переписывается на домен (на копии): $(grep -o 'заменён в [0-9]* файлах ([0-9]* вхождений)' "$T/inplace.log"), github.io / beget.tech — 0"
  rm -rf "$T"
  # 0в. копия для Beget и её проверка
  ( cd "$ROOT" && node tools/site-rebase.js --site=domain >/dev/null ) || die "site-rebase --site=domain упал"
  ok "копия для Beget собрана: .deploy/domain"
  ( cd "$ROOT" && node tools/gen-pages-redirect.js | sed 's/^/  /' ) || die "страницы-переходы не собрались"
  ( cd "$ROOT" && node tools/check-domain-copy.js .deploy/domain --redirects=.deploy/pages-redirect/redirects.tsv | sed 's/^/  /'; exit "${PIPESTATUS[0]}" ) \
    || die "копия .deploy/domain не готова — см. ошибки выше"
}

# ── 3. HTTPS и вебхук ЮKassa ───────────────────────────────────────────────────────────────────────────
https_checks() {   # $1 = strict|pre  (pre — до заливки адреса домена: 301 на https ещё не обязателен)
  local mode=$1 c v
  say "3. HTTPS ($H)"
  c=$(code "https://$H/")
  case "$c" in
    2*|3*|404) ok "https://$H/ отвечает ($c), сертификат принят" ;;
    *) if [ "$(code -k "https://$H/")" != 000 ]; then
         die "https://$H открывается только без проверки сертификата — сертификат не на этот домен или просрочен. Перевыпустите: панель Beget → «Сайты» → $FQDN → SSL → Let's Encrypt"
       fi
       die "https://$H не открывается (код ${c:-нет}). Выпустите сертификат: панель Beget → «Сайты» → $FQDN → SSL → Let's Encrypt (бывает до часа после регистрации и DNS). Потом запустите снова" ;;
  esac
  v=$(curl "${CI[@]}" -sv -o /dev/null -m 25 "https://$H/" 2>&1 | awk -F'expire date: ' '/expire date:/{print $2; exit}')
  if [ -n "$v" ]; then
    local end now days; end=$(date -j -f '%b %e %H:%M:%S %Y %Z' "$v" +%s 2>/dev/null || echo 0); now=$(date +%s)
    days=$(( (end - now) / 86400 ))
    if [ "$end" = 0 ]; then ok "сертификат до $v"
    elif [ "$days" -lt 14 ]; then warn "сертификат истекает через $days дн. ($v) — проверьте автопродление в панели Beget"
    else ok "сертификат до $v ($days дн.)"; fi
  else warn "срок сертификата не прочитан (curl -v не показал expire date)"; fi
  c=$(code "https://www.$H/")
  case "$c" in 2*|3*) ok "https://www.$H/ отвечает ($c)" ;; *) warn "https://www.$H/ не открывается ($c) — в сертификат не вошёл www; выпустить с www в панели Beget (ссылки с www редкие, не блокер)" ;; esac
  local loc; loc=$(curl "${CI[@]}" -s -o /dev/null -w '%{http_code} %{redirect_url}' -m 25 "http://$H/" 2>/dev/null || true)
  if [ "${loc%% *}" = 301 ] && [ "${loc#* }" = "https://$H/" ]; then ok "http → 301 → https://$H/"
  elif [ "$mode" = strict ]; then die "http://$H/ не уводит 301 на https (ответ: $loc) — .htaccess домена не выложен?"
  else warn "http://$H/ пока без 301 на https (ответ: ${loc:-нет}) — .htaccess домена приедет при выкладке, шаг 6 проверит"; fi

  say "3а. Вебхук ЮKassa: https://$H/api/pay-notify.php (в ЮKassa ничего не отправляется)"
  c=$(code -X GET "https://$H/api/pay-notify.php")
  case "$c" in
    405) ok "обработчик на месте: GET → 405 (принимает только POST)" ;;
    404) die "api/pay-notify.php нет (404) — приёмник не выложен: ./tools/deploy-beget.sh" ;;
    403) die "api/pay-notify.php закрыт (403) — проверьте server/api/.htaccess на сервере" ;;
    *)   die "api/pay-notify.php отвечает $c вместо 405 — PHP не работает? Проверьте api/ping.php и версию PHP домена (нужна 8.2+)" ;;
  esac
  c=$(code -X POST -H 'Content-Type: application/json' --data '{}' "https://$H/api/pay-notify.php")
  case "$c" in
    200) ok "POST по https → 200: PHP видит https, уведомления ЮKassa будут приняты (пустое тело — до API ЮKassa не доходит)" ;;
    403) die "POST по https → 403: PHP не видит https (нет HTTPS=on и X-Forwarded-Proto: https) — вебхук отвергнет уведомления ЮKassa, а бриф и оплата не примут ПДн. Проверить linea_https() в server/api/lib/boot.php против \$_SERVER на Beget" ;;
    *)   die "POST по https → $c вместо 200" ;;
  esac
  c=$(code -X POST -H 'Content-Type: application/json' -H 'X-Forwarded-Proto: https' --data '{}' "http://$H/api/pay-notify.php")
  case "$c" in
    200) warn "по http с подделанным заголовком X-Forwarded-Proto: https → 200: признак https можно подделать. Вебхуку не страшно (статус платежа перепроверяется в API ЮKassa), но ПДн по http так пройдут — linea_https() доверять только HTTPS=on, если Beget его ставит" ;;
    301|302|307|308|403) ok "по http с подделанным X-Forwarded-Proto → $c (подделка не проходит)" ;;
    *) warn "по http с подделанным X-Forwarded-Proto → $c" ;;
  esac
  local ping; ping=$(curl "${CI[@]}" -s -m 25 "https://$H/api/ping.php" 2>/dev/null || true)
  if printf '%s' "$ping" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("ok") else 1)' 2>/dev/null; then
    local info; info=$(printf '%s' "$ping" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("PHP %s, конфиг %s, папка данных %s" % (d.get("php"), "есть" if d.get("config") else "НЕТ", "пишется" if d.get("private") else "НЕ пишется"))')
    ok "api/ping.php: $info"
    case "$ping" in *'"config":false'*|*'"private":false'*) warn "нет config.php или папка linea-private не пишется — приём брифа не заработает" ;; esac
    ok "когда будет магазин ЮKassa — URL уведомлений https://$PUNY/api/pay-notify.php (payment.succeeded, payment.canceled, refund.succeeded, refund.canceled); режим оплаты — в ping.php только с токеном мониторинга"
  else warn "api/ping.php по https не ответил JSON-ом: ${ping:0:120}"; fi
}

# ── 6. Прозвон после заливки ──────────────────────────────────────────────────────────────────────────
after_deploy() {
  say "6. Прозвон домена после заливки"
  https_checks strict
  local B="https://$PUNY" html; html=$(curl "${CI[@]}" -s -m 25 "$B/" 2>/dev/null || true)
  if printf '%s' "$html" | grep -q "<link rel=\"canonical\" href=\"$B/\">"; then ok "canonical главной = $B/"; else die "canonical главной не $B/"; fi
  if printf '%s' "$html" | grep -qE 'github\.io|beget\.tech'; then die "на главной остались github.io / beget.tech"; else ok "на главной нет github.io / beget.tech"; fi
  if curl "${CI[@]}" -s -m 25 "$B/robots.txt" | grep -qx "Sitemap: $B/sitemap.xml"; then ok "robots.txt: Sitemap: $B/sitemap.xml"; else die "robots.txt без Sitemap домена"; fi
  if curl "${CI[@]}" -s -m 25 "$B/sitemap.xml" | grep -q "<loc>$B/</loc>"; then ok "sitemap.xml на домене"; else die "sitemap.xml не на домене"; fi
  if curl "${CI[@]}" -sI -m 25 "$B/" | grep -qi '^x-robots-tag'; then die "домен отдаёт X-Robots-Tag (noindex) — выложен .htaccess технического адреса"; else ok "X-Robots-Tag нет"; fi
}

if [ "$DRY" = 1 ]; then ready_offline; say "Репетиция пройдена: переключение на копиях без ошибок (предупреждений: $WARNS)"; exit 0; fi

if [ -n "$HOST" ]; then
  say "Шаги 1–2 пропущены: проверка шага 3 против $HOST"
  https_checks pre
  say "Шаг 3 для $HOST пройден (предупреждений: $WARNS)"; exit 0
fi

[ "$CHECK" = 1 ] && ready_offline

say "1. Регистрация домена"
DOM=$(api domain/getList | python3 -c "
import json, sys
d = json.load(sys.stdin)['answer']['result']
x = [r for r in d if r['fqdn'] in ('$FQDN', '$PUNY')]
print('%s %s' % (x[0]['id'], x[0]['register_order_status']) if x else 'нет нет')") || die "API Beget не ответил"
DID=${DOM% *}; DST=${DOM#* }
[ "$DID" = нет ] && die "домена $FQDN нет в аккаунте aleks2si"
[ "$DID" = None ] && die "регистрация ещё не подтверждена (статус $DST). Нужно подтвердить через Госуслуги — в панели Beget «Домены» → $FQDN"
ok "домен зарегистрирован: id $DID, статус $DST"

say "2. Привязка к сайту"
LINKED=$(api site/getList | python3 -c "
import json, sys
d = json.load(sys.stdin)['answer']['result']
s = [r for r in d if r['id'] == $SITE_ID]
print('yes' if s and any(str(x['id']) == '$DID' for x in s[0]['domains']) else 'no')")
if [ "$LINKED" = yes ]; then ok "домен уже смотрит в dizain-studiya-kvartir"
elif [ "$CHECK" = 1 ]; then ok "домен ещё не привязан к сайту — привяжется при запуске без --check"; say "Проверка: шаг 3 (https, вебхук) — после привязки"; exit 0
else api site/linkDomain "{\"domain_id\": $DID, \"site_id\": $SITE_ID}" >/dev/null || die "site/linkDomain не прошёл"; ok "домен привязан к сайту $SITE_ID"; fi

https_checks pre
[ "$CHECK" = 1 ] && { say "Проверка: домен готов к переезду — запустите без --check (предупреждений: $WARNS)"; exit 0; }

say "4. Адрес сайта → домен"
sed -i '' "s/^const SITE_DEFAULT = '[a-z]*';/const SITE_DEFAULT = 'domain';/" "$ROOT/tools/site-shell.js"
grep -q "^const SITE_DEFAULT = 'domain';" "$ROOT/tools/site-shell.js" || die "не смог поменять SITE_DEFAULT в tools/site-shell.js"
ok "tools/site-shell.js: SITE_DEFAULT = 'domain' (генераторы теперь пишут https://$PUNY)"
( cd "$ROOT" && node tools/site-rebase.js --site=domain --in-place ) || die "site-rebase --in-place упал"
( cd "$ROOT" && node tools/site-rebase.js --site=domain >/dev/null && node tools/gen-pages-redirect.js >/dev/null \
  && node tools/check-domain-copy.js .deploy/domain --redirects=.deploy/pages-redirect/redirects.tsv ) || die "копия .deploy/domain не прошла проверку — не заливаю"

say "5. Выкладка"
"$ROOT/tools/deploy-beget.sh" --site=domain --prune || die "выкладка с ошибками — см. выше"

after_deploy

say "Переезд выполнен: https://$FQDN/ (предупреждений: $WARNS)"
echo "  Дальше руками (порядок и зачем — docs/kb/pereezd-domena-vebmaster.md):"
echo "  1. git commit + git push — GitHub Pages начнёт отдавать canonical домена;"
echo "  2. Яндекс.Вебмастер и Google Search Console — добавить https://$FQDN, подтвердить, загрузить sitemap;"
echo "  3. страницы-переходы для GitHub Pages собраны в .deploy/pages-redirect/ — применить по чек-листу;"
echo "  4. ЮKassa: URL уведомлений https://$PUNY/api/pay-notify.php."
