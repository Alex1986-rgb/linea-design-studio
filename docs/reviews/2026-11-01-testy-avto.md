# Авто-проверки LINEA, 01.11.2026 (только чтение, код не правился)

| Проверка | Результат | Вывод |
|---|---|---|
| php -v | ок | PHP 8.5.9 |
| test-brigady.mjs (SQLite) | ок после подготовки | Из коробки падает: шаг 6, ENOENT `<private>/../brigady-pack/pack.json` (25 ✓ / 1 ✗). После `node tools/brigady-pack.mjs …/gost-draft/projects/prompt-kv54/project.json <scratch>/brigady-pack` — 102 ✓ / 0 ✗ |
| php -l по server/**/*.php (34 файла) | ок | синтаксических ошибок нет |
| sync-static-nav.js --check | ок | index.html, brief.html совпадают с каркасом |
| gen-home.js --check | ок | 106 локальных ссылок главной на месте |
| regen-fixtures.js | ок | 6/6 совпали (demo-56, house-120, broken, l-shaped, panel-bearing, studio-24); ✖ в выводе — ожидаемые ошибки заведомо кривого брифа `broken` |
| node --check (52 файла: site/js, tools, engine) | ок | ошибок нет |
| Ссылки site/**/*.html | ок | 98 страниц, 7638 локальных href/src/srcset, битых 0 |
| sitemap.xml | ок | 57 адресов, файлы есть у всех |
| archive-old-demos.js --check | ок | 17 страниц, правок не требуется |
| check-domain-copy.js (.deploy/domain, копия от 31.10) | 4 замечания | см. баги 3–4 |
| Запрещённые формулировки | 1 спорное | «0 ₽», «без предоплаты», NaN, undefined, [object, %%…%% в html — нет |

## Баги и замечания (по приоритету)

1. СРЕДНИЙ. site/remont/index.html:112 «Для вас подбор бесплатный» и site/js/remont.js:32 (абзац про бригады, слово «бесплатн…») — правило CLAUDE.md запрещает «бесплатно» на сайте; формулировка про подбор (а не про проект) — решить, допустимо ли; иначе заменить на «клиент за подбор не платит». site/compare/index.html:91 «бесплатно / подписка» — это про конкурента, допустимо.
2. СРЕДНИЙ (тесты). tools/test-brigady.mjs:27 по умолчанию ждёт pack.json в `<private>/../brigady-pack/`, которого нет; без него шаг 6 падает с ENOENT и тест краснеет на чистой машине. Нужен автосбор пака (из gost-draft/projects/prompt-kv54) или явная подсказка в сообщении. Также brigady-pack.mjs пишет «xlsx не собран: Cannot find package 'exceljs'» из gost-draft-svod/tools/export-xlsx.js — ведомости xlsx не собираются (нет npm install в gost-draft-svod).
3. НИЗКИЙ. site/brigady/index.html:70 — кириллический домен в href `https://дизайн-студия-квартир.рф/brigady/` (check-domain-copy: «punycode»); заменить на xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai.
4. НИЗКИЙ / ложное срабатывание. check-domain-copy ругается на api/brigade/tpl/shell.html (`%%CANON%%` — шаблон сервера, не страница). Стоит исключить tpl/ из проверки, иначе шум скрывает настоящие ошибки.
5. НИЗКИЙ. site/brief.html: служебная ссылка «скачать brief.json» — англ. служебное слово в тексте (по желанию «скачать бриф (файл)»).
6. ИНФО. В корне репо лежит неотслеживаемый файл `.cjs` (случайный артефакт) — удалить/в .gitignore. Автотестов, кроме test-brigady.mjs, в репозитории нет; других `--check`: gen-home, sync-static-nav, archive-old-demos (все зелёные). Не прогонялись (тяжёлые, headless): check-overlap, check-sheets, lint/audit-sheets.
7. ИНФО. «одной кнопкой» в site/index.html и site/brief.html — осознанно: site/ собран под домен (SITE_DEFAULT='domain', есть приёмник), GitHub Pages теперь отдаёт только редирект (pages.yml → gen-pages-redirect). Не баг.
