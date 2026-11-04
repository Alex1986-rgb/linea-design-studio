# «Доделать все пункты»: итог на 04.11.2026

## Статус по пунктам
| № | Пункт | Статус |
|---|---|---|
| 1 | Бэкап LINEA, восстановление, cron Beget | **бэкап и восстановление — готово**; cron — блокер Beget API 502 |
| 2 | elite-modern: кадры, PDF | **ждёт подписей Александра** (11 из 12 кадров не приняты) |
| 3 | Движок: кессоны в разрезе, профиль балки | **готово** (коммит `3b51c0e`) |
| 4 | Референсы клиента: оси, образ, лист | **оси и образ — готово** (коммит `5bfa7e8`); лист «референсы → решения» — остался |
| 5 | Обучение на 10 000 интерьеров | **пилот готов**, сбор 300 идёт; масштаб 10 000 — следующим прогоном |
| 6 | Комплектатор | не начат — следующий специалист |
| 7 | DWG/ODA и слияние `svod → main` | **оба блокера**: ODA не установлен; в главном чекауте untracked-файл, который перекрывает fast-forward |
| 8 | Отчёт и коммиты | этот отчёт; отчёты движка и бэкапа закоммичены |

## Что сделано подробно
- **Бэкап:** причина — Windows OpenSSH зависает из Node; переключили на Git ssh, создали задачу
  `LineaBackup` (04:20, SYSTEM), включили `expectBackup`, прогнали восстановление — проходит.
  Отчёт: `docs/reports/2026-11-04-bekap-pochinen.md`.
- **Кессоны:** `depth`/`beam`/`profile`/`level`; на плане — две линии по ширине балки; на «Сечениях
  потолков» — узел «Кессон»; FN-44 требует глубину и балку; сметчик считает каркас (м.п.) и обшивку (м²).
  Проверки: finisher/estimator/normcontrol 230/230/designer 86/86/drywall — зелёные; `kv-45` — 0 блокеров.
  Отчёт: `gost-draft-svod/docs/reports/2026-11-04-keessony-razrez.md`.
- **Референсы:** `refs-style` читает `axes.json` и возвращает оси; `intake` кладёт их в `style.proposed`;
  `style-look --from-style` применяет ближайший стиль и сохраняет `references` + `customLook`. Тест на
  3 кадрах — $0,025. Отчёт: `gost-draft-svod/docs/reports/2026-11-04-referensy-klienta.md`.
- **Обучение:** `tools/learn/interiors-learn.py` — Яндекс.Картинки + Pinterest (доминирующий цвет пина),
  CLIP ViT-B-32 на CPU SmartApe, только агрегаты, картинки удаляются. Пилоты: 15 кадров (Яндекс),
  7 пинов (Pinterest); палитры тёплые. Отчёт: `gost-draft-svod/docs/reports/2026-11-04-obuchenie-interery.md`.

## Что нужно от Александра
1. **Подписи кадров elite-modern** — без них ST-13 не снимается, финальный PDF не выпускается.
   Открыт `projects/elite-modern/_vydacha/elite-modern-polnyj.pdf`; список непринятых кадров —
   `node tools/views-check.js projects/elite-modern/project.json`.
2. **Cron Beget:** панель Beget → Cron, `*/15`, команда
   `/usr/local/bin/php8.2 /home/a/aleks2si/dizain-studiya-kvartir/server-tools/cron.php --private=/home/a/aleks2si/dizain-studiya-kvartir/linea-private >/dev/null 2>&1`.
3. **Цены на декор и кессоны** — книга цен или решение; сейчас строки «по КП».
4. **ODA File Converter** — установить/разрешить; без него DWG-приём/выдача не закрывается.
5. **Слияние main:** убрать/закоммитить `projects/prompt-kv54/apply-decisions-2026-10-28.mjs`
   в главном чекауте, иначе fast-forward не проходит.

## Что осталось по продукту
- Лист «Ваши референсы → что мы взяли» (данные уже в `object.design.references`).
- Комплектатор: артикулы, цены, наличие, три бюджета.
- Масштаб обучения 10 000 + отбор 100–200 лучших кадров и обновление `looks.json`/`axes.json`.
