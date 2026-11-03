#!/usr/bin/env bash
# Выкладка кабинетов (02.11.2026): сайт → настройки боевого config → cron раз в 15 минут → проверка адресов → trusted_proxies.
# Запускает Александр: ./tools/vykladka-kabinety.sh
# Боевой config.php правится только через tools/config-edit.php (ревью 02.11, С8): ИДЕМПОТЕНТНО — задаются лишь незаданные ключи,
# правки владельца (свои адреса admin_emails, выключенные письма) повторный запуск не трогает; копия config.php.bak-ГГГГММДД-ЧЧММСС
# (до секунд, существующая не перезаписывается), запись атомарная (временный файл → php -l → require → rename).
# Откат — tools/otkat-config.sh (последняя копия; --list, --dry). Пароли, ключи и токен мониторинга не печатаются.
# Шаг 6: какой REMOTE_ADDR видит PHP за nginx Beget — через api/ping.php с токеном мониторинга (monitor_token в config; временных
# эндпоинтов не создаём). Если запрос приходит с внутреннего адреса прокси, которого нет в trusted_proxies, — адрес добавляется
# (с копией config), иначе все клиенты для лимитов частоты выглядят одним адресом.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${LINEA_SSH_HOST:-beget-en0}"
ADMIN_EMAIL="aleksandrkyrlan83@gmail.com"
PHP=/usr/local/bin/php8.2
STAMP=$(date +%Y%m%d-%H%M%S)
PRIVR='cd ~/dizain-studiya-kvartir/linea-private && '
# Одно SSH-соединение на весь скрипт (ControlMaster) + повтор при обрыве: после аварии 02–03.11 Beget рвёт частые подключения
# («Connection closed by … port 22» на шаге 2 при запуске 03.11). Код 255 = сбой соединения, другой код — ошибка команды, не повторяем.
CM="/tmp/linea-vk-$$"
SSHO=(-o ControlMaster=auto -o ControlPath="$CM" -o ControlPersist=180 -o ConnectTimeout=20 -o ServerAliveInterval=15)
trap 'command ssh -o ControlPath="$CM" -O exit "$HOST" 2>/dev/null || true' EXIT
ssh() { local i rc; for i in 1 2 3 4; do rc=0; command ssh "${SSHO[@]}" "$@" || rc=$?; [ "$rc" -ne 255 ] && return "$rc"
  echo "  ! SSH оборвался (попытка $i), повтор через $((i*15)) с" >&2; sleep $((i*15)); done; return 255; }
scp() { local i rc; for i in 1 2 3 4; do rc=0; command scp "${SSHO[@]}" "$@" || rc=$?; [ "$rc" -eq 0 ] && return 0
  echo "  ! scp не прошёл (попытка $i), повтор через $((i*15)) с" >&2; sleep $((i*15)); done; return "$rc"; }
# скрипт правки уходит по stdin (на сервере файлов не оставляет); при обрыве — повтор с новым stdin
cfg_edit() { local i rc; for i in 1 2 3 4; do rc=0; command ssh "${SSHO[@]}" "$HOST" "$PRIVR $PHP -- $*" < tools/config-edit.php || rc=$?
  [ "$rc" -ne 255 ] && return "$rc"; echo "  ! SSH оборвался (попытка $i), повтор через $((i*15)) с" >&2; sleep $((i*15)); done; return 255; }
SITE="https://xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai"

say() { printf '\n▶ %s\n' "$*"; }

say "1/6 Выкладка сайта"
./tools/deploy-beget.sh --site=domain

say "2/6 Настройки боевого config.php (только незаданные ключи; копия config.php.bak-<время> — если что-то меняется)"
# brig_mail_enabled / notify_enabled — письма с кодом входа и уведомления; admin_emails — роль «Админка»; base — ссылки в письмах;
# admin_2fa=false — второй шаг входа включать после почты на домене (SPF/DKIM); monitor_token — подробности ping.php (шаг 6, монитор)
DEFAULTS=$(python3 -I -c 'import json,sys; e,s=sys.argv[1:3]; print(json.dumps({"brig_mail_enabled":True,"admin_emails":{"if_empty":[e]},"notify_enabled":True,
 "notify_to":{"if_empty":e},"base":{"if_empty":s},"allow_test":False,"admin_2fa":False,"rounds":{"if_empty":3},"monitor_token":{"if_short":24,"random_hex":24}}))' "$ADMIN_EMAIL" "$SITE")
cfg_edit defaults "'$DEFAULTS'"
ssh "$HOST" "$PRIVR chmod 600 config.php && $PHP -r '\$t = require \"config.php\"; echo \"config: brig_mail_enabled=\", var_export(\$t[\"brig_mail_enabled\"] ?? null, true), \", notify_enabled=\", var_export(\$t[\"notify_enabled\"] ?? null, true), \", admin_emails=\", count((array)(\$t[\"admin_emails\"] ?? [])), \", admin_2fa=\", var_export(\$t[\"admin_2fa\"] ?? null, true), \", monitor_token задан=\", (strlen((string)(\$t[\"monitor_token\"] ?? \"\")) >= 24 ? \"да\" : \"нет\"), PHP_EOL;'"

say "3/6 Cron-скрипт вне веб-корня"
ssh "$HOST" 'mkdir -p ~/dizain-studiya-kvartir/server-tools && ln -sfn ~/dizain-studiya-kvartir/public_html/api ~/dizain-studiya-kvartir/api'
scp -q server/tools/cron.php "$HOST":dizain-studiya-kvartir/server-tools/cron.php
RHOME=$(ssh "$HOST" 'echo $HOME')
CMD="$PHP $RHOME/dizain-studiya-kvartir/server-tools/cron.php --private=$RHOME/dizain-studiya-kvartir/linea-private"
echo "пробный прогон:"; ssh "$HOST" "$CMD" | tail -5

say "4/6 Задача в планировщике Beget (раз в 15 минут)"
if python3 -I tools/beget-api.py cron/getList | grep -q "server-tools/cron.php"; then
  echo "задача уже есть — не дублирую"
else
  python3 -I tools/beget-api.py cron/add "{\"minutes\":\"*/15\",\"hours\":\"*\",\"days\":\"*\",\"months\":\"*\",\"weekdays\":\"*\",\"command\":\"$CMD >/dev/null 2>&1\"}"
fi

say "5/6 Проверка адресов"
for u in "" kabinet/ brigada/ api/ping.php api/vhod.php?a=me api/panel.php brigady/ remont/; do
  printf '%s  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITE/$u")" "/$u"
done
say "6/6 trusted_proxies: какой адрес клиента видит PHP (api/ping.php с токеном мониторинга)"
MON=$(ssh "$HOST" "$PRIVR $PHP -r '\$c = require \"config.php\"; echo \$c[\"monitor_token\"] ?? \"\";'")
# токен — в заголовке из stdin (-H @-), не в аргументах curl: аргументы видны в ps; в адрес (?token=) — никогда
ping_detail() { printf 'X-Monitor-Token: %s\n%s' "$MON" "${1:-}" | curl -s --max-time 20 -H @- "$SITE/api/ping.php"; }
PD=$(ping_detail || true)
VERDICT=$(printf '%s' "$PD" | python3 -I -c '
import json, sys, ipaddress
try: d = json.load(sys.stdin)
except Exception: print("ERR ping.php с токеном не ответил JSON-ом"); sys.exit()
if not d.get("proxy"): print("ERR ping.php без подробностей (токен не принят? выложен старый ping.php?)"); sys.exit()
p = d["proxy"]; ra = p.get("remote_addr") or ""; xr = p.get("x_real_ip") or ""
print("INFO REMOTE_ADDR=%s, X-Real-IP=%s, trusted_proxies=%s, linea_ip=%s, https=%s, схема базы v%s, последний cron: %s" % (ra, xr or "—", p.get("trusted_proxies"), p.get("linea_ip"), d.get("https"), (d.get("db") or {}).get("schema"), d.get("cron_last") or "ещё не было"))
try: private = ipaddress.ip_address(ra).is_private or ipaddress.ip_address(ra).is_loopback
except ValueError: private = False
if p.get("remote_is_trusted") and xr and p.get("linea_ip") == xr: print("OK прокси доверен, адрес клиента берётся из X-Real-IP")
elif p.get("remote_is_trusted") and not xr: print("WARN прокси в списке, но X-Real-IP не приходит — лимиты считаются на адрес прокси; спросить поддержку Beget")
elif not p.get("remote_is_trusted") and private and xr: print("ADD " + ra)
elif not private: print("OK PHP видит публичный адрес клиента напрямую — trusted_proxies не нужен")
else: print("WARN внутренний REMOTE_ADDR без X-Real-IP — лимиты считаются на один адрес; спросить поддержку Beget")
')
printf '%s\n' "$VERDICT" | sed 's/^/  /'
ADD=$(printf '%s\n' "$VERDICT" | sed -n 's/^ADD //p')
if [ -n "$ADD" ]; then
  echo "  добавляю $ADD в trusted_proxies (копия config.php.bak-<время>)"
  cfg_edit add-proxy "$ADD"
  ssh "$HOST" "$PRIVR chmod 600 config.php"
  sleep 3   # opcache перечитывает config.php не сразу
  printf '%s' "$(ping_detail)" | python3 -I -c 'import json,sys; p=json.load(sys.stdin)["proxy"]; print("  после правки: linea_ip=%s, X-Real-IP=%s — %s" % (p["linea_ip"], p.get("x_real_ip"), "ок" if p["linea_ip"] == p.get("x_real_ip") else "НЕ совпадает, проверить руками"))' || echo "  повторная проверка не удалась — открыть ping.php с токеном руками"
fi
# подделка адреса: клиент сам шлёт X-Real-IP / X-Forwarded-For — nginx Beget обязан их перезаписать, иначе обход лимитов,
# аварийных IP и admin_ip_allow (ревью 02.11, С6)
SPOOF=$(ping_detail $'X-Real-IP: 1.2.3.4\nX-Forwarded-For: 1.2.3.4\n' | python3 -I -c 'import json,sys
try: p = json.load(sys.stdin)["proxy"]
except Exception: print("ERR нет ответа"); sys.exit()
print(("ОПАСНО linea_ip=1.2.3.4 — поддельный заголовок принят, НЕ включать admin_ip_allow/аварийные IP" if p.get("linea_ip") == "1.2.3.4" else "OK подделка X-Real-IP не прошла (linea_ip=%s)" % p.get("linea_ip")))' || echo "ERR проверка подделки не удалась")
printf '  %s\n' "$SPOOF"
unset MON

echo; echo "Готово. Дальше Claude проверит вход в кабинеты и админку."
