# План: готовность к переезду на дизайн-студия-квартир.рф (27.10.2026)

Цель — после подтверждения домена всё делается одной командой `./tools/switch-to-domain.sh`. Ничего не пушить, на домен не выкладывать.

1. `tools/gen-pages-redirect.js` — страницы-переходы для GitHub Pages (meta refresh + canonical на тот же путь домена,
   Punycode, 404.html для остальных путей) → `.deploy/pages-redirect/`, самопроверка; не применять.
2. `tools/check-domain-copy.js` — проверка копии `.deploy/domain`: ссылки, canonical, robots, sitemap на домене,
   ни одного github.io/beget.tech; негативный прогон на испорченной копии.
3. `tools/switch-to-domain.sh`: шаг 0 без сети (правка SITE_DEFAULT и --in-place на копиях, проверка копии, переходы),
   `--dry-run`; шаг 3 — сертификат, срок, www, 301 на https, вебхук ЮKassa (GET 405, POST «{}» по https 200, подделка
   X-Forwarded-Proto) без вызовов ЮKassa; шаг 6 — прозвон после заливки; `--host=` для проверки самого скрипта.
4. `docs/kb/pereezd-domena-vebmaster.md` — чек-лист Яндекс.Вебмастера, Search Console, применения переходов.
5. Прогон dry-run, `--check`, `--check --host=<технический>`, локальная проверка обработчика вебхука (php -S).
6. Отчёт `docs/reports/2026-10-27-gotovnost-domena.md`, коммит без push.
