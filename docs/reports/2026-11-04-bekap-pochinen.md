# Бэкап LINEA: почему не проходил и что сделано (04.11.2026)

## Симптом
`bk.mjs status` показывал `lastOk: null` — ни одной удачной копии. Каждый прогон висел ровно
60 минут и падал с «источник не ответил за 60 минут». В журнале было видно, что SSH к Beget
подключился, `beget-dump.sh` стартовал, но дальше — тишина.

## Причина
Не Beget и не дамп. Проверка с самого SmartApe:
- вручную `bash ~/linea-ops/beget-dump.sh dump` — 1 секунда, 1 МБ, «готово»;
- тот же вызов из Node через `spawnSync`/`spawn` с **Windows OpenSSH** (`C:\Windows\System32\OpenSSH\ssh.exe`)
  отдаёт первые строки и **не завершается** — ни `version`, ни `dump`;
- тот же вызов через **Git for Windows ssh** (`C:\Program Files\Git\usr\bin\ssh.exe`) — 0,4–0,6 с, код 0.

То есть Windows OpenSSH зависает при запуске из Node с pipe-ами; интерактивный PowerShell работал,
поэтому проблема не была видна.

## Что сделано
- `tools/ops/bk.mjs`: на Windows по умолчанию берётся Git ssh, если он установлен; путь можно
  переопределить в `ops.json → ssh`. На сервере в `C:\linea-ops\ops.json` прописан явный
  `"ssh": "C:\\Program Files\\Git\\usr\\bin\\ssh.exe"`.
- Снят зависший процесс `bk.mjs backup` и lock-файл, бэкап запущен заново.
- Создана задача Планировщика **`LineaBackup`** (ежедневно 04:20, SYSTEM) — раньше её не было.
- В `ops.json` включён `expectBackup: true` — монитор снова ждёт свежую копию.
- Прогнана проверка восстановления `tools/ops/restore-check.sh`.

## Результат
| Проверка | Результат |
|---|---|
| `bk.mjs backup` | `linea-20261104-0745.7z` (1,0 МБ), Диск: ok, недельная копия |
| `bk.mjs status` | `last.ok = true`, daily/weekly заполнены |
| `restore-check.sh` | дамп MySQL развёрнут, 39 таблиц / 26 строк; SQLite ok; config.php ok; 21 файл, brief.zip 0 — **восстановление проходит** |
| `LineaBackup` | создана, следующий запуск 05.11.2026 04:20 |

## Что осталось
- Прогон задачи в 04:48 упёрся в **rateLimitExceeded Google Drive** при выгрузке; локальная копия
  и недельная есть, копия 04:45 на Диске уже лежит. Следующий прогон повторит выгрузку.
- **Cron Beget раз в 15 минут не добавлен**: API Beget отдаёт 502, а в SSH-оболочке Beget нет
  команды `crontab`. Добавить вручную: панель Beget → Cron, команда
  `/usr/local/bin/php8.2 /home/a/aleks2si/dizain-studiya-kvartir/server-tools/cron.php --private=/home/a/aleks2si/dizain-studiya-kvartir/linea-private >/dev/null 2>&1`, период `*/15`.
- Пароль архивов — в менеджер паролей (на SmartApe `C:\linea-ops\secrets\backup.pass`).

## Файлы
`tools/ops/bk.mjs`, `docs/plans/2026-11-04-dodelat-vse.md`;
на сервере — `C:\linea-ops\ops.json`, задача `LineaBackup`.
