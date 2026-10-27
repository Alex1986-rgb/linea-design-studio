# Отчёт: переезд сайта LINEA на Beget (27.10.2026)

## Итог
Сайт выложен на Beget и работает по техническому адресу **http://linea.aleks2si.beget.tech/** (закрыт от индекса:
`robots.txt` — `Disallow: /`, заголовок `X-Robots-Tag: noindex, nofollow`). GitHub Pages не трогали — он остаётся
основным адресом, пока не подтверждён домен **дизайн-студия-квартир.рф**.

## Что сделано
1. **Beget, через API** (аккаунт aleks2si, остальные сайты и домены не тронуты):
   - сайт `dizain-studiya-kvartir` (id 9469516, папка `~/dizain-studiya-kvartir/public_html`);
   - поддомен `linea.aleks2si.beget.tech` (id 14825625) привязан к этому сайту.
   - Домен `дизайн-студия-квартир.рф` в аккаунте есть, статус заказа `ESIA`, id ещё нет — привязать его пока нельзя.
2. **Один источник адреса** — `tools/site-shell.js`: `SITE_BASES` (pages / preview / domain), `SITE_DEFAULT = 'pages'`,
   при сборке `LINEA_SITE=…` или `LINEA_BASE=…`. На него переведены `gen-articles.js`, `gen-style-pages.js` (была и вшитая
   ссылка apple-touch-icon) и `touch-sitemap.js`; остальные генераторы уже брали `BASE` из каркаса.
3. **`tools/site-rebase.js`** — копия `site/` под адрес в `.deploy/<site>/` (в git не попадает): адрес меняется во всех
   текстах (63 файла, 681 вхождение — включая статические `index.html` / `brief.html` и старые демо-альбомы движка),
   `robots.txt` (у preview закрыт, у домена пути без `/linea-design-studio/`), `.htaccess` (индекс, своя 404, кэш,
   слеш у папок с явной схемой, у домена — 301 на https и без www). `--in-place` переписывает саму `site/` — для переезда насовсем.
4. **`tools/deploy-beget.sh`** — выкладка: копия → SSH одним соединением (при VPN — в обход через en0) → только изменившиеся
   файлы (сверка размера и времени) **партиями** ≤ 40 МБ / ≤ 300 файлов с паузой 3 с, каждая партия rsync, при обрыве —
   повтор и tar | ssh → сверка всех размеров → прозвон. Первая заливка: 1396 файлов, 446 МБ, 16 партий, обрывов не было.
   Повторный запуск отправил 3 файла.
5. **`tools/switch-to-domain.sh`** — переключение на домен одной командой (ниже). `--check` говорит, на каком шаге домен:
   сейчас «регистрация ещё не подтверждена (ESIA)».
6. **`tools/beget-api.py`** — вызов API Beget: доступы читаются построчно регэкспом, пароль уходит POST-ом и не печатается.
7. CLAUDE.md — раздел «Beget» в «Публикации».

## Проверка (curl, технический адрес)
200: `/`, `/index.html`, `/brief.html`, `/review.html`, `/review.html?p=gost-kv3k`, `/portfolio-hub/`, `/portfolio/gost-kv3k/`
(и его `sheets.json`, которые review.js берёт относительным путём), `/portfolio/demo/index.html`, `/catalog/`, `/journal/`,
`/gost/`, `/style/`, `/css/main.css` (text/css), `/js/review.js`, `/sitemap.xml`, `/robots.txt`, PDF (album.pdf 24,6 МБ,
studio.pdf 24,4 МБ, старый демо 18 МБ), лист с кириллицей в имени. Несуществующий адрес → 404, `/catalog` → 301 на `/catalog/`,
canonical главной = технический адрес, адреса github.io в главной — 0.
**Из корня домена ничего не сломалось:** все ссылки сайта относительные (`u = '../'`), JS берёт данные относительными путями;
абсолютные адреса — только canonical / og / schema / sitemap / 404, их переписывает site-rebase.

## Почему Punycode в canonical, sitemap, robots
- Яндекс, справка по robots.txt: «Для указания имен доменов используйте Punycode» (пример `Sitemap: http://xn--80aswg.xn--p1ai/sitemap.xml`).
- Протокол Sitemap требует адреса по RFC 3986 — хост только ASCII, то есть Punycode.
- canonical, og:url и schema.org — тот же адрес, чтобы все сигналы совпадали байт в байт. Кириллица — только в тексте для людей
  (`SITE_DOMAIN_RU` в site-shell.js).
- Адрес: `https://xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai`.

## Команды
- Выкладка на технический адрес: `./tools/deploy-beget.sh` (пробно: `--dry-run`; только прозвон: `--check`).
- Переезд после Госуслуг: `./tools/switch-to-domain.sh` — проверяет регистрацию (API), привязывает домен к сайту, проверяет
  HTTPS, ставит `SITE_DEFAULT = 'domain'`, переписывает `site/` на домен (`--in-place`) и заливает `--site=domain --prune`.
- Дальше обычная выкладка на домен: `./tools/deploy-beget.sh --site=domain`.

## Что нужно от Александра
1. **Подтвердить регистрацию домена через Госуслуги** (панель Beget → «Домены» → дизайн-студия-квартир.рф).
2. После регистрации (и привязки — её сделает скрипт, или вручную «Сайты» → dizain-studiya-kvartir → привязать домен) —
   **выпустить SSL**: панель Beget → «Сайты» → домен → SSL → Let's Encrypt. Через API Beget сертификат не выпускается.
3. Запустить `./tools/switch-to-domain.sh` (или сказать мне).

## После переключения (не сделано, по порядку)
1. `git commit` + **`git push`** правок (site-shell.js с `SITE_DEFAULT = 'domain'` и переписанная `site/`) — тогда GitHub Pages
   отдаёт те же страницы с canonical на домен: для поисковиков это сигнал переезда. Сейчас коммит сделан без push — пушить
   при переключении.
2. GitHub Pages **не выключать** сразу: серверного 301 у Pages нет. Варианты: оставить на 1–3 месяца с canonical на домен,
   потом заменить `site/` на Pages страницами-переходами (`<meta http-equiv="refresh">` + `<link rel="canonical">` на
   тот же путь на домене), и только после переиндексации выключить Pages (Settings → Pages / workflow `pages.yml`).
3. Яндекс.Вебмастер: добавить домен, подтвердить, загрузить sitemap; Google Search Console — так же (Change of address для
   github.io недоступен, работает только canonical).
4. Технический адрес можно отвязать от сайта (или оставить — canonical у него уже будет на домене).
5. Ссылки «Правка к этому листу» в PDF альбомов ведут на review.html GitHub Pages — их задаёт движок **~/projects/gost-draft**
   (не правили): `engine/work.js`, константа `REVIEW_BASE` (стр. ~273), либо на объект — `meta.reviewBase` в `project.json`.
   После смены — пересобрать «студию» и полный альбом, перенести `tools/sync-gost-releases.sh`, выложить. До этого старые
   ссылки продолжают работать, пока жив Pages.
6. Старые демо-альбомы LINEA (`engine/generate.js`, стр. 6124–6130 и 6552) вшивают адрес Pages в canonical/og — движок не
   трогали (снапшот-фикстуры). На выкладке адрес переписывает site-rebase; при перегенерации демо — прогнать
   `node tools/site-rebase.js --site=domain --in-place` или перевести эти строки на адрес из site-shell.js.

## Файлы
- `tools/site-shell.js` — `SITE_BASES`, `SITE_DEFAULT`, `SITE_DOMAIN_RU`, `LINEA_SITE` / `LINEA_BASE`
- `tools/gen-articles.js`, `tools/gen-style-pages.js`, `tools/touch-sitemap.js` — адрес из site-shell.js
- `tools/site-rebase.js` — новый
- `tools/deploy-beget.sh` — новый
- `tools/switch-to-domain.sh` — новый
- `tools/beget-api.py` — новый
- `.gitignore` — `.deploy/`
- `CLAUDE.md` — раздел «Beget»
- `docs/plans/2026-10-27-pereezd-beget.md`, `docs/reports/2026-10-27-pereezd-beget.md`
