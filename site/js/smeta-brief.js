// LINEA · бриф сметы на материалы — отдельным заказом (09.11.2026), страница smeta/zakaz/ (её собирает tools/gen-smeta-brief.js)
//   1. Квартира и план: площадь (по ней сумма видна сразу), план с размерами — обязательно
//   2. Проект или ответы «что где»: «у меня есть проект» → файлы проекта; «проекта нет» → короткий опрос по типам помещений
//   3. Контакты, сводка «так ли мы поняли», согласие на ПДн (та же редакция, что в брифе на проект), отправка
// Приём — api/brief.php с meta.service = 'smeta' (заказ вида smeta: номер LN-…, токен, кабинет, оплата до работы).
// Формат архива: brief.json + brief.txt + plan/NN-… + proekt/NN-…; brief.json читают server/api/brief.php, панель администратора и tools/order-pull.mjs.
// Где есть приёмник (<meta name="linea-api" content="../../api/">, её вставляет tools/site-rebase.js) и соединение защищено, архив уходит на сервер.
// Иначе (GitHub Pages, http) — архив скачивается, его отправляют в WhatsApp или на почту. Исключения: ?test=1 (заказ тестовый) и localhost.
// Цена и срок — из <script id="smetaTerms"> (tools/site-shell.js → TERMS.addons.smeta); числа в этом файле не вписаны.
// ZIP без сжатия и сжатие фото продублированы из js/brief.js намеренно: основной бриф не трогаем (в нём фиксированный набор шагов).
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const TEST = qs.get('test') === '1';
  const SECURE = location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const API = (SECURE || TEST) ? ((document.querySelector('meta[name="linea-api"]') || {}).content || '') : '';
  let T = { rate: 100, min: 5000, minArea: 50, title: 'Смета на материалы', edition: '27.10.2026', maxMb: 100, rateText: '', minText: '' };
  try { const el = $('smetaTerms'); if (el) T = Object.assign(T, JSON.parse(el.textContent)); } catch (e) {}
  const NAMES = ['Квартира и план', 'Проект или ответы «что где»', 'Куда прислать смету'];
  const LAST = 2, DONE = 3;

  const ROOM_TYPES = [['living', 'Жилая комната / гостиная'], ['bedroom', 'Спальня'], ['kids', 'Детская'], ['kitchen', 'Кухня'], ['bathroom', 'Ванная / санузел'],
    ['hall', 'Прихожая / коридор'], ['balcony', 'Балкон / лоджия'], ['storage', 'Кладовая / гардеробная']];
  const WALLS = [['unknown', 'Не знаю'], ['paint', 'Краска'], ['wallpaper', 'Обои'], ['tile-full', 'Плитка до потолка'], ['tile-part', 'Плитка частично (фартук / до 1,5 м), остальное — краска'], ['panels', 'Панели']];
  const FLOOR = [['unknown', 'Не знаю'], ['laminate', 'Ламинат'], ['parquet', 'Паркет / паркетная доска'], ['tile', 'Плитка / керамогранит'], ['vinyl', 'Кварцвинил'], ['linoleum', 'Линолеум']];
  const CEIL = [['unknown', 'Не знаю'], ['paint', 'Окраска'], ['stretch', 'Натяжной'], ['gkl', 'Гипсокартон']];
  const YN = [['yes', 'Да'], ['no', 'Нет'], ['unknown', 'Не знаю']];
  const STATE = [['unknown', 'Не знаю'], ['new', 'Новостройка без отделки'], ['old', 'Вторичка, отделку снимаем'], ['part', 'Частичный ремонт']];
  const LBL = (list, v) => (list.find(x => x[0] === v) || [0, v || '—'])[1];

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const val = id => ($(id) ? $(id).value : '');
  const num = s => { const n = parseFloat(String(s == null ? '' : s).replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
  const rubF = n => Math.round(n).toLocaleString('ru-RU').replace(/ |\s/g, ' ') + ' ₽';
  const sum = a => Math.max(T.min, Math.round(T.rate * a));

  let step = 0, ready = false, mode = '';
  const files = { plans: [], project: [] };

  // ── поля опроса «что где»
  const opts = list => list.map(x => `<option value="${x[0]}">${esc(x[1])}</option>`).join('');
  $('szRooms').innerHTML = ROOM_TYPES.map(([k, t]) => `<div class="sz-rt" data-type="${k}">
    <label><input type="checkbox" data-on aria-expanded="false"><span>${esc(t)}</span></label>
    <div class="sz-rt-f" hidden>
      <div class="c1"><label class="t" for="rc-${k}">Сколько таких помещений</label><select id="rc-${k}" data-f="count">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}">${n}</option>`).join('')}</select></div>
      <div><label class="t" for="rw-${k}">Стены</label><select id="rw-${k}" data-f="walls">${opts(WALLS)}</select></div>
      <div><label class="t" for="rf-${k}">Пол</label><select id="rf-${k}" data-f="floor">${opts(FLOOR)}</select></div>
      <div class="c1"><label class="t" for="rl-${k}">Потолок</label><select id="rl-${k}" data-f="ceiling">${opts(CEIL)}</select></div>
    </div></div>`).join('');
  const chips = (id, name, list, def) => { $(id).innerHTML = list.map(([v, t]) => `<label><input type="radio" name="${name}" value="${v}"${v === def ? ' checked' : ''}><span>${esc(t)}</span></label>`).join(''); };
  chips('szElec', 'szElec', YN, 'yes'); chips('szPlumb', 'szPlumb', YN, 'yes');
  $('szState').innerHTML = opts(STATE);
  $('szRooms').addEventListener('change', e => {
    const on = e.target.closest('[data-on]'); if (!on) return;
    const box = on.closest('.sz-rt'); box.querySelector('.sz-rt-f').hidden = !on.checked; on.setAttribute('aria-expanded', on.checked ? 'true' : 'false');
  });
  $('szHUnk').addEventListener('change', () => { $('szH').disabled = $('szHUnk').checked; if ($('szHUnk').checked) $('szH').value = ''; });

  // ── файлы
  const isImg = f => /^image\/(jpeg|png|webp|gif)$/.test(f.type);
  function fileZone(inputs, labelId, listId, bucket, title, after) {
    const list = $(listId);
    const take = fl => { for (const f of fl) if (f && f.size) files[bucket].push(f); paint(); save(); };
    inputs.forEach(id => { $(id).addEventListener('change', e => { take(e.target.files); e.target.value = ''; }); });
    const lab = $(labelId);
    ['dragenter', 'dragover'].forEach(t => lab.addEventListener(t, e => { e.preventDefault(); lab.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => lab.addEventListener(t, () => lab.classList.remove('over')));
    lab.addEventListener('drop', e => { e.preventDefault(); take(e.dataTransfer.files); });
    function paint() {
      list.querySelectorAll('img').forEach(i => URL.revokeObjectURL(i.src));
      list.innerHTML = files[bucket].map((f, i) => `<li>${isImg(f) ? `<img src="${URL.createObjectURL(f)}" alt="">` : esc(f.name.slice(0, 28))}<button type="button" data-i="${i}" aria-label="Убрать файл ${esc(f.name)}"><i aria-hidden="true">✕</i></button></li>`).join('');
      list.querySelectorAll('button').forEach(b => { b.onclick = () => { files[bucket].splice(+b.dataset.i, 1); paint(); save(); }; });
      list.setAttribute('aria-label', title + ': ' + files[bucket].length);
      if (after) after(files[bucket].length);
    }
  }
  fileZone(['szFilePlan', 'szCamPlan'], 'szDropPlan', 'szPlanList', 'plans', 'Загружено страниц плана', n => { $('szPlanT').textContent = n ? 'Добавить ещё страницу' : 'Загрузить план'; if (n) $('szPlanErr').textContent = ''; });
  fileZone(['szFileProj'], 'szDropProj', 'szProjList', 'project', 'Загружено листов проекта', n => { $('szProjT').textContent = n ? 'Добавить ещё листы' : 'Загрузить файлы проекта'; if (n) $('szProjErr').textContent = ''; });

  // ── режим
  function setMode(m) {
    mode = m;
    $('szProject').hidden = m !== 'project'; $('szAnswers').hidden = m !== 'answers';
    document.querySelectorAll('input[name=szMode]').forEach(r => { r.checked = r.value === m; });
    if (m) $('szModeErr').textContent = '';
  }
  document.querySelectorAll('input[name=szMode]').forEach(r => r.addEventListener('change', () => { setMode(r.value); save(); }));

  // ── шаги
  function setErr(id, msg, field) {
    $(id).textContent = msg || '';
    if (field) field.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg && field && field.focus) field.focus();
    return !msg;
  }
  function price() {
    const a = num(val('szArea'));
    const l = a && a >= 10 ? `Сумма за ${String(a).replace('.', ',')} м²` : 'Сумма за вашу площадь';
    const v = a && a >= 10 ? rubF(sum(a)) : `от ${rubF(T.min)} (${rubF(T.rate)}/м²)`;
    const n = a && a >= 10 ? `${rubF(T.rate)} за м², не меньше ${rubF(T.min)} (как за ${T.minArea} м²)${a * T.rate < T.min ? ' — действует минимум' : ''}. Оплата до начала работы. Если по плану площадь окажется другой, пересчитаем по той же ставке и согласуем с вами.`
      : `${rubF(T.rate)} × площадь, не меньше ${rubF(T.min)} (как за ${T.minArea} м²). Укажите площадь — сумма появится сразу. Оплата до начала работы.`;
    $('szSumL').textContent = l; $('szSumV').textContent = v; $('szSumN').textContent = n;
    $('szSumL2').textContent = l; $('szSumV2').textContent = v; $('szSumN2').textContent = n;
  }
  $('szArea').addEventListener('input', price);
  function check(n) {
    if (n === 0) {
      const a = val('szArea').trim(), an = num(a);
      if (!a || an === null || an < 10 || an > 3000) return setErr('szAreaErr', a ? 'Площадь — число от 10 до 3000 м², например 62.' : 'Укажите площадь, м² — по ней считается сумма. Точно не знаете — напишите примерно, уточним по плану.', $('szArea'));
      setErr('szAreaErr', '', $('szArea'));
      if (!files.plans.length) { $('szPlanErr').textContent = 'Добавьте план с размерами — без него смету не посчитать. Нет плана — измерьте стены рулеткой и сфотографируйте листок.'; $('szFilePlan').focus(); return false; }
      $('szPlanErr').textContent = '';
    }
    if (n === 1) {
      if (!mode) return setErr('szModeErr', 'Выберите: у вас есть проект или проекта нет.', document.querySelector('input[name=szMode]'));
      if (mode === 'project' && !files.project.length) { $('szProjErr').textContent = 'Добавьте файлы проекта (PDF или изображения листов) — или выберите «Проекта нет».'; $('szFileProj').focus(); return false; }
      if (mode === 'answers' && !rooms().length) { $('szRoomsErr').textContent = 'Отметьте хотя бы один тип помещений — иначе считать нечего.'; return false; }
      $('szRoomsErr').textContent = '';
    }
    return true;
  }
  function show(n, focus) {
    step = n;
    document.querySelectorAll('#szw .panel').forEach(p => { p.hidden = +p.dataset.step !== step; });
    $('szStep').textContent = step === DONE ? 'Готово' : `Шаг ${step + 1} из ${LAST + 1}`;
    $('szName').textContent = NAMES[step] || 'Отправка';
    $('szSeg').innerHTML = NAMES.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('');
    $('szLive').textContent = $('szStep').textContent + ': ' + $('szName').textContent;
    $('szNav').hidden = step === DONE;
    $('szNav').classList.toggle('last', step === LAST);
    $('szPrev').hidden = step === 0;
    $('szNext').hidden = step >= LAST;
    if (step === LAST) { price(); recap(); }
    if (focus) {
      const h = document.querySelector(`.panel[data-step="${step}"] h2`);
      if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
      $('szProg').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (ready) save();
  }
  $('szNext').onclick = () => { if (check(step)) show(Math.min(LAST, step + 1), true); };
  $('szPrev').onclick = () => show(Math.max(0, step - 1), true);

  // ── сбор данных
  function rooms() {
    return [...document.querySelectorAll('#szRooms .sz-rt')].filter(b => b.querySelector('[data-on]').checked).map(b => {
      const g = f => b.querySelector(`[data-f=${f}]`).value;
      return { type: b.dataset.type, label: LBL(ROOM_TYPES, b.dataset.type), count: +g('count') || 1, walls: g('walls'), floor: g('floor'), ceiling: g('ceiling') };
    });
  }
  const radio = name => { const r = document.querySelector(`input[name=${name}]:checked`); return r ? r.value : 'unknown'; };
  function collect() {
    const a = num(val('szArea'));
    const sm = { mode };
    if (mode === 'answers') {
      Object.assign(sm, { rooms: rooms(), electric: radio('szElec'), plumbing: radio('szPlumb'), height: $('szHUnk').checked ? null : num(val('szH')), heightUnknown: $('szHUnk').checked,
        state: val('szState'), note: val('szNoteA').trim() });
    } else sm.note = val('szNoteP').trim();
    return {
      meta: Object.assign({ created: new Date().toISOString().slice(0, 10), source: 'site-smeta-brief', version: 1, service: 'smeta' }, TEST ? { test: true } : {}),
      client: { name: val('szName1').trim(), phone: val('szPhone').trim(), email: val('szEmail').trim(), contact: val('szPhone').trim() ? 'телефон / WhatsApp' : 'почта',
        // редакция согласия — та же, что у брифа на проект и на soglasie/ (tools/gen-more-pages.js → LEGAL_ED)
        consent: { personalData: $('szConsent').checked, portfolio: false, edition: T.edition, at: new Date().toISOString() } },
      object: { type: 'квартира', area: a },
      smeta: sm,
      files: { plans: files.plans.map(f => f.name), project: files.project.map(f => f.name) }
    };
  }

  // ── черновик в браузере (файлы браузер не хранит — выбрать заново)
  const KEY = 'linea_smeta_draft1';
  const FIELDS = ['szArea', 'szH', 'szState', 'szNoteA', 'szNoteP', 'szName1', 'szPhone', 'szEmail'];
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const d = { v: 1, step: Math.min(step, LAST), mode, fields: {}, hUnk: $('szHUnk').checked, elec: radio('szElec'), plumb: radio('szPlumb'),
        rooms: rooms(), files: { plans: files.plans.length, project: files.project.length } };
      FIELDS.forEach(id => { d.fields[id] = val(id); });
      try {
        localStorage.setItem(KEY, JSON.stringify(d));
        const t = new Date();
        $('szSaved').textContent = '✓ Черновик сохранён · ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
      } catch (e) { $('szSaved').textContent = ''; }
    }, 300);
  }
  document.addEventListener('input', save); document.addEventListener('change', save);
  function restore() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!d || d.v !== 1) return 0;
    FIELDS.forEach(id => { if ($(id) && d.fields && d.fields[id] != null) $(id).value = d.fields[id]; });
    $('szHUnk').checked = !!d.hUnk; $('szH').disabled = !!d.hUnk;
    const set = (name, v) => { const r = document.querySelector(`input[name=${name}][value="${v}"]`); if (r) r.checked = true; };
    set('szElec', d.elec || 'yes'); set('szPlumb', d.plumb || 'yes');
    (d.rooms || []).forEach(r => {
      const b = document.querySelector(`#szRooms .sz-rt[data-type="${r.type}"]`); if (!b) return;
      b.querySelector('[data-on]').checked = true; b.querySelector('.sz-rt-f').hidden = false;
      [['count', r.count], ['walls', r.walls], ['floor', r.floor], ['ceiling', r.ceiling]].forEach(([f, v]) => { const s = b.querySelector(`[data-f=${f}]`); if (s && v != null) s.value = v; });
    });
    setMode(d.mode || '');
    const lost = d.files ? d.files.plans + d.files.project : 0;
    $('szDraft').hidden = false;
    $('szDraft').innerHTML = 'Черновик восстановлен.' + (lost ? ' <b>Файлы браузер не сохраняет — добавьте план и проект ещё раз.</b>' : '') + ' <button type="button" id="szReset">Начать заново</button>';
    $('szReset').onclick = () => { try { localStorage.removeItem(KEY); } catch (e) {} location.href = location.pathname + (TEST ? '?test=1' : ''); };
    return lost ? 0 : Number.isInteger(d.step) && d.step > 0 && d.step <= LAST ? d.step : 0;
  }

  // ── сводка перед отправкой: «так ли мы поняли» с переходом к шагу, где это исправить
  function recap() {
    const box = $('szRecap'), b = collect(), P = [];
    const a = b.object.area;
    P.push(['Квартира', `${a ? String(a).replace('.', ',') + ' м²' : 'площадь не указана'}; план — ${files.plans.length} ${files.plans.length === 1 ? 'файл' : 'файлов'}`, 0]);
    if (mode === 'project') P.push(['Проект', `есть, ${files.project.length} ${files.project.length === 1 ? 'файл' : 'файлов'}: считаем по его листам (чужой проект не проверяем и не исправляем)`, 1]);
    else if (mode === 'answers') {
      const s = b.smeta;
      P.push(['Проекта нет — «что где»', s.rooms.map(r => `${r.label}${r.count > 1 ? ' × ' + r.count : ''}: стены — ${LBL(WALLS, r.walls).toLowerCase()}, пол — ${LBL(FLOOR, r.floor).toLowerCase()}, потолок — ${LBL(CEIL, r.ceiling).toLowerCase()}`).join('; '), 1]);
      P.push(['Электрика / сантехника', `${LBL(YN, s.electric).toLowerCase()} / ${LBL(YN, s.plumbing).toLowerCase()}; высота потолков — ${s.height ? String(s.height).replace('.', ',') + ' м' : 'не указана'}; состояние — ${LBL(STATE, s.state).toLowerCase()}`, 1]);
    }
    P.push(['Допущения', mode === 'answers' ? 'Что неизвестно или «не знаю», считаем по типовому решению и помечаем в смете.' : 'Чего нет в проекте, считаем по типовому решению и помечаем в смете.', -1]);
    box.hidden = false;
    box.innerHTML = '<h3>Проверьте, так ли мы поняли</h3><p>Если что-то не так — исправьте сейчас, потом это сложнее.</p><ol>'
      + P.map(([k, v, s]) => `<li><b>${esc(k)}:</b> ${esc(v)}${s >= 0 ? ` <button type="button" class="btn ghost sm fix" data-go="${s}">Изменить</button>` : ''}</li>`).join('') + '</ol>';
    box.querySelectorAll('[data-go]').forEach(x => { x.onclick = () => show(+x.dataset.go, true); });
  }

  function checkContacts() {
    const ph = val('szPhone').trim(), em = val('szEmail').trim();
    $('szEmail').setAttribute('aria-invalid', 'false');
    if (!ph && !em) return setErr('szContactErr', 'Оставьте телефон или e-mail — иначе мы не сможем прислать смету.', $('szPhone'));
    if (ph && ph.replace(/\D/g, '').length < 10) return setErr('szContactErr', 'В телефоне меньше 10 цифр — проверьте номер.', $('szPhone'));
    setErr('szContactErr', '', $('szPhone'));
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) return setErr('szContactErr', 'Проверьте e-mail — в нём ошибка.', $('szEmail'));
    if (!$('szConsent').checked) return setErr('szConsentErr', 'Отметьте согласие на обработку данных — без него заказ отправить нельзя.', $('szConsent'));
    setErr('szConsentErr', '', $('szConsent'));
    return true;
  }
  $('szConsent').addEventListener('change', () => { if ($('szConsent').checked) setErr('szConsentErr', '', $('szConsent')); });

  function summaryText(b) {
    const L = [], s = b.smeta;
    L.push('Заказ сметы на материалы — ' + (b.client.name || 'клиент') + (b.client.phone ? ', ' + b.client.phone : '') + (b.client.email ? ', ' + b.client.email : ''));
    L.push('Квартира: ' + (b.object.area || '?') + ' м²' + (b.object.area ? '; сумма ' + rubF(sum(b.object.area)) : ''));
    if (s.mode === 'project') L.push('Есть проект клиента (' + b.files.project.length + ' файлов): считаем по его листам');
    else {
      L.push('Проекта нет. Что где:');
      (s.rooms || []).forEach(r => L.push('· ' + r.label + (r.count > 1 ? ' × ' + r.count : '') + ': стены — ' + LBL(WALLS, r.walls).toLowerCase() + '; пол — ' + LBL(FLOOR, r.floor).toLowerCase() + '; потолок — ' + LBL(CEIL, r.ceiling).toLowerCase()));
      L.push('Электрика: ' + LBL(YN, s.electric).toLowerCase() + '; сантехника: ' + LBL(YN, s.plumbing).toLowerCase() + '; потолки: ' + (s.height ? s.height + ' м' : 'не знаю') + '; состояние: ' + LBL(STATE, s.state).toLowerCase());
    }
    if (s.note) L.push('Что учесть: ' + s.note.replace(/\n+/g, ' / '));
    L.push('Файлы: план ' + b.files.plans.length + (b.files.project.length ? ', проект ' + b.files.project.length : ''));
    return L.join('\n');
  }

  // ── архив: brief.json + brief.txt + plan/ + proekt/ (изображения ужимаются, PDF/DWG/HEIC — как есть). ZIP без сжатия, имена в UTF-8
  async function shrink(f, max) {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || !window.createImageBitmap) return new Uint8Array(await f.arrayBuffer());
    try {
      const bmp = await createImageBitmap(f), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
      return new Uint8Array(await blob.arrayBuffer());
    } catch (e) { return new Uint8Array(await f.arrayBuffer()); }
  }
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(entries) {
    const enc = new TextEncoder(), parts = [], central = [];
    let off = 0;
    const now = new Date(), dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)), dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate());
    for (const e of entries) {
      const name = enc.encode(e.name), data = e.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    }
    const csize = central.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }
  const safe = s => String(s).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
  async function makeArchive(b) {
    const enc = new TextEncoder(), list = [];
    list.push({ name: 'brief.json', data: enc.encode(JSON.stringify(b, null, 2)) });
    list.push({ name: 'brief.txt', data: enc.encode(summaryText(b)) });
    const put = async (arr, dir, max) => { let k = 0; for (const f of arr) list.push({ name: dir + '/' + String(++k).padStart(2, '0') + '-' + safe(f.name.replace(/\.(png|webp)$/i, '.jpg')), data: await shrink(f, max) }); };
    await put(files.plans, 'plan', 1800);
    if (mode === 'project') await put(files.project, 'proekt', 2600);   // листы проекта ужимаем слабее: мелкие размеры и подписи должны читаться
    const who = safe((b.client.name || 'klient').trim().replace(/\s+/g, '-'));
    return new File([zip(list)], `LINEA-smeta-${who}-${b.meta.created}.zip`, { type: 'application/zip' });
  }
  const sizeText = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' КБ' : (n / 1048576).toFixed(1) + ' МБ';
  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const say = (html, bad) => { const u = $('szUp'); u.hidden = false; u.style.color = bad ? '#e8a87c' : ''; u.innerHTML = html; };
  function upload(f, b) {
    return new Promise(resolve => {
      const fd = new FormData();
      fd.append('brief', f, f.name);
      fd.append('json', JSON.stringify(b));
      fd.append('website', val('szHp'));
      if (TEST) fd.append('test', '1');
      const x = new XMLHttpRequest();
      x.open('POST', API + 'brief.php');
      x.timeout = 20 * 60 * 1000;
      const bar = $('szBar').firstChild;
      x.upload.onprogress = e => { if (!e.lengthComputable) return; const p = Math.round(e.loaded / e.total * 100); bar.style.width = p + '%'; say('Отправляю: ' + p + ' % из ' + sizeText(e.total) + '. Не закрывайте страницу.'); };
      x.onload = () => { let r = null; try { r = JSON.parse(x.responseText); } catch (e) {} resolve({ code: x.status, r }); };
      x.onerror = x.ontimeout = x.onabort = () => resolve({ code: 0, r: null });
      x.send(fd);
    });
  }
  // true — дальше ничего не делать (принят или ошибка, которую исправит сам клиент); false — запасной путь (архив)
  async function sendToStudio(f, b) {
    $('szBar').hidden = false; $('szBar').firstChild.style.width = '0';
    let res = await upload(f, b);
    if (res.code === 0 || res.code === 502 || res.code === 503 || res.code === 504) {
      say('Связь прервалась — пробую ещё раз…');
      await new Promise(r => setTimeout(r, 3000));
      res = await upload(f, b);
    }
    if (res.code === 200 && res.r && res.r.ok) {
      $('szBar').firstChild.style.width = '100%';
      say('✓ Заказ принят, <b>№ ' + esc(res.r.number) + '</b>. Открываю страницу заказа…');
      try { localStorage.removeItem(KEY); localStorage.setItem('linea_last_order', res.r.orderUrl); } catch (e) {}
      setTimeout(() => { location.href = '../../' + res.r.orderUrl; }, 900);
      return true;
    }
    $('szBar').hidden = true;
    if (res.r && res.r.error && res.code >= 400 && res.code < 500 && ![403, 404, 405].includes(res.code)) { say(esc(res.r.error), true); return true; }
    return false;
  }

  let archive = null;
  if (API) $('szSend').textContent = 'Отправить заказ сметы';
  $('szSend').onclick = async () => {
    if (!checkContacts()) return;
    const btn = $('szSend'), old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Собираю…';
    try {
      const b = collect();
      const f = archive = await makeArchive(b);
      if (f.size > T.maxMb * 1048576) { say('Файлы весят ' + sizeText(f.size) + ' — больше ' + T.maxMb + ' МБ. Уберите часть листов или пришлите их отдельно в WhatsApp.', true); return; }
      let fallback = false;
      if (API) {
        btn.textContent = 'Отправляю…';
        if (await sendToStudio(f, b)) return;
        fallback = true;
      }
      manual(b, fallback);
    } finally { btn.disabled = false; btn.textContent = old; }
  };
  // запасной путь: скачать архив и отправить самому
  function manual(b, fallback) {
    const text = summaryText(b);
    $('szWa').href = 'https://wa.me/79257338640?text=' + encodeURIComponent(text.slice(0, 1800));
    $('szMail').href = 'mailto:optteem@mail.ru?subject=' + encodeURIComponent('Заказ сметы на материалы — ' + (b.client.name || 'клиент')) + '&body=' + encodeURIComponent(text.slice(0, 1600) + '\n\nАрхив приложу к письму.');
    $('szDl').onclick = () => { if (archive) saveBlob(archive, archive.name); };
    if (fallback) $('szManual').insertAdjacentHTML('afterbegin', '<b>Через сайт отправить не получилось.</b> ');
    show(DONE, true);
  }

  const start = restore();
  price();
  show(start, false);
  ready = true;
})();
