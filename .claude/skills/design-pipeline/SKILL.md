---
name: design-pipeline
description: Оркестрация конвейера дизайн-проектов LINEA — стадии и роли, контракты файлов, выпускные проверки, правила движка. Use when работаешь с брифом клиента, генерацией дизайн-проекта, папкой клиента, сметой, развертками, или командами /new-client, /regen, /qa-project.
---

# Конвейер дизайн-проектов LINEA

## Стадии

```
сырой бриф
  → [brief-analyst]      нормализация + engine/validate.js  → clients/<slug>/brief.json
  → [concept-designer]   стиль, палитра, образ              → concept.md
  → движок               node engine/generate.js --strict   → project/
  → [space-planner]      эргономика, зазоры, obstacles      → planning-report.md
  → [draftsman]          листы по канону                    → drafting-report.md
  → [cad-normcontrol]    нормоконтроль по ГОСТ и канону     → normcontrol-report.md
  → [estimator]          смета и цены                       → estimate-report.md
  → [visualizer]*        рендеры                            → project/06-koncept/renders/
  → [cad-acceptance]     выпускной контур, блокеры          → acceptance-report.md
  → [chief-architect]    смысловая приёмка для клиента      → ACCEPTED.md / REJECTED.md
```
\* visualizer — только тариф premium.

Разделение ответственности: **cad-acceptance** отвечает за формальную готовность (проверки, числа, комплектность), **chief-architect** — за смысл: попадает ли решение в бриф клиента, читается ли альбом человеком, не стыдно ли отдать.

## Контракты файлов

| Файл | Кто пишет | Кто читает |
|---|---|---|
| `clients/<slug>/brief.json` | brief-analyst | все агенты и движок |
| `clients/<slug>/concept.md` | concept-designer | visualizer, chief-architect |
| `clients/<slug>/project/**` | движок | все проверяющие |
| `planning-report.md`, `drafting-report.md`, `normcontrol-report.md`, `estimate-report.md`, `acceptance-report.md` | соответствующие агенты | chief-architect |
| `ACCEPTED.md` / `REJECTED.md` | chief-architect | оператор |
| `project/00-pasport/zamechaniya.html` | движок, если валидатор нашёл замечания | клиент |

## Движок

- Запуск: `node engine/generate.js <brief.json> <outdir> [--date=ДД.ММ.ГГГГ] [--strict]`. Node без зависимостей.
- Размеры в брифе — **метры**, внутри движка — миллиметры. Стены помещения: A — верхняя, B — правая, C — нижняя, D — левая; `offset` проёма — от левого/верхнего угла стены.
- Схема брифа — `examples/demo-brief.json`; краевые случаи — `examples/fixtures/*.json` (студия 24 м², Г-образная, панель с несущими и стояками, заведомо кривой бриф).
- Конструктив объекта: `object.structure {houseType, extWall, intWall, slab}`, `object.bearing[]` (отрезки несущих), `object.risers[]` (стояки), `room.walls {A:'bearing'|'partition'|'new'}`. Из них берутся толщины стен, глубина ниш (панель — 60 мм), препятствия расстановки и место ревизионного люка.
- `--strict` не даёт собрать альбом, пока `engine/validate.js` находит ошибки в брифе. Без флага альбом собирается, но получает документ «Замечания к исходным данным».
- Стили, тарифы, расценки и высоты мебели — `engine/presets.js` (`STYLES`, `TIERS`, `WORK_RATES`, `FURN_PRICES`, `FURN_H`).
- Правки чертежей — **только через код движка и перегенерацию**, никогда руками в готовых SVG.

## Выпускные проверки (все три обязательны)

```bash
node tools/audit-sheets.js <папка>   # содержание листов по канону docs/cad-canon.md
node tools/lint-sheets.js  <папка>   # бумага: A3, кегль ≥ 2,5 мм, перо ≥ 0,18 мм
node tools/regen-fixtures.js         # регрессии: 6 эталонных брифов, sha256 по каждому файлу
./tools/album.sh <папка>             # единый album.pdf для бригады
```

Перед правкой движка снять эталон (`regen-fixtures`), после правки — сверить и принять осознанно (`--update`). Правила чертежа — `docs/cad-canon.md`, регламент листов — навык `cad-drawings`.

## Правила конвейера

1. Каждый агент оставляет отчёт в папке клиента — это вход для приёмки.
2. Возврат обрабатывают только агенты, названные в `REJECTED.md`; максимум 2 круга.
3. Демо-проекты — витрина: после любого улучшения движка перегенерируй **оба** (`/regen` без аргументов) и прогони три проверки.
4. Сайт трогает только seo-marketer; движок и чертежи — профильные агенты.
5. Смотреть листы глазами: `preview_start name=linea-site` (порт 8141), затем `http://localhost:8141/_dev-view.html?f=portfolio/demo/<путь>.svg`. Chrome headless на SVG в этой среде зависает, а голый SVG браузерная панель рендерит мелко — поэтому обёртка `_dev-view.html`.
