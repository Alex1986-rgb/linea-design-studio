#!/usr/bin/env bash
# Выкладка кабинетов (02.11.2026): сайт → настройки боевого config → cron раз в 15 минут → проверка.
# Запускает Александр: ./tools/vykladka-kabinety.sh
# Боевой config.php перед правкой копируется рядом (config.php.bak-<дата>). Пароли и ключи не печатаются.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${LINEA_SSH_HOST:-beget-en0}"
ADMIN_EMAIL="aleksandrkyrlan83@gmail.com"
PHP=/usr/local/bin/php8.2
STAMP=$(date +%Y%m%d-%H%M)
SITE="https://xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai"

say() { printf '\n▶ %s\n' "$*"; }

say "1/5 Выкладка сайта"
./tools/deploy-beget.sh --site=domain

say "2/5 Настройки боевого config.php (копия: config.php.bak-$STAMP)"
ssh "$HOST" "cd ~/dizain-studiya-kvartir/linea-private && cp -p config.php config.php.bak-$STAMP && $PHP -r '
\$f = \"config.php\"; \$c = require \$f;
\$c[\"brig_mail_enabled\"] = true;                       // письма с кодом входа и уведомления кабинетов
\$c[\"admin_emails\"] = [\"$ADMIN_EMAIL\"];               // роль «Админка» на экране выбора
if (empty(\$c[\"base\"])) { \$c[\"base\"] = \"$SITE\"; } // ссылки в письмах — только от адреса сайта
if (!isset(\$c[\"allow_test\"])) { \$c[\"allow_test\"] = false; }
file_put_contents(\$f, \"<?php\\n// правлено tools/vykladka-kabinety.sh $STAMP, прежняя версия — config.php.bak-$STAMP\\nreturn \" . var_export(\$c, true) . \";\\n\");
\$t = require \$f; echo \"config: brig_mail_enabled=\", var_export(\$t[\"brig_mail_enabled\"], true), \", admin_emails=\", count(\$t[\"admin_emails\"]), \", base задан=\", (\$t[\"base\"] ? \"да\" : \"нет\"), PHP_EOL;
' && chmod 600 config.php"

say "3/5 Cron-скрипт вне веб-корня"
ssh "$HOST" 'mkdir -p ~/dizain-studiya-kvartir/server-tools && ln -sfn ~/dizain-studiya-kvartir/public_html/api ~/dizain-studiya-kvartir/api'
scp -q server/tools/cron.php "$HOST":dizain-studiya-kvartir/server-tools/cron.php
RHOME=$(ssh "$HOST" 'echo $HOME')
CMD="$PHP $RHOME/dizain-studiya-kvartir/server-tools/cron.php --private=$RHOME/dizain-studiya-kvartir/linea-private"
echo "пробный прогон:"; ssh "$HOST" "$CMD" | tail -5

say "4/5 Задача в планировщике Beget (раз в 15 минут)"
if python3 -I tools/beget-api.py cron/getList | grep -q "server-tools/cron.php"; then
  echo "задача уже есть — не дублирую"
else
  python3 -I tools/beget-api.py cron/add "{\"minutes\":\"*/15\",\"hours\":\"*\",\"days\":\"*\",\"months\":\"*\",\"weekdays\":\"*\",\"command\":\"$CMD >/dev/null 2>&1\"}"
fi

say "5/5 Проверка адресов"
for u in "" kabinet/ brigada/ api/ping.php api/vhod.php?a=me api/panel.php brigady/ remont/; do
  printf '%s  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITE/$u")" "/$u"
done
echo; echo "Готово. Дальше Claude проверит вход в кабинеты и админку."
