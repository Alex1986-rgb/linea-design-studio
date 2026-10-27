#!/usr/bin/env bash
#
# Переезд LINEA на дизайн-студия-квартир.рф — одной командой, когда домен зарегистрирован.
#
#   ./tools/switch-to-domain.sh            # проверить домен → привязать к сайту → SSL? → переписать адрес → залить
#   ./tools/switch-to-domain.sh --check    # только сказать, на каком шаге домен (ничего не меняет)
#
# Шаги:
#   1. API Beget: домен вышел из ESIA (регистрация подтверждена через Госуслуги) и получил id.
#   2. Домен привязан к сайту dizain-studiya-kvartir (site/linkDomain), если ещё не привязан.
#   3. HTTPS отвечает (сертификат Let's Encrypt выпускается в панели Beget: «Сайты» → домен → SSL).
#      Без SSL дальше не идём: canonical и sitemap будут https, а https не открывается.
#   4. Адрес по умолчанию в tools/site-shell.js: SITE_DEFAULT = 'domain'; site/ переписывается на новый адрес
#      (node tools/site-rebase.js --site=domain --in-place) — тогда и копия на GitHub Pages сообщает поисковикам
#      canonical нового домена.
#   5. Выкладка: ./tools/deploy-beget.sh --site=domain.
# Коммит и push (чтобы GitHub Pages тоже отдавал canonical домена) — руками, см. отчёт docs/reports/2026-10-27-pereezd-beget.md.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE_ID=9469516
FQDN="дизайн-студия-квартир.рф"
PUNY="xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai"
CHECK=0; [ "${1:-}" = --check ] && CHECK=1

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die() { printf '\n\033[31mОстановился:\033[0m %s\n' "$*" >&2; exit 1; }
api() { python3 -I "$ROOT/tools/beget-api.py" "$@"; }

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
elif [ "$CHECK" = 1 ]; then ok "домен ещё не привязан к сайту — привяжется при запуске без --check"
else api site/linkDomain "{\"domain_id\": $DID, \"site_id\": $SITE_ID}" >/dev/null || die "site/linkDomain не прошёл"; ok "домен привязан к сайту $SITE_ID"; fi

say "3. HTTPS"
IFACE=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
CI=(); case "$IFACE" in utun*|ppp*|ipsec*|tun*) CI=(--interface "${BEGET_BIND:-en0}") ;; esac
code=$(curl "${CI[@]}" -s -o /dev/null -w '%{http_code}' -m 25 "https://$PUNY/" 2>/dev/null || true)
case "$code" in
  2*|3*|404) ok "https://$PUNY/ отвечает ($code)" ;;
  *) die "https://$FQDN не открывается (код ${code:-нет}). Выпустите сертификат: панель Beget → «Сайты» → $FQDN → SSL → Let's Encrypt (бывает до часа после регистрации и DNS). Потом запустите снова" ;;
esac
[ "$CHECK" = 1 ] && { say "Проверка: домен готов к переезду — запустите без --check"; exit 0; }

say "4. Адрес сайта → домен"
sed -i '' "s/^const SITE_DEFAULT = '[a-z]*';/const SITE_DEFAULT = 'domain';/" "$ROOT/tools/site-shell.js"
grep -q "^const SITE_DEFAULT = 'domain';" "$ROOT/tools/site-shell.js" || die "не смог поменять SITE_DEFAULT в tools/site-shell.js"
ok "tools/site-shell.js: SITE_DEFAULT = 'domain' (генераторы теперь пишут https://$PUNY)"
( cd "$ROOT" && node tools/site-rebase.js --site=domain --in-place ) || die "site-rebase --in-place упал"

say "5. Выкладка"
"$ROOT/tools/deploy-beget.sh" --site=domain --prune || die "выкладка с ошибками — см. выше"

say "Переезд выполнен: https://$FQDN/"
echo "  Осталось руками: git commit + git push (GitHub Pages начнёт отдавать canonical домена),"
echo "  Яндекс.Вебмастер — добавить домен, sitemap, «Переезд сайта»; Search Console — Change of address не работает для"
echo "  github.io-поддомена, там только canonical. Подробно — docs/reports/2026-10-27-pereezd-beget.md."
