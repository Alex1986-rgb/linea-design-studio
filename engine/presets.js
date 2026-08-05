'use strict';
// ============================================================
// LINEA · студия дизайна интерьера — пресеты стилей и тарифов
// ============================================================

const STYLES = {
  japandi: {
    key: 'japandi', title: 'Джапанди',
    palette: ['#EDE7DC', '#C8A97A', '#8A8D80', '#3E3A34', '#A67B5B'],
    wall:  { color: '#EDE7DC', finish: 'краска Little Greene «Slaked Lime», шёлково-матовая' },
    accent:{ color: '#A67B5B', finish: 'акцентная стена: рейки, шпон дуба' },
    floor: { name: 'инженерная доска, дуб натуральный, укладка «ёлка»', color: '#C8A97A', priceM2: 5200 },
    ceiling: 'ГКЛ в один уровень, краска RAL 9010 глубокоматовая',
    plinth: 'плинтус МДФ 80 мм, эмаль в цвет стен',
    doors: 'полотна скрытого монтажа, эмаль в цвет стен',
    textiles: 'лён и хлопок; шторы в скрытой потолочной нише',
    paintPriceL: 3900,
    concept: 'Спокойный тёплый минимализм: природные материалы, низкая мебель, приглушённый свет и много воздуха.',
    skus: {
      paint: 'Little Greene · Slaked Lime №105, Absolute Matt',
      floor: 'Coswick · Французская ёлка, Дуб Натуральный 1169-1201, 14 мм',
      tile: 'Kerama Marazzi · Про Стоун беж тёмный 60×60, DD640200R',
      plinth: 'Ultrawood · Base 0022, 80 мм, под окраску',
      doors: 'Profil Doors · 1E Invisible, кромка ABS, магнитный замок AGB',
      led: 'Arlight · RT 2-5000 24V Warm3000 (лента) + профиль SL-LINE-2011'
    }
  },
  scandi: {
    key: 'scandi', title: 'Скандинавский',
    palette: ['#F2F0EA', '#D9BE93', '#9FB4A8', '#42464A', '#C96F4A'],
    wall:  { color: '#F2F0EA', finish: 'краска Dulux «Snow White», матовая' },
    accent:{ color: '#9FB4A8', finish: 'акцентная стена: шалфейно-серая краска' },
    floor: { name: 'ламинат 33 кл., дуб светлый', color: '#D9BE93', priceM2: 2400 },
    ceiling: 'натяжной потолок, белый матовый',
    plinth: 'плинтус МДФ 80 мм, белый',
    doors: 'царговые полотна, эмаль белая',
    textiles: 'хлопок, шерсть; яркие акценты в декоре',
    paintPriceL: 2400,
    concept: 'Светло, уютно и функционально: белая база, светлое дерево, живые растения и тёплый текстиль.',
    skus: {
      paint: 'Dulux · Professional Bindo 7, база BW, глубокоматовая',
      floor: 'Tarkett · Ballet Premium 33 кл., Дуб Джульетта',
      tile: 'Cersanit · Woodhouse светло-серый 29,7×59,8, WS4O522',
      plinth: 'Arbiton · Indo 80, белый',
      doors: 'Волховец · Tekna 6001, эмаль белая',
      led: 'Arlight · RT 2-5000 24V Warm3000 + профиль ARH-LINE'
    }
  },
  minimal: {
    key: 'minimal', title: 'Минимализм',
    palette: ['#ECECE8', '#C9BBA6', '#A9A9A3', '#2F2F2D', '#6E6E68'],
    wall:  { color: '#ECECE8', finish: 'декоративная штукатурка / микроцемент, светло-серый' },
    accent:{ color: '#6E6E68', finish: 'акцент: микроцемент графит' },
    floor: { name: 'кварцвинил, серо-бежевый камень', color: '#C9BBA6', priceM2: 3200 },
    ceiling: 'ГКЛ в один уровень, теневой примыкающий профиль',
    plinth: 'скрытый алюминиевый плинтус, теневой шов',
    doors: 'скрытого монтажа, без наличников',
    textiles: 'однотонные плотные ткани, рулонные шторы',
    paintPriceL: 3400,
    concept: 'Чистая геометрия: скрытые двери, теневые швы, минимум предметов — максимум качества поверхностей.',
    skus: {
      paint: 'San Marco · Intonachino Minerale (микроцемент-эффект), тон 3020',
      floor: 'Aquafloor · Stone XL AF3552MST, кварцвинил 6 мм',
      tile: 'Italon · Metropolis Arctic White 80×80, 610010002338',
      plinth: 'Profilpas · Metal Line 89/6, алюминий скрытый',
      doors: 'Sofia · Invisible 501, скрытый короб',
      led: 'Arlight · MICROLED-5000 24V Day4000 + теневой профиль'
    }
  },
  modern: {
    key: 'modern', title: 'Современный',
    palette: ['#E9E4DB', '#A97B4F', '#5B6B6D', '#31302C', '#C29A5B'],
    wall:  { color: '#E9E4DB', finish: 'краска Tikkurila Harmony, тёплый серо-бежевый' },
    accent:{ color: '#5B6B6D', finish: 'акцентная стена: глубокий серо-зелёный' },
    floor: { name: 'инженерная доска, дуб табак', color: '#A97B4F', priceM2: 4800 },
    ceiling: 'ГКЛ, локальные ниши под трек-системы',
    plinth: 'плинтус МДФ 100 мм, в цвет стен',
    doors: 'полотна в цвет стен, скрытые петли',
    textiles: 'смесовые ткани, шторы блэкаут в спальнях',
    paintPriceL: 2900,
    concept: 'Сдержанная современность: тёплая база, глубокие акценты, латунные детали и трековый свет.',
    skus: {
      paint: 'Tikkurila · Harmony, тон Y487 «Мулен», глубокоматовая',
      floor: 'Amber Wood · Дуб Табак, брашированный, УФ-масло, 14 мм',
      tile: 'Estima · Патина PT02 60×60, неполированный',
      plinth: 'Orac · SX184, 110 мм, под окраску',
      doors: 'Profil Doors · 2.7E, эмаль в цвет стен',
      led: 'Maytoni · трек Busbar 48V + LED Arlight Warm3000'
    }
  },
  neoclassic: {
    key: 'neoclassic', title: 'Неоклассика',
    palette: ['#E6E2D8', '#B98A5C', '#8C97A3', '#3A3A3E', '#CBB287'],
    wall:  { color: '#E6E2D8', finish: 'краска Manders, слоновая кость + молдинги' },
    accent:{ color: '#8C97A3', finish: 'акцент: пыльно-голубые панели буазери' },
    floor: { name: 'массивная доска, дуб, укладка «французская ёлка»', color: '#B98A5C', priceM2: 6500 },
    ceiling: 'ГКЛ, потолочный карниз 120 мм',
    plinth: 'плинтус МДФ 120 мм, белая эмаль',
    doors: 'филёнчатые полотна, эмаль белая, латунная фурнитура',
    textiles: 'портьеры в пол, бархат и жаккард',
    paintPriceL: 4600,
    concept: 'Классические пропорции в современном прочтении: молдинги, симметрия, благородные материалы.',
    skus: {
      paint: 'Manders · Paint & Paper Library, Ivory II, Pure Flat Emulsion',
      floor: 'Coswick · Французская ёлка, Дуб Ванильный 1167-1808, УФ-масло',
      tile: 'Ametis by Estima · Marmulla MA02 60×120, полированный',
      plinth: 'Ultrawood · Base 5573, 120 мм, белая эмаль',
      doors: 'Волховец · Galant Classic 7401, эмаль, латунная фурнитура Morelli',
      led: 'Arlight · RT 2-5000 24V Warm3000 + карнизная подсветка'
    }
  },
  loft: {
    key: 'loft', title: 'Лофт',
    palette: ['#D8D3CA', '#9C6B54', '#8B5F3C', '#2B2A28', '#5E6B5B'],
    wall:  { color: '#D8D3CA', finish: 'бетонная декоративная штукатурка' },
    accent:{ color: '#9C6B54', finish: 'акцентная стена: кирпич / клинкерная плитка' },
    floor: { name: 'паркетная доска, дуб термо', color: '#8B5F3C', priceM2: 3900 },
    ceiling: 'окрашенное перекрытие + чёрные трековые системы',
    plinth: 'плинтус металлический, чёрный 60 мм',
    doors: 'полотна ревизионного типа, чёрный муар',
    textiles: 'грубый лён, кожа, металл',
    paintPriceL: 2600,
    concept: 'Честные фактуры: бетон, кирпич, металл и дерево; открытый свет и свободная планировка.',
    skus: {
      paint: 'San Marco · Concret Art (бетон-эффект), тон серый натуральный',
      floor: 'Goodwin · Дуб Термо, паркетная доска, браш, 14 мм',
      tile: 'Italon · Eternum Magnum 80×80 + клинкер Feldhaus R700',
      plinth: 'Profilpas · Metal Line 90/8, чёрный анод',
      doors: 'ПК Концепт · ревизионные полотна, чёрный муар RAL 9005',
      led: 'SWG · трек 48V чёрный + LED-профили Warm3000'
    }
  }
};

// Автовыбор стиля, если клиент доверился студии
function pickStyle(brief) {
  const txt = JSON.stringify([brief.style, brief.answers] || '').toLowerCase();
  if (/кирпич|бетон|лофт|индастр/.test(txt)) return 'loft';
  if (/классик|молдинг|карниз|буазери/.test(txt)) return 'neoclassic';
  if (/минимал|строг|лаконич/.test(txt)) return 'minimal';
  if (/сканд|светл|уют|ярк/.test(txt)) return 'scandi';
  if (/соврем|трек|латун/.test(txt)) return 'modern';
  return 'japandi';
}

// Тарифы: k — работы, kMat — материалы, kFurn — мебель и свет
const TIERS = {
  econom:   { key: 'econom',   title: 'Эконом',  k: 0.75, kMat: 0.7, kFurn: 0.6 },
  business: { key: 'business', title: 'Бизнес',  k: 1.0,  kMat: 1.0, kFurn: 1.0 },
  premium:  { key: 'premium',  title: 'Премиум', k: 1.5,  kMat: 1.6, kFurn: 1.8 }
};

// Базовые расценки работ (тариф «Бизнес», ₽)
const WORK_RATES = {
  screed:   { name: 'Стяжка и подготовка пола',        unit: 'м²',   rate: 650 },
  plaster:  { name: 'Штукатурка стен по маякам',       unit: 'м²',   rate: 850 },
  paint:    { name: 'Шпаклёвка и окраска стен (2 слоя)', unit: 'м²', rate: 900 },
  floorLay: { name: 'Укладка напольного покрытия',     unit: 'м²',   rate: 800 },
  plinthLay:{ name: 'Монтаж плинтуса',                 unit: 'м.п.', rate: 450 },
  ceilGkl:  { name: 'Потолок ГКЛ + окраска',           unit: 'м²',   rate: 1100 },
  tile:     { name: 'Облицовка плиткой (стены/пол)',   unit: 'м²',   rate: 2000 },
  electro:  { name: 'Электромонтаж',                   unit: 'точка', rate: 3500 }
};

// Цены мебели/оборудования (тариф «Бизнес», ₽ за шт.)
const FURN_PRICES = {
  bed: 70000, nightstand: 11000, wardrobe: 85000, dresser: 30000,
  sofa: 135000, coffee: 18000, tv: 45000, shelf: 26000, armchair: 42000,
  rug: 24000, kitchen: 220000, kitchen_ext: 60000, table: 95000,
  desk: 32000, kidbed: 38000, bath: 58000, wc: 30000, sink: 27000,
  hallwardrobe: 70000, bench: 14000,
  spot: 2800, pendant: 22000, track: 19000
};

// Высоты мебели для развёрток, мм: base — низ от чистого пола, h — высота фронта.
// Кухня разбита по ярусам отдельно (kitchenEquipFor), здесь — корпусная и мягкая мебель.
const FURN_H = {
  wardrobe:    { base: 0, h: 2400, name: 'Шкаф' },
  hallwardrobe:{ base: 0, h: 2400, name: 'Шкаф-гардероб' },
  shelf:       { base: 0, h: 1400, name: 'Стеллаж' },
  dresser:     { base: 0, h: 900,  name: 'Комод' },
  bed:         { base: 0, h: 600,  head: 1100, name: 'Кровать' },
  kidbed:      { base: 0, h: 600,  head: 950,  name: 'Кровать' },
  nightstand:  { base: 0, h: 450,  name: 'Тумба' },
  desk:        { base: 0, h: 750,  name: 'Стол' },
  table:       { base: 0, h: 750,  name: 'Стол' },
  dining:      { base: 0, h: 750,  name: 'Обеденный стол' },
  sofa:        { base: 0, h: 850,  name: 'Диван' },
  armchair:    { base: 0, h: 800,  name: 'Кресло' },
  coffee:      { base: 0, h: 400,  name: 'Журнальный стол' },
  bench:       { base: 0, h: 450,  name: 'Банкетка' },
  fridge:      { base: 0, h: 2000, name: 'Холодильник' },
  washer:      { base: 0, h: 850,  name: 'Стиральная машина' },
  bath:        { base: 0, h: 600,  name: 'Ванна' },
  shower:      { base: 0, h: 2000, name: 'Душевая' },
  wc:          { base: 0, h: 800,  name: 'Унитаз' },
  sink:        { base: 0, h: 850,  name: 'Раковина' }
};

module.exports = { STYLES, TIERS, WORK_RATES, FURN_PRICES, FURN_H, pickStyle };
