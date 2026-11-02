# Бэкапы и мониторинг LINEA (SmartApe)

Всё работает на сервере SmartApe (`ssh smartape-win`), папка `C:\linea-ops`. На мак ничего крупного не тянется.

## Что где

| Что | Где |
|---|---|
| Скрипты (копия `tools/ops/`) | `C:\linea-ops\tools` |
| Настройки | `C:\linea-ops\ops.json` (образец — `tools/ops/ops.example.json`) |
| Секреты (только SYSTEM и Administrators) | `C:\linea-ops\secrets`: `backup.pass` (пароль архивов), `beget_ed25519` (ключ SSH до Beget), `known_hosts`, `notify.env` (Telegram, когда будет) |
| Архивы | `C:\linea-ops\backups\daily` (14 штук), `...\weekly` (8 штук); копия — Google Диск `LINEA/Бэкапы/daily`, `.../weekly` |
| Журналы | `C:\linea-ops\logs\backup.log`, `monitor.log`, `alerts.log` |
| Флаг сбоя | `C:\linea-ops\state\ALERT.txt` (появляется при сбое; после полного восстановления переименовывается в `ALERT-<дата>-closed.txt`) |

## Бэкап

Каждую ночь в 04:20 задача **LineaBackup** (SYSTEM): одно SSH-соединение до Beget → `beget-dump.sh` на сервере
(с `nice`/`ionice`) снимает дамп MySQL `aleks2si_linea` (mysqldump, а если его нет — PHP-дамп) и архивирует
`~/dizain-studiya-kvartir/linea-private` без `sessions/`, `rate/`, `exports/`, блокировок и файлов больше 200 МБ
(их список — в `_dump/skipped-big.txt`). В архив кладётся `_dump/manifest.json` с числом строк каждой таблицы.
Пароль базы не покидает Beget. Чужие сайты аккаунта не читаются.

**Ключ SmartApe на Beget умеет только отдать дамп** (ревью 02.11, В4): в `~/.ssh/authorized_keys` строка ключа
`linea-backup@smartape` с `command="nice -n 19 bash ~/linea-ops/beget-dump.sh",no-pty,no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-user-rc,from="94.198.55.117"`.
Бэкапер передаёт только слово-режим (`dump` | `check` | `version`), всё остальное скрипт отвергает с кодом 64 — оболочки
на аккаунт Beget у SmartApe нет. Скрипт лежит на Beget в `~/linea-ops/beget-dump.sh`; перед каждым дампом бэкапер сверяет
его sha256 с репозиторием (расхождение — предупреждение). Обновить после правки: `./tools/ops/after-beget-up.sh --only-script`.

На SmartApe архив проверяется (`tar`, наличие дампа и config), шифруется 7-Zip AES-256 с шифрованием имён
(пароль уходит в 7z через stdin, не в командной строке), проверяется `7z t`, кладётся в daily (раз в 7 дней — копия в weekly),
копия уходит на Диск (публичных ссылок нет).

**Пустой или подозрительный дамп не принимается** (ревью 02.11, В3): драйвер базы `none`, 0 таблиц, нет config — отказ;
число заказов, строк, файлов или размер упали больше чем на `backupDropPct` % (по умолчанию 40) к последней удачной копии
(`state\backup-last-ok.json`) — копия шифруется в `backups\suspect` (3 последних), в daily/weekly и на Диск не идёт,
хорошие не вытесняет, сигнал «бэкап отвергнут» — при каждом отказе. Падение законное (удалили тестовые заказы) —
один прогон `bk.mjs backup --accept-drop`. Пропущенные большие файлы — сигнал «бэкап прошёл с замечаниями».

**Ротация — по числу, не по возрасту**, и локально, и на Диске: удаляются только самые старые наши `linea-*.7z` сверх
max(14/8, `keepMinGood` = 7). Если бэкап перестал проходить, хорошие копии лежат сколько угодно долго.

Команды (с мака):

```bash
ssh smartape-win "node C:\linea-ops\tools\bk.mjs status"     # что лежит, последний удачный
ssh smartape-win "node C:\linea-ops\tools\bk.mjs test"       # целостность и пароль последнего архива
ssh smartape-win "schtasks /run /tn LineaBackup"             # внеочередной бэкап
./tools/ops/restore-check.sh                                 # проверка восстановления (мак, временная MariaDB, всё удаляется)
```

**Пароль архивов есть только на SmartApe.** Без него архивы на Диске бесполезны, если сервер пропадёт.
Скопировать в менеджер паролей, не показывая на экране:

```bash
ssh smartape-win "type C:\linea-ops\secrets\backup.pass" | pbcopy   # затем вставить в менеджер паролей и очистить буфер
```

### Восстановление (если Beget потерян)

1. Взять архив: `C:\linea-ops\backups\daily\linea-ГГГГММДД-ЧЧММ.7z` или с Диска `LINEA/Бэкапы/daily`.
2. Открыть 7-Zip (на маке — Keka или `7z x`) с паролем → внутри `linea-….tgz` → распаковать.
3. База: `mysql -u aleks2si_linea -p aleks2si_linea < _dump/mysql.sql` (на новом хостинге — новая база, потом `'db'` в config.php).
4. Файлы: содержимое `linea-private/` → `~/dizain-studiya-kvartir/linea-private/` (вне веб-корня), права 700 на папку.
5. Проверить `https://<домен>/api/ping.php` и вход в админку.

## Мониторинг

Задача **LineaMonitor** (SYSTEM, каждые 5 минут), `monitor.mjs`: DNS домена (DoH Google + системный),
главная, `api/ping.php` (ok/private/config), `/kabinet/`, срок SSL (меньше 14 дней — «внимание»),
свежесть бэкапа (не старше 30 часов; пока `expectBackup=false` — постоянное «внимание: бэкап не настроен»),
**cron на Beget** (ревью 02.11, С7): по токену мониторинга `ping.php` отдаёт отметку последнего прогона `cron.php` — старше
45 минут или не было ни разу — сбой (иначе чеки, напоминания и автоудаление ПДн молча стоят). Токен —
`C:\linea-ops\secrets\monitor.token` (= `monitor_token` в config Beget; переносит `after-beget-up.sh` без вывода на экран),
передаётся только заголовком `X-Monitor-Token`. Нет токена — «внимание».

Без шума: сбой подтверждается двумя прогонами подряд (10 минут), одно оповещение на все сменившиеся проверки,
пока сбой длится — напоминание раз в 12 часов, восстановление — сразу.

Каналы: **Telegram** — если в `C:\linea-ops\secrets\notify.env` есть `TG_TOKEN=…` и `TG_CHAT=…`;
`WEBHOOK_URL=…` — любой приёмник POST JSON. Без них — только `alerts.log` и `ALERT.txt`.
Проверка канала: `ssh smartape-win "node C:\linea-ops\tools\monitor.mjs --test-alert"`.
Текущее состояние: `ssh smartape-win "node C:\linea-ops\tools\monitor.mjs --print"` (сам прогон тоже засчитывается).

## Установка, обновление, снятие

```bash
./tools/ops/install-smartape.sh          # скрипты, секреты (не перезаписывает), самопроверка, задача LineaMonitor
./tools/ops/after-beget-up.sh            # после восстановления Beget: скрипт и ключ с принудительной командой, первый бэкап, LineaBackup, токен монитора, restore-check, DNS
./tools/ops/after-beget-up.sh --only-script   # только обновить ~/linea-ops/beget-dump.sh на Beget
node tools/ops/test-ops.mjs              # проверка контура на макете (без сети): отказы бэкапа, ротация, ключ, монитор, правка/откат config
```

Снять задачи: `ssh smartape-win "schtasks /delete /tn LineaMonitor /f & schtasks /delete /tn LineaBackup /f"`.
Отозвать доступ бэкапера к Beget: удалить строку с `linea-backup@smartape` из `~/.ssh/authorized_keys` на Beget.
Удалить всё с сервера: после снятия задач — папка `C:\linea-ops` (в ней архивы: сначала убедиться, что копия на Диске есть).

## Макет (когда Beget недоступен)

```bash
./tools/ops/mock-beget.sh <scratch>/mock --keep          # временная MariaDB + схема из migrations.php + beget-dump.sh → mock-backup.tgz
LINEA_OPS_HOME=<scratch>/ops node tools/ops/bk.mjs backup --local-root=<scratch>/mock/root/dizain-studiya-kvartir --no-upload
LINEA_OPS_HOME=<scratch>/ops LINEA_SCRATCH=<scratch> ./tools/ops/restore-check.sh --local
```
