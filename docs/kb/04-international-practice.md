# 04. Западная практика interior construction documents

База знаний LINEA. Собрано 06.08.2026 по первичным источникам: **U.S. National CAD Standard / CSI Uniform Drawing System** (UDS, модули 1–7), книга AIA/Wiley «The Architect's Guide to the U.S. National CAD Standard», **NKBA Drawing & Presentation Standards** (3-е изд., 2023 — единственный публичный стандарт, целиком посвящённый интерьерным рабочим чертежам жилья), академические конспекты (Jonathan Ochshorn, Cornell), руководства бюро и справочники.

Задача документа — не пересказать западный стандарт, а отобрать то, что усиливает наш альбом стадии РП (ГОСТ/СПДС, `docs/cad-canon.md`). Термины даны парами **english — русский**.

Сокращения источников в ссылках:
- **UDS-N** — CSI Uniform Drawing System, модуль N, в составе US National CAD Standard v5: [UDS-1](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds1.pdf), [UDS-2](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds2.pdf), [UDS-3](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds3.pdf), [UDS-4](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds4.pdf), [UDS-5](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds5.pdf), [UDS-6](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds6.pdf), [UDS-7](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds7.pdf); [состав NCS v6](https://www.nationalcadstandard.org/ncs6/content.php)
- **AIA/NCS** — R. Rosen, «The Architect's Guide to the U.S. National CAD Standard», гл. 1 «Drawing Set Organization» ([excerpt, Wiley](https://catalogimages.wiley.com/images/db/pdf/9780471703785.excerpt.pdf))
- **NKBA-4** — [Universal Presentation Standards](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf); **NKBA-8** — [Title Sheet & Site Layout](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf); **NKBA-9** — [Demolition & Construction Plan](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-9-Demolition-and-Construction-Plan-1.pdf); **NKBA-10** — [Finish Plan & Finish Schedules](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf); **NKBA-11** — [Mechanical, Electrical & Plumbing Plan](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-11-Mechanical-Electrical-Plumbing-Plan-1.pdf)

---

## 1. Типовой набор листов interior construction document set

### 1.1. Как западный набор устроен принципиально

Отличие от нашего альбома одно, но структурное: **у них лист — это носитель одного типа изображения, а комплект собирается из «подкомплектов» по дисциплинам** (subsets / discipline sets), причём порядок подкомплектов задан стандартом: Cover → G (General) → … → S (Structural) → **A (Architectural)** → **I (Interiors)** → Q → F → P → M → E → T → R (Resource) ([AIA/NCS, fig. 1-1](https://catalogimages.wiley.com/images/db/pdf/9780471703785.excerpt.pdf); [Archtoolbox](https://www.archtoolbox.com/construction-document-sheet-numbers/)). Интерьер — **отдельная дисциплина `I` (Interiors)**, не раздел архитектуры; в интерьерных бюро на практике пишут `ID` ([NKBA-4, «Interiors (sometimes “ID”, most commonly used)»](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)).

Первый подкомплект — **General sheets («G-sheets») — общие данные**: код-информация, **drawing sheet index — ведомость (индекс) листов**, symbol legend — условные обозначения, general notes — общие указания. «Информация на этих листах относится ко всем листам комплекта» ([AIA/NCS](https://catalogimages.wiley.com/images/db/pdf/9780471703785.excerpt.pdf)). Последний — **Resource sheets — справочные листы**: то, что нужно для координации, но **не входит в контракт** (существующие условия, фото, оборудование «by others») ([AIA/NCS](https://catalogimages.wiley.com/images/db/pdf/9780471703785.excerpt.pdf)).

### 1.2. Состав набора: лист → назначение → обязательность → есть ли у нас

«Обязателен ли» ниже — это не буква закона (в США состав CD-набора задаёт договор и AHJ — authority having jurisdiction — надзорный орган), а сложившаяся практика: **обязательный** = присутствует практически во всех наборах и на него ссылаются как на базовый; **условный** = «если требуется» прямо оговорено в источнике; **опциональный** = встречается у части бюро.

Колонка «У нас» сверена с составом альбома в `docs/cad-canon.md` §3.

| Лист (en — ru) | Назначение | Обязателен | У нас |
|---|---|---|---|
| **Cover / Title sheet — титульный лист** | Клиент, объект, дизайнер; 3D-перспектива или ключевая схема; правовая инфо и зонирование; список применённых кодов; список сокращений; general notes; **drawing sheet index** | да — «requirement for all drawings, regardless of the type of work» ([NKBA-8](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf)) | частично: паспорт + ведомость чертежей есть, но нет листа-титула с индексом листов и списком сокращений |
| **Site layout / key plan — ситуационный план, схема расположения** | Привязка объекта к участку/этажу, границы работ; масштаб не мельче 1/8″=1′-0″ (1:100) ([NKBA-8](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf)) | условный (для разрешения) | нет (для квартиры не нужен) |
| **Existing conditions / as-built plan — обмерный план** | Фактическая геометрия до работ | обязателен де-факто (база всего набора) | **да** (`obmer`) |
| **Demolition plan — план демонтажа** | «Delineates all partitions, doors, and power/communications outlets to be demolished» ([FMLink](https://www.fmlink.com/articles/types-of-drawings-in-a-typical-set-of-construction-documents/)); удаляемое — **тонкой пунктирной линией** с примечаниями, чтобы не снесли лишнее ([NKBA-9](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-9-Demolition-and-Construction-Plan-1.pdf)) | условный: «if no demolition or construction is occurring… this plan would likely not be necessary» ([NKBA-9](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-9-Demolition-and-Construction-Plan-1.pdf)) | **да** (`demolition`) |
| **Construction / partition plan — план монтажа перегородок** | Новые перегородки и их тип, проёмы, ниши, wall blocking — закладные в стене под навесное, переносимые проёмы; **wall-type legend — ведомость типов стен**; изменения уровня пола ([NKBA-9](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-9-Demolition-and-Construction-Plan-1.pdf)); часто объединяют с демонтажным | обязателен при любых конструктивных работах; часто **совмещён** с демонтажным | **да** (`montage`), но нет закладных (blocking) и типизации стен в отдельную ведомость |
| **Dimension plan — размерный план** | Отдельный лист только с цепочками, когда основной план перегружен | опциональный | нет — цепочки живут на `obmer`/`montage` |
| **Floor plan (anchor plan) — планировочное решение** | «Anchor plan»: мебель, оборудование, сантехника, марки позиций; к нему привязаны все schedules ([NKBA-4, табл. 4.2](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) | да | **да** (`furniture`, плюс `presentation` для клиента) |
| **Furniture / FF&E plan — план мебели с кодировкой** | Мебель с тегами позиций, критические проходы, furniture list; у бюро — «coded furniture plans» ([IDG](https://idgfw.com/process/construction-documents/)) | у интерьерных бюро — обязателен; у kitchen&bath — «not typically required» ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) | **да** (`furniture`) |
| **Reflected ceiling plan (RCP) — план потолка в зеркальной проекции** | Единый лист-координатор всего, что на потолке: см. §3 | да | частично: у нас три листа — `ceiling`, `lighting`, `switches` — и **нет ни одного листа-координатора** для люков, диффузоров, датчиков |
| **Lighting & switching plan — план освещения и групп управления** | Светильники, выключатели, **switching lines — линии управления** от светильника к выключателю (тип линии стандартизован; при пересечении рисуется «прыжок») ([NKBA-11](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-11-Mechanical-Electrical-Plumbing-Plan-1.pdf)) | обязателен (сам или внутри RCP/MEP) | **да** (`lighting`, `switches`, `switch-scheme`) |
| **Power / data & communication plan — план розеток, слабых токов и данных** | «Location, **height**, and orientation of all new power, telephone, and communications outlets» ([FMLink](https://www.fmlink.com/articles/types-of-drawings-in-a-typical-set-of-construction-documents/)); подводки к оборудованию, smart-home, вывод вытяжки на улицу ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) | да | **да** (`sockets`) |
| **MEP plan — совмещённый план ОВ+ЭО+ВК** | Компромисс для малых объектов: HVAC + электрика + сантехника на одном листе; NKBA прямо предупреждает разделять, когда становится «too cluttered or unclear» ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) | альтернатива раздельным листам | нет — у нас сразу раздельные (`plumbing`, `climate`, `sockets`) — это правильнее |
| **Finish plan — план отделки** | Графически показывает **границы** каждой отделки; **finish plan symbol** — крестовидный маркер (пол в центре, стены по 4 сторонам, потолок сверху, плинтус снизу); **wall finish lines — линии границ отделки стен**; **datum start point — точка начала раскладки** ([NKBA-10](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf)) | условный: «if not provided, then a FINISH SCHEDULE is sequenced after the FLOOR PLAN and the ELEVATIONS will have the finishes annotated» ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) | **да** (`wall-finish`, `floors`) |
| **Countertop plan — план столешниц** | Габариты и швы горизонтальных рабочих поверхностей, профиль кромки, тип установки мойки | опциональный (часто внутри finish plan) | нет |
| **Interior elevations — развёртки стен** | «Most prominent where ever something is to be built»; «typically illustrates every wall and compartment» ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)); нумеруются **по часовой стрелке от северной стены** | да | **да** (`elevation`) |
| **Sections / wall sections — разрезы** | Разрезы по стене, лестнице, узкому месту в увеличенном масштабе | условный («at larger scale, if required») ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) | **да** (`section`) |
| **Millwork / casework details — узлы мебели и встроенных конструкций** | Планы, развёртки, разрезы, крупные детали встройки: «document all approved special architectural construction items» — с листами развёрток, разрезов и крупных деталей ([FMLink](https://www.fmlink.com/articles/types-of-drawings-in-a-typical-set-of-construction-documents/)); толщины материалов, соединения, кромки, фурнитура ([The Millwork Studio](https://www.themillworkstudio.com/post/ultimate-guide-to-millwork-shop-drawings), [McLine](https://mclinestudios.com/components-of-casework-shop-drawings/)) | да, если есть встройка | частично: `node` — узлы конструкций (пироги, короб, стык), **не мебель**; и это осознанно (см. §6) |
| **Detail drawings — узлы** | Перегородки, стекло душа, разрез шкаф/столешница, установка карниза; масштаб не мельче 1-1/2″=1′-0″ (1:10) ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) | да | **да** (`node`) |
| **Door / window schedules — ведомости проёмов** | См. §4.2 | условный: «if required», по сложности объекта ([NKBA-9](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-9-Demolition-and-Construction-Plan-1.pdf)) | **да** (`doors` + ведомость проёмов) |
| **Finish schedule / room finish schedule — ведомость отделки** | См. §4.1 | да | частично: есть ведомость отделки и экспликация полов, **нет матрицы «помещение × поверхность»** |
| **FF&E schedule — спецификация мебели, оборудования, сантехники** | См. §4.4 | да | частично: есть спецификация позиций и материалов (ГОСТ 21.110), нет графы «кто поставляет / кто монтирует» |
| **Lighting / luminaire schedule — ведомость светильников** | См. §4.3. «When producing a reflected ceiling plan, a Luminaire Schedule is **required**» ([NKBA-11](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-11-Mechanical-Electrical-Plumbing-Plan-1.pdf)) | да | **да** (ведомость осветительного оборудования по ГОСТ 21.608) |
| **Partition schedule — ведомость типов перегородок** | Графы: Mark, Detail (ссылка на узел), Fire Rating Label, Notes ([AIA/NCS, FAQ](https://catalogimages.wiley.com/images/db/pdf/9780471703785.excerpt.pdf)) | условный | частично: марки Мn есть, отдельной ведомости с ссылкой на узел нет |
| **3D representations / presentation views — визуализации** | Отдельный тип листа (sheet type 9), **в конце комплекта** ([UDS-1](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds1.pdf); [NKBA-4, seq. 15](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) | опциональный | **да**, и тоже после чертежей — совпадает с каноном |

### 1.3. Порядок листов интерьерного набора (NKBA, табл. 4.2)

Полная последовательность 15 позиций ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)): титул → ситуационный/ключевой план → **floor plan (anchor)** → **schedules & specifications** → демонтаж → монтаж → отделка → мебель → MEP → power/data → RCP → разрезы → развёртки → узлы → визуализации.

Важное расхождение с нами: **ведомости идут сразу за планировочным решением, позиция 4** — раньше всех технических планов. Логика: schedule — это «истина» о позициях, а планы её только размещают. У нас ведомости прицеплены к своим листам; западная схема выносит их вперёд как реестр проекта.

---

## 2. Соглашения оформления

### 2.1. Нумерация листов (sheet identification — обозначение листа)

Формат `A A N N N`: **discipline designator — обозначение дисциплины** (1–2 буквы) + **sheet type designator — цифра типа изображения** + **sheet sequence number — двузначный порядковый номер** ([UDS-1](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds1.pdf)).

Типы изображений — та самая цифра, которая делает номер листа самодокументируемым:

| Цифра | Sheet type | Русский эквивалент |
|---|---|---|
| 0 | General (symbols legend, notes) | общие данные, условные обозначения, примечания |
| 1 | Plans (horizontal views) | планы |
| 2 | Elevations (vertical views) | развёртки, фасады |
| 3 | Sections (sectional views, wall & stair sections) | разрезы |
| 4 | Large-scale views | фрагменты в увеличенном масштабе (не узлы) |
| 5 | Details | узлы |
| 6 | Schedules and Diagrams | ведомости и схемы |
| 7, 8 | User defined | пользовательские (напр. альтернативы, спецификации) |
| 9 | 3D Representations | аксонометрии, перспективы, фотографии |

Правила, которые важны механически ([UDS-1](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds1.pdf), [AIA/NCS](https://catalogimages.wiley.com/images/db/pdf/9780471703785.excerpt.pdf)):
- нумерация в серии **начинается с 01, номер 00 запрещён**;
- **номера не обязаны быть последовательными** — специально, чтобы вставлять листы позже (`A-110, A-120, A-130`);
- двузначность фиксирована ради корректной сортировки файлов;
- смешивать один тип изображения с другим на листе можно, но цифра берётся по **преобладающему** изображению, а в названии листа перечисляются оба: «ROOF PLAN AND DETAILS»;
- ревизии и фазы — **суффиксом**: `A-102-R1` (перевыпуск того же объёма), `A-102-X1` (полностью изменённый лист), `A-101-A / -B` (фазы), `A-101-NE` (квадранты);
- имя файла кодирует место чертежа на листе: `A-502-C2.dwg` — чертёж в клетке C2 листа A-502.

Интерьерная практика жилья пользуется упрощённым десятичным вариантом: `ID-0.00` титул, `ID-1.00` план, `ID-1.01` ведомость шкафов, `ID-1.02` FF&E, `ID-1.03` демонтаж+монтаж, `ID-1.04` MEP, `ID-2.00` RCP, `ID-3.00` развёртки, `ID-4.00` узлы, `ID-5.00` презентация ([NKBA-8, fig. 8.4](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf)).

### 2.2. Sheet index — ведомость (индекс) листов

Живёт на титульном листе, **в левом нижнем углу** ([NKBA-8](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf)); в крупных наборах — на G-листе вместе с код-информацией, легендой символов и «drawing sheet logic» ([AIA/NCS](https://catalogimages.wiley.com/images/db/pdf/9780471703785.excerpt.pdf)). Обязателен всегда.

### 2.3. Title block — основная надпись

Всегда по нижней или правой кромке; по низу — полоса ~1″ (25 мм) высотой, справа — 1½–2″ (38–50 мм) шириной ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)). Обязательные поля: данные бюро (лого, адрес, телефон, e-mail), **disclaimer — оговорка об ответственности**, данные заказчика, **sheet title — наименование листа**, job info (номер работы, номер ревизии, «drawn by», «checked by», дата печати, масштаб), **sheet number**.

Отдельно: **north arrow в штамп не ставится** и появляется только на планах ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)).

### 2.4. Keynotes — ключевые (кодированные) примечания и legends — легенды

Механика: **keyed note — примечание под кодом** = алфавитно-цифровой маркер + линия-выноска, а полный текст один раз лежит в **keynote legend — расшифровке кодов** на том же листе. «Keying legend давала единую точку отсчёта и позволяла одному примечанию, написанному один раз, работать во множестве мест чертежа через повторение кода» ([UDS-7](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds7.pdf)). **Reference keynote — привязанное примечание** дополнительно связывает код с разделом спецификации по MasterFormat ([UDS-7](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds7.pdf)).

Правовая рамка, которая нам тоже полезна: примечания — часть контракта, поэтому нельзя формулировками делить работу между субподрядчиками и **нельзя писать расплывчатое «SEE SPECIFICATIONS»** ([UDS-7](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds7.pdf)).

Три вида примечаний ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)):
1. **general notes — общие указания** — на титуле, на весь комплект;
2. **plan notes — примечания к листу** — под легендой, справа;
3. **leader line notes — выноски** — на планах и развёртках; на развёртке выноски выравнивают и подписывают **только с одной стороны** вида.

Легенда — «в правом верхнем углу листа», на планах; на развёртках, разрезах и узлах легенды не ставят ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)). Легенда не является спецификацией, но её марки специфицируют элементы плана.

**Abbreviations — сокращения**: список выносится на G-лист; принцип «не сокращать слова из пяти букв и короче», «избегать сокращений с двумя значениями», и главное — «**When the meaning of an abbreviation is in doubt, spell it out!**» ([UDS-5](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds5.pdf)).

### 2.5. Tags и markers — маркеры и теги

Размеры даны в **миллиметрах бумаги** — прямо сопоставимо с нашим `normalizeInk()`:

| Symbol (en) | Русский эквивалент | Размер / правило |
|---|---|---|
| **elevation indicator, interior** | маркер развёртки (внутренний) | кружок Ø **16 мм (5/8″)**, есть варианты на 1, 2, 3, 4 вида ([UDS-6](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds6.pdf)); стрелка указывает на стену, в сторону взгляда; нумерация — **от северной стены по часовой** ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) |
| **elevation title marker** | маркер названия развёртки | кружок Ø 16 мм, разделён горизонтально: **сверху — номер вида, снизу — номер листа, где стоит маркер-источник** («cross referencing») ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) |
| **drawing title marker** | маркер названия чертежа | Ø 16 мм; обязателен даже когда на листе один вид ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) |
| **section indicator** | маркер разреза | кружок с линией сечения; **число сверху — номер чертежа, снизу — номер листа**; стрелка — в сторону взгляда (типовая ошибка новичков — развернуть её) ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) |
| **detail indicator** | маркер узла | пунктирная окружность или пунктирный прямоугольник вокруг места выноса; текст 2,5 мм (3/32″); для тесных мест — «detail indicator for small conditions»: стрелка под 45° ([UDS-6](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds6.pdf)) |
| **room identifier** | номер и наименование помещения | вариант с отделкой: `A` пол / `2` плинтус / `C` стены / `3` потолок прямо в маркере ([UDS-6](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds6.pdf)) |
| **finish plan symbol** | маркер отделки на плане | крест «box-fold»: 4 квадрата = стены, кружок в центре с 80 % заливкой = пол; сверху добавляется потолок, снизу — плинтус. Размер **зависит от масштаба**: при 1/2″ (1:25) — 6″, при 1/4″ (1:50) — 3″ в модельных единицах; если не влезает — отводится выноской с точкой ([NKBA-10](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf)) |
| **datum start point** | точка начала раскладки | место старта рисунка материала, обычно у порога проёма; годится и на плане, и на развёртке ([NKBA-10](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf)) |
| **north arrow** | указатель севера | самый крупный символ на плане, Ø **19 мм (3/4″)**, вверху справа, на каждом плане; если «верх листа» ≠ север, ставят пару **project north / true north — условный север / истинный север** ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) |
| **keynote indicator** | маркер кодированного примечания | текст 2,5 мм, шестиугольник 6 мм под 60° ([UDS-6](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds6.pdf)) |
| **generic tag** | тег позиции | плоттерный размер 1/4″ (6 мм), текст 3/32″; всегда перекрёстно связан с легендой или ведомостью ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)) |
| **match line + key plan** | линия стыковки + ключевая схема | обязательны, когда план разбит на части по листам ([AIA/NCS, FAQ](https://catalogimages.wiley.com/images/db/pdf/9780471703785.excerpt.pdf)) |
| **revision cloud + revision block** | облако ревизии + блок изменений | мелкие правки — облаком с номером и краткой записью в блоке; полный перевыпуск — суффиксом листа ([UDS-1](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds1.pdf)) |
| **fire-rated line, 1–4 hour** | линия огнестойкой преграды | тонкая линия с ромбиками 2,5 мм и шагом 14/12/8/7 мм для 1/2/3/4 ч ([UDS-6](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds6.pdf)) |
| **demolition line / existing to remain line / new line** | линия демонтажа / существующего / нового | демонтаж — средняя линия, штрих 4 мм, пробел 2 мм; существующее — тонкая; новое — средняя ([UDS-6](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds6.pdf)) |

### 2.6. Scale conventions — масштабы

Ряд линейных масштабов в UDS дан **и в дюймах, и метрический**: 1:1, 1:2, 1:5, 1:10, 1:20, 1:30, 1:50, 1:100, 1:200… параллельно с 1/16″, 3/32″, 1/8″, 1/4″, 3/8″, 1/2″, 3/4″, 1″, 1½″, 3″, 6″ = 1′-0″ ([UDS-6, graphic scales](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds6.pdf)). Соответствия, полезные для чтения западных примеров ([NKBA-4, -8, -10](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)):

| Imperial | Метрический эквивалент (как пишут сами) | Где применяют |
|---|---|---|
| 1/8″ = 1′-0″ | **1:100** | ситуационный / общеквартирный план |
| 1/4″ = 1′-0″ | **1:50** | этажный план крупной квартиры; типовой «архитектурный» масштаб плана |
| 1/2″ = 1′-0″ | **1:25** | все планы и развёртки кухни/санузла — базовый масштаб NKBA |
| 1-1/2″ = 1′-0″ | **1:10** | узлы, минимум для деталей |

Ключевые правила:
- масштаб проставляется **в двух местах — в drawing title marker и в штампе** ([NKBA-10](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf));
- масштаб **не подгоняют** под лист — «the scale of kitchen and bath plans should not be altered, and therefore a larger drawing sheet size should be considered instead» ([NKBA-10](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf)). Наш канон решает ту же задачу иначе — ряд ГОСТ + контрольный отрезок 1000 мм;
- при смене масштаба **все аннотации и символы пересчитываются** («all annotations and symbols must also adjust accordingly») — ровно наш `normalizeInk()`;
- RCP чертится **в том же масштабе, что план**, обычно 1/4″=1′-0″ ([archisoup](https://www.archisoup.com/studio-guide/reflected-ceiling-plans)).

### 2.7. Dimension strings — размерные цепочки: **что именно мерят**

Это самое ценное место западной практики и одновременно самое конфликтное — единого правила нет, но **есть обязанность объявить базу**.

Три базы отсчёта (**dimension datum — база размера**):

| База (en) | Русский эквивалент | Когда применяют |
|---|---|---|
| **face of finish / finish face to finish face** | по чистовой отделке | «для риелторов, маркетинга, **интерьерного дизайна** и планов сдаваемых площадей» ([EVstudio](https://evstudio.com/dimensioning-101/)) |
| **face of stud / stud-to-stud** | по каркасу (черновая) | «основной метод для строительства и большинства стадий планирования»; мерить **с одной и той же стороны стойки по всей цепочке**, чтобы каркасчик не вычитал толщину отделки ([EVstudio](https://evstudio.com/dimensioning-101/)) |
| **centerline** | по оси | оси общих стен между секциями/квартирами — «упрощает разбивку и снижает ошибки» ([Fine Homebuilding / EVstudio](https://evstudio.com/dimensioning-101/)) |

Интерьерная норма жёстче и однозначна: **размеры берутся от внутренней чистовой поверхности ГКЛ, но НЕ включают накладную отделку (плитку)** — «dimensions are witnessed from the interior finished face of gypsum wallboard… applied wall surfaces, such as tile, are not dimensioned but remain important clearance and functional considerations» ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)). И это дублируется общим примечанием на титуле: «**ALL DIMENSIONS ARE TO FINISHED SURFACE EXCEPT WHERE OTHERWISE NOTED. “EQ” INDICATES EQUAL DIMENSION**» ([NKBA-8](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf)).

Проёмы:
- **новые** проёмы — **по оси (centerline)**; существующие проёмы **не размеряют вовсе**, если стену не трогают ([NKBA-9](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-9-Demolition-and-Construction-Plan-1.pdf));
- в деревянных стенах — «always dimension windows or doors… **to the midpoint**»; в каменных — **к габариту чернового проёма (rough opening)**, потому что кладку потом не исправить ([EVstudio](https://evstudio.com/dimensioning-101/));
- проёмы с наличниками размеряют **по наружной кромке погонажа**: «ALL DIMENSIONS FOR DOOR OR TRIMMED OPENINGS ARE GIVEN BETWEEN OUTSIDE EDGE OF MILLWORK CASINGS/TRIM» ([NKBA-8](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf)).

**Dimension string hierarchy — иерархия цепочек**: три параллельные цепочки — **inner / center / outer (внутренняя / осевая / габаритная)**, и по каждому типу листа стандарт задаёт, какие из трёх обязательны, а какие опциональны ([NKBA-4, табл. 4.8](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)):

| Лист | inner | center | outer | Что размеряют |
|---|---|---|---|---|
| demolition plan | — | — | — | **не размеряют вовсе** |
| construction plan | опц. | опц. | опц. | только возводимое; новые проёмы — по оси |
| floor plan | ✚ | ✚ | ✚ | все препятствия, приборы с трапами, оборудование, габарит |
| interior elevations | ✚ | опц. | ✚ | препятствия, ширины и высоты корпусов, оборудование, габарит стены |
| details | ✚ | опц. | ✚ | ширина и высота; ось — только для оборудования |
| sections | ✚ | — | ✚ | — |
| finish plan | опц. | — | — | только если критично |
| countertop plan | ✚ | — | — | ширина и глубина поверхности |
| furniture plan | ✚ | — | — | **только критические проходы** |
| RCP | — | ✚ | — | **только оси светильников** |
| power & lighting | ✚ | ✚ | ✚ | всё |

Порядок простановки (сверху вниз по значимости): **1) габарит → 2) крупные изломы/выступы → 3) проёмы** ([EVstudio](https://evstudio.com/dimensioning-101/)).

Анти-правила: **не дублировать размер** («это создаёт путаницу и порождает RFI»), избегать дробей, внутренние размеры — внутри плана, наружные — по периметру ([EVstudio](https://evstudio.com/dimensioning-101/)).

Графика: **tick mark — засечка («forward slash»)** — «arrowheads and dots are **not** typically used when dimensioning»; **dimension gap — зазор** между объектом и началом выносной ≈ 1/32″ (1 мм); **witness lines — выносные** не пересекают друг друга и не идут поверх стены; числовое значение — **в разрыве размерной линии**, читается снизу листа (допустимо: горизонтальные — снизу, вертикальные — справа) ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)). Всё это совпадает с ГОСТ 2.307/21.101 до мелочей — засечки, зазоры, отступы.

Единицы: **одна система на весь комплект**, «No alternative or combination values should be used in a drawing»; для планов, развёрток, разрезов и узлов — **миллиметры** (метрический вариант), для ситуационного плана — метры с двумя знаками ([NKBA-4, табл. 4.7](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)).

### 2.8. Line weights — толщины линий и text height — кегли

| Назначение | Толщина, мм |
|---|---|
| heavy — основное сечение, линия земли | 0,70 |
| medium — контур объекта | 0,35 |
| light — размерные и осевые | 0,18 |
| extra light — невидимые, штриховка | 0,13 |

([BIM Heroes, 2D CAD Drafting Standards](https://bimheroes.com/2d-cad-drafting-standards-for-architecture/)) — практически один в один с нашей таблицей в `docs/cad-canon.md` §2 (0,7 / 0,5 / 0,35 / 0,25 / 0,18).

Кегли: весь текст чертежа — **3/32″…1/8″ (2,4…3,2 мм) в плоттерном размере**, заголовки 3/16″ ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf); [BIM Heroes](https://bimheroes.com/2d-cad-drafting-standards-for-architecture/)). Наш ГОСТ-ряд 2,5/3,5/5/7 мм — жёстче и совместим.

### 2.9. Poché — заливка стен

Тонкость, которую стоит знать: на **MEP-плане стены НЕ заливают** («Walls shall not be pochéd on an MEP Plan»), примыкающие стены обрываются **breaklines — линиями обрыва**; на finish plan стены «not commonly pochéd» ([NKBA-11](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-11-Mechanical-Electrical-Plumbing-Plan-1.pdf), [NKBA-10](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf)). Смысл: на инженерных листах чёрная стена «съедает» символы.

### 2.10. Mock-up set — макет альбома («cartoon set»)

Формальный этап **до** отрисовки: комплект уменьшенных до 1/4 размера листов, где заранее расставлены будущие чертежи, ведомости и примечания ([UDS-4](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds4.pdf), [UDS-2](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds2.pdf)). Процедура из 8 шагов начинается с «Step 1: **скомпоновать список листов** по sheet type designators и присвоить обозначения», а Step 5 — «отметить помещения, требующие развёрток, символами, и набросать каждую развёртку на назначенном листе». Есть даже **mock-up worksheet** с графами «номер листа / название / число видов / список видов / масштаб / часов на лист / исполнитель / стоимость».

Для нас это ровно то, что движок обязан делать первым проходом: посчитать список листов и их номера, а потом рисовать.

---

## 3. Reflected ceiling plan: чем принципиально отличается от нашего плана потолков

**Определение.** RCP — «orthographic drawing of a ceiling **projected downward as if mirrored on the floor**, so its orientation matches the floor plan of the same space» ([MT Copeland](https://mtcopeland.com/blog/what-is-a-reflected-ceiling-plan/)); наглядно: «представьте, что вы висите над прозрачным потолком, а примерно метром ниже — зеркало, которое отражает всё, что на потолке, обратно к вам» ([archisoup](https://www.archisoup.com/studio-guide/reflected-ceiling-plans)).

**Три принципиальных отличия от «плана потолков» в нашем понимании:**

1. **Это не вид снизу, а зеркальная проекция сверху.** Ориентация совпадает с планом пола, поэтому лево/право не переворачиваются, и потолочная точка лежит ровно над своей напольной. Отсюда практическое следствие: RCP **можно накладывать на план мебели и электрики без зеркалирования** — это единственный способ проверить, что светильник над столом действительно над столом. Наш `ceiling` рисуется в той же системе координат, что план, — то есть по геометрии мы уже RCP; но **мы этого не объявляем, а значит бригада не знает, что можно накладывать листы**.

2. **Условный уровень сечения — примерно метр над полом.** «The “mirror” is typically imagined at a few feet above the floor plane so that elements like furniture and base cabinets are **not** included» ([MT Copeland](https://mtcopeland.com/blog/what-is-a-reflected-ceiling-plan/)); окна и двери на RCP не показывают, а то, что ниже плоскости потолка, — **пунктиром** ([archisoup](https://www.archisoup.com/studio-guide/reflected-ceiling-plans)). То есть RCP намеренно чистится от напольной графики. Это прямо противоречит нашей практике полупрозрачной мебели-подложки — но у нас она нужна на `sockets`, а не на потолке.

3. **RCP — единственный лист-координатор потолочной плоскости.** Он снимает «visual congestion» с плана освещения и МЕР, вынося все потолочные системы на один лист ([RCP explainer](https://plan7architect.com/what-is-rcp-in-construction-drawings-ai3/), [archisoup](https://www.archisoup.com/studio-guide/reflected-ceiling-plans)). У нас потолочная плоскость размазана по `ceiling` + `lighting` + `switches`, и **ревизионные люки, вытяжка, датчики и диффузоры не сведены нигде**.

**Обязательный состав RCP** (сводно: [archisoup](https://www.archisoup.com/studio-guide/reflected-ceiling-plans), [NKBA-11](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-11-Mechanical-Electrical-Plumbing-Plan-1.pdf), [FMLink](https://www.fmlink.com/articles/types-of-drawings-in-a-typical-set-of-construction-documents/), [Vectorworks](https://www.vectorworks.net/en-US/newsroom/introduction-to-reflected-ceiling-plans)):

| Элемент (en) | Русский эквивалент | Обязателен |
|---|---|---|
| ceiling material / treatment | тип и материал потолка по участкам | да |
| **ceiling height AFF (above finished floor)** | **высота потолка от чистого пола** и все её изменения | да |
| ceiling grid + tile layout origin | раскладка (сетка) и точка её начала | да, если есть модульный потолок |
| lighting fixtures + types | светильники с типами | да |
| switch locations + switching lines | выключатели и линии управления | да |
| soffits / bulkheads | короба, ниши, гипсовые объёмы | да |
| access panels | ревизионные люки | да |
| air diffusers / return grills | приточные диффузоры и решётки возврата | да |
| exhaust fans, duct directions | вытяжка и направления воздуховодов | да |
| smoke / CO detectors | датчики дыма и СО | да |
| sprinklers | спринклеры | да (в РФ жилье — нет) |
| speakers, cameras, data outlets | акустика, камеры, слаботочные выводы на потолке | да, если есть |
| structural beams, drop beams, columns | балки, ригели, колонны, выступающие в потолок | да |

**Правило приоритета, которое стоит украсть целиком.** Общее примечание NKBA №16: «**CEILING LIGHT FIXTURE LAYOUT IS THE DETERMINANT REFERENCE FOR ALL OTHER CEILING-LOCATED ITEMS**» — раскладка светильников главенствует над всем остальным на потолке; исключение — люки доступа, которые согласуются отдельно ([NKBA-8](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf)). И примечание №17: «ALL CEILING HEIGHT DIMENSIONS CALLED OUT (A.F.F.) INDICATE THE DIMENSION FROM THE CEILING TO THE SURFACE OF THE **FINISHED** FLOOR» — то есть база высот объявлена явно.

**Размеры на RCP**: только **осевые (center)** — «All lighting fixtures» ([NKBA-4, табл. 4.8](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)). Габаритные цепочки на RCP не ставят: их место на плане.

**Ведомость обязательна**: «When producing a reflected ceiling plan, a **Luminaire Schedule is required**» ([NKBA-11](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-11-Mechanical-Electrical-Plumbing-Plan-1.pdf)).

---

## 4. Schedules — ведомости и их графы

### 4.0. Анатомия любой ведомости

Обязательные части ([UDS-3](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds3.pdf), [Ochshorn, Cornell](https://jonochshorn.com/academics/notes-bldgtech/14a.html)):

1. **heading — заголовок** (главная тема ведомости);
2. **mark column — графа марки** — **всегда первая слева**; марка может быть буквенно-цифровой или графическим символом, повторяющим обозначение на чертеже; **в широкой ведомости графу марки дублируют справа** для читаемости;
3. **item description — наименование позиции**;
4. **distinguishing feature column(s) — графы отличительных признаков** (может быть много);
5. **notes / remarks — примечания** — крайняя справа графа; в неё пишут **ключ (букву или номер) со ссылкой на легенду примечаний**, а не полный текст: «преимущество ключа — сокращение ширины графы».

Академическое уточнение: **в ведомости должно быть не меньше трёх графов** — две графы делают из неё список или легенду, но не ведомость ([Ochshorn](https://jonochshorn.com/academics/notes-bldgtech/14a.html)).

Правило размещения: ведомость лежит **на том же листе, что её план, или на листе сразу за ним** ([NKBA-10](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf)).

Правило сокращений: сокращать слова из ≤5 букв нельзя, **кроме заголовков графов ведомости** — там разрешено ради ширины ([UDS-5](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds5.pdf)).

### 4.1. Finish schedule — ведомость отделки

**Вариант А: «спецификационная» ведомость отделки** (NKBA, 13 графов — по сути наша спецификация материалов) ([NKBA-10](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf)):

| № | Графа (en) | Русский эквивалент |
|---|---|---|
| 1 | Key | марка (символ с плана) |
| 2 | Room | помещение (когда их несколько) |
| 3 | Description | наименование материала |
| 4 | Manufacturer | производитель — **полное имя бренда, без сокращений** |
| 5 | Product Number | артикул производителя |
| 6 | Color / Finish | точный цвет и фактура; несколько — в том же поле |
| 7 | Notes / Remarks | особые указания по монтажу; сюда же ток, напряжение, вентиляция, БТЕ |
| 8 | Quantity | количество + единица измерения (шт., пара) |
| 9 | Floor | признак «на пол» |
| 10 | Walls | признак «на стену» — **по сторонам: север, восток, юг, запад** |
| 11 | Ceiling | признак «на потолок» |
| 12 | **Supplied By** | **кто поставляет** |
| 13 | **Installed By** | **кто монтирует** (может отличаться от поставщика) |

**Вариант Б: room finish schedule — матрица «помещение × поверхность»** ([Ochshorn](https://jonochshorn.com/academics/notes-bldgtech/14a.html), [archisoup](https://www.archisoup.com/finish-schedules), [Helonic](https://helonic.com/knowledge-base/finish-schedule-guide)):

- по Y — помещения, по X — блоки **floor / base / walls / ceiling — пол / плинтус / стены / потолок**;
- **стены разбиты на четыре графы по сторонам света (N / E / S / W)** — это ключевая деталь: одна стена помещения может иметь другую отделку, и матрица это ловит;
- **отдельная графа ceiling height — высота потолка**, когда высоты разные: «a separate height column proves more efficient than requiring installers to reference sections» ([Ochshorn](https://jonochshorn.com/academics/notes-bldgtech/14a.html));
- дополнительные графы у бюро: wainscot — панель/буазери (верх/низ стены отдельно), trim & base — погонаж и плинтус, special finishes ([archisoup](https://www.archisoup.com/finish-schedules));
- обозначения марок: `F01` — первый тип напольного, `B04` — четвёртый тип плинтуса, `W06` — шестой тип отделки стен ([FMLink](https://www.fmlink.com/articles/types-of-drawings-in-a-typical-set-of-construction-documents/)); в маркере помещения — `A` пол / `2` плинтус / `C` стены / `3` потолок ([UDS-6](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds6.pdf));
- заполнение — точкой-маркером в клетке (матрица смежности) либо кодом отделки в клетке ([NKBA-10, fig. 10.8–10.9](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf)).

Разделение труда «ведомость / примечания к листу»: в plan notes к плану отделки пишут то, что таблицей не выражается — профиль кромки столешницы и радиусы, тип установки мойки, **тип затирки для плитки**, степень подготовки под покраску, тип погонажа и его отделку, отделку потолка ([NKBA-10](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf)).

### 4.2. Door schedule — ведомость дверей (и проёмов)

Сводный набор графов ([Ochshorn](https://jonochshorn.com/academics/notes-bldgtech/14a.html), [archisoup](https://www.archisoup.com/door-schedules-101), [Layer](https://layer.team/blog/the-door-and-window-schedule-process-explained), [CDF](https://www.cdfdistributors.com/blog/post/interpreting-door-specifications-guide)):

| Графа (en) | Русский эквивалент | Замечание |
|---|---|---|
| Door mark / number | марка проёма | `D101`; связывает ведомость с планом |
| Location / from–to rooms | расположение: **из какого помещения в какое** | Ochshorn: в ведомости указывают **keyside room number** — с какой стороны замок |
| Size (W × H × thickness) | габарит полотна: ширина × высота × толщина | у двупольных — оба полотна |
| **Door type** | тип полотна | ссылка на **отдельный чертёж типов полотен** (конфигурация филёнок, остекление, жалюзи) |
| **Frame type** | тип коробки | **отдельная графа**: «assemblies may combine different materials (e.g. wooden door in steel frame)» ([Ochshorn](https://jonochshorn.com/academics/notes-bldgtech/14a.html)) |
| Door material / core | материал и заполнение полотна | |
| Frame material | материал коробки | |
| Hand / handing | направление открывания (сторона навесов) | |
| Finish | отделка полотна и коробки | |
| **Hardware set** | **комплект фурнитуры** | `HW-1`, `HW-2` — код, расшифрованный в спецификации; в ведомости только код |
| Fire rating label | предел огнестойкости | в РФ жилье — обычно не нужен |
| Acoustic rating (STC) | звукоизоляция | опционально |
| **Head / jamb / sill details** | **ссылки на узлы примыкания: верх / боковина / порог** | по узлу на каждое сопряжение |
| Elevation reference | ссылка на чертёж вида полотна | |
| Notes / remarks | примечания | |

Ключевая методическая мысль: **elevations of doors use variable notation** — один чертёж вида полотна обслуживает множество размеров, а конкретика идёт из графов ведомости ([Ochshorn](https://jonochshorn.com/academics/notes-bldgtech/14a.html)). То есть библиотека типов + таблица, а не чертёж на каждую дверь.

**Window schedule — ведомость окон** строится так же: марка, размер, тип, материал, **glazing — заполнение**, огнестойкость, ссылки на узлы head/jamb/sill ([Ochshorn](https://jonochshorn.com/academics/notes-bldgtech/14a.html)); минимум для интерьерщика — размер проёма и **высота подоконника (sill height)** ([NKBA-9](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-9-Demolition-and-Construction-Plan-1.pdf)).

### 4.3. Lighting & switching schedule (luminaire schedule) — ведомость светильников

10 графов ([NKBA-11](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-11-Mechanical-Electrical-Plumbing-Plan-1.pdf)):

| № | Графа (en) | Русский эквивалент |
|---|---|---|
| 1 | Key / Symbol | марка (символ светильника **или линии управления**) |
| 2 | Description | наименование (встраиваемый, накладной, мебельный линейный, диммер…) |
| 3 | Manufacturer | производитель |
| 4 | Product Number | артикул |
| 5 | Color / Finish | цвет и отделка корпуса |
| 6 | **Kelvin / CRI** | **цветовая температура, К, и индекс цветопередачи** |
| 7 | Notes / Remarks | напр. «SIZE TO FIT», «SCREWLESS, INSTALL @ 45″ AFF» — **высота установки идёт в примечание** |
| 8 | Quantity | количество |
| 9 | Supplied By | кто поставляет (`EXT'G` — существующий, `GC` — генподряд) |
| 10 | Installed By | кто монтирует |

Замечания:
- **выключатели и диммеры входят в ту же ведомость**, что светильники — вместе с линией управления;
- существующие светильники «to be reused» и «to be relocated» — **отдельными строками**, с пометкой `EXT'G` в поставке;
- Kelvin/CRI как обязательные графы — то, чего в ГОСТ 21.608 нет, а для интерьера это критично.

**MEP schedule — ведомость инженерного оборудования** (7 графов: Key, Description, Manufacturer, Product #, Color/Finish, Notes, Quantity) охватывает три группы ([NKBA-11](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-11-Mechanical-Electrical-Plumbing-Plan-1.pdf)): (1) ОВ — оборудование, воздуховоды, вентиляторы, решётки, тёплый пол, радиаторы, газ, термостаты; (2) электрика и слаботочка — розетки, распаячные коробки, данные, безопасность, полотенцесушители, щиты и подщитки, **накладки/рамки выключателей called out**; (3) ВК и пожарная безопасность — трапы, подводки воды к оборудованию. Ток, напряжение, БТЕ и требования по вентиляции — **в графу Notes**.

### 4.4. FF&E schedule — спецификация мебели, оборудования и предметов интерьера

Базовые графы ([Procurist](https://procurist.io/resources/ffe-schedules), [Fohlio](https://www.fohlio.com/blog/ffe-101-how-to-build-the-ultimate-schedule)): item name — наименование, room / area — помещение, vendor — поставщик, product code — артикул, quantity — количество, dimensions — габариты, unit cost / total cost — цена за единицу и сумма, **lead time — срок поставки**, order status — статус заказа, expected delivery — планируемая дата. На больших объектах добавляют **COM/COL** (customer's own material / leather — ткань или кожа заказчика), finish codes, **sidemark** (отметка получателя на упаковке), installation notes.

Важное разграничение, которое мы обязаны понимать для сметы: «An FF&E **schedule** lists items with quantities, basic specs, and locations. An FF&E **specification** describes materials, construction, finishes, and performance standards in full technical detail. Schedules are used for procurement and logistics, specifications for quality control» ([Procurist](https://procurist.io/resources/ffe-schedules)). У нас эти две сущности слиты в одну «спецификацию».

### 4.5. Partition schedule — ведомость перегородок

Графы: **Mark — марка, Detail — ссылка на узел, Fire Rating Label — предел огнестойкости, Notes**; графа Detail должна давать ссылку на узел **на каждый тип перегородки**, «как head/jamb/sill в ведомости дверей» ([AIA/NCS, FAQ](https://catalogimages.wiley.com/images/db/pdf/9780471703785.excerpt.pdf)).

---

## 5. Что перенести к нам — приоритизированный список

Порядок = отношение «польза бригаде и заказчику / стоимость правки движка». Все пункты совместимы с СПДС.

### P1. Явно объявленная база размеров + `EQ` — примечанием на каждом плане

**Что:** обязательное примечание вида «Все размеры — до чистовой поверхности, если не указано иное. Накладная отделка (плитка, панели) в размер не входит. Новые проёмы — по оси. `EQ` = равные участки» + пометка `(черн.)` у тех цепочек, что даны по черновой.
**Почему:** в западной практике это два отдельных требования, продублированных на титуле и в чек-листе ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf), [NKBA-8](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf)), и не случайно: расхождение «в черновых / в чистовых» — главный источник провала раскладки плитки и втыкания мебели в стену. Наш канон подробно описывает *как* рисовать цепочку (засечки, замкнутость, отступы), но **нигде не говорит, от какой поверхности она отсчитана**. Это дешёвая правка движка и сразу проверяемая аудитом.

### P2. Матрица room finish schedule «помещение × поверхность», стены по A–D

**Что:** ведомость отделки в матричном виде: строки — помещения, столбцы — пол / плинтус / стены **A / B / C / D** / потолок / **H потолка**; в клетке — марка отделки.
**Почему:** у нас стены уже названы A/B/C/D (`brief.rooms[].walls`) — матрица ложится на модель данных без изобретений, а сторонняя разбивка стен по 4 направлениям — прямое требование академической и отраслевой практики ([Ochshorn](https://jonochshorn.com/academics/notes-bldgtech/14a.html), [archisoup](https://www.archisoup.com/finish-schedules)). Даёт три вещи сразу: (1) **машинную проверку полноты** — каждая пара «помещение × стена» обязана иметь марку, иначе аудит падает; (2) сверку с развёртками — если у стены есть марка, но нет развёртки, это дефект; (3) отдельная графа высоты потолка избавляет монтажников от лазания по разрезам.

### P3. Замкнутый граф перекрёстных ссылок: маркеры развёрток, разрезов и узлов с обратными ссылками

**Что:** на плане — маркер развёртки у каждой стены, у которой есть развёртка (кружок Ø16 мм со стрелкой в сторону взгляда, номер вида / номер листа), нумерация **от стены A по часовой**; на листе развёртки — `elevation title marker` с обратной ссылкой на лист-источник; то же для разрезов и узлов. Аудит проверяет граф на висячие концы в обе стороны.
**Почему:** это единственная навигация в альбоме из 40+ листов, и стандарт делает её обязательной для каждого вида ([NKBA-4: «All walls shall be identified with an elevation marker on floor plans», «All details shall be identified with a detail marker»](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf); [UDS-6](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds6.pdf)). Наш канон требует обратную ссылку только для узлов (§2, п. о узлах и фрагментах) и марки 1—1/2—2 для разрезов; развёртки же ничем не привязаны к плану — бригада не знает, какая развёртка какая стена. Для генератора это чистая выгода: связи вычисляются из модели, поэтому граф гарантированно полон — то, чего вручную никто не добивается.

### P4. Лист-координатор потолка (RCP) + правило приоритета раскладки светильников

**Что:** один лист, где сведена **вся** потолочная плоскость: уровни с отметками AFF, короба, карнизы, теневые швы, **ревизионные люки, вытяжка и направления воздуховодов, диффузоры и решётки, датчики, закладные**, светильники, выключатели; напольная графика убирается (плоскость сечения ~1 м, всё ниже — пунктиром); примечание «Раскладка светильников главенствует над остальными потолочными элементами; расположение люков доступа согласуется отдельно»; размеры на листе — **только осевые к светильникам**.
**Почему:** правило приоритета — дословно общее примечание №16 NKBA ([NKBA-8](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf)), а состав — сводная норма RCP ([archisoup](https://www.archisoup.com/studio-guide/reflected-ceiling-plans), [NKBA-11](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-11-Mechanical-Electrical-Plumbing-Plan-1.pdf)). У нас потолок разложен на `ceiling`/`lighting`/`switches`, и **никто не отвечает за конфликт «люк vs спот» и «диффузор vs карниз»** — на объекте это решает прораб как получится. Один координирующий лист плюс одна фраза о приоритете снимают самый частый потолочный переделыш.

### P5. Кодовая система листов + ведомость (индекс) листов на титуле

**Что:** внутренний код листа `АИ-<тип><NN>` по логике UDS (1 — планы, 2 — развёртки, 3 — разрезы, 4 — фрагменты, 5 — узлы, 6 — ведомости и схемы, 9 — визуализации), нумерация внутри серии с 01 и **не обязательно подряд**; плюс лист-титул с индексом всех листов, списком сокращений и общими указаниями. Код — **в дополнение** к сквозному номеру листа в штампе, не вместо (см. §6).
**Почему:** сегодня в `docs/cad-canon.md` §3 у развёрток, разрезов, узлов и покомнатных планов вместо номера стоит «—», то есть **у половины альбома нет устойчивого адреса** — а ссылаться на лист узла обязан каждый маркер из P3. Пропуски в нумерации решают проблему вставки листа задним числом без перенумерации всего альбома ([UDS-1](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds1.pdf)); ведомость листов — жёсткое требование «for all drawings, regardless of the type of work» ([NKBA-8](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf)). Побочная выгода: код становится именем файла и стабилизирует снапшот-фикстуры.

### P6. Ведомость дверей и проёмов западного объёма

**Что:** добавить в нашу ведомость проёмов графы: **из/в помещение**, **тип полотна** и **тип коробки отдельными графами**, направление открывания, **комплект фурнитуры кодом** (`Ф-1`, расшифровка в спецификации), **ссылки на узлы верх / боковина / порог**, высота подоконника для окон; библиотека типов полотен одним чертежом с переменными обозначениями вместо чертежа на каждую дверь.
**Почему:** разделение «полотно / коробка» — не педантизм, а следствие того, что их часто делают из разных материалов и заказывают у разных поставщиков ([Ochshorn](https://jonochshorn.com/academics/notes-bldgtech/14a.html)); графы head/jamb/sill дают монтажнику узел на каждое сопряжение вместо «сделай как обычно»; «from–to rooms» — единственный способ не перепутать одинаковые двери. Плюс приём «один чертёж типа + переменные из таблицы» идеально подходит генератору.

### P7. Графы «кто поставляет / кто монтирует» в спецификациях и ведомостях

**Что:** в спецификацию позиций, ведомость светильников и спецификацию материалов добавить две графы: **поставка** (заказчик / студия / подрядчик) и **монтаж** (подрядчик / поставщик / заказчик), плюс отметку «существующее, повторно используется / переносится» и `не в подряде`.
**Почему:** в западных ведомостях это отдельные обязательные графы **Supplied By / Installed By** — «may be different from the supplier» ([NKBA-10](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf), [NKBA-11](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-11-Mechanical-Electrical-Plumbing-Plan-1.pdf)), а к ним добавляется общее примечание «`N.I.C.` — not in contract, `B.O.` — by others» ([NKBA-8](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf)). У нас смета собирается из тех же данных, что чертежи, — значит две графы бесплатно разводят «что в смете подрядчика, а что покупает заказчик сам». Это самый частый бытовой конфликт на ремонте и самая дешёвая правка из списка.

### P8. Kelvin / CRI и высота установки — обязательные графы ведомости светильников

**Что:** добавить в ведомость осветительного оборудования графы **цветовая температура (К)** и **индекс цветопередачи (CRI/Ra)**, а высоту установки — в примечание к строке (формат «установить на отм. +2,300»).
**Почему:** это обязательные графы luminaire schedule ([NKBA-11](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-11-Mechanical-Electrical-Plumbing-Plan-1.pdf)), которых нет в порядке записи по ГОСТ 21.608 (там мощность, число ламп, высота). Для интерьера разнотемпературный свет в одной комнате — визуальный брак, который клиент увидит сразу, а исправление означает перезакуп всех светильников. Графа стоит один столбец таблицы.

### Мелочи, которые стоит внести попутно
- **Список сокращений** на первом листе + правило «сомневаешься в сокращении — пиши словом» ([UDS-5](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds5.pdf)).
- **Не заливать стены** на инженерных листах (розетки, ВК, ОВ), чтобы символы читались; примыкающие стены обрывать ([NKBA-11](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-11-Mechanical-Electrical-Plumbing-Plan-1.pdf)).
- **Демонтажный план не размеряют** — только объёмы и пометки ([NKBA-4, табл. 4.8](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)); у нас на `demolition` цепочки лишние.
- **Wall blocking — закладные в перегородке** под навесные шкафы, ТВ, поручни — на план монтажа ([NKBA-9](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-9-Demolition-and-Construction-Plan-1.pdf)). У нас этого нет, а забытая закладная = вскрытая стена.
- **Точка начала раскладки (datum start point)** отдельным символом, а не только красной привязкой ([NKBA-10](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf)).
- **Тип затирки** и степень подготовки под покраску — в примечания к листу отделки ([NKBA-10](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-10-Finish-Plan-Finish-Schedules-1.pdf)).
- **Mock-up / список листов как первый проход движка** ([UDS-4](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds4.pdf)) — считать состав и номера листов до отрисовки, тогда «лист N из M» в штампе и индекс листов берутся из одного источника.
- **Ведомость перегородок** с графой ссылки на узел ([AIA/NCS](https://catalogimages.wiley.com/images/db/pdf/9780471703785.excerpt.pdf)) — у нас марки Мn есть, ссылки на узел нет.

---

## 6. Что не применимо и почему

| Западная практика | Почему не переносим |
|---|---|
| **Обозначение листа `A-101` / `ID-1.04` вместо номера листа** | ГОСТ Р 21.101 требует основную надпись со **сквозным номером листа основного комплекта и общим числом листов**, а марка комплекта у нас одна — **АИ**. Код типа изображения можно ввести как внутренний адрес для перекрёстных ссылок и имён файлов, но **штамп обязан нести сквозной номер** (`docs/cad-canon.md` §2, §4). Иначе нормоконтроль отклонит альбом. |
| **Деление на дисциплины `I / Q / F / P / M / E / T` отдельными подкомплектами** ([UDS-1](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds1.pdf)) | У нас один основной комплект АИ на квартиру; отдельные марки (ЭО, ВК, ОВ) — это уже другие проектировщики с допуском СРО, и мы их работу не выпускаем (`docs/cad-canon.md` §6). Порядок подкомплектов брать не нужно; полезен только сам принцип «сначала общие данные, в конце справочные листы». |
| **Imperial-масштабы `1/4″ = 1′-0″`, `1/2″ = 1′-0″`** | Ряд масштабов задан ГОСТ 21.501 табл. 1 (1:20, 1:25, 1:40, 1:50, 1:100; узлы 1:5–1:20), и аудит его проверяет. Дюймовые записи нужны **только для чтения западных примеров** — таблица соответствий в §2.6. |
| **Форматы ANSI B (11×17″) и ANSI D (34×44″)** ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf), [UDS-2](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds2.pdf)) | У нас A3 альбомный на весь альбом с полем подшивки 20 мм. Разнокалиберных холстов канон не допускает. |
| **`stud-to-stud` / `face of stud` как основная база размеров** ([EVstudio](https://evstudio.com/dimensioning-101/)) | Метод рождён каркасным домостроением США (стойка 38×89 мм, шаг 406 мм). У нас несущее и ограждающее — кирпич, блок, пазогребень, монолит; бригада разбивает от готовой оштукатуренной поверхности. Переносим не базу, а **требование её объявить** (P1). |
| **Fire rating labels, smoke barrier lines, STC-рейтинги перегородок** ([UDS-6](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds6.pdf), [NKBA-9](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-9-Demolition-and-Construction-Plan-1.pdf)) | Пределы огнестойкости внутриквартирных перегородок в РФ не нормируются как в US IBC, а расчёт огнестойкости и звукоизоляции — расчёт по нормам, который мы принципиально не делаем (`docs/cad-canon.md` §6). Максимум — тип перегородки и её толщина. |
| **Спринклеры и суспендированный ceiling grid (потолок «Армстронг» с раскладкой плит)** | В жилье РФ спринклеров нет (кроме отдельных апартамент-комплексов), модульных потолков в квартирах практически нет. Из состава RCP эти пункты выпадают, остальные (люки, диффузоры, датчики, вытяжка) — обязательны. |
| **`Reference keynotes` с привязкой к MasterFormat** ([UDS-7](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_uds7.pdf)) | MasterFormat в РФ не используется; аналога классификатора разделов работ, к которому привязывают примечания, у нас в альбоме нет. Механику кодированных примечаний **берём** (номер на полке + расшифровка на листе — это и есть ГОСТ 2.316 + ГОСТ 21.110), а привязку к MasterFormat заменяем ссылкой на позицию нашей спецификации/сметы. |
| **`Hardware set HW-1` со ссылкой на раздел спецификации Div 08** ([CDF](https://www.cdfdistributors.com/blog/post/interpreting-door-specifications-guide)) | Сама идея «комплект фурнитуры кодом» переносится (P6), но нумерация по разделам MasterFormat — нет; код расшифровывается в спецификации по ГОСТ 21.110. |
| **Юридические general notes (indemnification, гарантия 1 год, ответственность подрядчика перед клиентом, AHJ-разрешения)** ([NKBA-8](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf)) | В РФ эти условия живут в договоре подряда, а не в альбоме; чертёж с ними не приобретает силы. Переносим только **технические** пункты того же списка: проверить размеры на месте и сообщить о расхождениях до начала работ; изменения — только с согласия автора; `N.I.C. / by others`; база отметок AFF; «все чертежи взаимодополняющие». |
| **`Millwork / casework shop drawings` — производственные чертежи мебели** ([The Millwork Studio](https://www.themillworkstudio.com/post/ultimate-guide-to-millwork-shop-drawings), [McLine](https://mclinestudios.com/components-of-casework-shop-drawings/)) | Осознанно вне нашего объёма: канон прямо требует примечание «Схема мебели не является технической документацией для производства мебели» (`docs/cad-canon.md` §4, `elevation`). Раскрой, присадка и кромка — работа мебельного производства по своим шаблонам; выпуская их, мы берём на себя чужую ответственность. Переносим только **разрезы встроенных конструкций** (короб, ниша, подиум) — они у нас уже есть как `node`. |
| **`Site layout plan / key plan` с юридическим описанием участка и зонированием** ([NKBA-8](https://elearning.nkba.org/wp-content/uploads/2023/12/Chapter-8-The-Title-Sheet-and-Site-Layout-Drawing-1.pdf)) | Для квартиры бессмысленно. Аналог, который имеет смысл, — **ключевая схема этажа** для многоуровневых объектов и `match line + key plan`, если план не влезает на A3. |
| **`Abbreviated sheet identification` (`A-1` без цифры типа)** ([AIA/NCS](https://catalogimages.wiley.com/images/db/pdf/9780471703785.excerpt.pdf)) | Сам источник её не рекомендует («we see no good reason to use… and hope to see it removed»). Если вводим коды — только полные. |
| **Матрица room finish schedule со сторонами света N/E/S/W** | Переносим **структуру**, но не привязку к сторонам света: мы уже маркируем стены A/B/C/D = верх/право/низ/лево (`examples/demo-brief.json`), и это устойчивее, чем север/юг, который для внутренней перегородки бессмыслен. Указатель севера при этом стоит добавить на планы отдельно ([NKBA-4](https://elearning.nkba.org/wp-content/uploads/2023/10/Chapter-4-Universal-Presentation-Standards.pdf)). |
| **`FF&E schedule` с order status, lead time, sidemark, COM/COL** ([Procurist](https://procurist.io/resources/ffe-schedules)) | Это закупочный трекер, а не лист альбома: он живёт и меняется еженедельно, а альбом воспроизводим по дате выпуска (`--date`). Логистику держим вне чертежей; в спецификацию берём только **поставка/монтаж** (P7). |

---

## 7. Итоговая карта соответствий терминов

| English | Русский эквивалент (наш) | Наш `data-sheet` / элемент |
|---|---|---|
| as-built / existing conditions plan | обмерный план | `obmer` |
| demolition plan | план демонтажа | `demolition` |
| construction / partition plan | план монтажа конструкций | `montage` |
| floor plan (anchor plan) | планировочное решение | `furniture` |
| furniture plan | план расстановки мебели | `furniture` |
| finish plan | план отделки | `wall-finish`, `floors` |
| reflected ceiling plan (RCP) | план потолка в зеркальной проекции | `ceiling` (+ нужен лист-координатор) |
| lighting & switching plan | план освещения и групп управления | `lighting`, `switches`, `switch-scheme` |
| power / data plan | план розеток и слаботочки | `sockets` |
| interior elevation | развёртка стены | `elevation` |
| section | разрез | `section` |
| detail | узел | `node` |
| large-scale view | фрагмент плана | покомнатные `*-room` |
| schedule | ведомость / спецификация | `legend`, таблицы |
| room finish schedule | ведомость отделки помещений | ведомость отделки |
| door schedule | ведомость проёмов | ведомость проёмов на `doors` |
| luminaire schedule | ведомость осветительного оборудования | ведомость на `lighting` |
| FF&E schedule | спецификация мебели и оборудования | спецификация позиций |
| sheet index | ведомость рабочих чертежей | общие данные |
| title block | основная надпись | `stamp` |
| keynote / keynote legend | кодированное примечание / расшифровка кодов | `notes` + `leader` |
| legend | условные обозначения | `legend` |
| tag | марка, тег позиции | марки, номера позиций |
| room tag | номер помещения | `room` |
| finish tag | марка отделки | марка в кружке Ø6–8 мм |
| elevation marker | маркер развёртки | — (внедрить, P3) |
| section marker | маркер разреза (1—1, 2—2) | есть на `obmer` |
| detail callout | маркер узла | есть |
| match line / key plan | линия стыковки / ключевая схема | — |
| north arrow | указатель севера | — |
| dimension string | размерная цепочка | `chain` |
| witness / extension line | выносная линия | — |
| tick mark | засечка | есть (2–4 мм, 45°) |
| centerline | ось | `tie` по оси |
| AFF (above finished floor) | от уровня чистого пола (отм. 0,000) | `level` |
| datum start point | точка начала раскладки | красная привязка первого ряда |
| wall blocking | закладная в перегородке | — (внедрить) |
| poché | заливка сечения стены | штриховка/заливка |
| soffit / bulkhead | короб, подшивной объём | короб на `ceiling` |
| access panel | ревизионный люк | есть на `ceiling` |
| casework / millwork | встроенная мебель, погонаж | вне объёма (см. §6) |
| hardware set | комплект фурнитуры | — (внедрить, P6) |
| head / jamb / sill | верх / боковина / порог проёма | — (внедрить, P6) |
| supplied by / installed by | поставка / монтаж | — (внедрить, P7) |
| N.I.C. (not in contract) / B.O. (by others) | не входит в подряд / силами заказчика | — (внедрить) |
| mock-up / cartoon set | макет альбома, список листов | манифест листов движка |
| revision cloud | облако изменения | — |
