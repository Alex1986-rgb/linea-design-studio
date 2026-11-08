// LINEA · бриф, необязательный шаг «Жизнь в квартире» (08.11.2026)
// Наводящие вопросы, о которых клиент сам не вспомнит, пока не начнётся ремонт: ТВ и звук, техника кухни, кондиционеры и наружные
// блоки, лоджия, хранение, стирка, умный дом, безопасность. Ответы — чипы; у каждого вопроса есть «Не знаю — решит дизайнер»,
// у каждой группы — строка «Зачем спрашиваем». Схема ответов в brief.json (ключ `life`) — docs/brief-life-schema.md.
// Публичный интерфейс: window.LineaLife { mount(el, onChange), out(skipped), restore(obj), answered(), lines(), answers(), total }
(function () {
  'use strict';
  const UNK = 'unknown', NONE = 'none';
  const UNK_LABEL = 'Не знаю — решит дизайнер';
  const o = (...a) => a.map(x => (Array.isArray(x) ? x : [x, x]));
  // q: k — ключ, l — вопрос, s — короткое имя для выжимки, m:1 — можно выбрать несколько, o — [ключ, подпись]
  const G = [
    { k: 'household', t: 'Кто живёт и как', why: 'От состава семьи зависят спальные места, обеденная группа, хранение и нагрузка на санузлы и щит — это закладывается в планировку.', q: [
      { k: 'people', l: 'Сколько человек живёт постоянно', s: 'живут', o: o(['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5plus', '5 и больше']) },
      { k: 'kids', l: 'Дети (можно несколько)', s: 'дети', m: 1, o: o([NONE, 'Нет'], ['baby', 'До 3 лет'], ['preschool', '3–7 лет'], ['school', 'Школьник'], ['teen', 'Подросток'], ['planned', 'Ждём ребёнка']) },
      { k: 'pets', l: 'Животные', s: 'животные', m: 1, o: o([NONE, 'Нет'], ['cat', 'Кошка'], ['dog_small', 'Собака малая'], ['dog_big', 'Собака крупная'], ['other', 'Птицы, грызуны, рыбки']) },
      { k: 'allergy', l: 'Аллергия или астма в семье', s: 'аллергия', o: o(['yes', 'Да'], ['no', 'Нет']) },
      { k: 'guests', l: 'Гости с ночёвкой', s: 'гости с ночёвкой', o: o(['never', 'Почти не бывает'], ['sometimes', 'Иногда'], ['often', 'Часто — нужно спальное место']) },
      { k: 'rhythm', l: 'Режим дня', s: 'режим дня', m: 1, o: o(['early', 'Рано встаём'], ['late', 'Поздно ложимся'], ['shift', 'Сменный график'], ['daysleep', 'Кто-то спит днём'], ['home', 'Днём кто-то дома']) }
    ] },
    { k: 'kitchen', t: 'Кухня и техника', why: 'Мощные приборы и ниши под технику закладываются в щит, розетки и мебель до штукатурки; встроенную технику после монтажа кухни не переставить.', q: [
      { k: 'hob', l: 'Варочная панель', s: 'варочная', o: o(['gas', 'Газ'], ['induction', 'Индукция'], ['electric', 'Электрическая'], ['no_gas_now', 'Газа в квартире нет']) },
      { k: 'oven', l: 'Духовой шкаф', s: 'духовка', o: o([NONE, 'Не нужен'], ['under', 'Под варочной'], ['column', 'В колонне на уровне глаз'], ['two', 'Два (с пароваркой)']) },
      { k: 'micro', l: 'СВЧ-печь', s: 'СВЧ', o: o([NONE, 'Не нужна'], ['built', 'Встроенная'], ['table', 'Отдельная на столешнице']) },
      { k: 'dish', l: 'Посудомоечная машина', s: 'посудомойка', o: o([NONE, 'Не нужна'], ['45', 'Узкая 45 см'], ['60', 'Полноразмерная 60 см']) },
      { k: 'fridge', l: 'Холодильник', s: 'холодильник', o: o(['free', 'Отдельностоящий'], ['built', 'Встроенный'], ['sbs', 'Side-by-side'], ['small', 'Небольшой под столешницу']) },
      { k: 'coffee', l: 'Кофемашина', s: 'кофемашина', o: o([NONE, 'Нет'], ['built', 'Встроенная в колонну'], ['table', 'Отдельная на столешнице']) },
      { k: 'sink', l: 'Мойка и вода', s: 'мойка', m: 1, o: o(['filter', 'Фильтр питьевой воды'], ['grinder', 'Измельчитель отходов'], ['boiler', 'Кран с кипятком'], ['double', 'Две чаши']) },
      { k: 'hood', l: 'Вытяжка', s: 'вытяжка', o: o(['dome', 'Купольная'], ['built', 'Встроенная в шкаф'], ['ceiling', 'Потолочная'], ['hob', 'Встроена в варочную']) },
      { k: 'island', l: 'Остров или стол на кухне', s: 'остров', o: o([NONE, 'Нет'], ['island', 'Остров'], ['peninsula', 'Полуостров'], ['bar', 'Барная стойка']) },
      { k: 'seats', l: 'Обеденный стол — на сколько мест', s: 'обеденный стол, мест', o: o(['2', '2'], ['4', '4'], ['6', '6'], ['8plus', '8 и больше']) }
    ] },
    { k: 'tv', t: 'ТВ и звук', why: 'Розетки, кабель и закладные под ТВ, колонки и проектор закладываются до штукатурки — иначе потом штробы или провода по стене.', q: [
      { k: 'rooms', l: 'В каких комнатах нужен телевизор', s: 'ТВ в комнатах', m: 1, o: o([NONE, 'Телевизор не нужен'], ['living', 'Гостиная'], ['bedroom', 'Спальня'], ['kids', 'Детская'], ['kitchen', 'Кухня'], ['cabinet', 'Кабинет']) },
      { k: 'size', l: 'Диагональ в гостиной', s: 'диагональ', o: o(['up43', 'До 43″'], ['50_55', '50–55″'], ['65', '65″'], ['75plus', '75″ и больше']) },
      { k: 'mount', l: 'Как стоит ТВ', s: 'установка ТВ', o: o(['wall', 'На стене'], ['stand', 'На тумбе или консоли'], ['niche', 'В нише, ТВ-панель'], ['hidden', 'Скрытый: за зеркалом или в подъёмнике']) },
      { k: 'sound', l: 'Звук', s: 'звук', m: 1, o: o(['tv', 'Хватит динамиков ТВ'], ['soundbar', 'Саундбар'], ['inwall', 'Встроенные колонки в потолке или стене'], ['cinema', 'Домашний кинотеатр 5.1 и выше'], ['hifi', 'Стерео, винил'], ['multiroom', 'Музыка по комнатам']) },
      { k: 'projector', l: 'Проектор и экран', s: 'проектор', o: o([NONE, 'Нет'], ['living', 'В гостиной'], ['bedroom', 'В спальне']) },
      { k: 'gaming', l: 'Игры', s: 'игры', m: 1, o: o([NONE, 'Нет'], ['console', 'Приставка'], ['pc', 'Игровой компьютер']) }
    ] },
    { k: 'climate', t: 'Климат: кондиционеры, тёплый пол, воздух', why: 'Трассы кондиционеров, место наружных блоков, тёплый пол и вентиляция решаются до отделки; наружный блок на фасаде обычно требует согласия дома.', q: [
      { k: 'ac', l: 'Кондиционер — в каких комнатах', s: 'кондиционеры', m: 1, o: o([NONE, 'Не нужен'], ['living', 'Гостиная'], ['bedroom', 'Спальня'], ['kids', 'Детская'], ['cabinet', 'Кабинет'], ['kitchen', 'Кухня']) },
      { k: 'acType', l: 'Тип', s: 'тип кондиционера', o: o(['split', 'Настенные сплиты'], ['multi', 'Мульти-сплит'], ['duct', 'Канальный, скрытый в потолке']) },
      { k: 'acOutdoor', l: 'Куда наружные блоки', s: 'наружные блоки', o: o(['facade', 'На фасад'], ['loggia', 'На лоджию или балкон'], ['niche', 'В нишу или короб'], ['exists', 'Место уже есть']) },
      { k: 'floorHeat', l: 'Тёплый пол', s: 'тёплый пол', m: 1, o: o([NONE, 'Не нужен'], ['bath', 'Санузлы'], ['hall', 'Прихожая'], ['kitchen', 'Кухня'], ['bedroom', 'Спальни'], ['all', 'Везде']) },
      { k: 'floorKind', l: 'Тёплый пол — какой', s: 'вид тёплого пола', o: o(['electric', 'Электрический'], ['water', 'Водяной (нужно согласование)']) },
      { k: 'air', l: 'Воздух', s: 'воздух', m: 1, o: o(['humidifier', 'Увлажнитель'], ['breezer', 'Бризер или приточка'], ['purifier', 'Очиститель'], ['dehumidifier', 'Осушитель'], ['recup', 'Рекуператор']) },
      { k: 'radiators', l: 'Радиаторы', s: 'радиаторы', o: o(['keep', 'Оставить на месте'], ['replace', 'Заменить на дизайнерские'], ['move', 'Перенести (согласуем)'], ['screen', 'Закрыть декоративным экраном']) }
    ] },
    { k: 'loggia', t: 'Балкон и лоджия', why: 'Объединение лоджии с комнатой и вынос на неё отопления по ЖК РФ и Постановлению № 170 обычно не согласуют, а утепление и остекление решаются отдельно — проверим по вашему плану.', q: [
      { k: 'has', l: 'Что есть', s: 'есть', o: o(['balcony', 'Балкон'], ['loggia', 'Лоджия'], ['two', 'Несколько'], [NONE, 'Нет']) },
      { k: 'glass', l: 'Остекление', s: 'остекление', o: o(['cold', 'Холодное'], ['warm', 'Тёплое'], ['none', 'Не остеклена']) },
      { k: 'plan', l: 'Что с ней делать', s: 'планы на лоджию', o: o(['asis', 'Оставить как есть'], ['insulate', 'Утеплить, не объединяя с комнатой'], ['join', 'Хочу присоединить к комнате — проверьте, возможно ли']) },
      { k: 'use', l: 'Для чего', s: 'назначение лоджии', m: 1, o: o(['cabinet', 'Кабинет, рабочее место'], ['rest', 'Зона отдыха'], ['storage', 'Хранение'], ['drying', 'Сушка белья'], ['garden', 'Зимний сад'], ['sport', 'Спорт']) },
      { k: 'power', l: 'Свет и розетки на лоджии', s: 'свет и розетки', o: o(['yes', 'Нужны'], ['no', 'Не нужны']) }
    ] },
    { k: 'storage', t: 'Хранение', why: 'Места хранения и розетка для док-станции робота закладываются в планировку и электрику; после ремонта их негде взять, не отняв площадь у комнат.', q: [
      { k: 'wardrobe', l: 'Одежда', s: 'гардероб', o: o(['room', 'Гардеробная комната'], ['built', 'Встроенные шкафы'], ['bedroom', 'Шкаф в спальне'], ['hall', 'Больше всего — в прихожей']) },
      { k: 'pantry', l: 'Кладовая', s: 'кладовая', o: o(['need', 'Нужна'], ['nope', 'Не нужна'], ['exists', 'Уже есть']) },
      { k: 'bulky', l: 'Громоздкое', s: 'громоздкое', m: 1, o: o(['bikes', 'Велосипеды'], ['stroller', 'Коляска'], ['ski', 'Лыжи, сноуборд'], ['scooter', 'Самокаты'], ['luggage', 'Чемоданы'], ['tools', 'Инструмент']) },
      { k: 'seasonal', l: 'Сезонные вещи', s: 'сезонное', o: o(['little', 'Мало'], ['normal', 'Обычно'], ['lots', 'Много']) },
      { k: 'shoes', l: 'Обувь', s: 'обувь', o: o(['10', 'До 10 пар'], ['20', '10–20 пар'], ['20plus', 'Больше 20 пар']) },
      { k: 'vacuum', l: 'Пылесосы', s: 'пылесосы', m: 1, o: o(['robot', 'Робот — нужен док'], ['upright', 'Вертикальный'], ['classic', 'Обычный'], ['central', 'Встроенная система']) },
      { k: 'ironing', l: 'Гладильная доска', s: 'глажка', o: o(['built', 'Встроенная в шкаф'], ['stand', 'Отдельное место'], ['nope', 'Не нужна']) }
    ] },
    { k: 'bath', t: 'Санузлы и стирка', why: 'Инсталляция, стиральная и сушильная машины, гигиенический душ и полотенцесушитель определяют выводы воды, канализацию и розетки — всё это закладывается до плитки.', q: [
      { k: 'kind', l: 'Ванна или душ', s: 'ванна/душ', o: o(['bath', 'Ванна'], ['shower', 'Только душ'], ['both', 'И ванна, и душ']) },
      { k: 'wc', l: 'Унитаз', s: 'унитаз', o: o(['install', 'Подвесной с инсталляцией'], ['floor', 'Напольный']) },
      { k: 'hygiene', l: 'Гигиена', s: 'гигиена', m: 1, o: o([NONE, 'Не нужно'], ['bidet', 'Биде'], ['shower', 'Гигиенический душ'], ['smart', 'Унитаз-биде']) },
      { k: 'washer', l: 'Стирка', s: 'стирка', o: o(['washer', 'Стиральная машина'], ['tower', 'Стиральная и сушильная колонной'], ['combo', '2 в 1'], ['laundry', 'Отдельная прачечная']) },
      { k: 'washerPlace', l: 'Где стоят машины', s: 'место машин', o: o(['bath', 'В санузле'], ['kitchen', 'На кухне'], ['hall', 'В нише коридора'], ['pantry', 'В кладовой']) },
      { k: 'drying', l: 'Где сушить бельё', s: 'сушка белья', o: o(['dryer', 'Сушильная машина'], ['loggia', 'На лоджии'], ['ceiling', 'Потолочная сушилка'], ['bath', 'В ванной']) },
      { k: 'towel', l: 'Полотенцесушитель', s: 'полотенцесушитель', o: o(['water', 'Водяной'], ['electric', 'Электрический'], ['nope', 'Не нужен']) }
    ] },
    { k: 'work', t: 'Работа из дома', why: 'Рабочее место и созвоны определяют розетки, интернет-кабель, свет и звукоизоляцию стен — их делают до отделки.', q: [
      { k: 'place', l: 'Где работаете', s: 'рабочее место', o: o([NONE, 'Не работаю из дома'], ['room', 'Отдельный кабинет'], ['corner', 'Уголок в комнате'], ['loggia', 'На лоджии']) },
      { k: 'seats', l: 'Сколько рабочих мест', s: 'рабочих мест', o: o(['1', '1'], ['2', '2'], ['3plus', '3 и больше']) },
      { k: 'calls', l: 'Созвоны', s: 'созвоны', o: o(['rare', 'Редко'], ['sometimes', 'Иногда'], ['daily', 'Каждый день']) },
      { k: 'gear', l: 'Оборудование', s: 'оборудование', m: 1, o: o(['monitors', 'Два монитора и больше'], ['printer', 'Принтер или МФУ'], ['nas', 'Сервер, NAS'], ['studio', 'Студийный свет, микрофон']) },
      { k: 'sound', l: 'Нужна звукоизоляция', s: 'звукоизоляция', m: 1, o: o([NONE, 'Не нужна'], ['cabinet', 'Кабинет'], ['bedroom', 'Спальня'], ['kids', 'Детская'], ['neighbors', 'Стена с соседями']) }
    ] },
    { k: 'smart', t: 'Свет и умный дом', why: 'Датчики, электроприводы штор и умные выключатели требуют кабеля и подрозетников до штукатурки; задним числом это открытая проводка.', q: [
      { k: 'control', l: 'Управление', s: 'управление', o: o(['classic', 'Обычные выключатели'], ['smart', 'Умный дом: приложение, голос'], ['mixed', 'Выключатели и умные сценарии']) },
      { k: 'scenes', l: 'Сценарии света', s: 'сценарии света', m: 1, o: o(['evening', 'Вечерний'], ['movie', 'Кино'], ['night', 'Ночной путь в санузел'], ['zones', 'Подсветка зон: ниши, шкафы']) },
      { k: 'sensors', l: 'Датчики', s: 'датчики', m: 1, o: o(['motion', 'Движения'], ['climate', 'Температуры и влажности'], ['smoke', 'Дыма'], ['door', 'Открытия дверей']) },
      { k: 'curtains', l: 'Шторы', s: 'шторы', o: o(['motor', 'Электропривод'], ['manual', 'Ручные'], ['roller', 'Рулонные']) },
      { k: 'platform', l: 'Платформа умного дома', s: 'платформа', o: o(['yandex', 'Яндекс (Алиса)'], ['apple', 'Apple Home'], ['google', 'Google Home'], ['none', 'Без платформы']) }
    ] },
    { k: 'security', t: 'Безопасность', why: 'Краны с датчиками протечки, видеодомофон и сигнализация требуют питания и кабеля заранее; краны и датчики ставят на этапе разводки воды.', q: [
      { k: 'leak', l: 'Защита от протечек', s: 'протечки', o: o(['yes', 'Датчики с автоперекрытием воды'], ['no', 'Не нужна']) },
      { k: 'intercom', l: 'Домофон', s: 'домофон', o: o(['classic', 'Обычный'], ['video', 'Видеодомофон'], ['phone', 'Вызов на телефон']) },
      { k: 'alarm', l: 'Сигнализация', s: 'сигнализация', o: o(['yes', 'Нужна'], ['no', 'Не нужна']) },
      { k: 'cams', l: 'Видеонаблюдение', s: 'видеонаблюдение', o: o(['entry', 'Камера у входа'], ['inside', 'Внутри квартиры'], ['no', 'Не нужно']) },
      { k: 'safe', l: 'Сейф', s: 'сейф', o: o(['built', 'Встроенный в шкаф'], ['floor', 'Отдельный'], ['no', 'Не нужен']) }
    ] },
    { k: 'special', t: 'Особые вещи', why: 'Пианино, аквариум, тренажёр и большая библиотека — это нагрузка на перекрытие, вода, розетки и звук; их учитываем в расстановке и в конструкции пола.', q: [
      { k: 'items', l: 'Что у вас есть или будет', s: 'особые вещи', m: 1, o: o([NONE, 'Ничего особого'], ['piano', 'Пианино, синтезатор'], ['aquarium', 'Аквариум'], ['library', 'Большая библиотека'], ['collection', 'Коллекция или винный шкаф'], ['gym', 'Тренажёр или спортуголок'], ['atelier', 'Мастерская, швейная, мольберт'], ['stream', 'Стрим-студия']) },
      { k: 'heavy', l: 'Есть тяжёлое (аквариум больше 200 л, сейф, штанга)', s: 'тяжёлое', o: o(['yes', 'Да'], ['no', 'Нет']) }
    ] }
  ];
  let total = 0;
  G.forEach(g => { total += g.q.length; g.q.forEach(q => { q.o.push([UNK, UNK_LABEL]); }); });

  let S = {};                 // { группа: { вопрос: 'ключ' | ['ключ',…], note: '' } }
  let root = null, onChange = () => {};
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const arr = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
  const lab = (q, key) => { const x = q.o.find(p => p[0] === key); return x ? x[1] : key; };
  const has = (g, q) => arr((S[g] || {})[q]).length > 0;
  const isUnk = (g, q) => arr((S[g] || {})[q]).includes(UNK);
  const countG = g => G.find(x => x.k === g).q.filter(q => has(g, q.k)).length + ((S[g] || {}).note ? 1 : 0);
  function answered() { return G.reduce((n, g) => n + g.q.filter(q => has(g.k, q.k)).length, 0) + G.filter(g => (S[g.k] || {}).note).length; }

  function toggle(g, qk, key) {
    const q = G.find(x => x.k === g).q.find(x => x.k === qk);
    const grp = S[g] = S[g] || {};
    let cur = arr(grp[qk]);
    if (q.m) {
      if (cur.includes(key)) cur = cur.filter(x => x !== key);
      else if (key === UNK || key === NONE) cur = [key];
      else cur = cur.filter(x => x !== UNK && x !== NONE).concat(key);
      if (cur.length) grp[qk] = cur; else delete grp[qk];
    } else if (cur[0] === key) delete grp[qk]; else grp[qk] = key;
  }

  function paint() {
    if (!root) return;
    root.querySelectorAll('.lc').forEach(b => {
      const on = arr((S[b.dataset.g] || {})[b.dataset.q]).includes(b.dataset.o);
      b.setAttribute('aria-pressed', String(on));
    });
    G.forEach(g => {
      const n = countG(g.k), c = root.querySelector(`[data-cnt="${g.k}"]`);
      if (c) { c.textContent = n ? `${n} из ${g.q.length + 1}` : ''; c.setAttribute('aria-label', n ? `Отвечено ${n}` : ''); }
    });
    const t = root.querySelector('[data-total]');
    if (t) t.textContent = answered() ? `Отвечено: ${answered()}` : 'Пока без ответов';
  }

  function mount(el, cb) {
    root = el; onChange = cb || onChange;
    el.innerHTML = G.map((g, gi) => `<details class="lg"${gi === 0 ? ' open' : ''}><summary><span class="lg-t">${esc(g.t)}</span><span class="lg-n" data-cnt="${g.k}"></span></summary>`
      + `<p class="why"><b>Зачем спрашиваем.</b> ${esc(g.why)}</p>`
      + g.q.map(q => `<div class="lq" role="group" aria-labelledby="lq-${g.k}-${q.k}"><div class="ql" id="lq-${g.k}-${q.k}">${esc(q.l)}</div><div class="lcs">`
        + q.o.map(p => `<button type="button" class="lc${p[0] === UNK ? ' unk' : ''}" data-g="${g.k}" data-q="${q.k}" data-o="${esc(p[0])}" aria-pressed="false">${esc(p[1])}</button>`).join('')
        + '</div></div>').join('')
      + `<div class="lq"><label for="ln-${g.k}">Своими словами: что ещё важно</label><input type="text" id="ln-${g.k}" data-note="${g.k}" maxlength="300" autocomplete="off"></div></details>`).join('')
      + '<p class="lg-total" data-total aria-live="polite"></p>';
    el.addEventListener('click', e => {
      const b = e.target.closest('.lc'); if (!b) return;
      toggle(b.dataset.g, b.dataset.q, b.dataset.o); paint(); onChange();
    });
    el.addEventListener('input', e => {
      const n = e.target.dataset && e.target.dataset.note; if (!n) return;
      const grp = S[n] = S[n] || {};
      if (e.target.value.trim()) grp.note = e.target.value.trim().slice(0, 300); else delete grp.note;
      paint(); onChange();
    });
    restoreInputs(); paint();
  }
  function restoreInputs() { if (root) root.querySelectorAll('[data-note]').forEach(i => { i.value = (S[i.dataset.note] || {}).note || ''; }); }

  // выжимка для brief.txt и для текста брифа: «Группа: вопрос — ответ; …». «Не знаю» собирается отдельной строкой
  function lines() {
    const L = [], unk = [];
    for (const g of G) {
      const part = [];
      for (const q of g.q) {
        const v = arr((S[g.k] || {})[q.k]); if (!v.length) continue;
        if (v.includes(UNK)) { unk.push(q.s); continue; }
        part.push(`${q.s} — ${v.map(x => lab(q, x).replace(/[.]$/, '')).join(', ')}`);
      }
      if ((S[g.k] || {}).note) part.push('ещё: ' + S[g.k].note);
      if (part.length) L.push(`${g.t}: ${part.join('; ')}`);
    }
    if (unk.length) L.push('Не знаю — решит дизайнер: ' + unk.join(', '));
    return L;
  }

  // структурный вывод для brief.json → life (схема — docs/brief-life-schema.md)
  function out(skipped) {
    const r = { version: 1, skipped: !!skipped && !answered(), answered: answered(), unknown: [] };
    for (const g of G) {
      const grp = {};
      for (const q of g.q) {
        const v = (S[g.k] || {})[q.k]; if (v == null || (Array.isArray(v) && !v.length)) continue;
        grp[q.k] = Array.isArray(v) ? v.slice() : v;
        if (arr(v).includes(UNK)) r.unknown.push(`${g.k}.${q.k}`);
      }
      if ((S[g.k] || {}).note) grp.note = S[g.k].note;
      if (Object.keys(grp).length) r[g.k] = grp;
    }
    r.text = lines();
    return r;
  }

  function restore(obj) {
    S = {};
    if (obj && typeof obj === 'object') {
      for (const g of G) {
        const src = obj[g.k]; if (!src || typeof src !== 'object') continue;
        const grp = {};
        for (const q of g.q) { const v = src[q.k]; if (v == null) continue; const a = arr(v).filter(x => q.o.some(p => p[0] === x)); if (a.length) grp[q.k] = q.m ? a : a[0]; }
        if (typeof src.note === 'string' && src.note) grp.note = src.note;
        if (Object.keys(grp).length) S[g.k] = grp;
      }
    }
    restoreInputs(); paint();
  }

  // готовые тексты для прежних полей answers.* (их читает tools/site-brief.js): заполняются, только если клиент не написал сам
  function answers() {
    const pick = (g, k) => { const v = arr((S[g] || {})[k]).filter(x => x !== UNK); return v; };
    const L = (g, k) => { const q = G.find(x => x.k === g).q.find(x => x.k === k); return pick(g, k).map(x => lab(q, x).toLowerCase()); };
    const R = {};
    const people = L('household', 'people')[0], kids = L('household', 'kids').filter(x => x !== 'нет');
    const hh = [people && (people === '5 и больше' ? '5 человек и больше' : people + ' ' + (people === '1' ? 'человек' : +people < 5 ? 'человека' : 'человек')), kids.length && 'дети: ' + kids.join(', ')].filter(Boolean);
    if (hh.length) R.household = hh.join(', ');
    const pets = L('household', 'pets').filter(x => x !== 'нет'); if (pets.length) R.pets = pets.join(', ');
    const wp = L('work', 'place')[0];
    if (wp && wp !== 'не работаю из дома') R.wfh = ['работа из дома: ' + wp, L('work', 'calls')[0] && 'созвоны: ' + L('work', 'calls')[0]].filter(Boolean).join(', ');
    const st = [...L('storage', 'wardrobe'), ...L('storage', 'pantry'), ...L('storage', 'bulky')]; if (st.length) R.storage = st.join(', ');
    const ki = [pick('kitchen', 'island')[0] === 'island' && 'остров', pick('kitchen', 'island')[0] === 'peninsula' && 'полуостров', pick('kitchen', 'island')[0] === 'bar' && 'барная стойка',
      L('kitchen', 'hob')[0] && 'варочная: ' + L('kitchen', 'hob')[0], L('kitchen', 'fridge')[0] && 'холодильник: ' + L('kitchen', 'fridge')[0]].filter(Boolean);
    if (ki.length) R.kitchen = ki.join(', ');
    if (pick('special', 'items').includes('gym')) R.sport = 'тренажёр или спортуголок';
    return R;
  }

  window.LineaLife = { mount, out, restore, answered, lines, answers, get total() { return total; }, GROUPS: G };
})();
