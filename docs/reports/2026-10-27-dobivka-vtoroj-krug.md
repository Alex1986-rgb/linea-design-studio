# Отчёт: добивка сайта по второму кругу критиков (27.10.2026)

## Что сделано
1. **Отправка брифа — честно на каждой площадке.** Фраза живёт в одном месте: `TERMS.intake` в `tools/site-shell.js`, пары
   «архивом в WhatsApp/на почту, номер заказа пришлём в ответ» / «одной кнопкой → страница заказа с номером». Генераторы
   (gen-home, gen-more-pages, gen-info-pages, gen-gost-pages) и статичная вёрстка главной берут вариант по адресу сборки;
   `site-rebase.js` меняет вариант при выкладке (`swapIntake`) и падает, если без приёмника по https осталось «одной кнопкой».
   Вариант «одной кнопкой» включается только на адресе с https и приёмником (домен после SSL). Проверено: копия для GitHub Pages —
   0 вхождений «одной кнопкой», копия для домена — 26 замен в 15 файлах, технический адрес — 0.
   Заодно: «Сумма появляется на странице заказа» → вариант по площадке; про ЮKassa — «когда подключим» (price, oplata).
2. **ПДн только по https.** `linea_require_https()` в `server/api/lib/boot.php`: brief / review / pay по http → 403 с текстом
   «пришлите в WhatsApp/на почту» (исключения: `test=1` и `php -S 127.0.0.1`). `admin.php` по http закрыт целиком — 403 до
   `session_start`, кука `linea_adm` не выдаётся. `pay-notify.php` — только https. `brief.js` / `review.js` на http сами уходят на
   запасной путь (архив), кроме `?test=1` и localhost; 403 от сервера → тоже архив. Версии скриптов подняты (brief v42, review v12).
3. **Лишнее на сервере убрано без удаления.** `deploy-beget.sh --prune` теперь переносит файлы, которых нет в выпуске, в
   `~/dizain-studiya-kvartir/public_html_backup/20261026-201925/` (вне веб-корня). Перенесено 97 файлов (снятые визуализации и
   служебные `_release.html` / `_card.json` / `_renders.json` / `_rules.txt`).
4. **Архив первой версии** (`portfolio/demo`, `portfolio/dom-120`, 17 страниц) — `tools/archive-old-demos.js`: noindex, плашка
   «Архив: первая версия программы (август 2026). Визуализации с планом не сверены, по комплекту не строят», убраны «та же мебель,
   свет и материалы, что на чертежах», «конвейер», «за 48 часов» без «от оплаты»; CTA — условия из TERMS. Ссылка с главной,
   из карты сайта и плитки с рендерами в портфолио сняты; в каталоге и кейсах ссылка подписана «архив, не сверено», `rel=nofollow`.
   `touch-sitemap.js` выкидывает noindex-страницы — 4 адреса архива ушли из sitemap.xml.
5. **Главная.** «Автопроверка оформления» вместо «Проверка по нормам» (сцена фильма и блок), без «прогоняет по правилам с пунктами
   ГОСТ и СП» как обещания экспертизы; «Рабочая документация, а не десять картинок» вместо «Всё, о чём спросит бригада»; «разделы
   программы» вместо «специалист движка»; развёртки, план розеток, ведомость дверей и колерная карта — «ещё в прежнем виде,
   перевыпуск после разбора практика готовится»; в «Как у нас» пункты про развёртки и электрику с той же пометкой; «поймёт ли
   заказчик и сможет ли прораб — смотрит автор, замечания практика идут в перевыпуск».

## Проверка (технический адрес, curl --interface en0)
- Выкладка: 96 файлов одной партией, сверка 1332/1332; на сервере ровно файлы выпуска (`comm` в обе стороны — 0), служебных `_*` — 0.
- 404: `gost-dom331/3d-top-et2.jpg`, `gost-dom120/3d-top-et2.jpg`, `gost-modern4k/room-kids-wB.jpg`, `modern4k-living.jpg`,
  `gost-lineademo/room-hall-wA.jpg`, `lineademo-bedroom-wA.jpg`, `dom331-living.jpg`.
- «одной кнопкой» на `/`, process, price, oplata, contacts, policy, страницах проектов — 0; «Проверка по нормам» — 0.
- `portfolio/demo/index.html` — noindex и плашка на месте; sitemap.xml без архива.
- API: brief без test → 403, brief test=1 (пустой) → 400 «бриф не прочитался» (заказ не создан), review → 403, pay → 403,
  pay-notify → 403, admin.php GET/POST → 403 без Set-Cookie, ping — ok. Тестовых заказов не создавалось.
- Глазами (локально, headless Chrome): плашка архива на index.html и листалке (листалка — fixed-плашка, шапка сдвинута под неё).

## Что осталось
- **Заголовок X-Forwarded-Proto Beget пропускает от клиента**: запрос с ручным `X-Forwarded-Proto: https` проходит проверку https.
  Браузер так не делает — клиенты защищены, обойти может только тот, кто сам шлёт свои данные открыто. После SSL на домене
  посмотреть, какой признак https ставит Beget, и оставить в `linea_https()` только его.
- На страницах кейсов (kvartira-56, dom-120) остаются несверенные кадры с честной подписью «ещё не пересверены» — по правилу
  Александра «показывать только совпадающие с планом» их стоит снять или заменить листами (в этот круг не входило).
- Архив первой версии остаётся доступен по ссылкам из портфолио, каталога и кейсов (noindex). Снять ссылки совсем — одной правкой.

## Что нужно от Александра
1. Домен: Госуслуги → привязка → SSL Let's Encrypt в панели Beget; после этого приём брифа «одной кнопкой» и страница заказов
   заработают сами (`./tools/switch-to-domain.sh`), там же — URL уведомлений ЮKassa.
2. Цены и отдельный магазин ЮKassa для LINEA (пока режим manual, «счёт пришлём»).
3. Push не делался (как просили).

## Файлы
- `tools/site-shell.js` — `INTAKE`, `intakeOnline`, `swapIntake`, `TERMS.intake`
- `tools/gen-home.js`, `site/index.html`, `tools/sync-static-nav.js`
- `tools/gen-more-pages.js`, `tools/gen-info-pages.js`, `tools/gen-gost-pages.js`, `tools/gen-catalog.js`, `tools/gen-site-pages.js`
- `tools/site-rebase.js`, `tools/deploy-beget.sh`, `tools/touch-sitemap.js`, `tools/archive-old-demos.js` (новый)
- `server/api/lib/boot.php`, `server/api/brief.php`, `server/api/review.php`, `server/api/pay.php`, `server/api/pay-notify.php`, `server/api/admin.php`
- `site/js/brief.js`, `site/js/review.js`, `site/brief.html`, `site/review.html`
- пересобранные страницы: index, process, price, oplata, policy, contacts, portfolio-hub, sitemap, catalog ×2, cases ×2,
  portfolio/gost-* ×9, portfolio/demo ×8, portfolio/dom-120 ×9, sitemap.xml
- `CLAUDE.md` (раздел «Приём брифа»), `docs/plans/2026-10-27-dobivka-vtoroj-krug.md`
