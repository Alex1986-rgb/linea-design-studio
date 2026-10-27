# Готовность к переезду на дизайн-студия-квартир.рф (27.10.2026)

Запрос: подготовить переезд так, чтобы после подтверждения домена всё делалось одной командой. Push не делался,
на домен ничего не выкладывалось (домен в статусе ESIA, не привязан).

## Итог проверки

**Готово.** Репетиция `./tools/switch-to-domain.sh --dry-run` прошла без ошибок и предупреждений:

| Проверка | Результат |
|---|---|
| Правка `SITE_DEFAULT = 'domain'` (та же команда, что в боевом шаге 4, на копии `site-shell.js`) | срабатывает, `BASE` = `https://xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai` |
| `site-rebase --site=domain --in-place` на копии `site/` (переезд насовсем, для Pages) | 67 файлов, 647 вхождений; github.io / beget.tech — 0 |
| Копия для Beget `.deploy/domain` (`tools/check-domain-copy.js`) | 1332 файла, 112 текстовых, 79 страниц — **0 ошибок** |
| canonical | 62 страницы, все на домене (https, Punycode), каждый ведёт на существующую страницу; у остальных 17 — noindex / 404 / order / review |
| Ссылки и ресурсы страниц (href / src / srcset / action) | 6448 на свой сайт — битых 0; внешние: только fonts.googleapis.com, fonts.gstatic.com, wa.me |
| github.io / beget.tech / alex1986-rgb / свой домен по http | 0 во всех текстах (html, xml, txt, json, js, css, php, .htaccess) |
| robots.txt | открыт, `Sitemap: https://xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai/sitemap.xml`, пути без `/linea-design-studio/` |
| sitemap.xml | 57 адресов: все на домене, файлы есть, noindex-страниц нет, canonical каждой = её `<loc>` |
| .htaccess | 301 на https и без www, X-Robots-Tag (noindex технического адреса) нет |
| Приёмник | `api/pay-notify.php` на месте, мета `linea-api` на brief / review / order |
| Страницы-переходы GitHub Pages | 89 + `404.html`; у каждой refresh = canonical = тот же путь на домене; все 89 целей есть в копии |

Негативный прогон проверки (испорченная копия: ссылка на github.io, битая ссылка, картинка с beget.tech, страница без
canonical, `Disallow: /`, `<loc>` на техническом адресе, 302 вместо 301) — поймано всё.

`./tools/switch-to-domain.sh --check` (живой): шаг 0 зелёный → шаг 1 «регистрация ещё не подтверждена (статус ESIA)».
`--check --host=linea.aleks2si.beget.tech` (проверка самого шага 3): «https не открывается (000)» — верно, у технического
адреса SSL нет. Обработчик вебхука на `php -S` локально: GET → 405, POST «{}» → 200, чужой хост по http → 403,
по http с подделанным `X-Forwarded-Proto: https` → 200 (на Beget это покажет шаг 3, см. «Осталось»).

## Что сделано

1. **`tools/gen-pages-redirect.js`** — страницы-переходы для GitHub Pages → `.deploy/pages-redirect/` (только собирает).
   На каждую HTML-страницу — `location.replace` (переносит `?p=…&s=…` — ссылки «Правка к этому листу» из выданных PDF
   продолжат работать), `<meta http-equiv="refresh" content="0; url=…">` и `<link rel="canonical">` на тот же путь домена;
   `index.html` → папка, `_release.html` / `_dev-*` → папка; `404.html` уводит любой другой путь (PDF, листы SVG,
   картинки); `.nojekyll`, `redirects.tsv`. Адреса — Punycode, путь — percent-encoding. Самопроверка в конце.
2. **`tools/check-domain-copy.js`** — проверка копии под домен (без сети): адреса во всех текстах, canonical / og /
   schema.org, все ссылки страниц на существующие файлы, robots, sitemap, .htaccess, приёмник, таблица переходов.
3. **`tools/switch-to-domain.sh`**:
   - шаг 0 (в `--check` и `--dry-run`) — готовность без сети на копиях; `--dry-run` — только он;
   - шаг 3 — сертификат принят (иначе отличает «нет SSL» от «сертификат не на этот домен»), срок (< 14 дней —
     предупреждение), www, http → 301 на https; **вебхук ЮKassa**: GET → 405, POST «{}» по https → 200 (PHP видит https;
     403 = вебхук отвергнет уведомления — стоп), подделка заголовка по http — предупреждение, `api/ping.php` (PHP,
     режим оплаты, конфиг) и URL для кабинета ЮKassa. **В ЮKassa ничего не уходит**: пустое тело обработчик закрывает
     до запроса к API;
   - шаг 4 — после `--in-place` копия `.deploy/domain` проверяется до заливки, иначе стоп;
   - шаг 6 — прозвон после заливки: всё из шага 3 строго + canonical главной, robots, sitemap, нет X-Robots-Tag;
   - `--check --host=<хост>` — прогнать шаг 3 против другого хоста.
4. **`docs/kb/pereezd-domena-vebmaster.md`** — чек-лист: день переезда, Яндекс.Вебмастер, Search Console, как применить
   страницы-переходы (вариант: один шаг в `pages.yml`), что проверить, чего не делать.

## Важный вывод для решения

Старый сайт — **папка на github.io**, не домен. Яндекс склеивает только домены целиком и межхостовый canonical не
учитывает; «Переезд сайта» в Вебмастере и «Изменение адреса» в Search Console для папки не работают. Значит, домен
войдёт в Яндекс как **новый сайт**, а единственный сигнал переезда для Яндекса — страницы-переходы (meta refresh он
считает редиректом). Поэтому в чек-листе **переходы на Pages — сразу после push**, а не «через 1–3 месяца с canonical»,
как было в `2026-10-27-pereezd-beget.md`: полный сайт на Pages с canonical для Яндекса — дубль.

## Что осталось

- Подтвердить домен (Госуслуги), выпустить SSL, запустить `./tools/switch-to-domain.sh` — дальше по чек-листу.
- Признак https в PHP (`linea_https()` верит `X-Forwarded-Proto`): шаг 3 на живом домене скажет, проходит ли подделка
  через nginx Beget. Если проходит — доверять только `HTTPS=on` (правка в `server/api/lib/boot.php`, после замера).
- Применить страницы-переходы на Pages и решить про `pages.yml` — после push переключения.
- Ссылки «Правка к этому листу» в PDF — адрес задаёт gost-draft (`REVIEW_BASE`); до перевыпуска альбомов Pages не выключать.
- В CLAUDE.md проекта (раздел «Beget») стоит добавить строку про `check-domain-copy.js`, `gen-pages-redirect.js`,
  `--dry-run` и ссылку на чек-лист — не правил (по правилам агент CLAUDE.md не меняет).

## Что нужно от Александра

1. Подтвердить дизайн-студия-квартир.рф через Госуслуги; SSL Let's Encrypt (желательно с www) и PHP 8.2+ в панели Beget.
2. Запустить `./tools/switch-to-domain.sh` (или сказать мне).
3. Решить: страницы-переходы на GitHub Pages сразу после переезда (рекомендую) или позже.
4. Регион сайта для Вебмастера; адрес сайта в Яндекс Бизнесе / соцсетях, если где-то указан github.io.

## Файлы

- `tools/gen-pages-redirect.js` — новый
- `tools/check-domain-copy.js` — новый
- `tools/switch-to-domain.sh` — шаг 0, `--dry-run`, https и вебхук, шаг 6, `--host=`
- `docs/kb/pereezd-domena-vebmaster.md` — новый
- `docs/plans/2026-10-27-gotovnost-domena.md`, `docs/reports/2026-10-27-gotovnost-domena.md`
- Не в git (`.deploy/`): `.deploy/domain/` (копия под домен), `.deploy/pages-redirect/` (переходы, `redirects.tsv`)
