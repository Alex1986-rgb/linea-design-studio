# Бэкапы, проверка восстановления, мониторинг, почта домена — 02.11.2026

Повод: ревизия готовности (`docs/reviews/2026-11-02-reviziya-gotovnosti.md`). Эксплуатация была «красной»: бэкапов нет, мониторинга нет.
Условие на сегодня: у Beget лежит DNS (`SERVFAIL`, «No Reachable Authority at delegation beget.com»), SSH и API Beget недоступны
ни с мака, ни со SmartApe. Поэтому всё собрано и проверено на макете, а боевой первый прогон — одной командой после восстановления.

## План (выполнен)
1. Дамп на стороне Beget одним потоком: MySQL + `linea-private` + manifest с числом строк.
2. Бэкапер на SmartApe: шифрование 7z AES-256, 14 суточных + 8 недельных, копия на Google Диск.
3. Проверка восстановления во временной MariaDB со сверкой строк по manifest.
4. Монитор раз в 5 минут, оповещения только при смене состояния.
5. Инструкция по почте домена и план записей DNS (без применения).
6. Макет Beget для проверки, пока сервер лежит; одна команда на «после восстановления».

## Что сделано
- **Бэкап** (`tools/ops/beget-dump.sh` + `bk.mjs`). Один ssh-поток с `nice`/`ionice`. На Beget: `mysqldump --single-transaction`
  (нет mysqldump — PHP-дамп через PDO), архив `linea-private` без `sessions/rate/exports`, блокировок, временных и файлов больше 200 МБ.
  Пароль базы остаётся на Beget. На SmartApe: проверка архива → 7z AES-256 с шифрованием имён → `7z t` → daily/weekly → ротация →
  `gdrive:LINEA/Бэкапы/{daily,weekly}` (на Диске чистятся только `linea-*.7z` старше срока, ссылок нет). При сбое — оповещение.
- **Проверка восстановления** (`restore-check.sh`). Архив расшифровывается на SmartApe, пароль на мак не попадает.
  На маке дамп разворачивается во временную MariaDB, строки каждой таблицы сверяются с manifest, обязательны ключевые таблицы.
  Ещё проверяются копия SQLite, открытие `config.php` (значения не печатаются) и каждый `brief.zip`. Временная папка удаляется.
- **Монитор** (`monitor.mjs`): DNS (DoH + системный), главная, `api/ping.php`, `/kabinet/`, срок SSL (меньше 14 дней — предупреждение),
  свежесть бэкапа. Сбой засчитывается после 2 прогонов подряд; напоминание раз в 12 ч; о восстановлении сообщает сразу.
  Каналы: Telegram/вебхук из `secrets/notify.env`; без них — журнал `alerts.log` и файл-флаг `state/ALERT.txt`.
- **SmartApe**: `C:\linea-ops` (права только SYSTEM и Administrators), пароль архивов и ключ SSH созданы на сервере, ключ хоста Beget
  перенесён с мака. Задача **LineaMonitor** стоит и работает (SYSTEM, каждые 5 минут, код 0). Сейчас она честно показывает сбой:
  домен не резолвится. Задачу **LineaBackup** не ставил: до Beget не достучаться, а ставить её без удачного прогона нельзя.
  Это сделает `after-beget-up.sh`.
- **Почта**: `docs/ops/pochta-domena.md` — ящики, записи MX/SPF/DMARC/DKIM, проверка доставки. `tools/ops/dns-mail-plan.py`
  читает текущие записи (API `dns/getData` + DoH) и печатает команды `dns/changeRecords` с переносом текущих A/TXT. Ничего не применяет.

### Проверено
- Макет (`mock-beget.sh`): временная MariaDB, схема из настоящих `migrations.php` (39 таблиц), тестовые строки. Прогнан `beget-dump.sh`
  точно так же, как через ssh (`bash -s`), в обоих режимах: mysqldump и PHP-дамп. Restore-check в обоих — «проходит».
- Нарочно испорченный дамп (без строк `orders`) → `✗ orders: было 3, восстановлено 0`, код 1.
- Ротация: после 20 прогонов осталось 14 суточных и 8 недельных.
- На SmartApe от имени **SYSTEM** через Планировщик (разовая задача, потом удалена): шифрование, `7z t`, загрузка на Диск через rclone прошли.
  Restore-check с мака по архиву с SmartApe: расшифровка там, передача по ssh, развёртывание — «проходит».
- Монитор: оповещение приходит один раз, повторов нет, о восстановлении сообщает; на SmartApe отработал по расписанию.
- DNS домена: прочитать не удалось — Beget DNS не отвечает (02.11, около 14:00 МСК).

## Что осталось
- Боевой первый бэкап и задача LineaBackup — после восстановления Beget (`./tools/ops/after-beget-up.sh`).
  Ещё не проверено: пускает ли сеть SmartApe (там работает Happ/xray) SSH до Beget. Если не пускает, скрипт остановится на шаге 3
  и скажет об этом. Тогда нужен обход, как `-B en0` на маке.
- Канал оповещений: в `config.php` Telegram пуст (`tg_enabled=false`), почты с домена нет. **Сейчас оповещения пишутся только
  в журнал и `ALERT.txt` на SmartApe — владелец о сбое не узнает.**
- Записи почты (SPF/DMARC/DKIM) и `mail_from` — после ответа DNS Beget и решения по DKIM.
- `ping.php` сейчас переделывает другой разработчик (незакоммичено): публично остаются `ok/private/config`, монитору этого хватает.
  Подробности с последним прогоном cron отдаются по `monitor_token`. Когда это выложат, добавлю в монитор проверку «cron жив»:
  токен положить в `C:\linea-ops\secrets\notify.env` как `MONITOR_TOKEN`.
- На Диске остались три пробных архива самопроверки: `LINEA/Бэкапы/_проверка` (~0,9 МБ). Их можно удалить.

## Что нужно от Александра
1. Когда Beget оживёт — запустить `./tools/ops/after-beget-up.sh`. Он добавит ключ бэкапера на Beget (с ограничением `from=94.198.55.117`),
   сделает первый бэкап, поставит LineaBackup и проверит восстановление.
2. **Пароль архивов — в менеджер паролей**: `ssh smartape-win "type C:\linea-ops\secrets\backup.pass" | pbcopy`.
   Без него архивы на Диске не открыть, если пропадёт SmartApe.
3. Канал оповещений: создать Telegram-бота (@BotFather) и прислать токен и chat id. Положу их в `C:\linea-ops\secrets\notify.env`
   и проверю через `monitor.mjs --test-alert`.
4. Почта: завести `info@` (и `dmarc@`) в панели Beget, написать тикет о DKIM, потом применить записи командами из `dns-mail-plan.py`
   (это изменение боевого DNS — делаете вы).

Снять всё: `ssh smartape-win "schtasks /delete /tn LineaMonitor /f & schtasks /delete /tn LineaBackup /f"`; ключ на Beget — строка
`linea-backup@smartape` в `~/.ssh/authorized_keys`.

## Файлы
- `tools/ops/beget-dump.sh` — дамп на Beget (stdin ssh → tar.gz в stdout)
- `tools/ops/bk.mjs`, `tools/ops/lib.mjs` — бэкапер: backup / test / cat-latest / status
- `tools/ops/monitor.mjs` — монитор
- `tools/ops/restore-check.sh` — проверка восстановления
- `tools/ops/mock-beget.sh` — макет Beget
- `tools/ops/install-smartape.sh`, `tools/ops/after-beget-up.sh` — установка и одна команда после восстановления
- `tools/ops/run-backup.cmd`, `tools/ops/run-monitor.cmd`, `tools/ops/ops.example.json` — для Планировщика SmartApe
- `tools/ops/dns-mail-plan.py` — план записей почты (только чтение)
- `docs/ops/bekapy-i-monitoring.md` — эксплуатация, восстановление, снятие
- `docs/ops/pochta-domena.md` — почта домена
