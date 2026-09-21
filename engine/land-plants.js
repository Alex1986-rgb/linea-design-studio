'use strict';
// ================================================================
// LINEA · каталог посадочного материала для ландшафтных проектов
// Цены — розница садовых центров средней полосы, 2026 г., с контейнером.
// h — ожидаемая высота взрослого растения, м; light: sun | part | shade
// ================================================================
const CATALOG = [
  // деревья
  { ru: 'Клён Гиннала', lat: 'Acer ginnala', form: 'дерево', size: 'h 2,0–2,5 м, С20', price: 6500, h: 5.0, light: 'sun', note: 'осенью — карминовая листва, держит стрижку' },
  { ru: 'Рябина обыкновенная', lat: 'Sorbus aucuparia', form: 'дерево', size: 'h 2,5–3,0 м, С20', price: 5500, h: 7.0, light: 'sun', note: 'силуэт и ягоды для птиц' },
  { ru: 'Яблоня декоративная «Royalty»', lat: "Malus 'Royalty'", form: 'дерево', size: 'штамб 1,8 м, С15', price: 7500, h: 4.5, light: 'sun', note: 'пурпурная листва в тон фасаду' },
  { ru: 'Ель колючая «Glauca Globosa»', lat: "Picea pungens 'Glauca Globosa'", form: 'хвойное', size: 'h 0,6–0,8 м, С15', price: 6900, h: 1.8, light: 'sun', note: 'вечнозелёный акцент входной группы' },
  { ru: 'Ива шаровидная на штамбе', lat: "Salix fragilis 'Bullata'", form: 'дерево', size: 'существующая', price: 0, h: 4.0, light: 'sun', note: 'формовка кроны раз в год, ранней весной' },
  { ru: 'Яблоня «Мельба»', lat: 'Malus domestica', form: 'плодовое', size: '2-летка, С10', price: 1800, h: 4.0, light: 'sun', note: 'летний сорт, съём в августе' },
  { ru: 'Слива «Венгерка»', lat: 'Prunus domestica', form: 'плодовое', size: 'существующая', price: 0, h: 3.5, light: 'sun', note: 'санитарная обрезка, побелка штамба' },
  { ru: 'Вишня «Владимирская»', lat: 'Prunus cerasus', form: 'плодовое', size: 'существующая', price: 0, h: 3.5, light: 'sun', note: 'прореживание кроны раз в 2 года' },
  { ru: 'Груша «Чижовская»', lat: 'Pyrus communis', form: 'плодовое', size: '2-летка, С10', price: 2000, h: 4.0, light: 'sun', note: 'самоплодная, зимостойкая' },
  // изгороди и крупные кустарники
  { ru: 'Туя западная «Брабант»', lat: "Thuja occidentalis 'Brabant'", form: 'хвойное', size: 'h 1,5–1,8 м, С15', price: 2500, h: 3.0, light: 'part', note: 'стрижка дважды за сезон, изгородь' },
  { ru: 'Дёрен белый «Elegantissima»', lat: "Cornus alba 'Elegantissima'", form: 'кустарник', size: 'С3, h 0,5–0,7 м', price: 750, h: 2.0, light: 'part', note: 'бело-зелёная листва, красные побеги зимой' },
  { ru: 'Спирея серая «Grefsheim»', lat: "Spiraea × cinerea 'Grefsheim'", form: 'кустарник', size: 'С3', price: 700, h: 1.5, light: 'sun', note: 'белое цветение в мае, каскад побегов' },
  { ru: 'Пузыреплодник «Diabolo»', lat: "Physocarpus opulifolius 'Diabolo'", form: 'кустарник', size: 'С3', price: 800, h: 2.0, light: 'sun', note: 'тёмно-пурпурная листва' },
  { ru: 'Гортензия метельчатая «Limelight»', lat: "Hydrangea paniculata 'Limelight'", form: 'кустарник', size: 'С5', price: 1600, h: 1.8, light: 'part', note: 'цветение июль–сентябрь, обрезка весной' },
  { ru: 'Гортензия метельчатая «Vanille Fraise»', lat: "Hydrangea paniculata 'Vanille Fraise'", form: 'кустарник', size: 'С5', price: 1600, h: 1.8, light: 'part', note: 'соцветия от белого к малиновому' },
  { ru: 'Гортензия древовидная «Annabelle»', lat: "Hydrangea arborescens 'Annabelle'", form: 'кустарник', size: 'С5', price: 1400, h: 1.3, light: 'part', note: 'для полутени у террасы' },
  { ru: 'Спирея японская «Little Princess»', lat: "Spiraea japonica 'Little Princess'", form: 'кустарник', size: 'С3', price: 600, h: 0.6, light: 'sun', note: 'бордюрный кустарник, стрижка' },
  { ru: 'Барбарис Тунберга «Bagatelle»', lat: "Berberis thunbergii 'Bagatelle'", form: 'кустарник', size: 'С3', price: 650, h: 0.4, light: 'sun', note: 'карликовый, пурпурный' },
  { ru: 'Чубушник «Manteau d’Hermine»', lat: "Philadelphus 'Manteau d'Hermine'", form: 'кустарник', size: 'С5', price: 1100, h: 1.0, light: 'sun', note: 'аромат в июне у окон' },
  { ru: 'Можжевельник скальный «Blue Arrow»', lat: "Juniperus scopulorum 'Blue Arrow'", form: 'хвойное', size: 'h 1,2–1,5 м, С10', price: 3400, h: 4.0, light: 'sun', note: 'вертикаль в цветнике' },
  { ru: 'Сосна горная «Мугус»', lat: "Pinus mugo var. mughus", form: 'хвойное', size: 'С7, h 0,4–0,6 м', price: 3200, h: 1.5, light: 'sun', note: 'зимняя структура куртины' },
  { ru: 'Лаванда узколистная', lat: 'Lavandula angustifolia', form: 'полукустарник', size: 'С2', price: 550, h: 0.5, light: 'sun', note: 'сухое место, укрытие лапником на зиму' },
  // многолетники
  { ru: 'Хоста «Halcyon»', lat: "Hosta 'Halcyon'", form: 'многолетник', size: 'С3', price: 750, h: 0.4, light: 'shade' },
  { ru: 'Хоста «Sum and Substance»', lat: "Hosta 'Sum and Substance'", form: 'многолетник', size: 'С5', price: 1100, h: 0.8, light: 'shade' },
  { ru: 'Папоротник страусник', lat: 'Matteuccia struthiopteris', form: 'многолетник', size: 'С3', price: 600, h: 1.0, light: 'shade' },
  { ru: 'Астильба «Fanal»', lat: "Astilbe × arendsii 'Fanal'", form: 'многолетник', size: 'С3', price: 650, h: 0.5, light: 'shade' },
  { ru: 'Бруннера «Jack Frost»', lat: "Brunnera macrophylla 'Jack Frost'", form: 'многолетник', size: 'С2', price: 700, h: 0.4, light: 'shade' },
  { ru: 'Герань кроваво-красная', lat: 'Geranium sanguineum', form: 'многолетник', size: 'С2', price: 500, h: 0.3, light: 'part' },
  { ru: 'Лилейник', lat: 'Hemerocallis hybrida', form: 'многолетник', size: 'С3', price: 650, h: 0.7, light: 'sun' },
  { ru: 'Эхинацея пурпурная', lat: 'Echinacea purpurea', form: 'многолетник', size: 'С2', price: 480, h: 0.8, light: 'sun' },
  { ru: 'Мискантус «Kleine Silberspinne»', lat: "Miscanthus sinensis 'Kleine Silberspinne'", form: 'злак', size: 'С3', price: 950, h: 1.2, light: 'sun' },
  { ru: 'Молиния голубая', lat: 'Molinia caerulea', form: 'злак', size: 'С3', price: 850, h: 0.9, light: 'sun' },
  { ru: 'Вейник «Karl Foerster»', lat: "Calamagrostis × acutiflora 'Karl Foerster'", form: 'злак', size: 'С3', price: 800, h: 1.5, light: 'sun' },
  { ru: 'Щучка дернистая', lat: 'Deschampsia cespitosa', form: 'злак', size: 'С2', price: 550, h: 0.8, light: 'part' },
  { ru: 'Овсяница сизая', lat: 'Festuca glauca', form: 'злак', size: 'С1', price: 300, h: 0.25, light: 'sun' },
  { ru: 'Очиток «Matrona»', lat: "Hylotelephium 'Matrona'", form: 'многолетник', size: 'С2', price: 450, h: 0.5, light: 'sun' },
  { ru: 'Очиток видный', lat: 'Hylotelephium spectabile', form: 'многолетник', size: 'С2', price: 450, h: 0.5, light: 'sun' },
  { ru: 'Шалфей дубравный', lat: 'Salvia nemorosa', form: 'многолетник', size: 'С1', price: 380, h: 0.5, light: 'sun' },
  { ru: 'Манжетка мягкая', lat: 'Alchemilla mollis', form: 'многолетник', size: 'С1', price: 380, h: 0.4, light: 'part' },
  { ru: 'Тысячелистник', lat: 'Achillea millefolium', form: 'многолетник', size: 'С2', price: 450, h: 0.7, light: 'sun' },
  { ru: 'Дицентра великолепная', lat: 'Dicentra spectabilis', form: 'многолетник', size: 'С2', price: 700, h: 0.7, light: 'shade' },
  { ru: 'Вербейник монетчатый', lat: 'Lysimachia nummularia', form: 'почвопокровное', size: 'С1', price: 250, h: 0.05, light: 'part' },
  { ru: 'Розы кустовые (пересадка)', lat: 'Rosa hybrida', form: 'кустарник', size: 'существующие', price: 0, h: 0.8, light: 'sun' },
  // ягодные
  { ru: 'Смородина чёрная', lat: 'Ribes nigrum', form: 'ягодное', size: 'С3', price: 600, h: 1.5, light: 'sun' },
  { ru: 'Смородина красная', lat: 'Ribes rubrum', form: 'ягодное', size: 'С3', price: 600, h: 1.5, light: 'sun' },
  { ru: 'Крыжовник', lat: 'Ribes uva-crispa', form: 'ягодное', size: 'С3', price: 700, h: 1.2, light: 'sun' },
  { ru: 'Жимолость съедобная', lat: 'Lonicera caerulea', form: 'ягодное', size: 'С3', price: 750, h: 1.5, light: 'sun' },
  { ru: 'Девичий виноград', lat: 'Parthenocissus quinquefolia', form: 'лиана', size: 'С3', price: 700, h: 8.0, light: 'part', note: 'на шпалеру перголы и ширму хозблока' }
];

const norm = s => String(s).toLowerCase().replace(/[«»"'`]/g, '').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

// поиск по вхождению ключевых слов: в брифе названия пишутся сокращённо
function lookup(name) {
  const n = norm(name);
  let best = null, bestScore = 0;
  for (const p of CATALOG) {
    const c = norm(p.ru);
    let score = 0;
    if (c === n) score = 100;
    else {
      const words = n.split(' ').filter(w => w.length > 3);
      const cw = c.split(' ').filter(w => w.length > 3);
      score = words.filter(w => cw.some(x => x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5)))).length * 10;
      if (n.length > 4 && c.startsWith(n.slice(0, 5))) score += 6;
    }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 6 ? best : null;
}

// «Гортензия метельчатая «Limelight» 2, спирея японская 5» → [{name, qty}]
function parseMix(str) {
  return String(str).split(',').map(part => {
    const m = /^(.*?)(\d+)\s*$/.exec(part.trim());
    if (!m) return { name: part.trim(), qty: 1 };
    return { name: m[1].trim(), qty: +m[2] };
  }).filter(x => x.name);
}

module.exports = { CATALOG, lookup, parseMix, norm };
