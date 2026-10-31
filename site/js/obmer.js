// LINEA · форма обмера квартиры (телефон) → survey.json формата linea-survey/1
// Пошагово: объект и узлы → помещения (стены, диагонали, высоты, проёмы, стояки, радиаторы, вентканалы) → итог.
// Черновик живёт в localStorage этого браузера (ключ linea-obmer-v1). На выходе — файл survey.json для
// tools/survey-to-project.mjs (заготовка project.json движка GOST-DRAFT) и отправка на api/survey.php, если страница
// на адресе с приёмником (мета linea-api ставит tools/site-rebase.js) и соединение https / localhost / ?test=1.
// Формат и правила обмера — docs/obmer/format.md и docs/obmer/protokol.md в репозитории студии.
(function () {
  'use strict';
  const KEY = 'linea-obmer-v1', KEY_BY = 'linea-obmer-by';
  const Q = new URLSearchParams(location.search);
  const TEST = Q.get('test') === '1';
  const SECURE = location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const API = (SECURE || TEST) ? ((document.querySelector('meta[name="linea-api"]') || {}).content || '') : '';
  const $ = id => document.getElementById(id);
  const root = $('obmer');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = v => typeof v === 'number' && isFinite(v);
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
  const now = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const TYPES = [['hall', 'Прихожая'], ['corridor', 'Коридор'], ['living', 'Комната / гостиная'], ['bedroom', 'Спальня'], ['kids', 'Детская'],
    ['study', 'Кабинет'], ['kitchen', 'Кухня'], ['living-kitchen', 'Кухня-гостиная'], ['bathroom', 'Ванная / совмещённый санузел'], ['wc', 'Туалет'],
    ['wardrobe', 'Гардеробная'], ['storage', 'Кладовая'], ['balcony', 'Балкон'], ['loggia', 'Лоджия']];
  const WALLS = [['A', 'A · верх'], ['B', 'B · право'], ['C', 'C · низ'], ['D', 'D · лево']];
  const SIDE = [['room', 'помещение квартиры'], ['outside', 'улица (фасад)'], ['flat', 'соседняя квартира'], ['stair', 'лестница / МОП / лифт']];
  const MAT = [['', '—'], ['бетон', 'бетон / ж/б панель'], ['кирпич', 'кирпич'], ['газобетон', 'газобетон / пеноблок'], ['пазогребень', 'пазогребень (ПГП)'], ['ГКЛ', 'ГКЛ на каркасе'], ['дерево', 'дерево'], ['?', 'не понял']];
  const HOW = [['', '—'], ['простукивание', 'простукивание'], ['вскрытие', 'видно в проёме / вскрытие'], ['проект', 'по проекту дома'], ['слова', 'со слов заказчика']];
  const OPK = { window: 'Окно', door: 'Дверь', opening: 'Проём без двери', 'balcony-door': 'Балконная дверь' };
  const RISER = [['sewer', 'К1 — канализация'], ['cold', 'В1 — холодная вода'], ['hot', 'Т3 — горячая вода'], ['heat', 'отопление'], ['gas', 'газ']];

  const blank = () => ({
    format: 'linea-survey/1',
    meta: { object: '', address: '', order: '' },
    survey: { by: (() => { try { return localStorage.getItem(KEY_BY) || ''; } catch (e) { return ''; } })(), date: today(), started: now(), finished: '', tool: '', orientation: 'стена A — верх эскиза; вход в квартиру — ', note: '' },
    object: { type: 'квартира', floor: null, floors: null, areaDocs: null,
      house: { kind: '', series: '', year: null, source: '', note: '' },
      water: { staticPressureBar: null, measuredAt: '', how: '', inletRoom: '', meters: false },
      power: { room: '', ax: { wall: 'D', v: null }, ay: { wall: 'A', v: null }, h: null, inputBreaker: { amps: null, curve: 'C' }, rcdInput: false, modules: null, used: null, tu: false, allowedPowerKw: null, photo: '' } },
    rooms: [],
  });
  const newRoom = i => ({ id: `r${i + 1}`, name: '', type: i === 0 ? 'hall' : 'living',
    place: i === 0 ? { x: 0, y: 0 } : { from: 'r1', side: 'B', shift: 0 },
    walls: Object.fromEntries(['A', 'B', 'C', 'D'].map(k => [k, { bottom: null, top: null, t: null, side: 'room', material: '', how: '', photo: '' }])),
    diagonals: [null, null], heights: [null, null, null], floorStep: null, openings: [], risers: [], radiators: [], vents: [], stove: '', photos: '', note: '' });

  let S;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
  if (!S || S.format !== 'linea-survey/1') S = blank();
  let step = 0, cur = 0;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); if (S.survey.by) localStorage.setItem(KEY_BY, S.survey.by); } catch (e) { /* приватный режим — черновик не сохранится */ } };

  // ── привязка полей: data-k="rooms.0.walls.A.bottom", data-n — число ─────────────────────────────────────
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function set(o, p, v) { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; }
  const opt = (list, v) => list.map(([k, t]) => `<option value="${esc(k)}"${String(v) === k ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const N = (k, label, ph, cls) => `<label class="f${cls ? ' ' + cls : ''}"><span>${label}</span><input data-k="${k}" data-n inputmode="numeric" value="${esc(get(S, k) ?? '')}" placeholder="${esc(ph || 'мм')}"></label>`;
  const T = (k, label, ph, cls) => `<label class="f${cls ? ' ' + cls : ''}"><span>${label}</span><input data-k="${k}" value="${esc(get(S, k) ?? '')}" placeholder="${esc(ph || '')}"></label>`;
  const SEL = (k, label, list, cls) => `<label class="f${cls ? ' ' + cls : ''}"><span>${label}</span><select data-k="${k}">${opt(list, get(S, k) ?? '')}</select></label>`;
  const CB = (k, label) => `<label class="cb"><input type="checkbox" data-k="${k}" data-b${get(S, k) ? ' checked' : ''}> ${label}</label>`;

  root.addEventListener('input', e => {
    const el = e.target, k = el.dataset && el.dataset.k;
    if (!k) return;
    let v = el.value;
    if ('b' in el.dataset) v = el.checked;
    else if ('n' in el.dataset) { v = v.replace(',', '.').replace(/\s/g, ''); v = v === '' ? null : Number(v); if (v != null && !isFinite(v)) v = null; }
    set(S, k, v);
    save();
    if (step === 1) { const c = $('chk'); if (c) c.innerHTML = roomChecks(S.rooms[cur]); }
    if (el.tagName === 'SELECT' && el.dataset.rerender != null) render();
  });
  root.addEventListener('change', e => { if (e.target.dataset && 'b' in e.target.dataset) { set(S, e.target.dataset.k, e.target.checked); save(); } });
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act, r = S.rooms[cur];
    if (a === 'step') { step = +b.dataset.v; render(); window.scrollTo(0, 0); return; }
    if (a === 'room') { cur = +b.dataset.v; step = 1; render(); return; }
    if (a === 'add-room') { S.rooms.push(newRoom(S.rooms.reduce((m, x) => Math.max(m, +String(x.id).replace(/\D/g, '') || 0), 0))); if (S.rooms.length > 1) S.rooms[S.rooms.length - 1].place.from = S.rooms[S.rooms.length - 2].id; cur = S.rooms.length - 1; step = 1; }
    if (a === 'del-room' && confirm(`Удалить помещение «${r.name || r.id}»?`)) { S.rooms.splice(cur, 1); cur = Math.max(0, cur - 1); }
    if (a === 'add-op') r.openings.push({ kind: b.dataset.v, wall: 'A', offset: null, width: null, height: null, sill: null, reveal: null, quarter: null, wallT: null, entry: false, swing: '', photo: '' });
    if (a === 'add-riser') r.risers.push({ kind: 'sewer', d: null, ax: { wall: 'D', v: null }, ay: { wall: 'A', v: null }, valve: false, meter: false, meterH: null, material: '', photo: '' });
    if (a === 'add-rad') r.radiators.push({ wall: 'A', offset: null, width: null, height: null, depth: null, floorGap: null, wallGap: null, sections: null, kind: '', connect: '', airVent: false, thermoHead: false, photo: '' });
    if (a === 'add-vent') r.vents.push({ wall: 'A', offset: null, w: null, l: null, h: null, box: false, draft: '', photo: '' });
    if (a === 'del') { r[b.dataset.list].splice(+b.dataset.i, 1); }
    if (a === 'download') { download(); return; }
    if (a === 'send') { send(b); return; }
    if (a === 'reset' && confirm('Стереть черновик обмера в этом браузере? Сначала скачайте файл, если он нужен.')) { S = blank(); cur = 0; step = 0; }
    save(); render();
  });

  // ── шаги ─────────────────────────────────────────────────────────────────────────────────────────────────
  const STEPS = ['Объект и узлы', 'Помещения', 'Итог'];
  function nav() {
    return `<div class="ob-steps">${STEPS.map((t, i) => `<button type="button" data-act="step" data-v="${i}" class="${i === step ? 'on' : ''}">${i + 1}. ${t}</button>`).join('')}</div>`;
  }
  const roomOpts = (except, withEmpty) => (withEmpty ? [['', '—']] : []).concat(S.rooms.filter(r => r.id !== except).map(r => [r.id, `${r.id} · ${r.name || 'без названия'}`]));
  function stepObject() {
    return `<fieldset><legend>Объект</legend><div class="g2">
      ${T('meta.address', 'Адрес', 'город, улица, дом, кв.', 'w2')}${T('meta.object', 'Объект', 'Квартира 2-комн.')}${T('meta.order', 'Заказ', 'LN-2610-0001')}
      ${T('survey.by', 'Кто мерил', 'Фамилия И.О.')}${T('survey.date', 'Дата', 'ДД.ММ.ГГГГ')}${T('survey.started', 'Начало', 'чч:мм')}${T('survey.tool', 'Инструмент', 'лазерная рулетка …')}
      ${T('survey.orientation', 'Ориентация эскиза', 'стена A — верх; вход — …', 'w2')}
      ${N('object.floor', 'Этаж', '7')}${N('object.floors', 'Этажей в доме', '17')}${N('object.areaDocs', 'Площадь по документам, м²', '57,1')}
    </div></fieldset>
    <fieldset><legend>Дом</legend><div class="g2">
      ${SEL('object.house.kind', 'Тип дома', [['', '—'], ['panel', 'панельный'], ['brick', 'кирпичный'], ['monolith', 'монолит'], ['block', 'блочный'], ['wood', 'деревянный'], ['unknown', 'не знаю']])}
      ${SEL('object.house.source', 'Откуда известно', [['', '—'], ['document', 'проект / БТИ на руках'], ['words', 'со слов'], ['look', 'по виду дома']])}
      ${T('object.house.series', 'Серия', 'П-44Т')}${N('object.house.year', 'Год постройки', '2004')}
      ${T('object.house.note', 'Какие документы видел', 'план БТИ, проект — нет', 'w2')}
    </div></fieldset>
    <fieldset><legend>Вода</legend><div class="g2">
      ${N('object.water.staticPressureBar', 'Давление ХВС, бар', '3,8')}${SEL('object.water.measuredAt', 'Где мерили', roomOpts(null, true))}
      ${SEL('object.water.inletRoom', 'Ввод (краны, счётчики) в', roomOpts(null, true))}${T('object.water.how', 'Как мерили', 'манометр на смеситель')}
      ${CB('object.water.meters', 'счётчики стоят')}
    </div><p class="hint">Давление — манометром при закрытых кранах в квартире. Норма у прибора 0,03–0,6 МПа (0,3–6 бар) для ХВС; выше 4,5 бар нужен редуктор — пометьте в примечании.</p></fieldset>
    <fieldset><legend>Электрощит</legend><div class="g2">
      ${SEL('object.power.room', 'Где щит', roomOpts(null, true))}${N('object.power.h', 'Низ щита от пола', 'мм')}
      ${SEL('object.power.ax.wall', 'От стены', [['D', 'D (лево)'], ['B', 'B (право)']])}${N('object.power.ax.v', 'до оси щита', 'мм')}
      ${SEL('object.power.ay.wall', 'От стены', [['A', 'A (верх)'], ['C', 'C (низ)']])}${N('object.power.ay.v', 'до оси щита', 'мм (0 — щит в этой стене)')}
      ${N('object.power.inputBreaker.amps', 'Вводной автомат, А', '25')}${SEL('object.power.inputBreaker.curve', 'Характеристика', [['B', 'B'], ['C', 'C'], ['D', 'D']])}
      ${N('object.power.modules', 'Мест в щите (модулей)', '12')}${N('object.power.used', 'Занято модулей', '8')}
      ${CB('object.power.rcdInput', 'на вводе есть УЗО / дифавтомат')}${CB('object.power.tu', 'ТУ / договор на мощность есть')}
      ${N('object.power.allowedPowerKw', 'Мощность по ТУ, кВт', 'только из документа')}${T('object.power.photo', 'Фото №', '31')}
    </div><p class="hint">Номинал автомата — не разрешённая мощность. Мощность пишем только из ТУ или справки УК.</p></fieldset>
    <div class="ob-next"><button type="button" class="btn" data-act="step" data-v="1">К помещениям →</button></div>`;
  }

  function roomChecks(r) {
    if (!r) return '';
    const w = r.walls, out = [], ok = [];
    const g = k => w[k] && num(w[k].bottom) ? w[k].bottom : null;
    const cw = g('A') != null && g('C') != null ? (g('A') + g('C')) / 2 : null, cl = g('B') != null && g('D') != null ? (g('B') + g('D')) / 2 : null;
    if (cw && cl) ok.push(`чистая площадь ≈ ${(cw * cl / 1e6).toFixed(2).replace('.', ',')} м²`);
    ['A', 'B', 'C', 'D'].forEach(k => { if (g(k) == null) out.push(`стена ${k}: нет длины по низу`); else if (!num(w[k].top)) out.push(`стена ${k}: нет длины по верху`); else if (Math.abs(w[k].top - w[k].bottom) > 10) out.push(`стена ${k}: низ/верх ${w[k].bottom}/${w[k].top} — завал ${Math.abs(w[k].top - w[k].bottom)} мм, перемерить и сфотографировать`); });
    if (g('A') != null && g('C') != null && Math.abs(g('A') - g('C')) > 10) out.push(`A и C отличаются на ${Math.abs(g('A') - g('C'))} мм — помещение не прямоугольно: снять диагонали обязательно`);
    if (g('B') != null && g('D') != null && Math.abs(g('B') - g('D')) > 10) out.push(`B и D отличаются на ${Math.abs(g('B') - g('D'))} мм`);
    const d = (r.diagonals || []).filter(num);
    if (d.length < 2) out.push('диагонали: нужно две');
    else {
      if (Math.abs(d[0] - d[1]) >= 5) out.push(`диагонали расходятся на ${Math.abs(d[0] - d[1])} мм — углы не прямые (подпишем на обмерном плане)`);
      if (cw && cl) { const c = Math.hypot(cw, cl), m = (d[0] + d[1]) / 2; if (Math.abs(m - c) / c > 0.01) out.push(`средняя диагональ ${Math.round(m)} против ${Math.round(c)} по сторонам — ошибка в стороне или диагонали, перемерить`); else ok.push('диагонали сходятся со сторонами'); }
    }
    const h = (r.heights || []).filter(num);
    if (h.length < 3) out.push(`высота потолка: ${h.length} из 3 точек`);
    else if (Math.max(...h) - Math.min(...h) > 15) out.push(`высоты ${h.join(' / ')} — перепад ${Math.max(...h) - Math.min(...h)} мм, отметить, где ниже`);
    ['A', 'B', 'C', 'D'].forEach(k => { if (!num(w[k].t) && !(r.openings || []).some(o => o.wall === k && num(o.wallT))) out.push(`стена ${k}: нет толщины (меряется в проёме или по торцу)`); });
    (r.openings || []).forEach((o, i) => {
      const len = g(o.wall), nm = `${OPK[o.kind] || 'проём'} ${i + 1}`;
      if (!num(o.offset) || !num(o.width)) out.push(`${nm}: нет отступа от угла или ширины`);
      else if (len != null && o.offset + o.width > len + 5) out.push(`${nm}: отступ + ширина больше длины стены ${o.wall}`);
      if (!num(o.height)) out.push(`${nm}: нет высоты`);
      if ((o.kind === 'window' || o.kind === 'balcony-door') && !num(o.sill) && o.kind === 'window') out.push(`${nm}: нет высоты подоконника`);
      if (!num(o.wallT)) out.push(`${nm}: нет толщины стены в проёме`);
    });
    (r.risers || []).forEach((s, i) => { if (!num(s.d) || !num(s.ax && s.ax.v) || !num(s.ay && s.ay.v)) out.push(`стояк ${i + 1}: нужен диаметр и две привязки`); if (s.meter && !num(s.meterH)) out.push(`стояк ${i + 1}: счётчик — нужна высота`); });
    (r.radiators || []).forEach((s, i) => { if (!num(s.offset) || !num(s.width) || !num(s.floorGap)) out.push(`радиатор ${i + 1}: нужны отступ, ширина и высота от пола`); if (!s.connect) out.push(`радиатор ${i + 1}: подключение (боковое / нижнее)`); });
    if (!String(r.photos || '').trim()) out.push('фото: номера снимков не записаны (каждая стена + узлы)');
    return `<div class="chk ${out.length ? 'bad' : 'good'}"><b>${out.length ? 'Проверить: ' + out.length : 'Помещение снято полностью'}</b>${ok.length ? `<p>${esc(ok.join(' · '))}</p>` : ''}${out.length ? `<ul>${out.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</div>`;
  }

  function stepRooms() {
    const chips = S.rooms.map((r, i) => `<button type="button" data-act="room" data-v="${i}" class="chip${i === cur ? ' on' : ''}">${i + 1}. ${esc(r.name || r.id)}</button>`).join('');
    const head = `<div class="ob-rooms">${chips}<button type="button" class="chip add" data-act="add-room">+ помещение</button></div>`;
    const r = S.rooms[cur];
    if (!r) return head + `<p class="hint">Начните с помещения, где вход в квартиру (обычно прихожая). Обход — по часовой стрелке от входа. Стены всех помещений называем по одному эскизу: A — верх, B — право, C — низ, D — лево.</p>`;
    const p = `rooms.${cur}`;
    const place = cur === 0
      ? `<p class="hint">Первое помещение — начало плана. Остальные ставятся «за стеной» уже снятых.</p>`
      : `<div class="g2">${SEL(`${p}.place.from`, 'Рядом с помещением', roomOpts(r.id))}${SEL(`${p}.place.side`, 'за его стеной', WALLS)}
         ${N(`${p}.place.shift`, 'Сдвиг начала вдоль этой стены', 'мм от её левого / верхнего угла', 'w2')}</div>
         <p class="hint">Пример: кухня справа от прихожей, их верхние стены на одной линии — «рядом с прихожей, за стеной B, сдвиг 0».</p>`;
    const walls = ['A', 'B', 'C', 'D'].map(k => `<div class="wall"><b>Стена ${k}</b><div class="g4">
      ${N(`${p}.walls.${k}.bottom`, 'по низу', 'мм')}${N(`${p}.walls.${k}.top`, 'по верху', 'мм')}${N(`${p}.walls.${k}.t`, 'толщина', 'мм')}${T(`${p}.walls.${k}.photo`, 'фото №', '')}
      ${SEL(`${p}.walls.${k}.side`, 'за стеной', SIDE, 'w2')}${SEL(`${p}.walls.${k}.material`, 'материал', MAT)}${SEL(`${p}.walls.${k}.how`, 'как понял', HOW)}</div></div>`).join('');
    const del = (list, i) => `<button type="button" class="x" data-act="del" data-list="${list}" data-i="${i}" aria-label="удалить">×</button>`;
    const ops = r.openings.map((o, i) => { const q = `${p}.openings.${i}`; return `<div class="item"><b>${OPK[o.kind]} ${i + 1}</b>${del('openings', i)}<div class="g4">
      ${SEL(`${q}.wall`, 'стена', WALLS)}${N(`${q}.offset`, 'от угла', 'мм')}${N(`${q}.width`, 'ширина', 'мм')}${N(`${q}.height`, 'высота', 'мм')}
      ${o.kind === 'window' || o.kind === 'balcony-door' ? N(`${q}.sill`, 'подоконник', 'мм от пола') + N(`${q}.reveal`, 'откос', 'глубина, мм') + N(`${q}.quarter`, 'четверть', 'мм') : ''}
      ${N(`${q}.wallT`, 'толщина стены', 'мм')}
      ${o.kind === 'door' ? SEL(`${q}.swing`, 'петли', [['', '—'], ['start', 'у начала проёма'], ['end', 'у конца проёма']]) + CB(`${q}.entry`, 'входная в квартиру') : ''}
      ${T(`${q}.photo`, 'фото №', '')}</div></div>`; }).join('');
    const risers = r.risers.map((s, i) => { const q = `${p}.risers.${i}`; return `<div class="item"><b>Стояк ${i + 1}</b>${del('risers', i)}<div class="g4">
      ${SEL(`${q}.kind`, 'что', RISER, 'w2')}${N(`${q}.d`, 'Ø, мм', '110')}${T(`${q}.material`, 'материал', 'чугун / ПП / сталь')}
      ${SEL(`${q}.ax.wall`, 'от стены', [['D', 'D'], ['B', 'B']])}${N(`${q}.ax.v`, 'до оси', 'мм')}${SEL(`${q}.ay.wall`, 'от стены', [['A', 'A'], ['C', 'C']])}${N(`${q}.ay.v`, 'до оси', 'мм')}
      ${CB(`${q}.valve`, 'кран')}${CB(`${q}.meter`, 'счётчик')}${N(`${q}.meterH`, 'счётчик от пола', 'мм')}${T(`${q}.photo`, 'фото №', '')}</div></div>`; }).join('');
    const rads = r.radiators.map((s, i) => { const q = `${p}.radiators.${i}`; return `<div class="item"><b>Радиатор ${i + 1}</b>${del('radiators', i)}<div class="g4">
      ${SEL(`${q}.wall`, 'стена', WALLS)}${N(`${q}.offset`, 'от угла', 'мм')}${N(`${q}.width`, 'ширина', 'мм')}${N(`${q}.height`, 'высота', 'мм')}
      ${N(`${q}.depth`, 'глубина', 'мм')}${N(`${q}.floorGap`, 'низ от пола', 'мм')}${N(`${q}.wallGap`, 'от стены', 'мм')}${N(`${q}.sections`, 'секций', '')}
      ${T(`${q}.kind`, 'тип', 'чугун МС-140 / сталь')}${SEL(`${q}.connect`, 'подключение', [['', '—'], ['side', 'боковое'], ['bottom', 'нижнее']])}
      ${CB(`${q}.airVent`, 'кран Маевского')}${CB(`${q}.thermoHead`, 'термоголовка')}${T(`${q}.photo`, 'фото №', '')}</div></div>`; }).join('');
    const vents = r.vents.map((s, i) => { const q = `${p}.vents.${i}`; return `<div class="item"><b>Вентканал ${i + 1}</b>${del('vents', i)}<div class="g4">
      ${SEL(`${q}.wall`, 'стена', WALLS)}${N(`${q}.offset`, 'до центра решётки', 'мм от угла')}${N(`${q}.h`, 'высота центра', 'мм')}
      ${N(`${q}.w`, 'отверстие: ширина', 'мм')}${N(`${q}.l`, 'глубина канала', 'мм')}${SEL(`${q}.draft`, 'тяга (лист бумаги)', [['', '—'], ['есть', 'есть'], ['слабая', 'слабая'], ['нет', 'нет']])}
      ${CB(`${q}.box`, 'вентблок выступает коробом')}${T(`${q}.photo`, 'фото №', '')}</div></div>`; }).join('');
    return head + `<fieldset><legend>Помещение ${cur + 1}</legend><div class="g2">
      ${T(`${p}.name`, 'Название', 'Кухня')}${SEL(`${p}.type`, 'Тип', TYPES)}</div>${place}</fieldset>
      <fieldset><legend>Стены</legend><p class="hint" style="margin:0 0 6px">Длина по низу — у пола, по верху — у потолка; в чистоте, от угла до угла.</p>${walls}</fieldset>
      <fieldset><legend>Контроль</legend><div class="g4">
        ${N(`${p}.diagonals.0`, 'диагональ 1', 'мм')}${N(`${p}.diagonals.1`, 'диагональ 2', 'мм')}${N(`${p}.floorStep`, 'перепад пола', 'мм, ниже — минус')}<span></span>
        ${N(`${p}.heights.0`, 'высота: центр', 'мм')}${N(`${p}.heights.1`, 'у окна', 'мм')}${N(`${p}.heights.2`, 'у двери', 'мм')}</div></fieldset>
      <fieldset><legend>Проёмы</legend>${ops}<div class="adds"><button type="button" data-act="add-op" data-v="window">+ окно</button><button type="button" data-act="add-op" data-v="door">+ дверь</button><button type="button" data-act="add-op" data-v="opening">+ проём</button><button type="button" data-act="add-op" data-v="balcony-door">+ балконная дверь</button></div></fieldset>
      <fieldset><legend>Инженерия</legend>${risers}${rads}${vents}<div class="adds"><button type="button" data-act="add-riser">+ стояк</button><button type="button" data-act="add-rad">+ радиатор</button><button type="button" data-act="add-vent">+ вентканал</button></div>
        ${r.type === 'kitchen' || r.type === 'living-kitchen' ? SEL(`${p}.stove`, 'Плита сейчас', [['', '—'], ['electric', 'электрическая'], ['gas', 'газовая']]) : ''}</fieldset>
      <fieldset><legend>Фото и примечание</legend><div class="g2">${T(`${p}.photos`, 'Номера фото', '1, 2, 3, 4 …', 'w2')}${T(`${p}.note`, 'Примечание', 'балка, ниша, короб, трещины …', 'w2')}</div></fieldset>
      <div id="chk">${roomChecks(r)}</div>
      <div class="ob-next"><button type="button" class="btn ghost" data-act="del-room">Удалить помещение</button><button type="button" class="btn" data-act="add-room">Следующее помещение →</button><button type="button" class="btn ghost" data-act="step" data-v="2">К итогу</button></div>`;
  }

  // ── выгрузка: состояние формы → survey.json ───────────────────────────────────────────────────────────────
  const atOf = (ax, ay) => { const o = {}; if (ax && num(ax.v)) o[ax.wall] = ax.v; if (ay && num(ay.v)) o[ay.wall] = ay.v; return o; };
  function exportSurvey() {
    const s = JSON.parse(JSON.stringify(S));
    if (!s.survey.finished) s.survey.finished = now();
    const pw = s.object.power;
    pw.at = atOf(pw.ax, pw.ay); delete pw.ax; delete pw.ay;
    s.rooms = s.rooms.map(r => Object.assign(r, {
      photos: String(r.photos || '').split(/[,;\s]+/).filter(Boolean),
      diagonals: r.diagonals.filter(num), heights: r.heights.filter(num),
      risers: r.risers.map(x => { const o = Object.assign({}, x, { at: atOf(x.ax, x.ay) }); delete o.ax; delete o.ay; return o; }),
    }));
    if (TEST) s.meta.test = true;
    return s;
  }
  const fileName = () => `obmer-${(S.survey.date || today()).split('.').reverse().join('-')}-${(S.meta.address || 'kvartira').replace(/[^\wа-яё]+/gi, '-').slice(0, 40)}.json`;
  function download() {
    const blob = new Blob([JSON.stringify(exportSurvey(), null, 2)], { type: 'application/json' });
    const f = new File([blob], fileName(), { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [f] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      navigator.share({ files: [f], title: 'Обмер', text: S.meta.address || 'Обмер квартиры' }).catch(() => {});
      return;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName();
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function send(btn) {
    const out = $('sendOut');
    if (!API) { out.innerHTML = 'Отправка с этого адреса не работает — скачайте файл и пришлите его в WhatsApp.'; return; }
    btn.disabled = true; out.textContent = 'Отправляем…';
    const body = JSON.stringify({ survey: exportSurvey(), t: Q.get('t') || '', website: ($('obWeb') || {}).value || '', test: TEST ? 1 : 0 });
    fetch(API + 'survey.php' + (TEST ? '?test=1' : ''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      .then(r => r.json().catch(() => ({ ok: false, error: 'сервер ответил не JSON (' + r.status + ')' })))
      .then(j => { out.innerHTML = j.ok ? `Обмер принят: <b>${esc(j.number)}</b>. Фото пришлите в WhatsApp с этим номером.` : 'Не принят: ' + esc(j.error || 'ошибка') + '. Скачайте файл и пришлите его в WhatsApp.'; })
      .catch(() => { out.textContent = 'Сеть подвела — скачайте файл и пришлите его в WhatsApp.'; })
      .finally(() => { btn.disabled = false; });
  }
  function stepSummary() {
    const problems = [];
    if (!String(S.survey.by || '').trim()) problems.push('не указано, кто мерил (шаг 1)');
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(S.survey.date || '')) problems.push('дата не в виде ДД.ММ.ГГГГ (шаг 1)');
    if (!num(S.object.water.staticPressureBar)) problems.push('давление воды не замерено');
    if (!S.object.power.room) problems.push('не отмечено, где электрощит');
    if (!S.rooms.length) problems.push('нет ни одного помещения');
    const rows = S.rooms.map((r, i) => { const n = (roomChecks(r).match(/<li>/g) || []).length; return `<tr><td>${i + 1}. ${esc(r.name || r.id)}</td><td>${n ? `<span class="bad">${n} к проверке</span>` : '<span class="good">полностью</span>'}</td><td><button type="button" class="chip" data-act="room" data-v="${i}">открыть</button></td></tr>`; }).join('');
    const total = S.rooms.reduce((s, r) => { const a = r.walls.A.bottom, c = r.walls.C.bottom, b = r.walls.B.bottom, d = r.walls.D.bottom; return s + (num(a) && num(b) && num(c) && num(d) ? (a + c) / 2 * (b + d) / 2 / 1e6 : 0); }, 0);
    return `<fieldset><legend>Итог</legend>
      <p>Помещений: <b>${S.rooms.length}</b>, сумма чистых площадей ≈ <b>${total.toFixed(2).replace('.', ',')} м²</b>${num(S.object.areaDocs) ? ` (по документам ${String(S.object.areaDocs).replace('.', ',')} м², разница ${((total / S.object.areaDocs - 1) * 100).toFixed(1).replace('.', ',')} %)` : ''}.</p>
      ${problems.length ? `<div class="chk bad"><b>Не хватает</b><ul>${problems.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
      <table class="ob-tab">${rows}</table>
      <div class="g2">${T('survey.finished', 'Окончание', 'чч:мм — подставится при выгрузке')}${T('survey.note', 'Общее примечание', '')}</div>
      <input id="obWeb" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-5000px" aria-hidden="true">
      <div class="ob-next"><button type="button" class="btn" data-act="download">Скачать survey.json</button>${API ? '<button type="button" class="btn" data-act="send">Отправить в студию</button>' : ''}<button type="button" class="btn ghost" data-act="reset">Новый обмер</button></div>
      <p id="sendOut" class="hint">${API ? 'Отправка — по защищённому соединению; фото на сервер не уходят, их — в WhatsApp с номером обмера.' : 'Файл — в WhatsApp или на почту студии вместе с фото. Черновик хранится только в этом браузере.'}</p>
    </fieldset>`;
  }
  function render() {
    root.innerHTML = nav() + (step === 0 ? stepObject() : step === 1 ? stepRooms() : stepSummary());
    // смена типа помещения меняет состав кнопок — перерисовка по select с data-rerender
    root.querySelectorAll(`select[data-k$=".type"]`).forEach(s => { s.dataset.rerender = ''; });
  }
  render();
})();
