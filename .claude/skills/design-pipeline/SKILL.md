---
name: design-pipeline
description: Оркестрация конвейера дизайн-проектов LINEA — контракты файлов, порядок агентов, правила движка. Use when работаешь с брифом клиента, генерацией дизайн-проекта, папкой клиента, сметой, развертками, или командами /new-client, /regen, /qa-project.
---

# Конвейер дизайн-проектов LINEA

## Архитектура

```
brief.json → [brief-analyst] → [concept-designer] → engine/generate.js
           → [space-planner] → [draftsman] → [estimator] → [visualizer*]
           → [chief-architect QA] → clients/<slug>/project/ → клиенту
```
\* visualizer — только тариф premium.

## Контракты файлов
| Файл | Кто пишет | Кто читает |
|---|---|---|
| `clients/<slug>/brief.json` | brief-analyst | все + движок |
| `clients/<slug>/concept.md` | concept-designer | visualizer, QA |
| `clients/<slug>/project/**` | движок | все проверяющие |
| `planning-report.md`, `drafting-report.md` | планировщик, чертёжник | QA |
| `ACCEPTED.md` / `REJECTED.md` | chief-architect | оператор |

## Движок
- Запуск: `node engine/generate.js <brief.json> <outdir>` (Node без зависимостей).
- Размеры в брифе — МЕТРЫ; внутри движка — миллиметры.
- Стили и цены: `engine/presets.js` (STYLES, TIERS, WORK_RATES, FURN_PRICES).
- Правки чертежей — только через код движка и перегенерацию, НИКОГДА руками в готовых SVG (перегенерация их сотрёт).
- Схема брифа — образец `examples/demo-brief.json`. Стены помещения: A — верхняя, B — правая, C — нижняя, D — левая; offset проёма — от левого/верхнего угла стены, в метрах.

## Правила конвейера
1. Каждый агент оставляет отчёт в папке клиента — это вход для QA.
2. Возврат от QA обрабатывают только названные в REJECTED.md агенты, максимум 2 круга.
3. Демо-проект `site/portfolio/demo` — витрина: перегенерируй его после любого улучшения движка (`/regen` без аргументов).
4. Сайт трогает только seo-marketer; движок и чертежи — профильные агенты.
