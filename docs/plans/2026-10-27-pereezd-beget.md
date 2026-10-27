# План: переезд сайта LINEA на Beget (27.10.2026)

1. API Beget: сайт `dizain-studiya-kvartir` + технический адрес `linea.aleks2si.beget.tech` (поддомен + привязка). Чужие сайты не трогать.
2. Один источник адреса — `SITE_BASES` / `SITE_DEFAULT` в `tools/site-shell.js`, переменные `LINEA_SITE` / `LINEA_BASE`; генераторы и `touch-sitemap.js` — оттуда.
3. `tools/site-rebase.js` — копия `site/` под адрес (canonical, og:url, sitemap, robots, schema.org, `.htaccess`); `--in-place` для переезда насовсем.
4. `tools/deploy-beget.sh` — заливка по SSH партиями (rsync → при обрыве tar | ssh), сверка размеров, прозвон.
5. `tools/switch-to-domain.sh` — переключение на https://дизайн-студия-квартир.рф одной командой после Госуслуг и SSL.
6. Проверка технического адреса curl-ом: главная, бриф, review.html, портфолио, PDF, 404, слеш у папок.
7. Отчёт `docs/reports/2026-10-27-pereezd-beget.md`, коммит своих файлов без push.
