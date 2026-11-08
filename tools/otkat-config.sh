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
# Цель: --target=vps (или DEPLOY_TARGET=vps) — config.php на VPS SmartApe (ssh sm-vps, /srv/beget/dizain-studiya-kvartir/linea-private,
# системный php 8.3); после отката файл отдаётся www-data (ssh заходит root-ом). По умолчанию — Beget (TARGET_DEFAULT).
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET_DEFAULT=beget                       # ← после переключения DNS домена на VPS поставить vps
TARGET="${DEPLOY_TARGET:-$TARGET_DEFAULT}"
CMD=rollback; EXTRA=()
for a in "$@"; do case "$a" in
  --list) CMD=list;; --dry) EXTRA+=(--dry);; --file=*) f="${a#*=}"; [[ "$f" =~ ^config\.php\.bak-[A-Za-z0-9_.-]+$ ]] || { echo "неверное имя копии"; exit 2; }; EXTRA+=("--file=$f");;
  --target=*) TARGET="${a#*=}";;
  *) echo "ключи: --list | --dry | --file=<config.php.bak-…> | --target=beget|vps"; exit 2;; esac; done
case "$TARGET" in
  # shellcheck disable=SC2088  # тильду раскрывает удалённая оболочка Beget
  beget) HOST="${LINEA_SSH_HOST:-beget-en0}"; PHP="${LINEA_PHP:-/usr/local/bin/php8.2}"; PRIV='~/dizain-studiya-kvartir/linea-private'; OWN="" ;;
  vps)   HOST="${VPS_SSH_HOST:-sm-vps}"; PHP="${LINEA_PHP:-php}"; PRIV="${VPS_ROOT:-/srv/beget}/dizain-studiya-kvartir/linea-private"; OWN="&& chown www-data:www-data config.php config.php.bak-*" ;;
  *) echo "Неизвестная цель --target=$TARGET (знаю beget и vps)"; exit 2 ;;
esac
if [ -n "${LINEA_CFG_DIR:-}" ]; then
  exec "${LINEA_PHP:-php}" tools/config-edit.php --dir="$LINEA_CFG_DIR" "$CMD" ${EXTRA[@]+"${EXTRA[@]}"}
fi
# при --list / --dry ничего не пишется — chmod/chown не нужны, но и не вредят (файлы уже есть)
ssh "$HOST" "cd $PRIV && $PHP -- $CMD ${EXTRA[*]:-} && chmod 600 config.php $OWN" < tools/config-edit.php
