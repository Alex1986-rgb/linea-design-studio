# Разведка 03.11.2026: ИИ в чертежах и визуализации — что взять в LINEA

Метод: Exa (3 раунда, ~20 запросов), страницы вендоров/репозиториев/статей. Пометки: [2+] подтверждено двумя и более источниками, [1] один источник, [вендор] цифры самого вендора. Просмотры видео в выдаче поиска почти нигде не отдаются — стоят «—», не выдумывал. Даты видео из индекса Exa местами условные (у части роликов стоит 03.11.2025 — похоже на дату индексации, не публикации).

## 0. Главный вывод (контекст LINEA)

У нас уже есть то, чего нет у всех сервисов ниже: **точная модель сцены** (project.json + scene.js). Поэтому «галлюцинации мебели» лечатся не выбором сервиса, а архитектурой: **геометрию рисуем мы, ИИ только красит**.
- Ведущий приём рынка [2+]: серая «глина» из своей 3D-сцены → depth/seg/lineart-условие → низкий denoise 0.2–0.4, промпт только про материал и свет, не про форму. Источники: archvizdaily (ControlNet over clay), Autodesk APS «Do you still need ControlNet?» (02.04.2026), студия ArchWW (design-mate, 30.06.2026: «серая сцена в ArchiCAD → Nano Banana → правка в Photoshop»).
- Autodesk, апрель 2026: без ControlNet Nano Banana даёт самый «красивый» кадр, но «геометрия лестницы смещается, стили перил меняются». Flux/Qwen + ControlNet по depth/normal держат план. [1, но в духе остальных]
- Лишнее (торшеры, вазы, стулья) — типовой дефект: «стремятся заполнить пустое пространство кадра» (design-mate, ArchWW/Жилин). Лечится: (а) все предметы уже есть в глине, пустых зон нет; (б) запрет в промпте «no additional objects»; (в) пост-проверка vision-моделью с подсчётом объектов по списку из project.json; (г) жёсткий композит: из ИИ-кадра берём пиксели только внутри масок материалов (пол/стены/ткань), а силуэты мебели берём из нашей глины.
- Маска в gpt-image — **не жёсткая**: «маска — подсказка, не композитинг», обработка блоками 16×16, вне маски возможны мелкие сдвиги (OpenAI community, erikmalk/image-edit-demo). Значит, для точечных правок нужно самим склеивать результат с оригиналом по маске.
- ВАЖНО по API: по документации OpenAI `gpt-image-1` отключён 23.10.2026; актуальны `gpt-image-2`, `gpt-image-2.5-sunburst/flare`. У `gpt-image-2` параметр `input_fidelity` не передаётся; у 2.5 есть новый `markup` (прозрачный PNG поверх первого изображения, нельзя вместе с mask). Проверить, что наш шлюз не зовёт снятую модель. [1: страница API-референса]

## 1. Распознавание плана -> векторная модель

| Что | Тип / доступ | Цена | Точность (как заявлено) | Лицензия / разворот у себя | Применимость | Куда встроить |
|---|---|---|---|---|---|---|
| **VLM-цикл «разбор -> наложение -> проверка»** (HF `rikhoffbauer2/floorplan-parser`: VLM пишет JSON стен/проёмов, Shapely выводит комнаты, оверлей на оригинал, VLM правит, цикл) | схема-паттерн, код открыт | токены VLM | статья 2510.20838: стены ~83% с первого прохода, после 2–3 итераций с обратной связью F1 >0.83 и геометрическая ошибка -> 0 (10 планов, от руки) [1] | развернуть можно; лицензию репо не проверял — | **Высокая** | Бриф: загрузка скана -> черновик `rooms/walls/openings` -> оверлей клиенту «ваш план и как мы поняли» -> правки. Схема JSON совпадает по смыслу с нашим брифом |
| **Home 3D Plan / «Claude Vision -> floor-plan JSON»** | SaaS-фича, BYO-ключ Anthropic | ~0,005 $ за скан (заявлено вендором) | — | закрытый | Средняя (как подтверждение подхода: масштаб по размерным цепочкам, масштабной линейке или ширине двери) | эвристика калибровки масштаба в бриф-визарде |
| **Revizo** (revizo.studio) | SaaS | — | «самопроверка по площадям, напечатанным на плане, сомнительное просит подтвердить» | закрытый | Средняя-высокая (идея) | **Контроль площадей из экспликации БТИ как валидатор распознавания** -> в `engine/validate.js` (Σ площадей vs печатные) |
| **CubiCasa5K** (модель + датасет, 623 звезды) | open, PyTorch, hourglass; веса есть | бесплатно | F1 стены ~0,86 / двери ~0,70-0,82 по сравнению в arXiv 2408.01526 (MDA-Unet: средн. F1 0,86 vs 0,74 у CubiCasa) [2+] | **лицензия «Other»; датасет и производные модели помечены CC BY-NC 4.0 -> коммерческий риск**, юристу показать до встраивания | Средняя (только R&D/бенчмарк) | офлайн-оценка качества, не прод |
| **Raster-to-Vector** (Liu 2017, ICCV) | open, Torch7 (устарел) | бесплатно | ~90% precision/recall на 100 тестовых планах (LIFULL), стены 94,7/91,7 | MIT | Низкая (старый стек, Manhattan-допущение) | только как историческая точка сравнения |
| **Raster-to-Graph** (EG 2024) | open | бесплатно | Edge F1 ~96 на своём датасете 10 000 планов | **GPL-3.0** | Средняя (R&D) | сравнить на наших 6 фикстурах |
| **Raster2Seq** (Cornell VAILab, 2025-26) | open | бесплатно | SOTA на Structured3D и CubiCasa5K; CubiCasa5K ~88,7 (метрика не уточнена) | лицензия не проверена | Средняя (R&D) | то же |
| **Qwen2.5-VL-3B LoRA на CubiCasa5K** (HF, SFT+GRPO) | веса адаптера, JSON walls/rooms/openings | бесплатно, GPU | не опубликована в выдаче | наследует **CC BY-NC** от датасета | Низкая для коммерции | идея: дообучить на своих выпусках (у нас парные «план->project.json»), не на CubiCasa |
| **Planner 5D — «Upload a plan»** | SaaS | Premium 59,99 $/год или 19,99/мес; DWG/DXF-экспорт только Professional 399,99 $/год | 10 мин-24 ч ожидание [2+] | закрытый, self-host нет; есть B2B API | Низкая как зависимость; полезна как «чёрный ящик» для сверки | сверка результата по 5-10 реальным планам клиентов |
| **Synaps** | SaaS «план/бриф -> DXF/DWG(beta)/IFC(beta)/PDF» | 89 €/место/мес | — | закрытый | Средняя | конкурент/бенчмарк по экспорту DXF |
| **Maket** | SaaS | импорт DXF/DWG/PDF бесплатно, распознавание фото 1–3 кредита | — | закрытый | Низкая | — |
| **Coohom, RoomSketcher, Archilogic** | SaaS | Coohom Pro 29 $/мес; RoomSketcher от 12 $/мес; Archilogic 329 $ за конверсию | RoomSketcher «<5 с» | закрытые | Низкая | — |
| **ПСС «Артинс»** (РФ) | плагин Revit: нейросеть стены/двери/окна по PDF/скану -> 3D в Revit, векторизация в DXF | цена не найдена | «8-кратное ускорение» (вендор) | закрытый, РФ | Средняя (если клиенту нужен Revit) | не в конвейер; ориентир по рынку |
| **Яндекс Недвижимость 3D-туры** (Хабр, 21.10.2025) | внутренняя модель, не продаётся | — | >250 тыс. туров сгенерировано с июля 2025; разметка 12 000 планов | — | Низкая как продукт, **высокая как урок** | урок: важнее геометрическая согласованность (без зазоров между полигонами), чем средняя пиксельная точность -> наш валидатор нахлёстов уже верный курс |
| **Kreo, Remplanner, Roomle** | поисковая выдача по ним ничего нового про распознавание не дала | Roomle 1680-13800 €/год (конфигуратор) | — | — | Низкая | — |

Вывод по п.1: **брать VLM-цикл** (у нас уже есть структурированная схема брифа и валидатор). Классические сети (CubiCasa и родня) хороши как независимая сверка, но датасет CC BY-NC.

## 2. Визуализация с жёстким контролем геометрии

| Что | Суть | Цена / доступ | Геометрия (оценка источников) | Применимость | Куда встроить |
|---|---|---|---|---|---|
| **Глина из своей сцены + FLUX.1 Depth/Canny ControlNet** (BFL Depth/Canny-dev, XLabs depth-v3, ComfyUI) | depth+canny 0,6/0,4, denoise 0,2-0,4 | open-weights, нужна GPU 12 ГБ+ (SmartApe) | высокая [2+] | **Высокая** | Кадры: движок отдаёт depth/normal/ID-проходы по каждой камере (сцена своя), ComfyUI на SmartApe |
| **Interior-ControlNet seg (BertChristiaens) + depth, победитель Generative Interior Design Challenge 2024** | seg сохраняет планировку, depth — геометрию; вместе лучше; окна/двери — в inpaint-маску | open | высокая; победители обучили два ControlNet и склеили [1] | Высокая | сегментация по ID-проходу из нашей сцены даёт идеальную маску, без Upernet |
| **FLUX Kontext (dev/pro) — edit по картинке** | инструкция + скриншот глины; «keep the exact camera angle» | playground.bfl.ai ~5 ц за кадр на 2025-е; dev-веса локально | «сохраняет текстуры, геометрию, свет», но сам автор ролика: «Flux — не физик, это художник» | Высокая | вариант B для кадров; тест на 10 видах |
| **Qwen-Image-Edit / Nano Banana (Pro/2) + референсы** | до 12 референсов мебели, `Image 1…N` | API | Autodesk: без ControlNet геометрия «дышит» | Средняя | только для стиля/материалов поверх глины, с пост-проверкой |
| **gpt-image-2/2.5 edit + mask** | уже наш шлюз | токены | маска мягкая, вне маски дрейф | Средняя | точечные правки; **композит по маске делать самим** |
| **Blender/Cycles headless** | реальный рендер из JSON (пример LumiVerse 11.10.2026: Claude писал Python, 7 кадров 2400×1600, ~7 ч, CPU) | бесплатно | 100% честная геометрия | **Высокая** | эталон «правды» для сверки и depth/ID-проходов; режим «честный рендер» без ИИ; кадр 10–13 с превью |
| **Floorplan2Walkthru** (GitHub, 2026-05) | SVG плана (CubiCasa) -> Three.js + захват G-buffer (albedo/depth/normal/metallic/roughness) + StreamDiffusion | open | автор: ИИ «не меняет мебель, только свет», мерцание между кадрами | Средняя | образец связки G-buffer -> диффузия; у нас scene.js |
| **yakden/ai-media-stack** | пайплайн план -> 3D -> камеры на комнату (в т.ч. «через дверь») -> SDXL RealVisXL + ControlNet depth, glTF-экспорт | open-репо | «стены стоят, где велит план» (самооценка) | Средняя | идея: планировщик ракурсов (угол комнаты, на окно, из двери) |
| **agentic-scene-graph** (divinrkz) | LLM -> JSON сцен-графа -> CP-SAT решает координаты без коллизий -> Blender -> GPT-4V проверка | open | гарантирует отсутствие наложений мебели | Средняя | аналог нашей расстановки; добавить vision-проверку «по тексту» |
| **PIXLRelight** (HF) | физически управляемый релайт: целевое освещение из Cycles-проходов, <0,1 с | open веса | не синтезирует контента — нет новых вазочек | Средняя | вечерний/дневной свет без перерисовки мебели |
| **Veras 4.0 (Chaos)** | плагин + web, ползунок Geometry Override (15–40% для архитекторов), Same Seed, движки Nano Banana Pro / SD | от 16,90 $/мес (год) | высокая «для массинга»; для точного — не гарантия | Низкая (плагины Revit/SketchUp, у нас своя сцена) | взять идеи: **ползунок strength + фиксация seed между ракурсами** |
| **Spacely AI** | SketchUp/Revit/AutoCAD/Rhino, Point-and-Edit | free 40 кр.; 25 $/мес; API на Agency (100 $/мес) | «сохраняет геометрию и материалы» (рекламная оценка) | Низкая-средняя | бенчмарк |
| **Rendair, mnml.ai, Interior AI, LookX, ReimagineHome, D5 AI** | браузерные ИИ-рендеры; Rendair: inpainting, планы/разрезы на входе (19 $/мес) | 19–49 $/мес | geometry preservation «средняя»; независимый обзор Maquete: Rendair — «диффузионный подход, переинтерпретация обычна» | Низкая | бенчмарк; ни один сервис не обещает совпадения с планом или спецификацией (ArchiGen 10.05.2026) |
| **Krea (сцена + реальная мебель)** | редактор сцены в браузере | подписка | в обзоре курса AMS³ | Средняя | идея «собираем из блоков», уже реализуем у себя |
| **3D Gaussian Splatting** | реконструкция по фото существующего помещения | open | для существующих объектов, не для проекта | Низкая | не для LINEA сейчас |

Про «3D-вид сверху не сходится»: ни один найденный источник не решает ортовид диффузией. Рекомендация-гипотеза (не подтверждена ссылкой): ортовид/аксонометрию получать **только** детерминированно (Blender/three.js, или SVG движка), а ИИ-проход допускать лишь на текстуры пола/стен по ID-маскам. Проверить на `gost-kv3k`.

## 3. ИИ в рабочей документации / BIM

| Что | Что делает | Цена / доступ | Применимость | Куда встроить |
|---|---|---|---|---|
| **Skyfall SKY-001** (19.10.2026) | «мировая модель»: BIM — контур этажа + бриф -> планировка с дверями/окнами/приборами; IoU 43,6% против GPT-6 Astra 40,6% (бенчмарк самого Skyfall, 1000 планов) | research preview, лист ожидания, **нет API/цен/весов**; коммерция «начало 2027» (i-scoop) | Низкая сейчас. Автор i-scoop: «при 43,6% IoU это генератор эскизов, не чертёжник» | следить; не планировать |
| **Snaptrude Agent** (01.11.2026, AEC Magazine/MarketScale) | заявлено: массинг -> LoD 400 с конструкциями/MEP/чертежами «за минуты»; ранее «чертежи -> модель» | Free 3 проекта; 60 $/мес; 100 $/мес орг. | Низкая (архитектурный масштаб); заявки вендора | идея «Sketch to BIM» как конкурент |
| **Autodesk Forma + Finch** | площадки, массинг, жилые планировки; Finch -> Revit | Forma 59–85 $/мес; Finch ИИ-планировки от 14 500 €/год | Низкая (жилой комплекс, не отделка) | — |
| **Hypar** | параметрические функции + естественный язык; основатели сами говорят «это не ИИ» | Free + enterprise | Средняя (идея) | урок честности формулировок на сайте |
| **Chaos Glyph (Revit)** | авто-виды, листы, размеры, марки; ИИ-ассистент | 600 $/год | Средняя (как образец состава автоматизации) | наш движок делает то же детерминированно |
| **Swapp, Graebert ARES Neo** | автоматизация CD-листов (80% рутины — заявка вендора); Neo: размеры/марки/исправление аннотаций, IFC -> DWG | Swapp — enterprise; Neo — цена по объёму | Низкая | ориентиры |
| **Archicad 30 AI Visualizer** | внутри ArchiCAD, движки вкл. Nano Banana Pro, edit/upscale 4×, «image from composition» с сохранением раскладки | в составе Archicad | Низкая (нужен Archicad) | — |
| **HarnessBIM** (GitHub, 07.2026) | текст -> IFC4 + 9 проверок (схема, IDS, коллизии, нормы), `sketch plan.png -> plan.ifc` детерминированным CV | Apache-2.0, headless, без ключа | **Высокая для экспорта IFC и проверок** | сверить наш IFC-экспорт; взять идею «verification is the reward» |
| **MCP4IFC / ifc-bonsai-mcp, ifcx-mcp** | LLM правит IFC через IfcOpenShell/Blender | open | Средняя | прототип «правка проекта голосом» |
| **Renga** (РФ) | BIM; ИИ-фич в выдаче не найдено | — | Низкая | — |
| **nanoCAD + NSR Specification** (Нанософт, 2025) | ИИ переводит нормативы в машиночитаемые правила проверки ЦИМ; точность подсказок >80%, но по суждению 50–60%; RAG-чат по стандартам | реестр российского ПО №12132; цена не найдена | Средняя как ориентир нормоконтроля | идея: наши `audit-sheets`/`cad-canon` — тоже «правила как код»; ссылаться на ГОСТ с пунктами |
| **ARAI «ИИ для проверки чертежей» (08.10.2026)** | статья-методика: «пустой список замечаний ничего не подтверждает»; отчёт = реестр находок + перечень НЕвыполненных проверок | — | **Высокая (методика)** | в `check-sheets`/приёмке выводить отдельным блоком, что НЕ проверено |
| **ЛЭНДПРОДЖЕКТ (09.10.2026)** | 40 типов квартир за 2 недели, агенты на Claude: Revit-листы по ГОСТ 21.110, машинная проверка листов (пустые виды, наложения текста, штамп, нумерация) | кейс, не продукт | Средняя: прямой конкурент по заявлению | сравнить по `compare/` только после проверки фактов |
| **BIM-стандарты РФ** | поиск дал только материалы Нанософт (машиночитаемость требований, схема XML Минстроя) | — | Низкая сейчас | вернуться при выходе на заказчиков с ЦИМ |

## 4. Видео и доклады (YouTube / VK / RuTube), 2025-2026

Просмотры — «—» там, где поисковик их не отдал. Проверять вручную.

| # | Видео | Канал | Дата | Просмотры | Что полезного | Польза LINEA |
|---|---|---|---|---|---|---|
| 1 | AI visualizations without rendering! FLUX Kontext — https://www.youtube.com/watch?v=RlSl5Wjjdw4 | CGwisdom | в индексе 03.11.2025 (условно) | — | вид из SketchUp -> Kontext; выключить линии, лёгкий AO, тени для подсказки света; промпт «keep exact camera angle»; не описывать то, что уже видно | Высокая (рецепт промпта для глины) |
| 2 | ComfyUI Architectural design plan (depth anything + lineart + IP-Adapter) — https://www.youtube.com/watch?v=-YztmpHp8UA | PixelEasel | — | — | при двух ControlNet снижать силу до исчезновения «полос» на стенах; IP-Adapter для цвета | Высокая (настройка весов) |
| 3 | Stable Diffusion + ControlNet in Architecture — https://www.youtube.com/watch?v=FJKJPSa0HC4 | ArchViz | — | — | честно: без 3D масштаб и свет не контролируются | Средняя (аргумент для «глины») |
| 4 | AI Virtual Staging: ControlNet, CLIPSeg, SD — https://www.youtube.com/watch?v=JJIk5pqT5S0 | Vibe Coding | 01.01.2026 | — | маски пол/стена + depth + послойная расстановка мебели | Средняя |
| 5 | Master Flux Kontext — Inpainting & Editing (ComfyUI) — https://www.youtube.com/watch?v=9-onDeEWWvU | pixaroma | в индексе 03.11.2025 | — | локальный Kontext-dev, GGUF для малых карт, CFG 1, conditioning 2.5; 36 с/кадр на RTX 4090 (первый), 18 с далее | Высокая (прикидка по времени на SmartApe) |
| 6 | 5 AI Workflows Every Interior Designer Should Try — https://www.youtube.com/watch?v=POsaBs5AusA | Salmaan Mohamed | 23.05.2026 | — | план + стрелка точки съёмки + мудборд -> вид; предметы мебели-референсы (до 12); тех. чертёж из фото — **размеры врут (1000 vs 1300 мм)** | Высокая (подтверждает риск размеров; приём «стрелка камеры») |
| 7 | How to Use AI to Design Homes 10x Better (Synaps) — https://www.youtube.com/watch?v=g1B01iv08IU | Melos Azemi | — | — | 2D -> белая модель -> рендер 9,8 с; ветвление вариантов; конкурентный UX | Средняя (бенчмарк) |
| 8 | This AI App Just Did My Entire Interior Design Project (Floor Plan Wizard на Gemini) — https://www.youtube.com/watch?v=9EGarPgN7hA | architutors | — | — | до 8 ракурсов из плана, стиль из референса через LLM; автор: «не всегда идеально» | Низкая-средняя |
| 9 | Rendair AI: complete workflow — https://www.youtube.com/watch?v=3l8U5SR9bF0 | Adrian Mazur | — | — | обзор Rendair | Низкая |
| 10 | Как превратить чертёж в дизайн-проект: ChatGPT и Nano Banana 2 — https://www.youtube.com/watch?v=ndK2_jn-8Wc | Школа ретуши и дизайна, Басманов | — | — | GPT Image 2 -> проверка, что расставил как надо; ошибки на «терраса/шкаф», подмазка кистью в Photoshop | Высокая (подтверждает дорисовку лишнего) |
| 11 | TOP 5 AI Tools for Interior Designers in 2025 — https://www.youtube.com/watch?v=ke-4H0XoN2M | Михаил Жилин | в индексе 03.11.2025 | — | Midjourney, Promeai, ApplyDesign и др. | Низкая (обзор для массовых дизайнеров) |
| 12 | ТОП-4 ИИ для архитектурных процессов (VK-копия) — https://vkvideo.ru/video-6887015_456243624 | Revit Проектирование / In BIM we trust (оригинал Youtube IsyUPYm-eUw) | 16.05.2026 | 770 (VK) | в комментариях профи: «на практике всё равно строишь 3D-модель, из неё берёшь планы/фасады/разрезы» | Высокая (подтверждает курс «модель — истина») |
| 13 | Мастер-класс «Нейросети для дизайнеров: как продавать проекты в 10 раз быстрее» — https://rutube.ru/video/fe9fa5e9c000cb577a44a0bf88179fa6/ | STRUCTURA | 20.03.2025 | — | 1ч27м, нейросети для эскизов на переговорах | Низкая (маркетинг) |
| 14 | ИИ в проектировании, Артур Ишмаев (ПИК), 3 шортса — https://rutube.ru/plst/1139855/ | BIM Support | год назад | — | как ПИК пробует ИИ в архитектуре с Revit | Низкая-средняя |
| 15 | Бесплатный мастер-класс AMS³ (Меркулов): Концепция/Планировки/Визуализация — https://vk.com/club44437244 | AMS³ | 12.05.2026 (пост) | — | видео про Krea AI со сборкой сцены и реальной мебелью; продаёт курс | Низкая |

Текстовые доклады, стоящие времени: Autodesk APS «Do you still need ControlNet?» (02.04.2026); design-mate «Гибридный пайплайн: как российские дизайнеры используют нейросети» (30.06.2026; цитата Жилина: «около 70% задач, кроме финального комплекта РД»); AEC Magazine «Ten conceptual designs before lunch…» (22.10.2026: ИИ в продакшене — гибрид, детерминированные движки исполняют, ИИ интерпретирует); Habr Нанософт (14.08.2025).

## 5. Рекомендация: что пробовать первыми (топ-7)

1. **ControlNet depth + seg (+ canny) на проходах из НАШЕЙ сцены** (ID-проход как идеальная seg-маска), FLUX.1-Depth/XLabs, denoise 0,2-0,4, промпт только про материал/свет. Встроить: генерация кадров. SmartApe. Проверка: сравнить с текущим gpt-image на 10 ракурсах gost-kv3k.
2. **FLUX Kontext-dev как альтернатива**: вход — глина из сцены, «keep the exact camera angle». 18–36 с/кадр на 4090. Генерация кадров.
3. **Композит по маске поверх любой ИИ-правки** (gpt-image edit, Kontext): финальный кадр = наша глина там, где стоит мебель/ортовид, ИИ — только в разрешённых зонах. Лечит торшеры/вазы/форму стола. Генерация + проверка.
4. **Vision-приёмка по списку из project.json** (подсчёт и тип предметов, форма столешницы, отсутствие лишнего) с отчётом «что НЕ проверено» (методика ARAI). Уже есть views-check — расширить. Проверка.
5. **VLM-цикл распознавания плана** (JSON -> оверлей -> правка -> Shapely для комнат) + сверка с площадями из экспликации (идея Revizo). Бриф. Начать с Claude/Qwen2.5-VL, замерить на 6 фикстурах + 5 реальных сканах.
6. **Blender headless как «эталон правды»** (по образцу LumiVerse) для ортовида и depth/ID-проходов; ИИ ортовид не рисует. Кадры + сверка.
7. **HarnessBIM / IfcOpenShell-проверки** для IFC-экспорта (схема, IDS, коллизии, помещения). Экспорт + проверка. Лицензия Apache-2.0.

Не тратить время сейчас: SKY-001 (нет доступа), Snaptrude/Forma/Finch (другой масштаб), CubiCasa-модели в проде (CC BY-NC), сервисы Spacely/Rendair/mnml (не обещают совпадение с планом; только как бенчмарк).

## 6. Что не подтверждено / пробелы
- Kreo, Remplanner, Roomle: по теме распознавания плана в выдаче ничего содержательного.
- Renga и «Модульные решения»: ИИ-функций не найдено.
- Точность Raster2Seq и лицензия репозитория — не проверены; лицензия floorplan-parser (HF) тоже.
- Цены ПСС «Артинс», NSR Specification — не найдены.
- Просмотры видео — не получены (кроме VK-ролика).
- Идея «ортовид только детерминированно» — моя гипотеза, источником не подтверждена.

## Основные источники
- https://aps.autodesk.com/blog/do-you-still-need-controlnet-testing-next-gen-models-viewer-scenes
- https://archvizdaily.com/posts/controlnet-and-img2img-over-clay-renders
- https://medium.com/@melgor89/generative-interior-design-challenge-2024-2nd-place-solution-6338f19f6fe3
- https://design-mate.ru/read/an-experience/design-thinking/how-russian-designers-and-architects-use-neural-networks
- https://3drenderingagency.com/software/ai-rendering/
- https://archigenai.com/ai-rendering-interior-designers-spacely-2026.html
- https://blog.chaos.com/ai-rendering-revit-plugin
- https://www.lumiverse.hr/blog/blueprint-to-archviz
- https://github.com/Teetertater/Floorplan2Walkthru
- https://github.com/yakden/ai-media-stack
- https://github.com/divinrkz/agentic-scene-graph
- https://huggingface.co/mlfarinha/pixlrelight
- https://github.com/CubiCasa/CubiCasa5k , https://github.com/art-programmer/FloorplanTransformation , https://github.com/SizheHu/Raster-to-Graph , https://github.com/Cornell-VAILab/Raster2Seq
- https://arxiv.org/html/2408.01526v1 ; https://d6108366.hf-mirror.com/papers/2510.20838
- https://huggingface.co/rikhoffbauer2/floorplan-parser ; https://huggingface.co/mudasir13cs/qwen25-vl-3b-floorplan-sft
- https://home3dplan.com/features/ai-plan-recognition ; https://revizo.studio/
- https://planner5d.com/pricing ; https://support.planner5d.com/en/articles/14434484-how-to-upload-a-floor-plan
- https://yesilcamstudios.com/compare/best-dxf-floor-plan-to-3d-tools ; https://synaps.app/news/blog/ai-tools-for-architects/
- https://habr.com/ru/companies/yandex/articles/954650/
- https://pssbim.ru/news/pss-artins-ii-ot-pss.html
- https://skyfall.ai/blog/introducing-sky-001 ; https://www.i-scoop.eu/sky-001-engineering-world-model/
- https://aecmag.com/bim/snaptrude-ai-conceptual-design-and-beyond/ ; https://www.marketscale.com/industries/engineering-and-construction/snaptrude-says-its-new-ai-agent-builds-lod-400-bim-models-in-minutes
- https://aecmag.com/cad/ten-conceptual-designs-before-lunch/ ; https://www.chaos.com/glyph ; https://www.graphisoft.com/en-us/plans-and-products/ai-solutions/
- https://github.com/ReverseZoom2151/harnessbim ; https://show2instruct.github.io/mcp4ifc/
- https://arai.build/ru/blog/proverka-chertezhej-ii ; https://habr.com/ru/companies/nanosoft/articles/936874/ ; https://www.nanocad.ru/press/article/nsr-specification-novye-moduli-dlya-avtomatizatsii-proektirovaniya-s-pomoshchyu-tekhnologii-ii/
- https://landproject.net/blog-posts/dizayn-proekt-i-rd-40-tipov-kvartir-za-2-nedeli-ii.html
- https://developers.openai.com/api/reference/resources/images/methods/edit ; https://community.openai.com/t/gpt-image-1-problems-with-mask-edits/1240639/65 ; https://github.com/erikmalk/image-edit-demo
