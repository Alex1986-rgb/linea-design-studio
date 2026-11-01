#!/usr/bin/env node
'use strict';
/**
 * Главная (site/index.html) на материалах альбомов GOST-DRAFT.
 *
 *   node tools/gen-home.js            — пересобрать области главной, кадры фильма, обложки
 *   node tools/gen-home.js --check    — только проверить ссылки главной (код 1, если файла нет)
 *   node tools/gen-home.js --force    — пересобрать кадры, даже если список не менялся
 *
 * Главная остаётся ручной вёрсткой: генератор переписывает только области между метками
 * <!-- home:имя --> … <!-- /home:имя -->. Числа (листы, помещения, вопросы к заказчику), карточки, плитки листов,
 * кадры фильма, FAQ и условия берутся из выпусков и из tools/site-shell.js → TERMS, а не пишутся руками.
 *
 * Правило картинок (замечание практика 22.10.2026, docs/reviews/2026-10-22-andrey-revit.md в gost-draft):
 *   визуализация попадает на главную, только если приёмка движка (tools/views-check.js) говорит «принят» —
 *   кадр сверен с планом по чек-листу и подписан дизайнером (checked.confirmedBy + confirmedOn), и файл кадра
 *   новее разбора практика (REVIEW_DAY): старые кадры, «принятые» сверкой с глиной, на первый экран не идут.
 *   Нет подписанного кадра — у карточки обложкой лист расстановки мебели. Кадры «ждёт подписи» на главную не идут.
 * Плитки листов ищут файл по имени БЕЗ номера в sheets.json: альбом перевыпустили — номер сменился, плитка не 404.
 * В конце — проверка: каждый src/href/srcset главной на локальный файл существует, иначе код 1.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const SHELL = require('./site-shell.js');
const { TERMS, esc } = SHELL;

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const INDEX = path.join(SITE, 'index.html');
const GD = process.env.GOST_DRAFT || path.join(require('os').homedir(), 'projects', 'gost-draft');
const CHECK = process.argv.includes('--check');
const FORCE = process.argv.includes('--force');
const REVIEW_DAY = new Date('2026-10-22T00:00:00+03:00');   // разбор практика: кадры старше — только после перерисовки

// слаг на сайте → папка объекта в движке (строки sync_one в sync-gost-releases.sh)
const OBJ = (() => {
  try {
    const sh = fs.readFileSync(path.join(__dirname, 'sync-gost-releases.sh'), 'utf8');
    return Object.fromEntries([...sh.matchAll(/^sync_one\s+(\S+)\s+(\S+)/gm)].map(m => [m[2], m[1]]));
  } catch { return {}; }
})();

// порядок карточек на главной: сначала проект с подписанными кадрами, дальше дома и квартиры
const ORDER = ['gost-modern4k', 'gost-dom331', 'gost-dom120', 'gost-retro103', 'gost-lineademo', 'gost-proekt2', 'gost-kv3k', 'gost-kv65', 'gost-kv58'];
// короткая подпись стиля/типа на карточке
const KICK = {
  'gost-modern4k': 'Квартира · модерн', 'gost-dom331': 'Дом · шале', 'gost-dom120': 'Дом · средиземноморье',
  'gost-retro103': 'Квартира · ретро', 'gost-lineademo': 'Квартира · джапанди', 'gost-proekt2': 'Квартира · 4 комнаты',
  'gost-kv3k': 'Квартира · 3 комнаты', 'gost-kv65': 'Квартира · реконструкция', 'gost-kv58': 'Квартира · 2 комнаты',
};
// плитки «Листы как есть»: альбом + имя листа без номера
const PLATES = [
  { slug: 'gost-dom331', key: 'interior-designer-furniture-et1', cap: 'Расстановка мебели · дом 271 м²' },
  { slug: 'gost-dom331', key: 'architect-stairs-л-1', cap: 'Лестница Л-1 · дом 271 м²' },
  { slug: 'gost-modern4k', key: 'foreman-open-issues', cap: 'Вопросы к заказчику · квартира с кабинетом' },
  { slug: 'gost-lineademo', key: 'electrical-engineer-panel', cap: 'Однолинейная схема щита · квартира 56 м²' },
  { slug: 'gost-lineademo', key: 'plumbing-engineer-razvodka', cap: 'Разводка воды и канализации · квартира 56 м²' },
  { slug: 'gost-lineademo', key: 'furniture-maker-furn-kitchen-1d', cap: 'Развёртка кухонного гарнитура · квартира 56 м²' },
];
// лист для блока «Правки голосом» (метки стоят в % этого листа)
const REVIEW_SHEET = { slug: 'gost-lineademo', key: 'interior-designer-furniture' };
// фильм: предпочтительный порядок кадров (первым — самый ясный кадр); остальные подписанные — следом
const FILM_PREFER = ['room-study-wA', 'room-bedroom-wB', 'room-study-wD', 'room-bedroom-wD', 'room-wardrobe-wide',
  'room-bedroom-wA', 'room-bath1-wD', 'room-bath2-wide', 'room-study-wB', 'room-hall-wB'];
const FILM_MAX = 11;
const ROOM_RU = { living: 'гостиная', kitchen: 'кухня', bedroom: 'спальня', kids: 'детская', study: 'кабинет', bath: 'ванная',
  wc: 'санузел', hall: 'прихожая', corridor: 'коридор', wardrobe: 'гардеробная', storage: 'кладовая', balcony: 'балкон' };
const ROOM_ORDER = ['bedroom', 'study', 'living', 'kitchen', 'kids', 'bath', 'hall', 'wardrobe', 'corridor', 'wc'];
const WALL_RU = { A: 'А', B: 'Б', C: 'В', D: 'Г' };

const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
const NUM_RU = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять'];
const numWord = n => NUM_RU[n] || String(n);
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const sheetKey = f => f.replace(/\.svg$/, '').replace(/^\d+-/, '');
const encSheet = f => f.split('/').map(encodeURIComponent).join('/');

/* ------------------------------------------------------------------ данные альбомов */
const ALB = ORDER.filter(s => fs.existsSync(path.join(SITE, 'portfolio', s, '_card.json'))).map(slug => {
  const dir = path.join(SITE, 'portfolio', slug);
  const card = readJson(path.join(dir, '_card.json'));
  const sheets = readJson(path.join(dir, 'sheets.json'));
  let rend = {};
  try { rend = readJson(path.join(dir, '_renders.json')); } catch { /* нет — значит без кадров */ }
  const plan = sheets.find(x => /^План расстановки мебели/.test(x.title)) || sheets[0];
  return { slug, card, sheets, rend, plan, total: sheets.length };
});
if (!ALB.length) { console.error('Нет ни одного альбома в site/portfolio/gost-*'); process.exit(1); }
const findSheet = (slug, key) => {
  const a = ALB.find(x => x.slug === slug);
  const s = a && a.sheets.find(x => sheetKey(x.file) === key);
  if (!s) throw new Error(`${slug}: в sheets.json нет листа «${key}» — поправьте PLATES/REVIEW_SHEET в gen-home.js`);
  return s;
};
const short = a => a.card.name.split(' · ')[0].replace(/^Квартира с кабинетом.*/, 'квартира с кабинетом').replace(/^./, c => c.toLowerCase());

/* ------------------------------------------------------------------ приёмка кадров движком */
function acceptance(obj) {
  const proj = path.join(GD, 'projects', obj, 'project.json'), tool = path.join(GD, 'tools', 'views-check.js');
  if (!fs.existsSync(proj) || !fs.existsSync(tool) || !fs.existsSync(path.join(GD, 'projects', obj, 'renders', 'views.json'))) return null;
  let txt = '';
  try { txt = execFileSync(process.execPath, [tool, proj], { cwd: GD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { txt = String(e.stdout || ''); }
  const map = new Map();
  for (const m of txt.matchAll(/^\s{2}(принят|предварительно|НЕ принят)\s+(\S+)/gm)) map.set(m[2], m[1] === 'принят' ? 'signed' : m[1] === 'предварительно' ? 'prelim' : 'rejected');
  if (!map.size) throw new Error(`${obj}: views-check.js не выдал ни одного кадра — формат вывода поменялся?`);
  return map;
}
// подписанные кадры всех альбомов: { slug, obj, name, file, room, wall, roomName }
function signedFrames() {
  const out = [];
  if (!fs.existsSync(path.join(GD, 'tools', 'views-check.js'))) return null;
  for (const a of ALB) {
    const obj = OBJ[a.slug];
    if (!obj) continue;
    const acc = acceptance(obj);
    if (!acc) continue;
    let rooms = [];
    try { rooms = readJson(path.join(GD, 'projects', obj, 'project.json')).rooms || []; } catch { /* нет имён — словарь */ }
    let views = [];
    try { views = readJson(path.join(GD, 'projects', obj, 'renders', 'views.json')); } catch { /* */ }
    for (const v of views) {
      if (acc.get(v.name) !== 'signed' || !/^room-/.test(v.name)) continue;
      const file = path.join(GD, 'projects', obj, 'renders', `${v.name}.jpg`);
      if (!fs.existsSync(file)) continue;
      if (fs.statSync(file).mtime < REVIEW_DAY) { console.log(`  фильм: ${a.slug}/${v.name} подписан, но файл старше разбора практика — не берём`); continue; }
      const key = (v.name.match(/^room-([a-z]+)/) || [])[1];
      const idx = +((String(v.wall || '').match(/^r(\d+):/) || [])[1] || 0);
      const roomName = (rooms[idx - 1] && rooms[idx - 1].name) || cap1(ROOM_RU[key] || 'интерьер');
      const w = (v.name.match(/-w([A-D])$/) || [])[1];
      out.push({ slug: a.slug, obj, name: v.name, file, key, roomId: idx, roomName, wall: w || null });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ картинки */
function sips(src, dst, px, q) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  execFileSync('sips', ['-Z', String(px), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(q || 60), src, '--out', dst], { stdio: 'ignore' });
}
function webp(src, dst, px, q) {
  try { execFileSync('cwebp', ['-quiet', '-q', String(q || 66), '-m', '6', '-resize', String(px), '0', src, '-o', dst], { stdio: 'ignore' }); return true; }
  catch { return false; }
}
const kb = f => Math.round(fs.statSync(f).size / 1024);

/* ------------------------------------------------------------------ области index.html */
let html = fs.readFileSync(INDEX, 'utf8');
function region(name, body) {
  const re = new RegExp(`(<!-- home:${name} -->)[\\s\\S]*?(<!-- /home:${name} -->)`);
  if (!re.test(html)) throw new Error(`в index.html нет метки <!-- home:${name} -->`);
  html = html.replace(re, (m, a, b) => `${a}\n${body}\n${b}`);
}

function build() {
  const sf = signedFrames();   // null — движка рядом нет: кадры и стены берём из уже собранного
  const nAlb = ALB.length;
  const minS = Math.min(...ALB.map(a => a.total)), maxS = Math.max(...ALB.map(a => a.total));
  const signedBySlug = {};
  for (const a of ALB) signedBySlug[a.slug] = (a.rend && a.rend.signed) || 0;
  const signedTotal = Object.values(signedBySlug).reduce((s, n) => s + n, 0);
  const signedAlbums = ALB.filter(a => signedBySlug[a.slug] > 0);
  const preRev = ALB.filter(a => a.card.preReview).length;

  /* --- фильм: кадры, manifest.json, обложка сайта --- */
  const FR = path.join(SITE, 'assets', 'frames');
  const manFile = path.join(FR, 'manifest.json');
  let man = null;
  try { man = readJson(manFile); } catch { /* */ }
  if (sf) {
    const rank = f => { const i = FILM_PREFER.indexOf(f.name); return i >= 0 ? i : 100 + (ROOM_ORDER.indexOf(f.key) + 1 || 50); };
    const pick = sf.slice().sort((x, y) => rank(x) - rank(y)).slice(0, FILM_MAX);
    if (!pick.length) console.log('  фильм: подписанных кадров нет — оставляю прежний набор');
    else {
      const sources = pick.map(f => `${f.obj}/${f.name}@${Math.round(fs.statSync(f.file).mtimeMs)}`);
      const same = man && JSON.stringify(man.sources) === JSON.stringify(sources) && man.frames.every(f => fs.existsSync(path.join(FR, f)));
      if (!same || FORCE) {
        fs.mkdirSync(FR, { recursive: true });
        for (const f of fs.readdirSync(FR)) if (/^\d\d\.(jpg|webp)$/.test(f)) fs.unlinkSync(path.join(FR, f));
        const frames = [], captions = [];
        pick.forEach((f, i) => {
          const nn = String(i + 1).padStart(2, '0');
          sips(f.file, path.join(FR, `${nn}.jpg`), 1280, 58);
          const hasW = webp(f.file, path.join(FR, `${nn}.webp`), 1280, 64);
          frames.push(`${nn}.${hasW ? 'webp' : 'jpg'}`);
          const a = ALB.find(x => x.slug === f.slug);
          captions.push({ room: f.roomName + (f.wall ? `, стена ${WALL_RU[f.wall]}` : ''), note: `— ${short(a)} · кадр сверен с планом и подписан дизайнером` });
        });
        man = { base: 'assets/frames/', note: `Раскадровка hero: ${frames.length} кадров 1280 px — только визуализации, сверенные с планом и подписанные дизайнером (views-check.js), новее разбора практика 22.10.2026. Пересобрать: node tools/gen-home.js`, frames, captions, sources };
        fs.writeFileSync(manFile, JSON.stringify(man, null, 1) + '\n');
        // обложка сайта (og по умолчанию для всех страниц) и превью главной — из первого кадра фильма
        const first = pick[0].file, A = path.join(SITE, 'assets');
        execFileSync('sips', ['-z', '1280', '1920', '-s', 'format', 'jpeg', '-s', 'formatOptions', '50', first, '--out', path.join(A, 'hero.jpg')], { stdio: 'ignore' });
        webp(path.join(A, 'hero.jpg'), path.join(A, 'hero.webp'), 1920, 64);
        execFileSync('sips', ['-z', '800', '1200', '-s', 'format', 'jpeg', '-s', 'formatOptions', '70', first, '--out', path.join(A, 'og-home.jpg')], { stdio: 'ignore' });
        execFileSync('sips', ['--cropToHeightWidth', '630', '1200', path.join(A, 'og-home.jpg')], { stdio: 'ignore' });
        console.log(`  фильм: ${frames.length} кадров, ${frames.reduce((s, f) => s + kb(path.join(FR, f)), 0)} КБ (webp); hero.jpg и og-home.jpg — ${pick[0].name}`);
      } else console.log(`  фильм: ${man.frames.length} кадров, без изменений`);
    }
  }
  if (!man || !man.frames || !man.frames.length) throw new Error('нет кадров фильма (assets/frames/manifest.json)');
  const caps = man.captions || [];
  region('preload', `<link rel="preload" as="image" href="assets/frames/${man.frames[0]}" fetchpriority="high"${/\.webp$/.test(man.frames[0]) ? ' type="image/webp"' : ''}>`);
  region('frames', `  var FRAMES = [\n${man.frames.map((f, k) => `    { f: '${f.replace(/\.webp$/, '.jpg')}', room: ${JSON.stringify((caps[k] || {}).room || '')}, note: ${JSON.stringify((caps[k] || {}).note || '')} }`).join(',\n')}\n  ];`);
  region('framecap', `    <div class="frame-cap"><b id="filmRoom">${esc((caps[0] || {}).room || '')}</b> <span id="filmNote">${esc((caps[0] || {}).note || '')}</span></div>`);
  region('og', `<meta property="og:image:alt" content="${esc(((caps[0] || {}).room || 'Интерьер') + ' ' + ((caps[0] || {}).note || '').replace(/^— /, '— '))}">`);

  /* --- цифры первого экрана --- */
  region('stats', `        <div class="stats">
          <div><b>48 / 72 ч</b><span>первый вариант: квартира / дом</span></div>
          <div><b>~5 мин</b><span>бриф: план, картинки, слова</span></div>
          <div><b>${minS}–${maxS}</b><span>листов A3 в альбомах на сайте</span></div>
          <div><b>от ${esc(TERMS.rate('proekt'))}</b><span>минимум ${esc(TERMS.minSum('proekt'))}, сумму знаете до оплаты</span></div>
        </div>`);
  /* --- цена и УТП: числа — из выпусков и из TERMS (site-shell.js), руками не пишутся --- */
  const flatT = ALB.filter(x => !x.card.house).map(x => x.total);
  const fMin = Math.min(...flatT), fMax = Math.max(...flatT);
  const PK = TERMS.pack, EXA = [40, 60, 80];
  region('utp', `    <div class="kicker">Цена и состав</div>
    <h2>От ${esc(TERMS.rate('proekt'))} — <em>полный альбом рабочих чертежей</em></h2>
    <p class="sub">Чертит автоматика, проверяют правила по ГОСТ и автор — поэтому дешевле студии. Заказать может любой, онлайн: ${esc(TERMS.brief.what)}.</p>
    <div class="grid g2">
      <div class="card feat"><span class="tag">ЦЕНА ОДНА</span><h3>${esc(PK.proekt.name)}</h3><b class="p">${esc(TERMS.rate('proekt'))}</b>
        <p>Минимальный заказ — как за ${TERMS.minArea} м²: ${esc(TERMS.minSum('proekt'))}. Полный рабочий альбом, спецификация и смета по чертежам.</p></div>
      <div class="card feat"><span class="tag">ВХОДИТ В ЦЕНУ</span><h3>Визуализации</h3><b class="p">в той же ставке</b>
        <p>Фотореалистичные визуализации помещений, сверенные с планом, — без доплаты и без выбора пакета.</p></div>
    </div>
    <ul class="h-list" style="margin-top:22px">
      <li><b>${fMin}–${fMax} ${plural(fMax, 'лист', 'листа', 'листов')} A3</b> в альбомах наших квартир — не ${TERMS.market.techSheets}, как в типичном техпроекте. Каждый альбом открыт целиком.</li>
      <li><b>Электрика и вода расписаны:</b> розетки, свет, щит, слаботочка, выводы и разводка сантехники — отдельными листами.</li>
      <li><b>Цена за м² фиксирована.</b> Сумма = ставка × площадь, не меньше минимума; вы видите её до оплаты.</li>
      <li><b>Оформление проверяет программа:</b> штамп, масштаб, наложения, стыковка листов; результат проверки — на странице каждого проекта.</li>
    </ul>
    <p class="sub" style="margin-top:18px"><b>Для сравнения.</b> Полный проект с визуализациями в ${esc(TERMS.market.city.replace('Москва', 'Москве'))} обычно стоит ${TERMS.market.full} ₽/м² (выборка открытых прайсов на ${TERMS.market.date}, ориентир). Пример: ${EXA.map(a => `${a} м² — ${esc(TERMS.rub(TERMS.sum('proekt', a)))}`).join('; ')}.</p>
    <div class="cta-row" style="margin-top:22px"><a class="btn" href="price/#primer">Рассчитать свою площадь</a><a class="btn ghost" href="price/">Что входит и что не входит</a></div>`);
  region('scene3', `            <p class="lead">Обмер, демонтаж, мебель, свет и щит, вода и канализация, отопление, потолки, плитка, встроенная мебель, лестницы, ведомости и смета. В альбомах на сайте — от ${minS} до ${maxS} листов A3.</p>`);
  region('cta-count', `          <a class="btn ghost" href="#portfolio">Смотреть ${nAlb} ${plural(nAlb, 'проект', 'проекта', 'проектов')}</a>`);

  /* --- стены одного помещения: подписанные кадры + лист расстановки мебели --- */
  const HD = path.join(SITE, 'assets', 'portfolio', 'home');
  if (sf) {
    fs.mkdirSync(HD, { recursive: true });
    for (const f of fs.readdirSync(HD)) fs.unlinkSync(path.join(HD, f));
    const groups = {};
    for (const f of sf) if (f.wall) (groups[`${f.slug}|${f.roomId}`] = groups[`${f.slug}|${f.roomId}`] || []).push(f);
    const best = Object.values(groups).sort((x, y) => y.length - x.length || (ROOM_ORDER.indexOf(x[0].key) + 1 || 50) - (ROOM_ORDER.indexOf(y[0].key) + 1 || 50))[0];
    if (best && best.length >= 2) {
      const walls = best.sort((x, y) => x.wall.localeCompare(y.wall)).slice(0, 3);
      const a = ALB.find(x => x.slug === walls[0].slug);
      const figs = walls.map(f => {
        const base = `${f.slug.replace(/^gost-/, '')}-${f.name.replace(/^room-/, '')}`;
        sips(f.file, path.join(HD, `${base}.jpg`), 800, 62);
        webp(f.file, path.join(HD, `${base}.webp`), 800, 66);
        return `      <figure><picture><source srcset="assets/portfolio/home/${base}.webp" type="image/webp"><img src="assets/portfolio/home/${base}.jpg" width="800" height="533" loading="lazy" decoding="async" alt="${esc(`${f.roomName}, стена ${WALL_RU[f.wall]} — ${short(a)}, визуализация сверена с планом`)}"></picture><figcaption>${WALL_RU[f.wall]}</figcaption></figure>`;
      });
      figs.push(`      <figure class="plan"><a href="review.html?p=${a.slug}&amp;s=${encSheet(a.plan.file)}"><img src="portfolio/${a.slug}/sheets/${encSheet(a.plan.file)}" width="1587" height="1123" loading="lazy" decoding="async" alt="${esc(`${a.plan.title} — ${short(a)}, лист ${a.plan.no}`)}"></a><figcaption>План</figcaption></figure>`);
      const letters = walls.map(f => WALL_RU[f.wall]).join(', ');
      region('walls', `    <div class="h-walls">
${figs.join('\n')}
    </div>
    <p class="h-walls-cap">${esc(walls[0].roomName)} — ${esc(short(a))}: стены ${letters} и лист ${a.plan.no} «${esc(a.plan.title)}» того же альбома. Каждый кадр сверен с планом по чек-листу — мебель, двери, сантехника, свет — и подписан дизайнером. Где кадр и чертёж расходятся, верен чертёж.</p>`);
    }
  }

  /* --- макет брифа: «галерея референсов» из подписанных кадров (♥ / ✕ — как отмечает клиент) --- */
  if (sf && sf.length >= 3) {
    const want = ['room-study-wA', 'room-bath2-wide', 'room-bedroom-wB'];
    const refs = want.map(n => sf.find(f => f.name === n)).filter(Boolean);
    for (const f of sf) if (refs.length < 3 && !refs.includes(f)) refs.push(f);
    region('refs', `      <div class="h-refs">
${refs.slice(0, 3).map((f, i) => {
      const base = `ref-${f.slug.replace(/^gost-/, '')}-${f.name.replace(/^room-/, '')}`;
      sips(f.file, path.join(HD, `${base}.jpg`), 360, 60);
      webp(f.file, path.join(HD, `${base}.webp`), 360, 62);
      return `        <div class="h-ref${i === 1 ? ' no' : ''}"><picture><source srcset="assets/portfolio/home/${base}.webp" type="image/webp"><img src="assets/portfolio/home/${base}.jpg" alt="" width="360" height="240" loading="lazy" decoding="async"></picture><i${i === 1 ? '' : ' class="like"'}>${i === 1 ? '✕' : '♥'}</i></div>`;
    }).join('\n')}
      </div>`);
  }

  /* --- карточка «Визуализации и смета» --- */
  region('kit-vis', `      <div class="card"><h3>Визуализации и смета</h3><p>Визуализации по стенам — только сверенные с планом: мебель, двери, сантехника и свет как на чертеже${signedTotal ? ` (${signedTotal} ${plural(signedTotal, 'кадр подписан', 'кадра подписаны', 'кадров подписаны')} дизайнером)` : ''}. Ведомость объёмов работ, спецификация и ориентировочная смета.</p></div>`);

  /* --- портфолио --- */
  const cards = ALB.map(a => {
    const c = a.card, h = a.rend && a.rend.hero;
    const signed = h && h.kind === 'render' && h.state === 'signed';
    const img = signed
      ? `<span class="ph"><picture><source srcset="${h.webp || h.src.replace(/\.jpg$/, '.webp')}" type="image/webp"><img src="${h.src}" width="${h.w}" height="${h.h}" loading="lazy" decoding="async" alt="${esc(h.alt)} сверена с планом"></picture><i>кадр сверен с планом · подписан</i></span>`
      : `<span class="ph"><img class="sheet" src="portfolio/${a.slug}/sheets/${encSheet(a.plan.file)}" width="1587" height="1123" loading="lazy" decoding="async" alt="${esc(`${c.name} — ${a.plan.title.toLowerCase()}, лист ${a.plan.no}`)}"><i>лист ${a.plan.no} · ${esc(a.plan.title.replace(/^План расстановки мебели.*/, 'расстановка мебели').toLowerCase())}</i></span>`;
    const q = c.openQ && c.openQ.n ? `${c.openQ.n} ${plural(c.openQ.n, 'вопрос', 'вопроса', 'вопросов')} к заказчику` : 'вопросы к заказчику — в альбоме';
    const bl = c.blockers ? ` · ${c.blockers} ${plural(c.blockers, 'стоп-ошибка', 'стоп-ошибки', 'стоп-ошибок')} ждёт решения` : '';
    return `      <a href="portfolio/${a.slug}/">${img}
        <div class="b"><span class="st">${esc(KICK[a.slug] || c.type)}</span><h3>${esc(c.name.replace(' · ', ' — '))}</h3><span class="ex">демонстрационный проект · статус выпуска — на странице альбома</span><span class="m"><b>${a.total}</b> ${plural(a.total, 'лист', 'листа', 'листов')} · ${c.rooms} ${plural(c.rooms, 'помещение', 'помещения', 'помещений')}<span class="go">→</span></span></div></a>`;
  });
  region('portfolio', `    <div class="kicker">Портфолио нового формата</div>
    <h2>${cap1(numWord(nAlb))} ${plural(nAlb, 'проект', 'проекта', 'проектов')} — <em>${numWord(nAlb)} разных планировок</em></h2>
    <p class="sub">Это демонстрационные проекты студии, а не заказы клиентов. Каждый альбом выложен целиком: страница проекта, оба PDF и все листы, к которым можно поставить правку; статус выпуска и открытые вопросы — на странице альбома, рядом с листами. Визуализацию на обложку ставим, только если кадр сверен с планом и подписан дизайнером; у остальных обложка — лист расстановки мебели.</p>
    <div class="h-pj">
${cards.join('\n')}
    </div>`);

  /* --- микроразметка: список проектов и организация --- */
  const B = SHELL.BASE;
  region('ld-list', `<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Проекты LINEA в новом формате', itemListElement: ALB.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: `${a.card.name.replace(' · ', ', ')} — ${a.total} ${plural(a.total, 'лист', 'листа', 'листов')}`, url: `${B}/portfolio/${a.slug}/` })) })}
</script>`);
  const org = { '@context': 'https://schema.org', '@type': 'ProfessionalService', name: 'LINEA — студия дизайна интерьера', url: `${B}/`, image: `${B}/assets/og-home.jpg`,
    description: `Дизайн-проект интерьера квартиры и дома: ${TERMS.brief.short}, альбом рабочей документации по ГОСТ с проверкой по правилам (планы, развёртки, электрика, сантехника, отделка, мебель, потолки, лестницы), визуализации — только сверенные с планом. ${TERMS.how}; ${TERMS.term}.`,
    areaServed: 'RU', telephone: SHELL.AUTHOR.tel, email: SHELL.AUTHOR.email,
    founder: { '@type': 'Person', name: SHELL.AUTHOR.name, jobTitle: SHELL.AUTHOR.role, telephone: SHELL.AUTHOR.tel, email: SHELL.AUTHOR.email } };
  // Offer: цена «от» = минимальный заказ, ставка за м² — в UnitPriceSpecification (site-shell.js → TERMS.offers)
  org.makesOffer = ['Дизайн-проект квартиры с альбомом рабочей документации', 'Дизайн-проект дома с альбомом рабочей документации'].flatMap(n => TERMS.offers(n, `${B}/brief.html`));
  region('ld-org', `<script type="application/ld+json">\n${JSON.stringify(org)}\n</script>`);

  /* --- плитки листов --- */
  region('plates', `    <div class="plates">
${PLATES.map(p => {
    const s = findSheet(p.slug, p.key);
    const f = encSheet(s.file);
    return `      <a class="plate" href="review.html?p=${p.slug}&amp;s=${f}">
        <span class="plate-img"><img src="portfolio/${p.slug}/sheets/${f}" alt="${esc(`${s.title} — ${p.cap.split(' · ')[1]}, лист ${s.no} альбома`)}" width="1587" height="1123" loading="lazy" decoding="async"></span>
        <span class="plate-cap"><i>Лист ${s.no}</i>${esc(p.cap)}</span>
      </a>`;
  }).join('\n')}
    </div>`);
  const rs = findSheet(REVIEW_SHEET.slug, REVIEW_SHEET.key), rf = encSheet(rs.file);
  region('rv-img', `      <img src="portfolio/${REVIEW_SHEET.slug}/sheets/${rf}" alt="${esc(rs.title)} квартиры 56 м² с метками правок" width="1587" height="1123" loading="lazy" decoding="async">`);
  region('rv-cta', `      <div class="cta-row"><a class="btn ghost" href="review.html?p=${REVIEW_SHEET.slug}&amp;s=${rf}">Поставить правку на демо-листе</a></div>`);
  region('step4-link', `        <a href="review.html?p=${REVIEW_SHEET.slug}&amp;s=${rf}">Попробовать правку на листе →</a></div>`);

  /* --- честно о границах --- */
  const bl = ALB.filter(a => a.card.blockers);
  region('honest', `    <p class="h-honest"><b>Честно о границах.</b> Проверки движка ловят формальные ошибки — наложения, штамп, кегли, проём больше стены, — но не отвечают за то, удобно ли прорабу работать по листу: это смотрит автор, и замечания практикующего проектировщика уже идут в перевыпуск альбомов. Статус каждого выпуска — пометки, открытые вопросы и замечания автопроверки — на странице альбома, рядом с листами. Подписей нормоконтролёра на листах нет: за проверяющих мы не расписываемся.</p>`);

  /* --- условия --- */
  region('price', `    <div class="kicker">Условия</div>
    <h2>${esc(TERMS.start)} — <em>сумму знаете до неё</em></h2>
    <p class="sub">${esc(TERMS.how)}. ${esc(TERMS.line)}. <a href="price/">Подробно об условиях</a> · <a href="oplata/">как проходит оплата</a></p>
    <div class="grid g3">
      <div class="card feat"><span class="tag">ПОРЯДОК</span><h3>Бриф → сумма → оплата → проект</h3><b class="p">от ${esc(TERMS.rate('proekt'))}</b>
        <ul><li>${TERMS.intake.brief}</li><li>Сумма — ставка × площадь, не меньше ${esc(TERMS.minSum('proekt'))}; срок — по брифу</li><li>Оплата — по счёту; онлайн через ЮKassa — кнопкой на странице заказа, когда подключим</li><li>До начала работы деньги возвращаем полностью</li></ul>
        <a class="btn sm" href="brief.html">Заполнить бриф — ${esc(TERMS.brief.time)}</a></div>
      <div class="card"><h3>Что придёт и когда</h3>
        <ul><li>${esc(cap1(TERMS.term))}</li><li>Два PDF: альбом для заказчика и полный альбом для бригады</li><li>Комплект с пометкой «ПРЕДВАРИТЕЛЬНО» и листом вопросов к вам</li><li>Финал без пометки — после ваших ответов, контрольного обмера и правок; ${esc(TERMS.roundsText)}</li></ul></div>
      <div class="card"><h3>Что не входит</h3>
        <ul>${TERMS.notIncluded.map(x => `<li>${esc(cap1(x))}</li>`).join('')}</ul></div>
    </div>`);

  /* --- FAQ: видимый блок и FAQPage из одного массива --- */
  const FAQ = [
    ['Сколько стоит и когда платить?', `${TERMS.line}. Сумма — ставка × площадь, не меньше минимального заказа; дом — те же ставки за м² интерьера. Работа начинается после оплаты: по счёту, а когда подключим ЮKassa — онлайн на странице заказа. До начала работы деньги возвращаем полностью.`],
    ['Что придёт через 48 часов?', `Первый вариант: ${TERMS.term}. Это предварительный комплект — решения на обсуждение, лист вопросов к вам и задание на контрольный обмер. Финальный выпуск — после ваших ответов, обмера и правок.`],
    ['Это делает ИИ — значит, шаблон?', `Нет. Лист не берётся из библиотеки и не рисуется от руки: он строится из данных вашего объекта в миллиметрах — стены, проёмы, мебель, инженерные точки. Поменялась стена — пересобирается весь альбом и смета. На сайте ${numWord(nAlb)} проектов — ${numWord(nAlb)} разных планировок. Решения смотрит автор, ${SHELL.AUTHOR.name}.`],
    ['Примут ли такие чертежи строители?', `Альбом оформлен как рабочая документация по СПДС: штамп, масштаб, цепочки размеров, отметки, ведомости, узлы. Первый вариант — для обсуждения: после ваших ответов и контрольного обмера выпускаем комплект для стройки. Что значит пометка «ПРЕДВАРИТЕЛЬНО» — на странице каждого альбома.`],
    ['Визуализации совпадают с чертежами?', `На сайт идут только кадры, сверенные с планом по чек-листу — мебель, двери, сантехника, свет — и подписанные дизайнером. Сейчас таких ${signedTotal}${signedAlbums.length ? ` в ${signedAlbums.length === 1 ? 'одном проекте' : `${signedAlbums.length} проектах`}` : ''}; у остальных альбомов кадры на перерисовке, на обложке — лист расстановки мебели. Если кадр и чертёж расходятся, верен чертёж.`],
    ['Что нужно от меня?', TERMS.brief.line + '. План — от застройщика, БТИ, PDF или листок от руки; нет плана — договоримся об обмере. ' + TERMS.intake.brief + '.'],
    ['Как вносить правки?', `Откройте лист на сайте, поставьте метку прямо на чертеже и надиктуйте или напишите замечание. В PDF альбома на каждой странице есть кнопка «Правка к этому листу». Альбом пересобирается целиком — вместе со сметой; ${TERMS.roundsText}.`],
    ['Кому принадлежат права на проект?', 'Проект ваш, используйте как угодно. Студия может показывать его в портфолио только с вашего согласия — это отдельная галочка в брифе.'],
  ];
  region('faq', FAQ.map(([q, a], i) => `    <details${i ? '' : ' open'}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n'));
  region('ld-faq', `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) })}\n</script>`);

  /* --- каркас: плашка, воронка --- */
  region('beta', SHELL.beta(''));
  region('funnel', SHELL.funnel('', 'home'));

  // статичная вёрстка главной тоже говорит об отправке брифа фразой из TERMS.intake — под адрес сборки
  html = SHELL.swapIntake(html, TERMS.intakeOnline)[0];
  fs.writeFileSync(INDEX, html);
  console.log(`✔ index.html: альбомов ${nAlb}, листов ${minS}–${maxS}, подписанных кадров ${signedTotal}, плиток ${PLATES.length}`);
}

/* ------------------------------------------------------------------ проверка ссылок главной */
function checkLinks() {
  const src = fs.readFileSync(INDEX, 'utf8').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  const urls = new Set();
  for (const m of src.matchAll(/\s(?:src|href)="([^"]+)"/g)) urls.add(m[1]);
  for (const m of src.matchAll(/\ssrcset="([^"]+)"/g)) m[1].split(',').forEach(x => urls.add(x.trim().split(/\s+/)[0]));
  // кадры фильма из manifest.json и запасного списка
  try { const man = readJson(path.join(SITE, 'assets', 'frames', 'manifest.json')); man.frames.forEach(f => { urls.add(`assets/frames/${f}`); urls.add(`assets/frames/${f.replace(/\.webp$/, '.jpg')}`); }); } catch { urls.add('assets/frames/manifest.json'); }
  for (const m of src.matchAll(/\{ f: '([^']+)'/g)) urls.add(`assets/frames/${m[1]}`);
  const bad = [];
  for (let u of urls) {
    u = u.replace(/&amp;/g, '&');
    if (/^(https?:|mailto:|tel:|#|data:|javascript:)/.test(u)) continue;
    const [p, q] = u.split('#')[0].split('?');
    const rel = decodeURIComponent(p || '');
    if (rel) {
      let f = path.join(SITE, rel);
      if (rel.endsWith('/') || (fs.existsSync(f) && fs.statSync(f).isDirectory())) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) bad.push(u);
    }
    // review.html?p=<альбом>&s=<лист> — лист тоже должен существовать
    if (/^review\.html$/.test(rel) && q) {
      const sp = new URLSearchParams(q), pp = sp.get('p'), ss = sp.get('s');
      if (pp && ss && !fs.existsSync(path.join(SITE, 'portfolio', pp, 'sheets', ss))) bad.push(`${u} (нет листа portfolio/${pp}/sheets/${ss})`);
    }
  }
  if (bad.length) { console.error(`✖ index.html: ${bad.length} ссылок на несуществующие файлы:\n  ${bad.join('\n  ')}`); return false; }
  console.log(`✔ index.html: ${urls.size} локальных ссылок, все файлы на месте`);
  return true;
}

if (!CHECK) build();
process.exit(checkLinks() ? 0 : 1);
