// LINEA · бриф: три шага + отправка (решение Александра 31.10.2026 — «план, референсы, словами — и всё»)
//   1. План квартиры — файл или камера, площадь (обязательно — по ней считается сумма), «плана нет»
//   2. Что нравится — свои картинки или ♥ на кадрах галереи (assets/refs/refs.json)
//   3. Расскажите словами — одно поле, 🎤 (Web Speech API), чипы-заготовки; подробности (помещения, стиль…) — под «Добавить подробности»
//   +  необязательно (09.11.2026 — после «словами»): «Жизнь в квартире» (life), «Двери, свет и электрика» (tech) и «Дом и ремонт» (home) — каталоги js/brief-life.js
//   Единая шкала «Шаг N из 7»: пять шагов с вопросами идут по порядку, три необязательных помечены в названии и пунктиром на полосе.
//   4. Контакты, сводка из 5–6 пунктов для проверки, согласие, цена по площади, что дальше → отправка
// Формат заказа прежний: архив brief.json + brief.txt + plan/* + referensy/* (+ referensy-galereya.txt). brief.json читают
// api/brief.php, tools/brief-intake.js и gost-draft tools/site-brief.js — поля collect() сохранены (rooms может быть пустым).
// Где есть приёмник (<meta name="linea-api" content="api/">, её вставляет tools/site-rebase.js) и соединение защищено (https),
// архив уходит на api/brief.php → номер заказа → order.html. Иначе (GitHub Pages, http) — «Поделиться» / скачать и отправить
// самому в WhatsApp или на почту; этот путь — и запасной при ошибке сети. Исключения: ?test=1 (заказ тестовый) и localhost.
// Ставки и «что дальше» — из tools/site-shell.js → TERMS (в brief.html их переносит tools/sync-static-nav.js).
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const TEST = qs.get('test') === '1';
  const SECURE = location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const API = (SECURE || TEST) ? ((document.querySelector('meta[name="linea-api"]') || {}).content || '') : '';
  const MAX_MB = 100;
  const NAMES = ['План квартиры', 'Что нравится', 'Расскажите словами', 'Жизнь в квартире', 'Двери, свет и электрика', 'Дом и ремонт', 'Куда прислать проект'];
  // шаги LIFE, TECH и HOME необязательны и идут после главного «словами» (09.11.2026): быт, двери и электрика, вопросы прораба — js/brief-life.js
  const STORY = 2, LIFE = 3, TECH = 4, HOME = 5, SEND = 6, DONE = 7;
  const L = window.LineaLife, H = window.LineaHome, TE = window.LineaTech;
  const OPTIONAL = [LIFE, TECH, HOME];
  // ставки — из TERMS (sync-static-nav.js пишет <script id="briefTerms">); запасные значения — на случай старой копии страницы
  let T = { packs: [{ key: 'proekt', name: 'Проект с визуализациями', rate: 2000, min: 80000 }], minArea: 40 };
  try { const el = $('briefTerms'); if (el) T = JSON.parse(el.textContent); } catch (e) {}
  // стили — только для «подробностей» и прихода со страницы стиля (brief.html?style=japandi); ключи читает site-brief.js
  const STYLES = [['studio', 'на усмотрение студии'], ['japandi', 'Джапанди'], ['scandi', 'Скандинавский'], ['minimal', 'Минимализм'], ['modern', 'Современный'],
    ['neoclassic', 'Неоклассика'], ['loft', 'Лофт'], ['retro', 'Ретро, середина века'], ['chalet', 'Загородный, шале']];
  const ROOM_TYPES = [['living-kitchen', 'Гостиная-кухня'], ['living', 'Гостиная'], ['kitchen', 'Кухня'], ['dining', 'Столовая'], ['bedroom', 'Спальня'], ['kids', 'Детская'],
    ['cabinet', 'Кабинет'], ['wardrobe', 'Гардеробная'], ['bathroom', 'Санузел'], ['hallway', 'Прихожая'], ['hall', 'Холл / коридор'], ['storage', 'Кладовая / котельная'],
    ['gym', 'Спортзал'], ['garage', 'Гараж'], ['veranda', 'Веранда / терраса'], ['balcony', 'Балкон / лоджия']];
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const val = id => ($(id) ? $(id).value : '');
  const num = s => { const n = parseFloat(String(s == null ? '' : s).replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
  const kind = () => 'квартира';   // только квартиры (решение 06.11.2026); поле object.type остаётся для сервера
  const pack = () => T.packs[0].key;   // пакет один (31.10.2026): визуализации входят в цену

  let step = 0, ready = false;
  const files = { plans: [], photos: [], now: [] };   // File → в архив; в черновике только имена (now — фото «как сейчас», шаг HOME)
  const liked = new Set();                   // id кадров галереи
  $('prog').hidden = false; $('nav').hidden = false;
  // прогресс шагов с вопросами «прилипает» под шапкой сайта: её высота разная на телефоне и компьютере
  const hdrH = () => { const h = document.querySelector('header.site'); document.documentElement.style.setProperty('--hdrH', (h ? h.offsetHeight : 0) + 'px'); };
  hdrH(); addEventListener('resize', hdrH);

  // ── шаги
  function show(n, focus) {
    step = n;
    document.querySelectorAll('#wiz .panel').forEach(p => { p.hidden = +p.dataset.step !== step; });
    const opt = OPTIONAL.includes(step);
    $('progStep').textContent = step === DONE ? 'Готово' : `Шаг ${step + 1} из ${SEND + 1}`;
    $('progName').textContent = (NAMES[step] || 'Отправка') + (opt ? ' · необязательно' : '');
    $('progSeg').innerHTML = Array.from({ length: SEND + 1 }, (_, i) => `<i class="${OPTIONAL.includes(i) ? 'opt ' : ''}${i <= step ? 'on' : ''}"></i>`).join('');
    $('progLen').textContent = step < LIFE ? 'Основное — около 5 минут. Дальше три необязательных блока вопросов: их можно пройти сейчас или оставить на потом.'
      : opt ? 'Основное уже готово. Эти вопросы необязательны: ответьте на сколько хочется — остальное решим вместе на обмере. Черновик сохраняется.'
      : step === SEND ? 'Остался последний шаг: контакты и согласие.' : '';
    $('stepLive').textContent = $('progStep').textContent + ': ' + $('progName').textContent;
    $('nav').hidden = step === DONE;
    $('nav').classList.toggle('last', step === SEND);
    $('prev').hidden = step === 0;
    document.body.classList.toggle('stepped', step > 0);
    $('next').hidden = step >= SEND;
    $('next').textContent = step === HOME ? 'К отправке →' : 'Дальше →';
    $('skipNote').textContent = step === 1 ? 'Ничего не подходит — просто нажмите «Дальше».' : opt ? 'Можно ответить на часть вопросов или нажать «Пропустить шаг».'
      : step === STORY ? 'Можно коротко: пара фраз уже помогает. Дальше — три необязательных шага с вопросами, их можно пропустить.' : '';
    if (step === SEND) { price(); recap(); }
    if (focus) {
      const h = document.querySelector(`.panel[data-step="${step}"] h2`);
      if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
      $('prog').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (ready) save();
  }
  function setErr(id, msg, field) {
    $(id).textContent = msg || '';
    if (field) field.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg && field) field.focus();
    return !msg;
  }
  function check(n) {
    if (n !== 0) return true;
    const a = val('objArea').trim(), an = num(a);
    // площадь обязательна (01.11.2026): по ней сумма видна сразу на странице заказа
    if (!a || an === null || an < 10 || an > 3000) return setErr('areaErr', a ? 'Площадь — число от 10 до 3000 м², например 62.' : 'Укажите площадь, м² — по ней считается сумма. Точно не знаете — напишите примерно, уточним по плану.', $('objArea'));
    setErr('areaErr', '', $('objArea'));
    if (!files.plans.length && !$('needSurvey').checked) {
      $('noPlanBox').open = true;
      $('planErr').textContent = 'Добавьте план — или отметьте ниже «Плана нет», и размеры снимем мы.';
      $('filePlan').focus();
      return false;
    }
    $('planErr').textContent = '';
    return true;
  }
  $('next').onclick = () => { if (check(step)) show(Math.min(SEND, step + 1), true); };
  $('prev').onclick = () => show(Math.max(0, step - 1), true);
  $('needSurvey').addEventListener('change', () => { if ($('needSurvey').checked) $('planErr').textContent = ''; });

  // ── файлы: план (шаг 1) и свои картинки (шаг 2)
  const isImg = f => /^image\/(jpeg|png|webp|gif)$/.test(f.type);
  function fileZone(inputs, labelId, listId, bucket, title) {
    const list = $(listId);
    const take = fl => { for (const f of fl) if (f && f.size) files[bucket].push(f); paint(); save(); };
    inputs.forEach(id => { $(id).addEventListener('change', e => { take(e.target.files); e.target.value = ''; }); });
    const lab = labelId && $(labelId);
    if (lab) {
      ['dragenter', 'dragover'].forEach(t => lab.addEventListener(t, e => { e.preventDefault(); lab.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(t => lab.addEventListener(t, () => lab.classList.remove('over')));
      lab.addEventListener('drop', e => { e.preventDefault(); take(e.dataTransfer.files); });
    }
    function paint() {
      list.querySelectorAll('img').forEach(i => URL.revokeObjectURL(i.src));
      list.innerHTML = files[bucket].map((f, i) => `<li>${isImg(f) ? `<img src="${URL.createObjectURL(f)}" alt="">` : esc(f.name.slice(0, 28))}`
        + `<button type="button" data-i="${i}" aria-label="Убрать файл ${esc(f.name)}"><i aria-hidden="true">✕</i></button></li>`).join('');
      list.querySelectorAll('button').forEach(b => { b.onclick = () => { files[bucket].splice(+b.dataset.i, 1); paint(); save(); }; });
      if (bucket === 'plans') {
        $('planBtnT').textContent = files.plans.length ? 'Добавить ещё страницу' : 'Загрузить план';
        if (files.plans.length) $('planErr').textContent = '';
      }
      list.setAttribute('aria-label', title + ': ' + files[bucket].length);
    }
  }
  fileZone(['filePlan', 'camPlan'], 'dropPlan', 'planList', 'plans', 'Загружено страниц плана');
  fileZone(['fileRefs'], null, 'refList', 'photos', 'Ваших картинок');
  fileZone(['fileNow'], null, 'nowList', 'now', 'Фото квартиры');

  // ── галерея: нажатие = нравится. Сначала по одному кадру каждого стиля, остальные — «Показать ещё»
  const gal = $('gal');
  let REFS = [];
  function paintCount() {
    const n = liked.size;
    $('galCount').innerHTML = n ? `Отмечено: <b>${n}</b>${n < 6 ? ' — можно ещё' : ''}` : 'Отмечено: 0';
  }
  fetch('assets/refs/refs.json?v=2').then(r => r.json()).then(list => {
    const seen = new Set(), first = [], rest = [];
    for (const m of list) { if (!seen.has(m.styleKey) && first.length < 9) { seen.add(m.styleKey); first.push(m); } else rest.push(m); }
    REFS = first.concat(rest);
    gal.innerHTML = REFS.map((m, i) => `<button type="button" data-id="${esc(m.id)}" aria-pressed="${liked.has(m.id)}" aria-label="${esc(m.style)}, ${esc(m.room)}"${i >= 9 ? ' hidden' : ''}>`
      + `<img src="${esc(m.src)}" alt="" loading="lazy" decoding="async"></button>`).join('');
    $('galMore').hidden = REFS.length <= 9;
    paintCount();
  }).catch(() => { gal.innerHTML = '<p class="hint">Кадры не загрузились — загрузите свои картинки выше.</p>'; });
  gal.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.dataset.id, on = !liked.has(id);
    if (on) liked.add(id); else liked.delete(id);
    b.setAttribute('aria-pressed', String(on));
    paintCount(); save();
  });
  $('galMore').onclick = () => {
    const hid = [...gal.querySelectorAll('button[hidden]')];
    hid.slice(0, 9).forEach(b => { b.hidden = false; });
    if (hid.length <= 9) $('galMore').hidden = true;
  };

  // ── «Жизнь в квартире» и «Дом и ремонт»: каталоги из js/brief-life.js; «Пропустить» помечает шаг пропущенным
  let lifeSkipped = false, homeSkipped = false;
  let techSkipped = false;
  if (L) {
    L.mount($('lifeBox'), () => { lifeSkipped = false; save(); });
    $('skipLife').onclick = () => { lifeSkipped = !L.answered(); show(TECH, true); };
  } else { $('lifeBox').hidden = true; $('skipLife').textContent = 'Дальше'; $('skipLife').onclick = () => show(TECH, true); }
  if (TE) {
    TE.mount($('techBox'), () => { techSkipped = false; save(); });
    $('skipTech').onclick = () => { techSkipped = !TE.answered(); show(HOME, true); };
  } else { $('techBox').hidden = true; $('skipTech').textContent = 'Дальше'; $('skipTech').onclick = () => show(HOME, true); }
  if (H) {
    H.mount($('homeBox'), () => { homeSkipped = false; save(); });
    $('skipHome').onclick = () => { homeSkipped = !H.answered(); show(SEND, true); };
  } else { $('homeBox').hidden = true; $('skipHome').textContent = 'Дальше'; $('skipHome').onclick = () => show(SEND, true); }

  // ── рассказ: чипы-заготовки («Кто живёт: …» отдельной строкой)
  const story = $('story');
  const CHIPS = ['Кто живёт', 'Что мешает сейчас', 'Что точно нужно', 'Бюджет', 'Сроки'];
  $('chips').insertAdjacentHTML('beforeend', CHIPS.map(c => `<button type="button" data-p="${c}">+ ${c}</button>`).join(''));
  const lineRe = p => new RegExp('^[ \\t]*' + p + ':[ \\t]*(.*)$', 'im');
  function paintChips() {
    $('chips').querySelectorAll('button').forEach(b => {
      const m = story.value.match(lineRe(b.dataset.p)), ok = !!(m && m[1].trim());
      b.classList.toggle('ok', ok);
      b.textContent = (ok ? '✓ ' : '+ ') + b.dataset.p;
      b.setAttribute('aria-label', b.dataset.p + (ok ? ' — уже есть в тексте' : ' — добавить заготовку в текст'));
    });
  }
  $('chips').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const p = b.dataset.p, m = story.value.match(lineRe(p));
    if (m) { const end = story.value.indexOf(m[0]) + m[0].length; story.focus(); story.setSelectionRange(end, end); return; }
    const v = story.value.replace(/\s+$/, '');
    story.value = (v ? v + '\n' : '') + p + ': ';
    story.focus(); story.setSelectionRange(story.value.length, story.value.length);
    paintChips(); save();
  });
  story.addEventListener('input', paintChips);

  // ── голос: Web Speech API (Chrome, Edge, Яндекс Браузер, Safari 14.5+). Нет API — подсказка про 🎤 на клавиатуре
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const REC_ERR = {
    'not-allowed': 'Микрофон не разрешён: нажмите на замок в адресной строке и разрешите. Или 🎤 на клавиатуре телефона.',
    'service-not-allowed': 'Микрофон не разрешён: нажмите на замок в адресной строке и разрешите. Или 🎤 на клавиатуре телефона.',
    'no-speech': 'Не расслышали. Говорите ближе к микрофону и нажмите ещё раз.',
    'audio-capture': 'Микрофон не найден — можно написать текстом.',
    'network': 'Распознаванию речи нужен интернет — проверьте связь или напишите текстом.',
    'language-not-supported': 'Браузер не распознаёт русскую речь — напишите текстом или откройте страницу в Chrome.',
    other: 'Голосовой ввод не сработал — нажмите ещё раз или напишите текстом.'
  };
  let rec = null;
  function micState(on, msg) {
    $('mic').classList.toggle('rec', on);
    $('mic').setAttribute('aria-pressed', String(on));
    $('micT').textContent = on ? 'Остановить' : 'Надиктовать';
    $('micState').textContent = msg || (on ? 'Слушаю… говорите' : '');
  }
  $('mic').onclick = () => {
    if (!SR) { micState(false, 'Здесь голосовой ввод не работает: нажмите 🎤 на клавиатуре телефона или напишите текстом.'); story.focus(); return; }
    if (rec) { try { rec.stop(); } catch (e) {} return; }
    const r = rec = new SR(); r.lang = 'ru-RU'; r.continuous = true; r.interimResults = true;
    const base = story.value ? story.value.replace(/\s*$/, ' ') : '';
    let fin = '', err = '';
    r.onresult = ev => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) fin += t.trim() + ' '; else interim += t;
      }
      story.value = base + fin + interim;
      paintChips();
    };
    r.onerror = ev => { if (ev.error !== 'aborted') err = REC_ERR[ev.error] || REC_ERR.other; };
    r.onend = () => { story.value = story.value.replace(/[ \t]+$/, ''); if (rec === r) rec = null; micState(false, err || (story.value.trim() ? 'Готово. Можно дополнить — нажмите снова.' : '')); paintChips(); save(); };
    try { r.start(); micState(true); } catch (e) { rec = null; micState(false, REC_ERR.other); }
  };

  // ── подробности (необязательно): помещения, высота, состояние, адрес, стиль, класс материалов, ссылки
  $('stKey').innerHTML = STYLES.map(s => `<option value="${s[0]}">${s[1]}</option>`).join('');
  const roomsEl = $('rooms');
  function addRoom(r) {
    r = r || {};
    const row = document.createElement('div');
    row.className = 'room-row'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Помещение');
    row.innerHTML = `<select class="r-type" aria-label="Помещение">${ROOM_TYPES.map(t => `<option value="${t[0]}"${t[0] === r.type ? ' selected' : ''}>${t[1]}</option>`).join('')}</select>`
      + `<input type="text" inputmode="decimal" class="r-w" placeholder="шир." aria-label="Ширина, м" value="${esc(r.width || '')}">`
      + `<input type="text" inputmode="decimal" class="r-l" placeholder="дл." aria-label="Длина, м" value="${esc(r.length || '')}">`
      + `<button class="x" type="button" aria-label="Убрать помещение">✕</button>`;
    row.querySelector('.x').onclick = () => { row.remove(); save(); };
    roomsEl.appendChild(row);
    return row;
  }
  $('addRoom').onclick = () => { addRoom().querySelector('select').focus(); };

  // ── цена по площади (ставки из TERMS); сервер считает по своему config.php
  const rubF = n => Math.round(n).toLocaleString('ru-RU').replace(/ |\s/g, ' ') + ' ₽';
  function price() {
    const a = num(val('objArea')), P = T.packs;
    $('pk0n').textContent = P[0].name;
    if (a && a >= 10) {
      $('priceLead').textContent = `Сумма за ${String(a).replace('.', ',')} м²`;
      $('pk0').textContent = rubF(Math.max(P[0].min, P[0].rate * a));
      $('priceNote').textContent = `${rubF(P[0].rate)} за м², визуализации входят в цену` + (a < T.minArea ? `; меньше ${T.minArea} м² — минимальный заказ` : '') + '. ' + (T.areaRecalc || '');
    } else {
      $('priceLead').textContent = 'Ставка за м²';
      $('pk0').textContent = rubF(P[0].rate) + '/м²';
      $('priceNote').textContent = `Минимальный заказ — как за ${T.minArea} м² (${rubF(P[0].min)}). Укажите площадь на первом шаге — сумма появится сразу.`;
    }
  }

  // ── разбор рассказа: строки-заготовки и ключевые слова → answers (их читает gost-draft tools/site-brief.js)
  function parseStory(t) {
    const line = p => { const m = t.match(lineRe(p)); return m ? m[1].trim() : ''; };
    const sents = t.split(/(?<=[.!?…])\s+|\n+/).map(x => x.replace(/^[^:\n]{2,25}:\s*/, '').trim()).filter(Boolean);
    const about = re => sents.filter(x => re.test(x)).join('. ').slice(0, 400);
    const W = w => new RegExp('(^|[^а-яё])(' + w + ')([^а-яё]|$)', 'i');
    return {
      household: line('Кто живёт') || about(/(живу|живём|живем|живут|муж|жена|дет[иейя]|реб[её]н|сын|доч|бабушк|дедушк)/i),
      pets: [W('кот|кота|коты|котов|кошка|кошки|котик|кошек').test(t) && 'кот', W('собака|собаки|собак|пёс|пес|щенок').test(t) && 'собака'].filter(Boolean).join(', '),
      wfh: about(/(работа[юе][а-яё]* из дома|удал[её]нк|кабинет|рабоч[а-яё]+ мест)/i),
      storage: about(/(хранен|гардероб|кладов|шкаф)/i),
      kitchen: about(/(кухн|остров|верхн[а-яё]* шкаф|открыт[а-яё]* полк|готов(им|ит|ить|лю))/i),
      sport: about(/(спорт|йог|трена|дорожк|пилатес|растяжк)/i),
      dislikes: line('Что мешает сейчас'),
      must: line('Что точно нужно'),
      budget: line('Бюджет'),
      timeline: line('Сроки'),
      notes: ''
    };
  }
  // ответы шага «Жизнь в квартире» дополняют answers.* там, где клиент сам ничего не написал (старые читатели брифа получают их без правок)
  function mergeLife(A) {
    for (const S of [L, H]) {
      if (!S || !S.answered()) continue;
      const X = S.answers();
      for (const k of Object.keys(X)) if (!A[k] || (Array.isArray(A[k]) && !A[k].length)) A[k] = X[k];
    }
    return A;
  }
  // бюджет на ремонт из шага «Дом и ремонт» → класс материалов по ₽/м² (середина вилки / площадь): до 20 тыс. — эконом, до 45 — бизнес
  const FINISH_MID = { '1': 700000, '2': 1500000, '35': 2750000, '35plus': 4500000 };
  function budgetClass(text) {
    if (val('qBudget')) return val('qBudget');
    const f = H && H.pick('plan', 'budFinish')[0], a = num(val('objArea'));
    if (f && FINISH_MID[f] && a) { const m2 = FINISH_MID[f] / a; return m2 < 20000 ? 'econom' : m2 < 45000 ? 'business' : 'premium'; }
    if (/эконом|недорог|скромн|бюджетн/i.test(text)) return 'econom';
    if (/премиум|без компромисс/i.test(text)) return 'premium';
    return 'business';
  }

  // ── сбор брифа (схема прежняя: meta, client, object, rooms, story, files, style, budget, answers)
  function collect() {
    const t = story.value.trim(), A = mergeLife(parseStory(t));
    const rooms = [...roomsEl.querySelectorAll('.room-row')].map(r => {
      const ty = r.querySelector('.r-type');
      return { name: ty.selectedOptions[0].textContent, type: ty.value, width: num(r.querySelector('.r-w').value), length: num(r.querySelector('.r-l').value) };
    });
    const key = val('stKey') || 'studio', st = STYLES.find(s => s[0] === key);
    return {
      meta: Object.assign({ created: new Date().toISOString().slice(0, 10), source: 'site-brief-simple', version: 3, package: pack() }, TEST ? { test: true } : {}),
      client: { name: val('cName').trim(), phone: val('cPhone').trim(), email: val('cEmail').trim(), contact: val('cPhone').trim() ? 'телефон / WhatsApp' : 'почта',
        // редакция согласия — та же дата, что на soglasie/ (tools/gen-more-pages.js → LEGAL_ED)
        consent: { personalData: $('cConsent').checked, portfolio: $('cPortfolio').checked, edition: '27.10.2026', at: new Date().toISOString() } },
      object: { type: kind(), address: val('objAddr').trim(), area: num(val('objArea')), ceilingHeight: num(val('objH')), state: val('objState'),
        needSurvey: $('needSurvey').checked && !files.plans.length },
      rooms,
      story: t,
      files: { plans: files.plans.map(f => f.name), photos: files.photos.map(f => f.name), now: files.now.map(f => f.name) },
      style: { key, title: st ? st[1] : key, byStudio: key === 'studio', colors: '', avoidColors: L && L.avoidColorsText ? L.avoidColorsText() : '', liked: [...liked], disliked: [],
        links: val('stRefs').split(/[\s,]+/).map(s => s.trim()).filter(s => /^https?:\/\//.test(s)) },
      budget: budgetClass(A.budget),
      answers: A,
      life: L ? L.out(lifeSkipped) : undefined,
      tech: TE ? TE.out(techSkipped) : undefined,
      home: H ? H.out(homeSkipped) : undefined
    };
  }

  // ── черновик в браузере (файлы браузер не хранит — выбрать заново)
  const KEY = 'linea_brief_draft3';
  const FIELDS = ['objArea', 'story', 'objH', 'objState', 'objAddr', 'stKey', 'qBudget', 'stRefs', 'cName', 'cPhone', 'cEmail'];
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const b = collect();
      const d = { v: 3, fields: {}, kind: kind(), pack: pack(), needSurvey: $('needSurvey').checked, liked: [...liked], rooms: b.rooms, step: Math.min(step, SEND), ds: 4,
        life: L ? L.out(false) : null, lifeSkipped, tech: TE ? TE.out(false) : null, techSkipped, home: H ? H.out(false) : null, homeSkipped, files: b.files };
      FIELDS.forEach(id => { d.fields[id] = val(id); });
      try {
        localStorage.setItem(KEY, JSON.stringify(d));
        if ($('draftNote').hidden) { $('draftNote').hidden = false; $('draftNote').textContent = 'Черновик сохраняется в этом браузере — можно закрыть и вернуться.'; }
        const t = new Date();
        $('savedMark').textContent = '✓ Черновик сохранён · ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
      } catch (e) { $('savedMark').textContent = ''; }
    }, 300);
  }
  document.addEventListener('input', save);
  document.addEventListener('change', save);
  function restore() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!d || d.v !== 3) return 0;
    FIELDS.forEach(id => { if ($(id) && d.fields && d.fields[id] != null) $(id).value = d.fields[id]; });
    $('needSurvey').checked = !!d.needSurvey;
    if (L && d.life) L.restore(d.life);
    if (TE && d.tech) TE.restore(d.tech);
    if (H && d.home) H.restore(d.home);
    lifeSkipped = !!d.lifeSkipped; techSkipped = !!d.techSkipped; homeSkipped = !!d.homeSkipped;
    // номера шагов в старых черновиках: без ds — 2 «словами», 3 «контакты»; ds 2 — 2 «жизнь», 3 «словами», 4 «контакты»;
    // ds 3 — 3 «жизнь», 4 «дом и ремонт», 5 «контакты» (шага «Двери, свет и электрика» ещё не было)
    if (!d.ds) d.step = { 2: STORY, 3: SEND }[d.step] ?? d.step;
    else if (d.ds === 2) d.step = { 2: LIFE, 3: STORY, 4: SEND }[d.step] ?? d.step;
    else if (d.ds === 3) d.step = { 4: HOME, 5: SEND }[d.step] ?? d.step;
    (d.liked || []).forEach(id => liked.add(id));
    (d.rooms || []).forEach(addRoom);
    if ((d.rooms || []).length || d.fields.objH || d.fields.objState || d.fields.objAddr) $('more').open = true;
    const lostPlans = d.files ? d.files.plans.length : 0, lost = lostPlans + (d.files ? d.files.photos.length + (d.files.now || []).length : 0);
    $('draftNote').hidden = false; $('savedMark').textContent = '✓ Черновик восстановлен';
    $('draftNote').innerHTML = 'Черновик восстановлен.' + (lost ? ' <b>Файлы браузер не сохраняет — добавьте план и картинки ещё раз.</b>' : '')
      + ' <button type="button" class="linklike" id="draftReset">Начать заново</button>';
    $('draftReset').onclick = () => { try { localStorage.removeItem(KEY); } catch (e) {} location.href = location.pathname + (TEST ? '?test=1' : ''); };
    // план пропал вместе с файлами — к первому шагу; иначе продолжаем с того же шага
    return lostPlans ? 0 : Number.isInteger(d.step) && d.step > 0 && d.step <= SEND ? d.step : 0;
  }
  const start = restore();
  const want = qs.get('style');
  if (want && STYLES.some(s => s[0] === want) && val('stKey') === 'studio') $('stKey').value = want;
  paintChips();

  // ── сводка перед отправкой (09.11.2026): 5–6 пунктов «так ли мы поняли» с переходом к шагу, где это исправить
  function recap() {
    const box = $('recap'); if (!box) return;
    const b = collect(), o = b.object, P = [];
    const lp = (S, g, k) => (S ? S.L(g, k).filter(Boolean) : []);
    const lc = a => a.map(x => x.toLowerCase());
    const cut = x => String(x || '').replace(/[.\s;,]+$/, '');
    const item = (title, text, go) => P.push({ title, text: cut(text), go });
    const house = [lp(H, 'house', 'type')[0], lp(H, 'house', 'year')[0] && 'год: ' + lc(lp(H, 'house', 'year'))[0], lp(H, 'house', 'floor')[0] && lp(H, 'house', 'floor')[0] + '-й этаж'].filter(Boolean);
    item('Квартира', [o.area ? String(o.area).replace('.', ',') + ' м²' : 'площадь не указана', b.files.plans.length ? 'план приложен' : o.needSurvey ? 'плана нет — нужен обмер' : 'план не приложен', house.join(', ')].filter(Boolean).join(' · '), 0);
    const la = L && L.answered() ? L.answers() : {};
    const who = [cut(la.household || b.answers.household), cut(la.pets || b.answers.pets) && 'животные: ' + cut(la.pets || b.answers.pets)].filter(Boolean).join('; ');
    item('Кто живёт', who || 'не указано — спросим', who ? LIFE : STORY);
    const look = [b.style.byStudio ? 'стиль — на усмотрение студии' : 'стиль: ' + b.style.title, b.style.liked.length ? 'отмечено кадров: ' + b.style.liked.length : '', b.files.photos.length ? 'своих картинок: ' + b.files.photos.length : ''].filter(Boolean).join(', ');
    const no = [b.style.avoidColors, b.answers.dislikes].filter(Boolean).join('; ');
    item('Что нравится и что нет', look + (no ? '. Не хотите: ' + no : ''), 1);
    const must = [b.answers.must, b.answers.kitchen && 'кухня: ' + b.answers.kitchen, b.answers.storage && 'хранение: ' + b.answers.storage, b.answers.wfh].filter(Boolean).map(cut).join('; ');
    item('Обязательно учесть', must || (b.story ? 'по вашему рассказу' : 'пока ничего — можно дописать в рассказе'), STORY);
    if (TE && TE.answered()) {
      const td = [lp(TE, 'doors', 'kind').length && 'двери: ' + lc(lp(TE, 'doors', 'kind')).map(x => x.replace(/:.*/, '')).join(', '), lp(TE, 'light', 'temp')[0] && 'свет: ' + lc(lp(TE, 'light', 'temp'))[0].replace(/:.*/, ''), lp(TE, 'smarthome', 'level')[0] && 'умный дом: ' + lc(lp(TE, 'smarthome', 'level'))[0].replace(/:.*/, ''), lp(TE, 'low', 'router')[0] && 'роутер: ' + lc(lp(TE, 'low', 'router'))[0]].filter(Boolean);
      item('Двери, свет и электрика', td.join('; ') || 'ответы сохранены', TECH);
    }
    const eng = [lp(H, 'power', 'kw')[0] && 'мощность ' + lp(H, 'power', 'kw')[0], lp(H, 'water', 'gas')[0] && 'газ: ' + lc(lp(H, 'water', 'gas'))[0], lc(lp(H, 'works', 'replan')).join(', '), lp(H, 'works', 'keep').length && 'оставляем: ' + lc(lp(H, 'works', 'keep')).join(', ')].filter(Boolean).join('; ');
    item('Дом и ремонт', eng || 'не заполнено — уточним на обмере', HOME);
    const when = [b.answers.timeline, b.answers.budget && 'бюджет: ' + b.answers.budget].filter(Boolean).join('; ');
    item('Сроки и бюджет', when || 'не указаны — обсудим до оплаты', HOME);
    const unk = [L, H].reduce((n, S) => n + (S ? S.out(false).unknown.length : 0), 0);
    box.hidden = false;
    box.innerHTML = '<h3>Проверьте, так ли мы поняли</h3><p>Если что-то не так — нажмите «Исправить», ответы сохранятся.</p><ol>'
      + P.map(x => `<li><b>${esc(x.title)}.</b> ${esc(x.text)} <button type="button" class="linklike fix" data-go="${x.go}">Исправить</button></li>`).join('') + '</ol>'
      + (unk ? `<p class="rk" style="margin:8px 0 0">«Не знаю» отмечено у ${unk} ${unk === 1 ? 'вопроса' : 'вопросов'} — их решим вместе с дизайнером или уточним на обмере.</p>` : '');
    box.querySelectorAll('[data-go]').forEach(btn => { btn.onclick = () => show(+btn.dataset.go, true); });
  }

  // ── отправка: проверка контактов → архив → приёмник или «Поделиться»
  function checkContacts() {
    const ph = val('cPhone').trim(), em = val('cEmail').trim();
    $('cEmail').setAttribute('aria-invalid', 'false');
    if (!ph && !em) return setErr('contactErr', 'Оставьте телефон или e-mail — иначе мы не сможем прислать проект.', $('cPhone'));
    if (ph && ph.replace(/\D/g, '').length < 10) return setErr('contactErr', 'В телефоне меньше 10 цифр — проверьте номер.', $('cPhone'));
    setErr('contactErr', '', $('cPhone'));
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) return setErr('contactErr', 'Проверьте e-mail — в нём ошибка.', $('cEmail'));
    if (!$('cConsent').checked) return setErr('consentErr', 'Отметьте согласие на обработку данных — без него бриф отправить нельзя.', $('cConsent'));
    setErr('consentErr', '', $('cConsent'));
    return true;
  }
  $('cConsent').addEventListener('change', () => { if ($('cConsent').checked) setErr('consentErr', '', $('cConsent')); });

  function summaryText(b) {
    const o = b.object, L = [];
    L.push('Бриф LINEA — ' + (b.client.name || 'клиент') + (b.client.phone ? ', ' + b.client.phone : '') + (b.client.email ? ', ' + b.client.email : ''));
    L.push('Объект: ' + o.type + (o.area ? ', ' + o.area + ' м²' : '') + (o.address ? ', ' + o.address : '') + (o.needSurvey ? ' — плана нет, нужен обмер' : ''));
    L.push('Пакет: ' + T.packs[0].name);
    if (o.state) L.push('Состояние: ' + o.state);
    if (o.ceilingHeight) L.push('Потолки: ' + o.ceilingHeight + ' м');
    if (b.rooms.length) L.push('Помещения: ' + b.rooms.map(r => r.name + (r.width && r.length ? ' ' + r.width + '×' + r.length + ' м' : '') + (r.level != null ? ' (' + r.level + ' эт.)' : '')).join('; '));
    if (b.story) L.push('Своими словами: ' + b.story.replace(/\n+/g, ' / '));
    if (b.life && b.life.text && b.life.text.length) { L.push('Жизнь в квартире:'); b.life.text.forEach(x => L.push('· ' + x)); }
    if (b.tech && b.tech.text && b.tech.text.length) { L.push('Двери, свет и электрика:'); b.tech.text.forEach(x => L.push('· ' + x)); }
    if (b.home && b.home.text && b.home.text.length) { L.push('Дом и ремонт:'); b.home.text.forEach(x => L.push('· ' + x)); }
    if (!b.style.byStudio) L.push('Стиль: ' + b.style.title);
    if (b.style.liked.length) L.push('Кадры галереи: нравится ' + b.style.liked.length);
    if (b.style.links.length) L.push('Ссылки: ' + b.style.links.join(' '));
    L.push('Файлы: план ' + b.files.plans.length + ', свои картинки ' + b.files.photos.length + (b.files.now.length ? ', фото квартиры ' + b.files.now.length : ''));
    return L.join('\n');
  }

  // ── архив: бриф + план + фото (фото ужимаются до 1600 px, PDF/DWG/HEIC — как есть). ZIP без сжатия, имена в UTF-8
  async function shrink(f) {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || !window.createImageBitmap) return new Uint8Array(await f.arrayBuffer());
    try {
      const bmp = await createImageBitmap(f), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
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
    const gl = REFS.filter(m => b.style.liked.includes(m.id)).map(m => '+ ' + m.style + ' · ' + m.room + ' (' + m.id + ')');
    if (gl.length) list.push({ name: 'referensy-galereya.txt', data: enc.encode(gl.join('\n')) });
    let k = 0;
    for (const f of files.plans) list.push({ name: 'plan/' + String(++k).padStart(2, '0') + '-' + safe(f.name.replace(/\.(png|webp)$/i, '.jpg')), data: await shrink(f) });
    k = 0;
    for (const f of files.photos) list.push({ name: 'referensy/' + String(++k).padStart(2, '0') + '-' + safe(f.name.replace(/\.(png|webp)$/i, '.jpg')), data: await shrink(f) });
    k = 0;
    for (const f of files.now) list.push({ name: 'foto-seychas/' + String(++k).padStart(2, '0') + '-' + safe(f.name.replace(/\.(png|webp)$/i, '.jpg')), data: await shrink(f) });
    const who = safe((b.client.name || 'klient').trim().replace(/\s+/g, '-'));
    return new File([zip(list)], `LINEA-brif-${who}-${b.meta.created}.zip`, { type: 'application/zip' });
  }
  const sizeText = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' КБ' : (n / 1048576).toFixed(1) + ' МБ';
  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const say = (html, bad) => { const u = $('upState'); u.hidden = false; u.style.color = bad ? '#e8a87c' : ''; u.innerHTML = html; };
  function upload(f, b) {
    return new Promise(resolve => {
      const fd = new FormData();
      fd.append('brief', f, f.name);
      fd.append('json', JSON.stringify(b));
      fd.append('website', val('hpWebsite'));
      if (TEST) fd.append('test', '1');
      const x = new XMLHttpRequest();
      x.open('POST', API + 'brief.php');
      x.timeout = 20 * 60 * 1000;                      // с телефона 50–100 МБ — это минуты
      const bar = $('upBar').firstChild;
      x.upload.onprogress = e => { if (!e.lengthComputable) return; const p = Math.round(e.loaded / e.total * 100); bar.style.width = p + '%'; say('Отправляю: ' + p + ' % из ' + sizeText(e.total) + '. Не закрывайте страницу.'); };
      x.onload = () => { let r = null; try { r = JSON.parse(x.responseText); } catch (e) {} resolve({ code: x.status, r }); };
      x.onerror = x.ontimeout = x.onabort = () => resolve({ code: 0, r: null });
      x.send(fd);
    });
  }
  // true — дальше ничего не делать (принят или ошибка, которую исправит сам клиент); false — запасной путь (архив)
  async function sendToStudio(f, b) {
    $('upBar').hidden = false; $('upBar').firstChild.style.width = '0';
    let res = await upload(f, b);
    if (res.code === 0 || res.code === 502 || res.code === 503 || res.code === 504) {   // обрыв связи — один повтор
      say('Связь прервалась — пробую ещё раз…');
      await new Promise(r => setTimeout(r, 3000));
      res = await upload(f, b);
    }
    if (res.code === 200 && res.r && res.r.ok) {
      $('upBar').firstChild.style.width = '100%';
      say('✓ Бриф принят, заказ <b>№ ' + esc(res.r.number) + '</b>. Открываю страницу заказа…');
      try { localStorage.removeItem(KEY); localStorage.setItem('linea_last_order', res.r.orderUrl); } catch (e) {}
      setTimeout(() => { location.href = res.r.orderUrl; }, 900);
      return true;
    }
    $('upBar').hidden = true;
    // 403 — приём закрыт (нет https): уходим на архив; остальные 4xx исправляет сам клиент (телефон, размер, частота)
    if (res.r && res.r.error && res.code >= 400 && res.code < 500 && ![403, 404, 405].includes(res.code)) { say(esc(res.r.error), true); return true; }
    return false;
  }

  let archive = null, lastBrief = null;
  if (API) $('send').textContent = 'Отправить бриф';
  // способ отправки показываем один: без приёмника (GitHub Pages, http) фраза «одной кнопкой» из блока «Что будет дальше» неверна — прячем её;
  // как уйдёт архив, скажет экран после «Собрать бриф» (текст там — про «Поделиться» и скачивание)
  if (!API) document.querySelectorAll('#next3 p').forEach(p => { if (/одной кнопкой/.test(p.textContent)) p.hidden = true; });
  $('send').onclick = async () => {
    if (!checkContacts()) return;
    const btn = $('send'), old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Собираю…';
    try {
      const b = lastBrief = collect();
      const f = archive = await makeArchive(b);
      if (f.size > MAX_MB * 1048576) { say('Файлы весят ' + sizeText(f.size) + ' — больше ' + MAX_MB + ' МБ. Уберите часть фото на шагах 1–2 или пришлите их отдельно в WhatsApp.', true); return; }
      const heic = files.plans.concat(files.photos, files.now).filter(x => /\.(heic|heif)$/i.test(x.name) || /heic|heif/i.test(x.type)).length;
      let fallback = false;
      if (API) {
        btn.textContent = 'Отправляю…';
        if (await sendToStudio(f, b)) return;
        fallback = true;
      }
      result(b, heic, fallback);
    } finally { btn.disabled = false; btn.textContent = old; }
  };
  // запасной путь: «Поделиться» на телефоне / скачать на компьютере
  function result(b, heic, fallback) {
    const text = summaryText(b), json = JSON.stringify(b, null, 2);
    $('summary').innerHTML = text.split('\n').map(l => { const i = l.indexOf(': '); return i > 0 ? '<div class="srow"><span>' + esc(l.slice(0, i)) + '</span><b>' + esc(l.slice(i + 2)) + '</b></div>' : '<div class="srow"><b>' + esc(l) + '</b></div>'; }).join('');
    $('mailto').href = 'mailto:optteem@mail.ru?subject=' + encodeURIComponent('Бриф на дизайн-проект — ' + (b.client.name || 'клиент')) + '&body=' + encodeURIComponent(text.slice(0, 1600) + '\n\nАрхив с планом и картинками приложу к письму.');
    $('waSend').href = 'https://wa.me/79257338640?text=' + encodeURIComponent(text.slice(0, 1800));
    $('copyBrief').onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(text + '\n\n' + json).then(() => { $('copyBrief').textContent = 'Скопировано ✓'; }, () => {}); };
    $('dl').onclick = () => saveBlob(new Blob([json], { type: 'application/json' }), 'brief.json');
    if (!(navigator.canShare && navigator.share)) {
      $('sendZip').textContent = 'Скачать архив брифа';
      $('sendMust').innerHTML = 'На компьютере архив <b>скачается в «Загрузки»</b> и сам к нам не уйдёт: пришлите файл в <a href="https://wa.me/79257338640" target="_blank" rel="noopener">WhatsApp на +7 925 733-86-40</a> или на <a href="mailto:optteem@mail.ru">optteem@mail.ru</a>.';
    }
    if (fallback) $('sendMust').insertAdjacentHTML('afterbegin', '<b>Через сайт отправить не получилось.</b> ');
    if (heic) { $('afterZip').hidden = false; $('afterZip').textContent = 'Фото HEIC (' + heic + ') уйдут как есть — если какое-то не откроется, попросим JPG.'; }
    try { localStorage.setItem('linea_brief', json); } catch (e) {}
    show(DONE, true);
  }
  const AFTER = $('afterZip').innerHTML;
  $('sendZip').onclick = async () => {
    const f = archive; if (!f) return;
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], title: 'Бриф LINEA', text: 'Бриф на дизайн-проект: ' + ((lastBrief && lastBrief.client.name) || '') }); }
      catch (e) { if (e.name === 'AbortError') { $('afterZip').hidden = false; $('afterZip').textContent = 'Отправка отменена — нажмите кнопку ещё раз.'; return; } saveBlob(f, f.name); }
    } else saveBlob(f, f.name);
    $('afterZip').innerHTML = AFTER; $('afterZip').hidden = false;
    $('zipInfo').textContent = f.name + ' · ' + sizeText(f.size);
  };

  show(start, false);
  ready = true;
})();
