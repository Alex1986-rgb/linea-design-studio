# Prompt engineering для чертёжной генерации (gpt-image-2 / gpt-image-1.5)

Цель: получать от модели генерации изображений картинки, которые выглядят как
**технический чертёж/план**, а не как фотореалистичный рендер интерьера. Ниже — выжимка
официальных рекомендаций OpenAI + практика сообщества + 8 готовых шаблонов под задачи LINEA.

Дата сбора: 21.09.2026. Инструменты поиска — WebSearch/WebFetch (Exa и Firecrawl были
недоступны, 402/credits). Часть утверждений — с одного источника, помечено `[1 источник]`.

---

## 0. Контекст модели

- **gpt-image-2** — текущая модель OpenAI для генерации изображений, в API с 21.04.2026
  (`model: "gpt-image-2"`), в ChatGPT — с 22.04.2026 («ChatGPT Images 2.0»). Заявлено: думает
  перед генерацией (reasoning), выдаёт до 2K, до 8 согласованных изображений за запрос,
  ощутимо надёжнее рисует текст (в т.ч. не-латиницу) — это главная новость релиза
  `[1 источник, официальную страницу openai.com/index/introducing-chatgpt-images-2-0/ отдать
  не удалось — 403]`.
- **08.09.2026** вышла ревизия **GPT Image 2.5** («ChatGPT Images 2.5»): функция Sketch
  (рисунок → картинка), задержка генерации снижена вдвое.
- Эндпоинты те же, что у gpt-image-1: `POST /v1/images/generations` (с нуля) и
  `POST /v1/images/edits` (правка/референс, можно с `mask`).
- Параметры, подтверждённые для линейки gpt-image-1/1.5 (для gpt-image-2 в открытой
  документации детали параметров не расписаны — предполагаем совместимость, но **не
  подтверждено**):
  - `size`: `1024x1024` | `1536x1024` (альбом) | `1024x1536` (портрет) | `auto`.
  - `quality`: `low` | `medium` | `high` (по умолчанию `high`). `low` — для быстрых
    черновиков и итераций по композиции; `high` — для листов с плотным текстом/леттерингом.
  - `input_fidelity` (для `images/edits`, поддерживается моделью gpt-image-1): `high` |
    `low`. `high` — когда нужно **сохранить геометрию исходника** (обмер, план стен) и
    только «одеть» его в стиль; расходует больше токенов, у `low` фиксированная база
    65 токенов + 129 за тайл.
  - `mask` — PNG до 4 МБ, тот же размер, что и редактируемое изображение; правит только
    непрозрачную область маски — полезно, чтобы перерисовать только заливку стен или
    только мебель, не трогая контур плана.

Источники: OpenAI Cookbook (image-gen-1.5-prompting-guide), developers.openai.com/api/docs
(models/gpt-image-2, guides/images-vision), community.openai.com (input_fidelity, quality),
getimg.ai / mindstudio.ai / buildfastwithai.com (обзоры релиза gpt-image-2/2.5).

---

## 1. Как добиться «technical drawing», а не рендера

### 1.1 Термины, которые двигают модель к чертежу

| Категория | Слова/фразы | Что дают |
|---|---|---|
| Проекция | `orthographic`, `top-down orthographic view`, `true top-down`, `plan view`, `no perspective`, `no perspective distortion`, `flat elevation view` | Убирают перспективные искажения — плоский вид сверху/сбоку, как в CAD |
| Линии | `clean line-work`, `vector line-art`, `precise fine pen linework`, `technical line hierarchy`, `line weights: 0.18mm / 0.25mm / 0.35mm`, `heavy outline, medium walls, fine hatching` | Задают иерархию толщин пера — так задаётся вес линий в ГОСТ/СПДС (жирный контур → средние стены → тонкая штриховка) |
| Заливка стен | `poché walls`, `solid black poché`, `grey poché fill`, `wall fill solid dark grey` | «Poché» — профессиональный термин заливки сечения стены на плане; модель его знает из архитектурных датасетов |
| Штриховка | `hatching`, `cross-hatch texture`, `material hatching pattern`, `45-degree hatch lines` | Штриховка материалов (кладка, дерево, бетон) |
| Фон/лист | `white background`, `plain white paper background`, `off-white / light beige paper texture`, `blueprint deep prussian blue ground with white linework` | Два рабочих направления: «чистый лист» (CAD/presentation) или «синька» (blueprint-стиль) |
| Свет/объём (для presentation-плана) | `soft drop shadows under furniture`, `subtle ambient occlusion`, `flat lighting, no dramatic shadows` | Лёгкая тень под мебелью — характерный приём «presentation drawing», отличающий его от плоского CAD |
| Массинг/белая модель | `matte white card material, no colour, no texture`, `clay render`, `soft studio light from above`, `faint ambient occlusion in corners` | Белая модель / clay-рендер для аксонометрии-схемы |
| Общее «не рендер» | `diagram`, `schematic`, `technical illustration`, `measured drawing`, `presentation drawing`, `CAD drawing style` | Сигнал жанра — модель переключает «режим» ближе к чертежу/инфографике, а не к фото |

### 1.2 Что мешает — слова, тянущие к фотореализму (исключать или ставить в explicit negative)

Из cookbook и практики: фотореализм включают **параметры камеры/освещения/текстуры кожи
материала** — если их нет в промпте, модель реже «доигрывает» сцену до фото. Конкретно
избегать (или явно запрещать через «no …»):

- `photo`, `photograph`, `photorealistic`, `35mm`, `50mm lens`, `depth of field`, `bokeh`
- `golden hour`, `soft warm lighting`, `cinematic lighting`, `dramatic shadows`
- текстуры реальности: `skin pores`, `fabric grain`, `film grain`, `wood grain close-up`
- `interior render`, `CGI render`, `hyperrealistic`, `ray tracing`, `global illumination`

Рекомендованная практика (community.openai.com / cookbook): **самые важные негативы —
сразу после subject/style**, а не в конце промпта — модель понижает их вес с самого начала
генерации. Пример негативного блока для чертежа:

```
Style constraints: no photorealism, no photographic lighting, no depth of field,
no perspective, no textures, no materials rendering, no camera lens effects.
```

### 1.3 Как задавать толщины линий и штриховку словами

Модель не умеет читать числа как параметр рендера буквально (это не векторный движок), но
**упоминание конкретных значений толщины пера повышает вероятность визуальной иерархии
линий**, похожей на настоящий CAD-чертёж (жирный контур/средний/тонкий), а не «плоский
одинаковый контур»:

```
Line hierarchy: 0.35mm bold line for wall outlines and door/window openings,
0.25mm medium line for furniture silhouettes, 0.18mm thin line for hatching,
dimension lines and text.
```

Для штриховки — называть материал явно (`brick hatch`, `wood parquet hatch pattern`,
`45-degree diagonal hatch for concrete section`), а не абстрактное «hatching» — конкретика
материала обычно даёт более узнаваемый паттерн, чем общее слово.

---

## 2. Официальные рекомендации OpenAI и практики сообщества

Источник: `openai/openai-cookbook` → `examples/multimodal/image-gen-1.5-prompting_guide.ipynb`
(зеркало на developers.openai.com/cookbook), плюс community.openai.com.

**Структура промпта** (рекомендуемый порядок):
`фон/сцена → объект → ключевые детали → ограничения (constraints)`.
Для сложных запросов — короткие подписанные сегменты или переносы строк вместо одного
длинного абзаца (это прямо подходит под наш кейс «чертёж сверху / рендер снизу»).

**Специфичность лучше общих усилителей.** Вместо «8K, ultra detailed» — конкретные
материалы, формы, текстуры, явное указание визуального медиума (`ink drawing`,
`vector diagram`, `3D render`) и целевое назначение картинки (`for a client presentation`,
`for a construction document mockup`) — назначение задаёт модели «уровень полировки».

**Работа с референсом в `images/edits`:**
- Каждое входное изображение нумеровать и описывать: *«Image 1: measured floor plan
  photo/scan… Image 2: style reference, grey presentation drawing…»*.
- Явно описывать взаимодействие: *«apply the linework style of Image 2 to the layout
  geometry of Image 1»*.
- При композитинге — отдельно уточнять, что именно перемещается/меняется.

**Сохранение геометрии/инвариантов (критично для чертежа по обмеру):**
- Формула «изменить только X, всё остальное не менять» + **повторять список того, что
  сохраняется, на каждой итерации** (модель «дрейфует» при последовательных правках).
- Явно писать: *«keep exact wall positions, room proportions and door/window openings
  unchanged; do not add, remove or resize any room»*.
- Для `images/edits` ставить `input_fidelity: "high"`, если план большой/сложный и важно
  не потерять исходную геометрию при стилизации.

**Параметры quality/size (практика):**
- `quality="low"` — для черновых прогонов, когда перебираешь 5-10 вариантов композиции.
- `quality="high"` — для финальной генерации листа с плотной подписью/леттерингом
  (спецификация, штамп, легенда условных обозначений).
- `size` выбирать под пропорции листа: `1536x1024` для альбомной развёртки стены/фасада,
  `1024x1536` для портретного каталожного листа, `1024x1024` для квадратной иконки/детали.

**Итеративность.** Начинать с «чистого» базового промпта, дальше — маленькие точечные
правки («холоднее свет», «убрать один диван»), а не переписывание всего промпта заново;
при явном «дрейфе» результата — переуточнять критические константы (геометрию, масштаб,
цветовую гамму) заново текстом, не полагаясь на «как раньше».

---

## 3. Ограничения по тексту/цифрам и обходы

- Историческая слабость линейки image-моделей (включая ранние gpt-image-1/DALL·E) —
  **мелкий текст, размерные цепочки, точные цифры на чертеже** рисуются с ошибками или
  «фантомными» символами. gpt-image-2 заявляет заметное улучшение рендера текста (в т.ч.
  не-латиницы) — но это относится к **крупному/среднему** тексту в кадре, а не к мелким
  размерным цифрам на чертеже уровня рабочей документации; отдельного заявления от OpenAI
  про точность **размерных подписей на чертежах** не найдено `[допущение, не подтверждено
  источником]`.
- Рабочая рекомендация cookbook при необходимости текста в кадре:
  - помещать литеральный текст в кавычки или ПРОПИСЬЮ;
  - указывать типографику отдельно (шрифт/размер/цвет/расположение);
  - для сложных слов — прописывать по буквам.
- **Практический обход для LINEA** (согласуется с тем, как уже устроен движок: SVG +
  программные подписи): для реальных рабочих чертежей и альбомов **не полагаться на
  генеративный текст вообще**.
  - Генерировать изображение **только как графику** (план/развёртка/аксонометрия без
    единой надписи и без размерных цифр) — явно просить `no text, no numbers, no labels,
    no dimension figures, blank title block` (штамп оставить пустым).
  - Размерные линии — можно попросить нарисовать **сами линии и выносные засечки** (это
    геометрия, не текст), а цифры на них — не просить, накладывать программно поверх
    (как уже делает `engine/paper.js`/SVG-слой в проекте).
  - Подписи помещений, спецификации, легенду условных знаков — писать отдельным слоем
    (HTML/SVG-текст, как в текущем движке), а не ждать их от модели генерации изображений.
  - Если текст всё же нужен «внутри» картинки (например, декоративный штамп для
    моков/маркетинга, не для реального листа) — держать его коротким (1-3 слова),
    крупным, в кавычках, и проверять глазами каждый прогон.

---

## 4. Восемь готовых шаблонов промптов

Общий паттерн для всех: **сцена → объект → детали стиля → line-hierarchy → constraints
(что сохранить/чего не должно быть)**. Плейсхолдеры `[...]` — подставлять параметры
конкретного проекта (из `brief.json`).

### (а) Презентационный план с мебелью, серый стиль, по референсу-обмеру

Задача: взять референс (скан обмера/наш SVG-план) и превратить в «дизайнерский»
презентационный план — серые стены, тонкая мебель, мягкие тени. Использовать
`images/edits` с `input_fidelity: high`.

```
Image 1: measured floor plan reference — exact wall geometry, room proportions,
door and window openings must be preserved.

Task: redraw Image 1 as a professional interior-design presentation floor plan,
top-down orthographic view, no perspective.

Style:
- Walls: solid mid-grey poché fill, crisp 0.35mm bold outline.
- Furniture: thin 0.2mm line-art silhouettes (top-down), light grey fill, no color,
  no material texture, no photorealistic shading.
- Soft, subtle drop shadow under furniture pieces only (flat ambient shadow, no
  directional light source, no gradients on walls or floor).
- Plain white background, no floor texture, no perspective, no camera lens effects.
- Door swings shown as thin arc lines; window openings as double thin lines in the wall.

Constraints: keep exact wall positions, room proportions, door and window openings
unchanged from Image 1. Do not add, remove, resize or relocate any room. No text,
no numbers, no dimension figures, no room labels, no watermark, no photorealism.
```

### (б) CAD-план чёрно-белыми линиями (blueprint / линейный чертёж)

```
Top-down orthographic architectural floor plan, black-and-white technical line
drawing, CAD blueprint style.

Line hierarchy: 0.35mm bold black line for wall outlines and structural elements,
0.25mm medium line for furniture and fixed equipment silhouettes, 0.18mm thin line
for door swing arcs, hatching and reference lines.

Walls: solid black poché fill (cut walls), thin double-line for partitions.
Windows: double thin parallel lines within the wall thickness. Doors: single line
leaf plus quarter-circle swing arc.

Background: plain white paper, no color, no grey fill, no shading, no gradients,
no perspective, no 3D, no photorealism, no texture, no shadows.

Constraints: clean vector-like line-art only, no text, no numbers, no dimension
figures, no title block content (leave title block area blank/empty rectangle only).
```

### (в) План полов с раскладкой покрытия

```
Top-down orthographic flooring layout plan, technical presentation drawing style,
no perspective, no photorealism.

Show floor covering pattern per room as flat line-art texture: [herringbone
parquet / straight-lay plank / large-format tile grid / mosaic border] — draw the
joint lines only, no color rendering, no wood grain photo-texture, flat light-grey
fill with thin darker joint lines (0.15mm).

Walls: solid mid-grey poché, 0.3mm outline. Room boundaries clearly closed.
Different rooms may use different flooring pattern styles; keep a clean boundary
line (0.25mm) between adjacent flooring types (transition strip line).

Constraints: keep wall geometry and room layout exactly as in the reference image.
No furniture, no text, no numbers, no material names written on the plan, no
photorealistic material shading, plain white background outside the building outline.
```

### (г) План потолков с уровнями (reflected ceiling plan)

```
Reflected ceiling plan (RCP), top-down orthographic view as if looking up at the
ceiling mirrored onto the floor plane, technical presentation drawing style.

Show: ceiling level zones as flat fill areas with different light-grey tones per
level step (e.g. lighter grey = base level, darker grey = lowered/coffered zone);
thin 0.2mm boundary line between level zones; simple flat symbols for light
fixtures (circles for downlights, rectangles for linear LED strips, small squares
for spotlights) — symbols only, no glow, no photorealistic light rendering.

Walls: thin 0.3mm outline only (RCP walls are drawn thin, not solid poché).
Background: plain white, no shading, no gradients, no perspective, no 3D render.

Constraints: keep the exact wall/room layout from the reference. No text, no
numbers, no level height labels (leave blank leader lines only if height callouts
are needed, no digits), no photorealism.
```

### (д) Развёртка стены кухни (interior elevation)

```
Flat orthographic interior wall elevation (front view, no perspective, no vanishing
point) of a kitchen wall, technical presentation drawing style.

Show cabinetry as flat line-art fronts: base cabinets, wall cabinets, worktop line,
backsplash zone, appliances as simple flat rectangular silhouettes (fridge, oven,
hood) — line-art only, no photorealistic material texture, no reflections, no
brand logos.

Line hierarchy: 0.3mm bold outline for cabinet/appliance silhouettes, 0.18mm thin
line for panel joints, handle lines and hatching (e.g. tile hatch on backsplash).
Flat light-grey fill for cabinet fronts, no color, no wood-grain photo-texture,
no gloss/reflection rendering.

Background: plain white, floor line and ceiling line as simple horizontal
boundaries, no perspective, no shadows other than a thin flat contact-shadow line
at the floor.

Constraints: proportions and cabinet widths must match the reference plan; no
text, no numbers, no dimension figures, no photorealism.
```

### (е) Аксонометрия-схема квартиры, белая модель (white massing axonometric)

```
Isometric axonometric massing view of the apartment interior, no perspective
convergence, 45-degree isometric projection, cut-away view showing all interior
walls and rooms from above at an angle.

Style: clean white architectural card massing model — every surface matte white,
no color, no material texture, no photorealistic rendering. Soft neutral studio
light from directly above, faint ambient occlusion in inside corners only, subtle
soft contact shadows where walls meet the floor.

Furniture (if included): simplified white block volumes only, no detail, no color,
matching the same matte-white material as the walls.

Background: plain white or very light neutral grey, no gradient sky, no ground
texture, no perspective distortion, no realistic materials, no glass reflections.

Constraints: keep wall layout and room proportions exactly as in the reference
plan; no text, no numbers, no labels, no color accents, no photorealism.
```

### (ж) План электрики с символами

```
Top-down orthographic electrical layout plan, technical presentation drawing
style, no perspective, no photorealism.

Walls: thin 0.25mm outline (light poché fill, lighter than a construction plan so
symbols stay legible). Furniture (if shown): very light thin grey outline only,
de-emphasized, in the background.

Electrical symbols (flat line-art, standard architectural symbol style, black
line on white, no color): small circle for single socket, circle with two short
parallel lines for a double/duplex socket, letter-free simple square for a switch
plate with a short leader line to the switch location, circle with a small cross
or radiating lines for a ceiling light point, rectangle with diagonal lines for a
linear light fixture. Thin dashed lines connecting switches to their controlled
fixtures (switching lines), drawn as simple dashed 0.15mm lines, no color coding.

Constraints: keep the exact wall/room layout from the reference plan. Symbols
must be flat, small, and consistent in size across the sheet. No text, no numbers,
no legend text (leave a blank legend box area only), no photorealism, no shadows.
```

### (з) Комбинированный лист «чертёж + рендер» (split sheet)

Для маркетинговых страниц/презентации клиенту — верх лист технический, низ — рендер той
же геометрии, с явным требованием совпадения между половинами (частая проблема — рендер
«уезжает» от чертежа).

```
Create a 3:4 aspect ratio split-screen architectural presentation sheet.

TOP HALF — technical drawing:
Precise true top-down orthographic floor plan, black line-art on white background,
solid grey poché walls (0.35mm bold outline), thin 0.18mm furniture silhouettes,
no color, no shading, no perspective, no photorealism, no text, no numbers
(title block area left blank).

BOTTOM HALF — photorealistic render:
The same room, same furniture layout, same wall positions as the plan above,
rendered as a photorealistic interior visualization, soft even daylight from the
window shown in the plan, natural materials matching the design brief
[материалы/палитра из presets.js], 35mm lens, eye-level perspective from the
room entrance.

Critical constraints — zero deviation between the two halves: identical wall
positions, identical room shape, identical door/window openings, identical
furniture placement and count between the top plan and the bottom render.
No missing walls, no extra rooms, no furniture in the render that is absent
from the plan, no mismatched proportions, no floating structural elements.
No text, no numbers, no watermark in either half.
```

---

## 5. Что взять в практику LINEA (короткие выводы)

1. Для реальных рабочих листов (то, что уже строит `engine/paper.js`) генеративные
   картинки не заменяют векторный движок — модель не гарантирует замкнутость стен и точные
   размеры. Использовать эти промпты только для **презентационных/маркетинговых** материалов
   (сайт, кейсы, соцсети), не для листов альбома, которые идут в стройку.
2. Любой текст/цифры на сгенерированном изображении — не доверять, просить `no text, no
   numbers` и накладывать подписи отдельно (уже так устроено в проекте через SVG/HTML).
3. Для «одеть в стиль» готовый обмер/SVG-план — `images/edits` с `input_fidelity: high` и
   явным повтором «keep exact wall positions/proportions» в каждой итерации.
4. Комбинированный шаблон (з) — готовый кандидат для карточек `site/cases/` или
   `site/portfolio` (план + рендер на одном листе для соцсетей), но требует ручной проверки
   на совпадение геометрии, а не автопубликации.

---

## Источники

- [openai/openai-cookbook — image-gen-1.5-prompting_guide.ipynb](https://github.com/openai/openai-cookbook/blob/main/examples/multimodal/image-gen-1.5-prompting_guide.ipynb)
- [OpenAI Cookbook (зеркало) — Gpt-image-1.5 Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-1.5-prompting_guide)
- [OpenAI Developers — GPT-Image-2 Model docs](https://developers.openai.com/api/docs/models/gpt-image-2)
- [OpenAI Developers — Images and vision guide](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI — Introducing ChatGPT Images 2.0](https://openai.com/index/introducing-chatgpt-images-2-0/) (403 при фетче, данные — по цитатам поисковой выдачи)
- [getimg.ai — GPT Image 2: Official Release, Features & What's New](https://getimg.ai/blog/gpt-image-2-rumours-leaks-release-date-2026)
- [MindStudio — What is GPT Image 2?](https://www.mindstudio.ai/blog/what-is-gpt-image-2)
- [BuildFastWithAI — ChatGPT Images 2.0 Full Developer Breakdown](https://www.buildfastwithai.com/blogs/chatgpt-images-2-0-gpt-image-2-2026)
- [OpenAI Community — GPT Image 1 Input Fidelity](https://community.openai.com/t/gpt-image-1-input-fidelity/1317640)
- [OpenAI Community — Gpt-image-1 quality parameter](https://community.openai.com/t/gpt-image-1-quality-parameter/1246424)
- [DataCamp — GPT-Image-1 API Guide](https://www.datacamp.com/tutorial/gpt-image-1)
- [BigPromptHub — Convert Blueprint to Render Prompt](https://www.bigprompthub.com/convert-blueprint-to-render-prompt/)
- [CivilMix — Architectural AI Prompt for Floor Plans, Elevations & Sections](https://civilmix.com/architectural-ai-prompt-for-floor-plans-elevations-sections-copy-use-cad-blueprint-prompt/) (403 при фетче, данные — по цитатам поисковой выдачи)
- [ChatGPTPrompt.in — ChatGPT Architectural Drawing Prompts: 12 Templates](https://chatgptprompt.in/blog/chatgpt-architectural-drawing-prompts)
- [Architizer Journal — Chat GPT for Architects and Designers](https://architizer.com/blog/practice/tools/chat-gpt-for-architects-in-practice/)
- [PromptAA — 7 Prompt Key Words to Make Images Less Fake Looking](https://www.promptaa.com/blog/prompt-key-words-to-make-images-less-fake-looking)
- [ArchiVinci — What Is Clay Rendering?](https://www.archivinci.com/blogs/what-is-clay-rendering)
- [EdrawMax — What is A Reflected Ceiling Plan](https://edrawmax.wondershare.com/floor-plan-tips/what-is-reflected-ceiling-plan.html)
- [RoomSketcher — The Ultimate Guide to Blueprint Symbols](https://www.roomsketcher.com/blog/the-ultimate-guide-to-blueprint-symbols/)
- [Archtoolbox — Electrical Plan Symbols](https://www.archtoolbox.com/electrical-plan-symbols/)
