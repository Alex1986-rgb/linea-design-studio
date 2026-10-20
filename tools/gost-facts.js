'use strict';
/**
 * Факты об альбомах нового формата (GOST-DRAFT) для генераторов страниц сайта.
 *
 * Всё читается из выпусков, перенесённых tools/sync-gost-releases.sh:
 *   site/portfolio/<slug>/sheets.json  — состав альбома (число листов, разделы, названия);
 *   site/portfolio/<slug>/_release.html — название, сводка проверки (блокеры); титульный лист — площадь, помещения;
 *   site/portfolio/<slug>/studio.pdf   — альбом для заказчика (визуализации на листах развёрток).
 * Руками здесь пишутся только короткие подписи и картинки — числа берутся из файлов,
 * поэтому после перевыпуска альбома страницы пересобираются и не врут.
 */

const fs = require('fs');
const path = require('path');
const OPEN = require('./gost-open-issues.js');

const SITE = path.join(__dirname, '..', 'site');

// Порядок — как показываем на сайте. img — только файлы, лежащие в git (assets/refs, assets/portfolio).
const PROJECTS = [
  { slug: 'gost-dom331', short: 'Дом с мансардой и гаражом', style: 'загородный дом, шале и эко', house: true, img: 'assets/refs/dom-331-living-wD.jpg' },
  { slug: 'gost-retro103', short: 'Две квартиры в одну, ретро', style: 'середина века и ар-деко', img: 'assets/refs/retro-103-living-wA.jpg' },
  { slug: 'gost-lineademo', short: 'Квартира 56 м², джапанди', style: 'джапанди', img: 'assets/portfolio/lineademo-living.jpg' },
  { slug: 'gost-dom120', short: 'Дом в два этажа', style: 'средиземноморье и сканди', house: true, img: 'assets/portfolio/dom120-top.jpg' },
  { slug: 'gost-modern4k', short: 'Квартира с кабинетом, модерн', style: 'модерн 2026', img: 'assets/refs/modern-4k-living-wA.jpg' },
  { slug: 'gost-proekt2', short: 'Квартира с эркерами', style: 'светлый современный', img: 'assets/refs/proekt-2-living1-wA.jpg' },
  { slug: 'gost-kv3k', short: 'Трёхкомнатная квартира', style: 'современный', img: 'assets/refs/kv-3k-living-wB.jpg' },
  { slug: 'gost-kv65', short: 'Квартира 65 м²', style: 'скандинавский', img: 'assets/refs/kv-65-living.jpg' },
  { slug: 'gost-kv58', short: 'Квартира 58 м²', style: 'скандинавский минимализм', img: 'assets/refs/kv-58-living-wB.jpg' },
];

// Владелец листа — по второй части имени файла «NN-<специалист>-…»
const ROLE = {
  decorator: 'Декор и текстиль', draftsman: 'Общие данные, развёртки, узлы', foreman: 'Организация работ',
  architect: 'Архитектурные решения', interior: 'Планировка и мебель', electrical: 'Электрика и слаботочка',
  lighting: 'Освещение', hvac: 'Отопление и вентиляция', plumbing: 'Водоснабжение и канализация',
  drywall: 'Потолки и перегородки', tiler: 'Раскладка плитки', finisher: 'Полы и отделка',
  colorist: 'Цвет и материалы', furniture: 'Мебель на заказ', estimator: 'Объёмы, материалы, смета',
};

const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const readText = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const mb = f => { try { return (fs.statSync(f).size / 1048576).toFixed(1).replace('.', ',') + ' МБ'; } catch { return ''; } };
const roleOf = file => (String(file).match(/^\d+-([a-z]+)-/) || [])[1] || '';

function facts(p) {
  const dir = path.join(SITE, 'portfolio', p.slug);
  const sheets = readJSON(path.join(dir, 'sheets.json'));
  if (!Array.isArray(sheets) || !sheets.length) throw new Error(`${p.slug}: нет sheets.json — запустите tools/sync-gost-releases.sh`);
  // сводка проверки и паспорт объекта — из служебной листалки выпуска и с титула (как в gen-gost-pages.js),
  // а не со страницы альбома: её вёрстку правит другой генератор
  const rel = OPEN.readRelease(SITE, p.slug);
  const pas = OPEN.facts(SITE, p.slug, rel).facts;
  const title = (readText(path.join(dir, '_release.html')).match(/<title>([^<]+)<\/title>/) || [])[1] || p.short;
  const roles = [...new Set(sheets.map(s => roleOf(s.file)).filter(Boolean))];
  return {
    ...p,
    name: title.trim(),
    sheets: sheets.length,
    list: sheets,
    area: pas.area.replace(/\s*м²$/, ''),     // «270,67» — общая площадь по экспликации с титула
    rooms: pas.rooms,
    blockers: String(rel.blockers),
    roles,
    url: `portfolio/${p.slug}/`,
    review: `review.html?p=${p.slug}`,
    studio: fs.existsSync(path.join(dir, 'studio.pdf')) ? { href: `portfolio/${p.slug}/studio.pdf`, size: mb(path.join(dir, 'studio.pdf')) } : null,
    album: fs.existsSync(path.join(dir, 'album.pdf')) ? { href: `portfolio/${p.slug}/album.pdf`, size: mb(path.join(dir, 'album.pdf')) } : null,
  };
}

let CACHE = null;
function all() {
  if (!CACHE) CACHE = PROJECTS.filter(p => fs.existsSync(path.join(SITE, 'portfolio', p.slug, 'sheets.json'))).map(facts);
  if (!CACHE.length) throw new Error('нет альбомов нового формата в site/portfolio — запустите tools/sync-gost-releases.sh');
  return CACHE;
}
const get = slug => { const f = all().find(x => x.slug === slug); if (!f) throw new Error(`нет альбома ${slug}`); return f; };

// лист по началу имени файла без номера: sheet('gost-dom331', 'architect-stairs') → объект листа
function sheet(slug, key) {
  const f = get(slug);
  const s = f.list.find(x => x.file.replace(/^\d+-/, '').startsWith(key));
  if (!s) throw new Error(`${slug}: нет листа «${key}» — альбом перевыпущен, поправьте ссылку`);
  return s;
}
// адрес правки голосом к листу (относительно корня сайта)
const reviewHref = (slug, key) => `review.html?p=${slug}&amp;s=${encodeURIComponent(sheet(slug, key).file)}`;

// Состав раздела по всем альбомам: какие листы встречаются и сколько их в альбомах (мин–макс).
function norm(t) {
  return String(t)
    .replace(/\s*\((продолжение|окончание)\)/g, '').replace(/\. Лист \d+ из \d+/g, '')
    .replace(/ · .*$/, '')
    .replace(/^Развёртк[аи] стен.*/, 'Развёртки стен каждого помещения')
    .replace(/^Раскладка плитки\. (?!Планы полов).*/, 'Раскладка плитки по стенам мокрых зон и фартуку')
    .replace(/^Кухня \(пом\. \d+\)\. Развёртка гарнитура/, 'Кухня: развёртка гарнитура')
    .replace(/^Кухня \(пом\. \d+\)\. Монтажная схема/, 'Кухня: монтажная схема')
    .replace(/^(Система хранения|Шкаф[- ]купе|Шкаф распашной|Шкаф|Тумба|Стеллаж|Пенал|Комод|Гардероб|Антресоль|Скамья|Полки|Банкетка|Консоль|Изделие)(?=\s|$).*/i, 'Чертёж каждого изделия')
    .replace(/^Схема каркаса перегородки.*/, 'Схема каркаса перегородок')
    .replace(/^Лестница Л-\d+.*/, 'Лестница: план марша, разрез, ограждение')
    .trim();
}
function composition() {
  const A = all();
  const byRole = {};
  for (const f of A) {
    const counts = {};
    for (const s of f.list) { const r = roleOf(s.file); counts[r] = (counts[r] || 0) + 1; }
    for (const r of Object.keys(counts)) {
      const o = byRole[r] = byRole[r] || { role: r, name: ROLE[r] || r, n: [], titles: new Map() };
      o.n.push(counts[r]);
    }
    const seen = new Set();
    for (const s of f.list) {
      const r = roleOf(s.file), t = norm(s.title), k = r + '|' + t;
      if (seen.has(k)) continue; seen.add(k);
      const o = byRole[r]; o.titles.set(t, (o.titles.get(t) || 0) + 1);
    }
  }
  return Object.values(byRole).map(o => ({
    role: o.role, name: o.name, min: Math.min(...o.n), max: Math.max(...o.n), albums: o.n.length,
    titles: [...o.titles.entries()].sort((a, b) => b[1] - a[1]).map(([t, k]) => ({ t, k })),
  }));
}

const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return n + ' ' + (a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many); };

module.exports = { all, get, sheet, reviewHref, composition, plural, ROLE };

/* ---------- разметка, общая для генераторов ---------- */
const escA = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// плитка листа: превью SVG + переход к правке голосом на этом листе. u — префикс до корня сайта
function plate(u, slug, key, cap) {
  const s = sheet(slug, key);
  return `<a class="plate" href="${u}${reviewHref(slug, key)}" title="Открыть лист и оставить правку голосом">
        <span class="plate-img"><img loading="lazy" decoding="async" src="${u}portfolio/${slug}/sheets/${encodeURIComponent(s.file)}" alt="${escA(s.title)}"></span>
        <span class="plate-cap"><i>Лист ${String(s.no).padStart(2, '0')}</i>${escA(cap || s.title)}</span>
      </a>`;
}
// картинка без WebP-пары (у визуализаций assets/refs её нет — <picture> с пустым source дал бы пустой кадр)
const img = (u, src, alt, w, h) => `<img src="${u}${src}" alt="${escA(alt)}" width="${w || 720}" height="${h || 480}" loading="lazy" decoding="async">`;
// карточка альбома для сеток «реальные проекты»
function tile(u, f, lead) {
  return `<a class="tile" href="${u}${f.url}">
        ${img(u, f.img, f.name + ' — визуализация', /portfolio\//.test(f.img) ? 1200 : 720, /portfolio\//.test(f.img) ? 800 : 480)}
        <div class="tile-body">
          <span class="tag">${escA(f.house ? 'Дом' : 'Квартира')} · ${escA(f.style)}</span>
          <b>${escA(f.short)}</b>
          ${lead ? `<span class="tile-lead">${escA(lead)}</span>` : ''}
          <span class="tile-figs"><i><b>${f.sheets}</b> ${plural(f.sheets, 'лист', 'листа', 'листов').replace(/^\d+ /, '')}</i><i><b>${escA(f.area)}</b> м²</i><i><b>${f.rooms}</b> помещ.</i></span>
        </div>
      </a>`;
}
module.exports.plate = plate;
module.exports.img = img;
module.exports.tile = tile;
