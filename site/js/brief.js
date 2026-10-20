// LINEA · бриф-визард → brief.json + архив с файлами
// Сайт статический: приёма на сервере нет. Всё собирается в браузере клиента — бриф, план, фото и референсы уходят
// одним ZIP-архивом через «Поделиться» (WhatsApp / Telegram на телефоне) или скачиванием; черновик хранится в браузере.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const STEPS = ['Рассказ', 'Объект', 'План и фото', 'Что нравится', 'Вопросы', 'Контакты', 'Готово'];
  const LAST = STEPS.length - 1, FORM_LAST = LAST - 1;
  const STYLES = [
    { key: 'studio',  title: 'На усмотрение студии', note: 'подберём по вашим ответам', sw: ['#EDE7DC', '#C29A5B', '#8A8D80', '#3E3A34'] },
    { key: 'japandi', title: 'Джапанди', note: 'тёплый минимализм, дерево', sw: ['#EDE7DC', '#C8A97A', '#8A8D80', '#A67B5B'] },
    { key: 'scandi',  title: 'Скандинавский', note: 'светло, уютно, функционально', sw: ['#F2F0EA', '#D9BE93', '#9FB4A8', '#C96F4A'] },
    { key: 'minimal', title: 'Минимализм', note: 'чистая геометрия, микроцемент', sw: ['#ECECE8', '#C9BBA6', '#A9A9A3', '#6E6E68'] },
    { key: 'modern',  title: 'Современный', note: 'глубокие акценты, латунь, трек', sw: ['#E9E4DB', '#A97B4F', '#5B6B6D', '#C29A5B'] },
    { key: 'neoclassic', title: 'Неоклассика', note: 'молдинги, симметрия, ёлка', sw: ['#E6E2D8', '#B98A5C', '#8C97A3', '#CBB287'] },
    { key: 'loft',    title: 'Лофт', note: 'бетон, кирпич, металл', sw: ['#D8D3CA', '#9C6B54', '#8B5F3C', '#5E6B5B'] },
    { key: 'retro',   title: 'Ретро, середина века', note: 'орех, латунь, бархат, ар-деко', sw: ['#E8DCC4', '#7A4E2D', '#1F5A4A', '#C9A04A'] },
    { key: 'chalet',  title: 'Загородный, шале', note: 'дерево, камень, зелень, терракота', sw: ['#DECFB9', '#6A6C4A', '#254631', '#B0624A'] }
  ];
  const ROOM_TYPES = [
    ['living-kitchen', 'Гостиная-кухня'], ['living', 'Гостиная'], ['kitchen', 'Кухня'], ['dining', 'Столовая'],
    ['bedroom', 'Спальня'], ['kids', 'Детская'], ['cabinet', 'Кабинет'], ['wardrobe', 'Гардеробная'],
    ['bathroom', 'Санузел'], ['hallway', 'Прихожая'], ['hall', 'Холл / коридор'], ['storage', 'Кладовая / котельная'],
    ['gym', 'Спортзал'], ['garage', 'Гараж'], ['veranda', 'Веранда / терраса'], ['balcony', 'Балкон / лоджия']
  ];
  let step = 0, selStyle = 'studio';
  const files = { plans: [], photos: [] };          // File — в архив; в черновике хранятся только имена
  const refs = {};                                   // id галереи → 'like' | 'dislike'

  // ── шаги
  const stepsEl = $('steps');
  function renderSteps() {
    stepsEl.innerHTML = STEPS.map((t, i) => `<span class="${i === step ? 'on' : i < step ? 'done' : ''}">${i + 1}<em> из ${STEPS.length}</em> · ${t}</span>`).join('')
      + `<i class="progress"><b style="width:${Math.round((step / LAST) * 100)}%"></b></i>`;
    document.querySelectorAll('.panel').forEach(p => { p.hidden = +p.dataset.step !== step; });
    $('prev').style.visibility = step === 0 ? 'hidden' : 'visible';
    $('next').textContent = step === FORM_LAST ? 'Собрать бриф ✓' : 'Далее →';
    $('next').style.display = step === LAST ? 'none' : '';
    if (renderSteps.done) $('steps').scrollIntoView({ behavior: 'smooth', block: 'start' });   // к форме, не к заголовку страницы
    renderSteps.done = true;
  }
  $('next').onclick = () => {
    if (step === FORM_LAST && !val('cPhone').trim() && !val('cEmail').trim()) { $('needContact').hidden = false; $('cPhone').focus(); return; }   // без способа связи бриф бесполезен
    if (step === 0) autoFill(); if (step === FORM_LAST) buildResult(); step = Math.min(LAST, step + 1); renderSteps(); save(); };
  $('prev').onclick = () => { step = Math.max(0, step - 1); renderSteps(); };

  // ── дом: этажи, лестница, участок
  const isHouse = () => $('objType').value === 'дом';
  function houseUI() {
    document.querySelectorAll('.house-only').forEach(el => { el.hidden = !isHouse(); });
    document.querySelectorAll('.r-level').forEach(el => { el.hidden = !isHouse(); });
  }
  $('objType').addEventListener('change', houseUI);

  // ── помещения
  const roomsEl = $('rooms');
  function addRoom(name, type, w, l, level) {
    const row = document.createElement('div');
    row.className = 'room-row';
    row.innerHTML = `
      <input type="text" class="r-name" placeholder="Название" value="${(name || '').replace(/"/g, '&quot;')}">
      <select class="r-type">${ROOM_TYPES.map(t => `<option value="${t[0]}"${t[0] === type ? ' selected' : ''}>${t[1]}</option>`).join('')}</select>
      <input type="number" class="r-w" placeholder="шир., м" step="0.1" min="1" value="${w || ''}">
      <input type="number" class="r-l" placeholder="дл., м" step="0.1" min="1" value="${l || ''}">
      <select class="r-level" title="Этаж"><option value="1">1 эт.</option><option value="2"${level == 2 ? ' selected' : ''}>2 эт.</option><option value="3"${level == 3 ? ' selected' : ''}>3 эт.</option><option value="0"${level == 0 ? ' selected' : ''}>цоколь</option></select>
      <button class="x" type="button" title="Удалить">✕</button>`;
    row.querySelector('.x').onclick = () => { row.remove(); save(); };
    row.querySelector('.r-type').onchange = e => {
      const nameInp = row.querySelector('.r-name');
      if (!nameInp.value) nameInp.value = e.target.selectedOptions[0].textContent;
    };
    roomsEl.appendChild(row);
    houseUI();
  }
  $('addRoom').onclick = () => addRoom();

  // ── файлы: план и фото квартиры; свои референсы
  function fileZone(dropId, inputId, listId, bucket) {
    $(dropId).onclick = () => $(inputId).click();
    $(dropId).ondragover = e => { e.preventDefault(); };
    $(dropId).ondrop = e => { e.preventDefault(); take(e.dataTransfer.files); };
    $(inputId).onchange = e => take(e.target.files);
    function take(list) {
      for (const f of list) files[bucket].push(f);
      show();
      save();
    }
    function show() {
      $(listId).innerHTML = files[bucket].map((f, i) => `<span class="chip">${f.name.replace(/</g, '&lt;')} · ${Math.round(f.size / 1024)} КБ <button type="button" data-i="${i}" title="Убрать">✕</button></span>`).join('');
      $(listId).querySelectorAll('button').forEach(b => { b.onclick = () => { files[bucket].splice(+b.dataset.i, 1); show(); }; });
    }
  }
  fileZone('drop', 'files', 'filelist', 'plans');
  fileZone('dropRefs', 'filesRefs', 'reflist', 'photos');

  // ── стили (радиогруппа с клавиатурой)
  const stylesEl = $('styles');
  stylesEl.setAttribute('role', 'radiogroup');
  stylesEl.setAttribute('aria-label', 'Стиль интерьера');
  stylesEl.innerHTML = STYLES.map(s => `
    <div class="style-card${s.key === 'studio' ? ' sel' : ''}" data-key="${s.key}"
         role="radio" tabindex="${s.key === 'studio' ? '0' : '-1'}" aria-checked="${s.key === 'studio'}">
      <div class="sw">${s.sw.map(c => `<i style="background:${c}"></i>`).join('')}</div>
      <b>${s.title}</b><small>${s.note}</small>
    </div>`).join('');
  const pickStyle = card => {
    selStyle = card.dataset.key;
    stylesEl.querySelectorAll('.style-card').forEach(c => {
      const on = c === card;
      c.classList.toggle('sel', on);
      c.setAttribute('aria-checked', String(on));
      c.tabIndex = on ? 0 : -1;
    });
    save();
  };
  stylesEl.onclick = e => { const card = e.target.closest('.style-card'); if (card) pickStyle(card); };
  stylesEl.onkeydown = e => {
    const card = e.target.closest('.style-card'); if (!card) return;
    const all = [...stylesEl.querySelectorAll('.style-card')], i = all.indexOf(card);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = all[(i + 1) % all.length];
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = all[(i - 1 + all.length) % all.length];
    if (e.key === ' ' || e.key === 'Enter') next = card;
    if (!next) return;
    e.preventDefault(); pickStyle(next); next.focus();
  };
  const cardOf = key => stylesEl.querySelector(`.style-card[data-key="${key}"]`);

  // ── галерея референсов: визуализации проектов студии, «нравится / не нравится»
  const gal = $('refGallery');
  let REFS = [];
  fetch('assets/refs/refs.json').then(r => r.json()).then(list => {
    REFS = list;
    const styles = [...new Set(list.map(m => m.style))];
    $('refFilter').innerHTML = ['Все', ...styles].map((t, i) => `<button type="button" class="${i ? '' : 'on'}" data-s="${i ? t : ''}">${t}</button>`).join('');
    $('refFilter').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      $('refFilter').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      gal.querySelectorAll('.ref').forEach(f => { f.hidden = !!b.dataset.s && f.dataset.s !== b.dataset.s; });
    };
    gal.innerHTML = list.map(m => `
      <figure class="ref" data-id="${m.id}" data-s="${m.style}">
        <img src="${m.src}" alt="${m.style}, ${m.room}" loading="lazy">
        <figcaption>${m.style} · ${m.room}</figcaption>
        <div class="ref-btns"><button type="button" class="like" aria-label="Нравится">♥</button><button type="button" class="dislike" aria-label="Не нравится">✕</button></div>
      </figure>`).join('');
    paintRefs();
  }).catch(() => { gal.innerHTML = '<p class="hint">Галерея не загрузилась — пришлите свои фото или ссылки ниже.</p>'; });
  gal.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.closest('.ref').dataset.id, v = b.classList.contains('like') ? 'like' : 'dislike';
    refs[id] = refs[id] === v ? undefined : v;
    if (!refs[id]) delete refs[id];
    paintRefs(); save();
  };
  function paintRefs() {
    gal.querySelectorAll('.ref').forEach(f => { f.dataset.v = refs[f.dataset.id] || ''; });
    const n = Object.values(refs), l = n.filter(v => v === 'like').length, d = n.filter(v => v === 'dislike').length;
    $('refCount').textContent = l || d ? `нравится: ${l} · не нравится: ${d}` : '';
  }

  // ── голосовой ввод: Web Speech API (Chrome, Edge, Яндекс Браузер, Safari 14.5+)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, recField = null, recBtn = null;
  function stopRec() { if (rec) { try { rec.stop(); } catch (e) {} } }
  // dictate(поле, кнопка, onState): включает/выключает распознавание для поля; одновременно слушает одно поле
  function dictate(field, b, onState) {
    if (rec && recField === field) { stopRec(); return; }
    stopRec();
    rec = new SR(); rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = true;
    recField = field; recBtn = b;
    const base = field.value ? field.value.replace(/\s*$/, ' ') : '';
    let finalText = '';
    rec.onresult = ev => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += t.trim() + ' '; else interim += t;
      }
      field.value = base + finalText + interim;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    };
    rec.onend = () => { field.value = field.value.trim(); rec = null; recField = null; onState(false); save(); };
    rec.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { $('micHint').hidden = false; $('micHint').innerHTML = '<b>Микрофон не разрешён.</b> Нажмите значок замка в адресной строке и разрешите микрофон — или нажмите 🎤 на клавиатуре телефона и говорите в поле.'; } };
    try { rec.start(); onState(true); } catch (e) { onState(false); }
  }
  function micFor(field) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mic'; b.title = 'Надиктовать'; b.setAttribute('aria-label', 'Надиктовать голосом');
    b.textContent = '🎤';
    b.onclick = () => {
      if (!SR) { $('micHint').hidden = false; field.focus(); return; }
      dictate(field, b, on => b.classList.toggle('rec', on));
    };
    const wrap = document.createElement('div');
    wrap.className = 'dict-wrap';
    field.parentNode.insertBefore(wrap, field);
    wrap.appendChild(field); wrap.appendChild(b);
  }
  document.querySelectorAll('textarea.dict, input.dict').forEach(micFor);

  // ── главный экран: рассказ голосом. Подсказки-темы загораются, когда о них сказано; из рассказа заполняется, что можно
  const TOPICS = [
    ['Кто живёт', /(живу|живём|живем|муж|жена|дет|сын|доч|реб[её]н|бабушк|дедушк|пара|вдво[её]м|втро[её]м|вчетвером|одна|один)/i],
    ['Площадь и комнаты', /(\d+\s*(кв|м²|м2|метр|квадрат)|комнат|тр[её]шк|двушк|однушк|студи|этаж|спальн)/i],
    ['Как проходит день', /(вечер|утр|выходн|гост|готов|смотр|чита|игра|отдыха)/i],
    ['Кухня', /(кухн|остров|готов|плит|посуд)/i],
    ['Хранение', /(хранен|шкаф|гардероб|кладов|вещ)/i],
    ['Работа, хобби, спорт', /(работ|хобби|спорт|тренаж|музык|рису|мастерск|йог|бег)/i],
    ['Стиль и цвета', /(стил|цвет|дерев|бел|сер|зел[её]н|син|беж|скандинав|классик|лофт|минимал|уют|т[её]пл)/i],
    ['Что не нравится', /(не нрав|ненавиж|раздража|терпеть не|не хочу|не люблю|не надо)/i],
    ['Сроки и бюджет', /(бюджет|деньг|тысяч|миллион|срок|месяц|весн|лет|осен|зим|переезд|въех)/i]
  ];
  const story = $('story');
  const startWord = re => new RegExp('(?:^|[^а-яёa-z])(?:' + re.source + ')', 'i');   // тема — с начала слова: «бел» не в «колыбели»
  TOPICS.forEach(tp => { tp[1] = startWord(tp[1]); });
  function paintTopics() {
    const t = story.value;
    $('topics').innerHTML = '<span class="topics-title">О чём рассказать:</span>' + TOPICS.map(([n, re]) => `<span class="topic${re.test(t) ? ' ok' : ''}">${re.test(t) ? '✓ ' : ''}${n}</span>`).join('');
  }
  story.addEventListener('input', paintTopics);
  paintTopics();
  function autoFill() {
    const t = story.value, done = [];
    const set = (id, v, label) => { const el = $(id); if (el && !el.value && v) { el.value = v; done.push(label + ': ' + v); } };
    const area = t.match(/(\d{2,3}(?:[.,]\d)?)\s*(?:кв|квадрат|м²|м2|метр)/i);
    if (area) set('objArea', area[1].replace(',', '.'), 'площадь');
    if (/(^|[^а-яё])(дом|коттедж|дача|дачу)([^а-яё]|$)/i.test(t) && !/квартир/i.test(t) && $('objType').value === 'квартира') { $('objType').value = 'дом'; houseUI(); done.push('тип: дом'); }
    const W = w => new RegExp('(^|[^а-яё])(' + w + ')([^а-яё]|$)', 'i');   // целое слово: «котором», «котельная» — не кот
    const pets = [W('кот|кота|коты|котов|кошка|кошки|котик|кошек').test(t) && 'кот', W('собака|собаки|собак|пёс|пес|щенок').test(t) && 'собака'].filter(Boolean).join(', ');
    set('qPets', pets, 'животные');
    const who = t.match(/((?:живу|живём|живем)[^.!?,;]{0,60})/i);
    if (who) set('qWho', who[1].trim(), 'кто живёт');
    if (done.length) { $('autoFill').hidden = false; $('autoFill').textContent = '✓ Из рассказа заполнили — ' + done.join('; ') + '. Проверьте на следующих шагах.'; save(); }
  }
  const bigMic = $('bigMic');
  bigMic.onclick = () => {
    if (!SR) { $('micHint').hidden = false; story.focus(); return; }
    dictate(story, bigMic, on => {
      $('voiceState').textContent = on ? 'Слушаю… говорите. Нажмите ещё раз, чтобы закончить' : 'Готово. Можно дополнить — нажмите снова';
      bigMic.classList.toggle('rec', on);
      if (!on) { paintTopics(); autoFill(); }
    });
  };

  // ── сбор брифа
  const val = id => ($(id) ? $(id).value : '');
  function collect() {
    const rooms = [...roomsEl.querySelectorAll('.room-row')].map(r => ({
      name: r.querySelector('.r-name').value || 'Помещение',
      type: r.querySelector('.r-type').value,
      width: +r.querySelector('.r-w').value || null,
      length: +r.querySelector('.r-l').value || null,
      level: isHouse() ? +r.querySelector('.r-level').value : undefined
    }));
    const st = STYLES.find(s => s.key === selStyle);
    return {
      meta: { created: new Date().toISOString().slice(0, 10), source: 'site-brief-wizard', version: 2, test: true },
      client: { name: val('cName'), phone: val('cPhone'), email: val('cEmail'), contact: val('cWay') },
      object: {
        type: val('objType'), address: val('objAddr'),
        area: +val('objArea') || null, ceilingHeight: +val('objH') || null,
        floors: isHouse() ? +val('objFloors') : undefined, stairs: isHouse() ? val('objStairs') : undefined,
        plot: isHouse() ? val('objPlot') : undefined, state: val('objState')
      },
      rooms,
      story: val('story'),
      files: { plans: files.plans.map(f => f.name), photos: files.photos.map(f => f.name) },
      style: {
        key: selStyle, title: st ? st.title : selStyle, byStudio: selStyle === 'studio',
        colors: val('stColors'), avoidColors: val('stAvoid'),
        liked: Object.keys(refs).filter(k => refs[k] === 'like'),
        disliked: Object.keys(refs).filter(k => refs[k] === 'dislike'),
        links: val('stRefs').split(/[\s,]+/).map(s => s.trim()).filter(s => /^https?:\/\//.test(s))
      },
      budget: val('qBudget'),
      answers: {
        household: val('qWho'), pets: val('qPets'), wfh: val('qWfh'), storage: val('qStorage'),
        kitchen: val('qKitchen'), sport: val('qSport'), dislikes: val('qDislikes'),
        timeline: val('qWhen'), notes: val('qNotes')
      }
    };
  }

  // ── черновик в браузере (файлы браузер не хранит — их надо выбрать заново)
  const KEY = 'linea_brief_draft';
  const FIELDS = ['objType', 'objArea', 'objH', 'objAddr', 'objFloors', 'objStairs', 'objPlot', 'objState', 'story', 'stColors', 'stAvoid', 'stRefs',
    'qWho', 'qPets', 'qWfh', 'qStorage', 'qKitchen', 'qSport', 'qDislikes', 'qWhen', 'qBudget', 'qNotes', 'cName', 'cPhone', 'cEmail', 'cWay'];
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const d = { fields: {}, rooms: collect().rooms, style: selStyle, refs, step, files: collect().files };
      FIELDS.forEach(id => { if ($(id)) d.fields[id] = $(id).value; });
      try { localStorage.setItem(KEY, JSON.stringify(d)); $('draftNote').hidden = false; } catch (e) {}
    }, 300);
  }
  document.addEventListener('input', save);
  document.addEventListener('change', save);
  function restore() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!d) { addRoom('Гостиная-кухня', 'living-kitchen'); addRoom('Спальня', 'bedroom'); addRoom('Санузел', 'bathroom'); return false; }
    FIELDS.forEach(id => { if ($(id) && d.fields && d.fields[id] != null) $(id).value = d.fields[id]; });
    (d.rooms && d.rooms.length ? d.rooms : [{ name: 'Гостиная-кухня', type: 'living-kitchen' }]).forEach(r => addRoom(r.name, r.type, r.width, r.length, r.level));
    if (d.style && cardOf(d.style)) pickStyle(cardOf(d.style));
    Object.assign(refs, d.refs || {});
    if (Number.isInteger(d.step) && d.step > 0 && d.step < LAST) step = d.step;   // продолжить с того же шага
    const lost = d.files ? d.files.plans.length + d.files.photos.length : 0;
    $('draftNote').hidden = false;
    $('draftNote').innerHTML = 'Черновик восстановлен — продолжайте с того места, где остановились.' + (lost ? ' Файлы браузер не сохраняет: выберите их ещё раз.' : '')
      + ' <button type="button" class="linklike" id="draftReset">начать заново</button>';
    $('draftReset').onclick = () => { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };
    return true;
  }
  // приход со страницы стиля: brief.html?style=japandi
  const want = new URLSearchParams(location.search).get('style');
  const restored = restore();
  if (want && cardOf(want) && !restored) pickStyle(cardOf(want));
  houseUI();

  // ── итог
  function summaryText(b) {
    const o = b.object, lines = [];
    lines.push('Бриф LINEA — ' + (b.client.name || 'клиент') + (b.client.phone ? ', ' + b.client.phone : ''));
    lines.push('Объект: ' + (o.type || '') + (o.area ? ', ' + o.area + ' м²' : '') + (o.floors ? ', этажей ' + o.floors : '') + (o.address ? ', ' + o.address : ''));
    if (o.state) lines.push('Состояние: ' + o.state);
    lines.push('Помещения: ' + b.rooms.map(r => r.name + (r.width && r.length ? ' ' + r.width + '×' + r.length + ' м' : '') + (r.level ? ' (' + r.level + ' эт.)' : '')).join('; '));
    if (b.story) lines.push('Своими словами: ' + b.story);
    lines.push('Стиль: ' + b.style.title + (b.style.colors ? '; любит: ' + b.style.colors : '') + (b.style.avoidColors ? '; не любит: ' + b.style.avoidColors : ''));
    if (b.style.liked.length || b.style.disliked.length) lines.push('Референсы галереи: нравится ' + b.style.liked.length + ', не нравится ' + b.style.disliked.length);
    if (b.style.links.length) lines.push('Ссылки: ' + b.style.links.join(' '));
    const a = b.answers;
    [['Кто живёт', a.household], ['Животные', a.pets], ['Работа из дома', a.wfh], ['Хранение', a.storage], ['Кухня', a.kitchen], ['Спорт', a.sport], ['Не нравится', a.dislikes], ['Ремонт', a.timeline], ['Ещё', a.notes]]
      .forEach(([k, v]) => { if (v) lines.push(k + ': ' + v); });
    lines.push('Файлы: план/фото ' + b.files.plans.length + ', свои референсы ' + b.files.photos.length);
    return lines.join('\n');
  }
  let lastBrief = null;
  function buildResult() {
    const brief = collect();
    lastBrief = brief;
    const json = JSON.stringify(brief, null, 2), text = summaryText(brief);
    $('json').textContent = json;
    $('summary').innerHTML = text.split('\n').map(l => {
      const i = l.indexOf(': ');
      return i > 0 ? '<div class="srow"><span>' + esc(l.slice(0, i)) + '</span><b>' + esc(l.slice(i + 2)) + '</b></div>' : '<div class="srow"><b>' + esc(l) + '</b></div>';
    }).join('');
    $('mailto').href = 'mailto:optteem@mail.ru?subject=' + encodeURIComponent('Бриф на дизайн-проект — ' + (brief.client.name || 'клиент'))
      + '&body=' + encodeURIComponent(text.slice(0, 1600) + '\n\nАрхив с файлами (бриф, план, фото) приложу к письму.');
    $('waSend').href = 'https://wa.me/79257338640?text=' + encodeURIComponent(text.slice(0, 1800));
    $('copyBrief').onclick = () => copy(text + '\n\n' + json, $('copyBrief'));
    $('dl').onclick = () => saveBlob(new Blob([json], { type: 'application/json' }), 'brief.json');
    try { localStorage.setItem('linea_brief', json); } catch (e) {}
  }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function copy(t, btn) {
    const done = () => { const o = btn.textContent; btn.textContent = 'Скопировано ✓'; setTimeout(() => { btn.textContent = o; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done);
    else { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ── архив: бриф + план + фото (фото ужимаются до 1600 px, PDF/DWG — как есть)
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
  function zip(entries) {                     // ZIP без сжатия (store), имена в UTF-8
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
  async function makeArchive() {
    const b = lastBrief || collect(), enc = new TextEncoder(), list = [];
    list.push({ name: 'brief.json', data: enc.encode(JSON.stringify(b, null, 2)) });
    list.push({ name: 'brief.txt', data: enc.encode(summaryText(b)) });
    const liked = REFS.filter(m => b.style.liked.includes(m.id)).map(m => '+ ' + m.style + ' · ' + m.room + ' (' + m.id + ')')
      .concat(REFS.filter(m => b.style.disliked.includes(m.id)).map(m => '- ' + m.style + ' · ' + m.room + ' (' + m.id + ')'));
    if (liked.length) list.push({ name: 'referensy-galereya.txt', data: enc.encode(liked.join('\n')) });
    let k = 0;
    for (const f of files.plans) list.push({ name: 'plan/' + String(++k).padStart(2, '0') + '-' + safe(f.name.replace(/\.(png|webp)$/i, '.jpg')), data: await shrink(f) });
    k = 0;
    for (const f of files.photos) list.push({ name: 'referensy/' + String(++k).padStart(2, '0') + '-' + safe(f.name.replace(/\.(png|webp)$/i, '.jpg')), data: await shrink(f) });
    const who = safe((b.client.name || 'klient').trim().replace(/\s+/g, '-'));
    return new File([zip(list)], `LINEA-brif-${who}-${b.meta.created}.zip`, { type: 'application/zip' });
  }
  $('sendZip').onclick = async () => {
    const btn = $('sendZip'), old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Собираю архив…';
    try {
      const f = await makeArchive();
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], title: 'Бриф LINEA', text: 'Бриф на дизайн-проект: ' + (lastBrief && lastBrief.client.name || '') }); }
        catch (e) { if (e.name === 'AbortError') { $('afterZip').hidden = false; $('afterZip').innerHTML = 'Отправка отменена. Нажмите кнопку ещё раз — или <button type="button" class="linklike" id="zipDl">скачайте архив</button> и пришлите его в WhatsApp на +7 925 733-86-40.'; $('zipDl').onclick = () => saveBlob(f, f.name); return; } saveBlob(f, f.name); }
      } else saveBlob(f, f.name);
      $('afterZip').hidden = false;
      $('zipInfo').textContent = f.name + ' · ' + (f.size < 1048576 ? Math.max(1, Math.round(f.size / 1024)) + ' КБ' : (f.size / 1048576).toFixed(1) + ' МБ');
    } finally { btn.disabled = false; btn.textContent = old; }
  };

  renderSteps();
})();
