#!/usr/bin/env bash
# LINEA · откат боевого config.php к последней копии config.php.bak-* (ревью 02.11, С8). Запускает Александр.
#
#   ./tools/otkat-config.sh --list            какие копии есть (новые сверху), содержимое не печатается
#   ./tools/otkat-config.sh --dry             какую копию вернул бы (копия проверяется php -l и require)
#   ./tools/otkat-config.sh                   вернуть последнюю копию
#   ./tools/otkat-config.sh --file=config.php.bak-20261102-153012   вернуть указанную
#
# Как и правка, откат атомарный (tools/config-edit.php: временный файл → проверка → rename); текущий config перед откатом
# сохраняется копией config.php.bak-<время>-before-otkat — откат отката тем же скриптом с --file=.
# Макет на маке: LINEA_CFG_DIR=<папка с config.php> ./tools/otkat-config.sh … (без ssh).
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${LINEA_SSH_HOST:-beget-en0}"; PHP="${LINEA_PHP:-/usr/local/bin/php8.2}"
CMD=rollback; EXTRA=()
for a in "$@"; do case "$a" in
  --list) CMD=list;; --dry) EXTRA+=(--dry);; --file=*) f="${a#*=}"; [[ "$f" =~ ^config\.php\.bak-[A-Za-z0-9_.-]+$ ]] || { echo "неверное имя копии"; exit 2; }; EXTRA+=("--file=$f");;
  *) echo "ключи: --list | --dry | --file=<config.php.bak-…>"; exit 2;; esac; done
if [ -n "${LINEA_CFG_DIR:-}" ]; then
  exec "${LINEA_PHP:-php}" tools/config-edit.php --dir="$LINEA_CFG_DIR" "$CMD" ${EXTRA[@]+"${EXTRA[@]}"}
fi
ssh "$HOST" "cd ~/dizain-studiya-kvartir/linea-private && $PHP -- $CMD ${EXTRA[*]:-} && chmod 600 config.php" < tools/config-edit.php
