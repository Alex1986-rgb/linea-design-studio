#!/usr/bin/env bash
# Выкладка кабинетов (02.11.2026): сайт → настройки боевого config → cron раз в 15 минут → проверка адресов → trusted_proxies.
# Запускает Александр: ./tools/vykladka-kabinety.sh
# Боевой config.php перед правкой копируется рядом (config.php.bak-<дата>). Пароли, ключи и токен мониторинга не печатаются.
# Шаг 6: какой REMOTE_ADDR видит PHP за nginx Beget — через api/ping.php с токеном мониторинга (monitor_token в config; временных
# эндпоинтов не создаём). Если запрос приходит с внутреннего адреса прокси, которого нет в trusted_proxies, — адрес добавляется
# (с копией config), иначе все клиенты для лимитов частоты выглядят одним адресом.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${LINEA_SSH_HOST:-beget-en0}"
ADMIN_EMAIL="aleksandrkyrlan83@gmail.com"
PHP=/usr/local/bin/php8.2
STAMP=$(date +%Y%m%d-%H%M)
SITE="https://xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai"

say() { printf '\n▶ %s\n' "$*"; }

say "1/6 Выкладка сайта"
./tools/deploy-beget.sh --site=domain

say "2/6 Настройки боевого config.php (копия: config.php.bak-$STAMP)"
ssh "$HOST" "cd ~/dizain-studiya-kvartir/linea-private && cp -p config.php config.php.bak-$STAMP && $PHP -r '
\$f = \"config.php\"; \$c = require \$f;
\$c[\"brig_mail_enabled\"] = true;                       // письма с кодом входа и уведомления кабинетов
\$c[\"admin_emails\"] = [\"$ADMIN_EMAIL\"];               // роль «Админка» на экране выбора
\$c[\"notify_enabled\"] = true;                          // письмо владельцу о новом брифе, оплате, правках
if (empty(\$c[\"notify_to\"])) { \$c[\"notify_to\"] = \"$ADMIN_EMAIL\"; }
if (empty(\$c[\"base\"])) { \$c[\"base\"] = \"$SITE\"; } // ссылки в письмах — только от адреса сайта
if (!isset(\$c[\"allow_test\"])) { \$c[\"allow_test\"] = false; }
if (empty(\$c[\"monitor_token\"])) { \$c[\"monitor_token\"] = bin2hex(random_bytes(24)); }   // токен для ping.php с подробностями (мониторинг, шаг 6)
file_put_contents(\$f, \"<?php\\n// правлено tools/vykladka-kabinety.sh $STAMP, прежняя версия — config.php.bak-$STAMP\\nreturn \" . var_export(\$c, true) . \";\\n\");
\$t = require \$f; echo \"config: brig_mail_enabled=\", var_export(\$t[\"brig_mail_enabled\"], true), \", admin_emails=\", count(\$t[\"admin_emails\"]), \", base задан=\", (\$t[\"base\"] ? \"да\" : \"нет\"), \", monitor_token задан=\", (strlen((string)(\$t[\"monitor_token\"] ?? \"\")) >= 24 ? \"да\" : \"нет\"), PHP_EOL;
' && chmod 600 config.php"

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
CFGR='cd ~/dizain-studiya-kvartir/linea-private && '
MON=$(ssh "$HOST" "$CFGR $PHP -r '\$c = require \"config.php\"; echo \$c[\"monitor_token\"] ?? \"\";'")
ping_detail() { curl -s --max-time 20 -H "X-Monitor-Token: $MON" "$SITE/api/ping.php"; }
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
  echo "  добавляю $ADD в trusted_proxies (копия: config.php.bak-$STAMP-proxy)"
  ssh "$HOST" "$CFGR cp -p config.php config.php.bak-$STAMP-proxy && $PHP -r '
\$f = \"config.php\"; \$c = require \$f;
\$c[\"trusted_proxies\"] = array_values(array_unique(array_merge((array)(\$c[\"trusted_proxies\"] ?? [\"127.0.0.1\", \"::1\"]), [\"$ADD\"])));
file_put_contents(\$f, \"<?php\\n// trusted_proxies дополнен tools/vykladka-kabinety.sh $STAMP\\nreturn \" . var_export(\$c, true) . \";\\n\");
' && chmod 600 config.php"
  sleep 3   # opcache перечитывает config.php не сразу
  printf '%s' "$(ping_detail)" | python3 -I -c 'import json,sys; p=json.load(sys.stdin)["proxy"]; print("  после правки: linea_ip=%s, X-Real-IP=%s — %s" % (p["linea_ip"], p.get("x_real_ip"), "ок" if p["linea_ip"] == p.get("x_real_ip") else "НЕ совпадает, проверить руками"))' || echo "  повторная проверка не удалась — открыть ping.php с токеном руками"
fi
unset MON

echo; echo "Готово. Дальше Claude проверит вход в кабинеты и админку."
