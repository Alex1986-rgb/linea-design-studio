# Выкладка LINEA на VPS SmartApe — цель `--target=vps` (08.11.2026)

Сайты аккаунта Beget `aleks2si` переезжают на VPS SmartApe 45.154.185.168 (ssh `sm-vps`, root). Копия домашней
папки Beget лежит в `/srv/beget/` той же раскладкой; сайты отдаёт nginx → Apache → PHP-fpm от `www-data`; базы MySQL
перенесены в MariaDB с теми же именами и паролями. DNS ещё на Beget, переключается по одному сайту.

## Что сделано

Во все скрипты выкладки и эксплуатации добавлена цель VPS. **По умолчанию всё по-прежнему льётся на Beget** — пока
домен смотрит туда. Переключение: ключ `--target=vps` или переменная `DEPLOY_TARGET=vps`; после переезда DNS достаточно
поменять `TARGET_DEFAULT=beget` → `vps` в шапке скрипта.

| Скрипт | Куда лил | Что добавлено для VPS |
|---|---|---|
| `tools/deploy-beget.sh` | beget-en0 → `~/dizain-studiya-kvartir/public_html` | sm-vps → `/srv/beget/dizain-studiya-kvartir/public_html`; после заливки `chown -R www-data`; `php -l` для `api/*.php` (PHP 8.3 вместо 8.2); прозвон домена по IP VPS (`--resolve`, без проверки сертификата); маркер и `_backup` при `--prune` тоже → www-data |
| `tools/deploy-3d.sh` | beget-en0 → `~/3d-linea/public_html` | sm-vps → `/srv/beget/3d-linea/public_html`, chown www-data, прозвон поддомена по IP VPS |
| `tools/vykladka-kabinety.sh` | beget-en0, php8.2 Beget, cron через API Beget | sm-vps, системный `php`, пути `/srv/beget/...`; `config.php` и копии после правки → www-data (иначе PHP-fpm не прочитает 600); пробный прогон cron.php от `www-data` (runuser); **шаг 4 (API Beget cron/add) пропускается** — печатается строка для `/etc/cron.d/linea-cron`; адреса проверяются по IP VPS; при VPN ssh/curl в обход через en0 |
| `tools/otkat-config.sh` | beget-en0 | `--target=vps`: путь `/srv/beget/.../linea-private`, `php`, после отката chown www-data |
| `tools/switch-to-domain.sh` | API Beget (домен, привязка, SSL) + deploy | при `--target=vps` шаги 1–3 и 6 (API Beget, https по DNS) пропускаются с сообщением; остаются шаг 0 (готовность копии) и выкладка `deploy-beget.sh --target=vps` |
| `tools/ops/beget-dump.sh` | выполняется на Beget (forced-command ключа SmartApe) | сам находит `/srv/beget/dizain-studiya-kvartir`, если `~/dizain-studiya-kvartir` нет; под root дамп `aleks2si_linea` идёт `mysqldump --protocol=socket` без пароля (`LINEA_DUMP_ROOT_SOCKET=auto`, в manifest `method: mysqldump-root-socket`); режим `check` печатает `root_socket` и `root` |
| `tools/ops/after-beget-up.sh` | ставит скрипт и ключ на Beget, включает бэкап на SmartApe | `--target=vps`: скрипт → `/srv/beget/linea-ops/beget-dump.sh`, ключ бэкапера с принудительной командой `LINEA_ROOT=/srv/beget/dizain-studiya-kvartir nice -n 19 bash …` → `/root/.ssh/authorized_keys` на VPS, проверка «check проходит / id отвергается» с SmartApe по IP, `ops.json` на SmartApe получает `source: vps`, первый бэкап снимается с VPS |
| `tools/ops/lib.mjs`, `bk.mjs`, `ops.example.json` | источник дампа — только Beget | `source: beget|vps` в ops.json, блок `vps` (host 45.154.185.168, user root), `dumpSource()`; сообщения называют источник |
| `tools/ops/install-smartape.sh` | known_hosts только gandalf.beget.com | переносит и ключ хоста VPS (45.154.185.168) |
| `tools/ops/vps-dump.sh` (новый) | — | бэкап с VPS одной командой с мака: `beget-dump.sh` уходит на VPS по stdin, tar.gz (дамп MariaDB + linea-private) → `.deploy/backups/linea-vps-<время>.tar.gz`; `--check` — готовность |

Не трогал: `tools/site-rebase.js`, `tools/site-shell.js` (Beget там только в комментариях и адресе технического превью —
логики выкладки нет), `tools/beget-api.py` (панель Beget, в VPS-режиме не вызывается), `tools/ops/restore-check.sh`,
`mock-beget.sh`.

## Как лить на VPS одной командой

```bash
./tools/deploy-beget.sh --target=vps                 # сайт (сначала можно --dry-run / --check)
./tools/deploy-3d.sh --src <папка> --all --target=vps --go
./tools/vykladka-kabinety.sh --target=vps            # сайт + config + cron.php (строку cron поставить руками)
./tools/otkat-config.sh --target=vps --list
./tools/ops/vps-dump.sh                              # бэкап с VPS в .deploy/backups/
./tools/ops/after-beget-up.sh --target=vps           # ночной бэкап SmartApe переключить на VPS (ключ в /root/.ssh — только по «да»)
```

## Проверено (ничего не выложено)

`bash -n` и shellcheck всех скриптов, `node --check` для ops/*.mjs; `deploy-beget.sh --check --target=vps` и `--dry-run
--target=vps` (связь через en0 при VPN, папка на месте, 23 адреса домена по IP VPS — 200/301/404 как надо, `api/ping.php`
ok); `deploy-3d.sh --check --target=vps` (каталог есть, поддомен отвечает по IP); `vps-dump.sh --check` → `root_socket=1`,
`php 8.3`, `mysqldump` есть.

## Что осталось

- Сертификаты на VPS для доменов ещё не выпущены — прозвон в VPS-режиме идёт с `-k`; после DNS и выпуска можно убрать.
- Cron кабинетов на VPS (`/etc/cron.d/linea-cron`, строку печатает `vykladka-kabinety.sh --target=vps`) — поставить руками.
- Ключ бэкапера в `/root/.ssh/authorized_keys` VPS и `source: vps` в ops.json — только запуском `after-beget-up.sh --target=vps`
  по явному «да» Александра.
- После переключения DNS: `TARGET_DEFAULT=vps` в `deploy-beget.sh`, `deploy-3d.sh`, `vykladka-kabinety.sh`, `otkat-config.sh`.
