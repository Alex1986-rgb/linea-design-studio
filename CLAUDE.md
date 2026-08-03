# LINEA — студия дизайна интерьера с ИИ-конвейером

Сайт студии + автоматический генератор дизайн-проектов: клиент заполняет бриф (размеры, фото, стиль) → конвейер собирает папку проекта (планы с мебелью, развертки каждой стены, потолки со светом, концепция, спецификация материалов, смета).

## Структура
- `engine/generate.js` — генератор папки проекта (Node, без зависимостей). Запуск: `node engine/generate.js <brief.json> <outdir>`
- `engine/presets.js` — 6 стилей, тарифы, расценки работ и мебели
- `site/` — статический сайт: index.html (лендинг), brief.html + js/brief.js (визард брифа), portfolio/demo/ (демо-проект, генерируется движком)
- `examples/demo-brief.json` — эталон схемы брифа (размеры в метрах; стены A/B/C/D = верх/право/низ/лево)
- `examples/house-brief.json` — второй эталон: дом 120 м² в два этажа (`rooms[].level`, `rooms[].stairs`)
- `clients/<slug>/` — рабочие папки клиентов (brief.json, отчёты, project/)
- `.claude/agents/` — 7 агентов конвейера; `.claude/commands/` — /new-client, /regen, /qa-project
- `.claude/skills/cad-drawings` — канон рабочих чертежей (состав альбома, лист А3, слои, размеры, обозначения, чек-лист приёмки)
- `docs/` — маркетинг- и SEO-планы

## Правила
- Чертежи правятся ТОЛЬКО через код движка + перегенерацию, не руками в SVG.
- После улучшений движка перегенерируй демо: `node engine/generate.js examples/demo-brief.json site/portfolio/demo`
- Полный регламент конвейера — скилл `design-pipeline`; канон самих чертежей — скилл `cad-drawings` (читать перед любой правкой листов).
- Демо-проекты: `node engine/generate.js examples/demo-brief.json site/portfolio/demo` и `node engine/generate.js examples/house-brief.json site/portfolio/dom-120`.
- Сайт: премиальный тон, тёмная тема, дизайн-токены в `site/css/main.css`; на каждой странице canonical + OG + schema.org.
- Просмотр сайта: любой статический сервер из `site/` (движку сервер не нужен).
