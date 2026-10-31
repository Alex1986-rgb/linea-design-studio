# Формат обмера `linea-survey/1` (survey.json)

Файл собирает форма `site/obmer/` (кнопка «Скачать survey.json» / «Отправить в студию» → `api/survey.php` →
`linea-private/surveys/`). Пример — `survey-example.json`. Перевод в движок — `tools/survey-to-project.mjs`.
Все размеры — **мм**, высоты — от чистого (существующего) пола помещения, давление — бар.
Стены помещения **A · B · C · D = верх · право · низ · лево эскиза** — одна ориентация на всю квартиру (как в движке).

```jsonc
{
  "format": "linea-survey/1",
  "meta":   { "object": "Квартира 2-комн.", "address": "…", "order": "LN-2610-0001" },
  "survey": { "by": "Кырлан А.С.", "date": "31.10.2026", "started": "10:05", "finished": "11:25",
              "tool": "Bosch GLM 50-27 C", "orientation": "стена A — окна гостиной", "note": "" },
  "object": {
    "type": "квартира", "floor": 7, "floors": 17, "areaDocs": 57.1,
    "house": { "kind": "panel|brick|monolith|block|wood|unknown", "series": "П-44Т", "year": 2004,
               "source": "document|words|look", "note": "какие документы видел" },
    "water": { "staticPressureBar": 3.8, "measuredAt": "r4", "how": "манометр на смеситель", "inletRoom": "r4", "meters": true },
    "power": { "room": "r3", "at": { "C": 0, "D": 250 }, "h": 1700, "inputBreaker": { "amps": 25, "curve": "C" },
               "rcdInput": false, "modules": 12, "used": 8, "tu": false, "allowedPowerKw": null, "photo": "31" }
  },
  "rooms": [{
    "id": "r1", "name": "Гостиная", "type": "living",            // типы — как rooms[].type движка
    "place": { "x": 0, "y": 0 },                                   // первое помещение — начало плана
    // или: "place": { "from": "r1", "side": "B", "shift": 0 }   // за стеной B помещения r1, начало сдвинуто на shift вдоль неё
    "walls": { "A": { "bottom": 3480, "top": 3478, "t": 300, "side": "outside|flat|stair|room",
                      "material": "бетон", "how": "простукивание|вскрытие|проект|слова", "photo": "1" }, "B": {…}, "C": {…}, "D": {…} },
    "diagonals": [6074, 6077], "heights": [2642, 2645, 2639], "floorStep": -20,
    "openings": [{ "kind": "window|door|opening|balcony-door", "wall": "A", "offset": 1040, "width": 1400, "height": 1500,
                   "sill": 850, "reveal": 160, "quarter": 50, "wallT": 300, "entry": false, "swing": "start|end", "photo": "5" }],
    "risers":    [{ "kind": "sewer|cold|hot|heat|gas", "d": 110, "at": { "A": 160, "D": 200 }, "valve": true,
                    "meter": true, "meterH": 600, "material": "чугун", "photo": "24" }],
    "radiators": [{ "wall": "A", "offset": 1140, "width": 1200, "height": 500, "depth": 100, "floorGap": 100, "wallGap": 50,
                    "sections": 12, "kind": "МС-140", "connect": "side|bottom", "airVent": true, "thermoHead": false }],
    "vents":     [{ "wall": "D", "offset": 2900, "w": 150, "l": 150, "h": 2400, "box": false, "draft": "есть" }],
    "stove": "electric|gas", "photos": ["1", "2"], "note": ""
  }]
}
```

Правила привязки:
- `offset` проёма, радиатора, вентканала — от **левого** угла стены (A, C) или **верхнего** (B, D) в чистоте до края
  (у вентканала — до центра решётки).
- `at` стояка и щита — расстояние от чистой грани стены до оси: одна стена из B/D и одна из A/C (`0` — в толще стены).
- `side` стены: `room` — за ней помещение квартиры, остальное — граница квартиры (в движке — контур `object.outline`).

Что делает конвертер с полями — шапка `tools/survey-to-project.mjs`. Коротко:

| survey.json | project.json (канон `gost-draft/docs/schema.md`) |
|---|---|
| `survey.by`, `survey.date` | `object.survey { by, date, ceiling, tool, time, file }` — событие обмера (SH-50, AR-17) |
| стены по низу A/C, B/D | чистые `cw`, `cl` → `rooms[].x, y, w, l` **по осям** (к соседу +INT/2, к границе +0) |
| `walls.*.t`, `openings.*.wallT` | `object.walls { ext, int }` — медианы; фактические толщины — в `rooms[].survey.walls` |
| `walls.*.material` | `rooms[].wallBase { A…D }` |
| `diagonals`, `heights` | `rooms[].survey.diagonals` (AR-16), `rooms[].ceiling` = наименьшая высота, `object.ceiling` — медиана |
| `openings` | `rooms[].doors[]` / `windows[]` (offset по сетке, `sill`, `revealDepth`, `entry`, `swing`, `leaf: false` у проёма); дверь двух помещений — одна |
| `risers` | `object.risers[]` (`x, y` по плану, `name` «Ст К1-1», `valve`, `meter`, `meterH`) |
| `vents` | `object.ventDucts[]` (ВК-N, прямоугольник канала за решёткой или короб) |
| `radiators` | `rooms[].radiators[]` (Р-N, `connect`, `airVent`, `thermoHead`) |
| `water.staticPressureBar` | `object.water.staticPressure` (МПа) — PL-55 |
| `power` | `object.electrical.panel { modules, used, survey }`; мощность — только при `tu: true`, иначе К-N и допущение 15 кВт |
| `house` | при `source: document` — `object.structure`; всегда `bearingStatus: "pending"` + К-N «несущие не определены» |
