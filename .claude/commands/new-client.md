---
description: Полный цикл нового клиента — от сырого брифа до принятой папки проекта
---

Полный конвейер студии LINEA для нового клиента. Вход: $ARGUMENTS (путь к brief.json, текст брифа или «демо»).

Стадии строго по порядку, каждая — своим субагентом (Task tool); результат стадии — вход следующей. Регламент конвейера — навык `design-pipeline`, правила чертежей — `cad-drawings` и `docs/cad-canon.md`.

1. **brief-analyst** — нормализовать бриф → `clients/<slug>/brief.json`, прогнать `engine/validate.js`. Ошибки валидатора — стоп: покажи их и вопросы клиенту, дальше не иди.
2. **concept-designer** — ДНК проекта по `docs/design/elite-standard.md` → `clients/<slug>/dna.json` (проверка `python3 tools/prompt-build.py --check-dna`) и `concept.md`.
3. **Движок**: `node engine/generate.js clients/<slug>/brief.json clients/<slug>/project --strict`.
4. **space-planner** — эргономика и зазоры по разделу 5 канона, препятствия (`obstacles`), перегенерация.
5. **draftsman** — листы по канону, перегенерация, три проверки.
6. **cad-normcontrol** — нормоконтроль по ГОСТ и канону → `normcontrol-report.md`. Найденное «брак» возвращается в draftsman (максимум 2 круга).
7. **estimator** — смета и цены, сверка сметы с геометрией листов.
8. **visualizer** — промпты из ДНК (`tools/prompt-build.py --dna`), рендеры (только тариф premium, иначе пропусти 8 и 8b).
8b. **art-director** — приёмка каждого кадра по `tools/prompts/art-check.md` → `team/15b-art-director.md`; ВОЗВРАТ уходит в visualizer (максимум 3 круга на кадр) или в draftsman, если архитектуры нет в геометрии.
9. **cad-acceptance** — выпускной контур: три проверки, сверка чисел, единый PDF → `acceptance-report.md`.
10. **chief-architect** — смысловая приёмка → `ACCEPTED.md` или `REJECTED.md`.
11. При возврате прогони замечания через названных агентов (максимум 2 круга) и повтори шаги 9–10.

В конце покажи: путь к папке, число листов, итог сметы, результаты проверок числами, вердикт приёмки, открытые вопросы клиенту.
