'use strict';
// ================================================================
// LINEA · валидатор брифа
// Ловит мусор в исходных данных ДО того, как он превратится в 74 листа
// и смету. Вход — сырой бриф (метры), выход — {errors, warnings}.
//   errors   — считать нельзя: геометрия противоречива
//   warnings — считать можно, но дизайнер должен посмотреть
// ================================================================

// типы, для которых в движке описаны правила расстановки и отделки
const KNOWN_TYPES = new Set(['living', 'living-kitchen', 'kitchen', 'bedroom', 'kids', 'cabinet', 'hallway', 'bathroom', 'wc']);
const WET_TYPES = new Set(['bathroom', 'wc']);
// габариты помещения, м
const DIM_MIN = 0.8, DIM_MAX = 15;
// высота потолка, м
const H_MIN = 2.2, H_MAX = 4.5;
// доля длины стены, которую суммарно могут занять проёмы
const OPEN_MAX_SHARE = 0.7;
// допуск расхождения Σ площадей помещений и object.area
const AREA_TOL = 0.1;

const num = v => typeof v === 'number' && isFinite(v);
const r2 = v => +(+v).toFixed(2);
const wallLen = (room, wall) => (wall === 'A' || wall === 'C') ? room.width : room.length;
const overlap = (a, b) => {
  const ax2 = a.x + a.w, ay2 = a.y + a.h, bx2 = b.x + b.w, by2 = b.y + b.h;
  const ix = Math.min(ax2, bx2) - Math.max(a.x, b.x);
  const iy = Math.min(ay2, by2) - Math.max(a.y, b.y);
  return (ix > 0.01 && iy > 0.01) ? r2(ix * iy) : 0;
};

function validate(brief) {
  const errors = [], warnings = [];
  const E = m => errors.push(m);
  const W = m => warnings.push(m);

  if (!brief || typeof brief !== 'object') { E('Бриф пустой или не является объектом.'); return { errors, warnings }; }
  const obj = brief.object || {};
  const rooms = Array.isArray(brief.rooms) ? brief.rooms : [];

  if (!rooms.length) { E('В брифе нет ни одного помещения (rooms[]).'); return { errors, warnings }; }

  // ---------- помещения ----------
  const ids = new Map();
  let doorsTotal = 0;
  rooms.forEach((r, i) => {
    const nm = r.name || r.id || `помещение ${i + 1}`;
    const H = num(r.height) ? r.height : (num(obj.ceilingHeight) ? obj.ceilingHeight : 2.7);

    if (!num(r.width) || !num(r.length)) { E(`«${nm}»: не заданы числовые width/length.`); return; }
    for (const [k, v] of [['width', r.width], ['length', r.length]]) {
      if (v < DIM_MIN || v > DIM_MAX) E(`«${nm}»: ${k} = ${v} м вне диапазона ${DIM_MIN}–${DIM_MAX} м.`);
    }
    if (H < H_MIN || H > H_MAX) E(`«${nm}»: высота ${H} м вне диапазона ${H_MIN}–${H_MAX} м.`);

    if (!r.type) W(`«${nm}»: тип не указан — будет принят «living».`);
    else if (!KNOWN_TYPES.has(r.type)) W(`«${nm}»: тип «${r.type}» не описан в правилах отрисовки — мебель, отделка и смета соберутся как для жилой комнаты.`);

    if (r.id) { if (ids.has(r.id)) E(`Дубликат id «${r.id}»: «${ids.get(r.id)}» и «${nm}».`); else ids.set(r.id, nm); }

    // ---------- проёмы ----------
    const perWall = { A: 0, B: 0, C: 0, D: 0 };
    const check = (o, kind, idx) => {
      const label = `«${nm}», ${kind} ${idx + 1}`;
      if (!o.wall || !'ABCD'.includes(o.wall)) { E(`${label}: стена «${o.wall}» — допустимы только A/B/C/D.`); return; }
      if (!num(o.width) || o.width <= 0) { E(`${label}: не задана ширина.`); return; }
      const L = wallLen(r, o.wall);
      const off = num(o.offset) ? o.offset : 0;
      if (off < 0) E(`${label}: отрицательное смещение ${off} м.`);
      if (off + o.width > L + 0.001) E(`${label}: выходит за стену — ${off} + ${o.width} = ${r2(off + o.width)} м при длине стены ${L} м.`);
      perWall[o.wall] += o.width;
      if (kind === 'окно') {
        const sill = num(o.sill) ? o.sill : 0.9;
        const wh = num(o.height) ? o.height : 1.45;
        if (sill + wh > H + 0.001) E(`${label}: подоконник ${sill} + высота ${wh} = ${r2(sill + wh)} м выше потолка ${H} м.`);
      } else {
        const dh = num(o.height) ? o.height : 2.05;
        if (dh > H - 0.05) E(`${label}: высота полотна ${dh} м не оставляет перемычки под потолком ${H} м.`);
      }
    };
    (r.windows || []).forEach((o, i2) => check(o, 'окно', i2));
    (r.doors || []).forEach((o, i2) => check(o, 'дверь', i2));

    for (const wk of ['A', 'B', 'C', 'D']) {
      const L = wallLen(r, wk);
      if (perWall[wk] > L * OPEN_MAX_SHARE) E(`«${nm}», стена ${wk}: проёмы занимают ${r2(perWall[wk])} м из ${L} м (> ${OPEN_MAX_SHARE * 100}%) — простенков не остаётся.`);
    }

    const nd = (r.doors || []).length;
    doorsTotal += nd;
    if (!nd) W(`«${nm}»: двери не заданы — будет принята дверь 900 мм в стене C.`);
    if (!(r.windows || []).length && !WET_TYPES.has(r.type) && r.type !== 'hallway') W(`«${nm}»: окон нет — для жилого помещения проверьте исходные данные.`);
    if (WET_TYPES.has(r.type) && Math.min(r.width, r.length) < 1.2) W(`«${nm}»: ширина ${Math.min(r.width, r.length)} м — сантехника и короб могут не поместиться.`);
  });
  if (!doorsTotal) W('Ни в одном помещении не заданы двери — план дверей и спецификация соберутся по значениям по умолчанию.');

  // ---------- взаимное положение помещений ----------
  const placed = rooms.filter(r => r.pos && num(r.pos.x) && num(r.pos.y) && num(r.width) && num(r.length));
  if (placed.length && placed.length !== rooms.length) {
    W(`Координаты pos заданы у ${placed.length} из ${rooms.length} помещений — сводные листы квартиры собраны не будут (нужны у всех или ни у одного).`);
  }
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    const s = overlap({ x: a.pos.x, y: a.pos.y, w: a.width, h: a.length }, { x: b.pos.x, y: b.pos.y, w: b.width, h: b.length });
    if (s) E(`Помещения «${a.name || a.id}» и «${b.name || b.id}» пересекаются по площади ${s} м² — планировка противоречива.`);
  }

  // ---------- площадь ----------
  const sum = r2(rooms.reduce((s, r) => s + ((num(r.width) && num(r.length)) ? r.width * r.length : 0), 0));
  if (num(obj.area)) {
    const d = Math.abs(sum - obj.area);
    if (d > obj.area * AREA_TOL) E(`object.area = ${obj.area} м², сумма площадей помещений = ${sum} м² (расхождение ${r2(d)} м², больше ${AREA_TOL * 100}%). Смета считается от площадей помещений — цифра в паспорте будет врать.`);
    else if (d > obj.area * 0.03) W(`object.area = ${obj.area} м² против суммы ${sum} м² — расхождение ${r2(d)} м² (коридоры и ниши?).`);
  } else W('object.area не задана — в паспорт уйдёт сумма площадей помещений.');

  // ---------- прочее ----------
  if (!obj.address) W('object.address не задан — в штампе всех листов будет «Объект».');
  if (brief.style && brief.style.name && !brief.style.byStudio) {
    // список стилей проверяется движком; здесь только предупреждение о опечатке в ключе
    if (!/^[a-z-]+$/.test(brief.style.name)) W(`style.name «${brief.style.name}» не похож на ключ стиля — студия подберёт стиль сама.`);
  }
  if (brief.meta && brief.meta.issueDate && !/^\d{2}\.\d{2}\.\d{4}$/.test(brief.meta.issueDate)) {
    W(`meta.issueDate «${brief.meta.issueDate}» — ожидается формат ДД.ММ.ГГГГ.`);
  }

  return { errors, warnings };
}

module.exports = { validate, KNOWN_TYPES };
