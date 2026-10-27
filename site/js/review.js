// LINEA · правки к листам голосом: review.html?p=<слаг проекта>&s=<файл листа>
// Клиент открывает лист, нажимает на место на чертеже — ставится метка, к ней замечание голосом или текстом.
// Правки хранятся в браузере (localStorage) по проекту. Где есть приёмник (Beget: <meta name="linea-api">) и https — уходят на
// api/review.php и клиент сразу видит «Правки приняты, № R-…»; иначе (GitHub Pages, адрес без https) или при ошибке сети — как раньше,
// одним сообщением / файлом через «Поделиться», WhatsApp или почту. Токен заказа из ссылки (&t=…) связывает правки с заказом.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const q0 = new URLSearchParams(location.search);
  // имя и телефон автора правок — только по https (кроме ?test=1 и localhost), как в brief.js
  const SECURE = location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const API = (SECURE || q0.get('test') === '1') ? ((document.querySelector('meta[name="linea-api"]') || {}).content || '') : '';
  const q = q0, slug = (q.get('p') || '').replace(/[^a-z0-9-]/gi, '');
  const KEY = 'linea_review_' + slug;
  const KEEP = ['t', 'test'].filter(k => q.get(k)).map(k => '&' + k + '=' + encodeURIComponent(q.get(k))).join('');
  let sheets = [], cur = 0, zoom = 1, notes = [], editing = null;
  try { notes = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { notes = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch (e) {} paintCount(); };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  // нет проекта или битая ссылка — понятное сообщение вместо пустого листа
  function fail(head, text) {
    $('title').textContent = head;
    $('loading').hidden = true;
    $('view').classList.add('rv-fail');
    $('view').innerHTML = `<div class="rv-msg"><b>${esc(head)}</b><p>${text}</p><a class="btn sm" href="portfolio-hub/">Открыть портфолио</a></div>`;
    ['prev', 'next', 'pick', 'zin', 'zout', 'zfit', 'general'].forEach(id => { $(id).disabled = true; });
    $('pick').innerHTML = '<option>Листов нет</option>';
    $('back').href = 'portfolio-hub/'; $('back').textContent = '← портфолио';
    document.body.classList.add('rv-off');            // боковая панель правок без листов не нужна
  }
  if (!slug) { fail('Не указан проект', 'Откройте эту страницу по ссылке из альбома — кнопка «Проверить листы и надиктовать правки» на странице проекта.'); return; }
  $('back').href = 'portfolio/' + slug + '/';
  let projName = slug;

  // человекочитаемое название проекта — из <title> страницы альбома
  fetch('portfolio/' + slug + '/index.html').then(r => r.ok ? r.text() : '').then(html => {
    const m = /<title>([^<]+)<\/title>/i.exec(html || ''); if (!m) return;
    const t = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s*[—|-]\s*(рабочая документация|дизайн-проект|альбом|LINEA).*$/i, '').trim();
    if (!t) return;
    projName = t; $('proj').textContent = t; document.title = 'Правки · ' + t + ' — LINEA';
  }).catch(() => {});

  fetch('portfolio/' + slug + '/sheets.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(list => {
    if (!Array.isArray(list) || !list.length) throw new Error('empty');
    sheets = list;
    ['prev', 'next', 'pick', 'zin', 'zout', 'zfit', 'general'].forEach(id => { $(id).disabled = false; });
    $('pick').innerHTML = list.map((s, i) => `<option value="${i}">${esc(s.no ? s.no + ' · ' : '')}${esc(s.title)}</option>`).join('');
    // лист — по имени файла; если альбом перевыпущен и номер сменился — по имени без номера «NN-»
    const want = q.get('s') || '', bare = f => String(f).replace(/^\d+-/, '');
    let i = list.findIndex(s => s.file === want);
    if (i < 0 && want) i = list.findIndex(s => bare(s.file) === bare(want));
    show(i >= 0 ? i : 0);
  }).catch(() => fail('Проект не найден', 'По ссылке «' + esc(slug) + '» листов нет — возможно, ссылка обрезалась при пересылке. Выберите проект в портфолио или попросите прислать ссылку ещё раз.'));

  // текст правки не теряется: при смене метки, листа и отправке открытая правка сохраняется, пустая — удаляется
  function commitEditing() {
    if (!editing) return;
    const n = notes.find(m => m.id === editing);
    if (n) { n.text = $('edText').value.trim(); if (!n.text) notes = notes.filter(m => m !== n); }
    renumber(); save();
  }
  function show(i) {
    if (!sheets.length) return;                        // клик до загрузки sheets.json
    commitEditing();
    cur = Math.max(0, Math.min(sheets.length - 1, i));
    const s = sheets[cur];
    $('pick').value = String(cur);
    $('title').textContent = (s.no ? 'Лист ' + s.no + ' · ' : '') + s.title;
    $('sheetName').textContent = $('title').textContent;
    const src = 'portfolio/' + slug + '/sheets/' + encodeURIComponent(s.file);
    if ($('img').getAttribute('src') !== src) { $('loading').hidden = false; $('loadTxt').textContent = 'Загружаю лист…'; $('loading').classList.remove('err'); }
    $('img').src = src;
    $('raw').href = $('img').src;
    history.replaceState(null, '', '?p=' + slug + '&s=' + encodeURIComponent(s.file) + KEEP);   // токен заказа и пометка теста не теряются при листании
    closeEditor();
    paintPins(); paintList();
  }
  $('img').addEventListener('load', () => { $('loading').hidden = true; });
  $('img').addEventListener('error', () => { if (!$('img').getAttribute('src')) return; $('loading').hidden = false; $('loading').classList.add('err'); $('loadTxt').textContent = 'Лист не загрузился — проверьте связь и обновите страницу'; });
  $('prev').onclick = () => show(cur - 1);
  $('next').onclick = () => show(cur + 1);
  $('pick').onchange = e => show(+e.target.value);

  // масштаб: кнопки и колесо с Ctrl (и щипок на тачпаде); прокрутка контейнера — перемещение
  function setZoom(z, cx, cy) {
    const v = $('view'), old = zoom;
    zoom = Math.max(1, Math.min(5, z));
    // точка под курсором остаётся на месте
    const r = v.getBoundingClientRect(), px = cx == null ? r.width / 2 : cx - r.left, py = cy == null ? r.height / 2 : cy - r.top;
    const fx = (v.scrollLeft + px) / old, fy = (v.scrollTop + py) / old;
    $('stage').style.width = (zoom * 100) + '%'; $('zoomv').textContent = Math.round(zoom * 100) + '%';
    v.scrollLeft = fx * zoom - px; v.scrollTop = fy * zoom - py;
  }
  $('view').addEventListener('wheel', e => {
    if (!e.ctrlKey || !sheets.length) return;
    e.preventDefault();
    setZoom(zoom * Math.exp(-e.deltaY * 0.004), e.clientX, e.clientY);
  }, { passive: false });
  $('zin').onclick = () => setZoom(zoom * 1.5);
  $('zout').onclick = () => setZoom(zoom / 1.5);
  $('zfit').onclick = () => setZoom(1);

  // метки
  const mine = () => notes.filter(n => n.file === sheets[cur].file);
  function paintPins() {
    $('pins').innerHTML = mine().map(n => `<button type="button" class="pin${editing === n.id ? ' on' : ''}" data-id="${n.id}" style="left:${n.x}%;top:${n.y}%">${n.n}</button>`).join('');
  }
  $('stage').addEventListener('click', e => {
    if (!sheets.length) return;                        // листы ещё не загрузились
    const pin = e.target.closest('.pin');
    if (pin) { commitEditing(); openEditor(notes.find(n => n.id === pin.dataset.id)); paintList(); return; }
    commitEditing();
    const r = $('img').getBoundingClientRect();
    const x = +((e.clientX - r.left) / r.width * 100).toFixed(1), y = +((e.clientY - r.top) / r.height * 100).toFixed(1);
    if (x < 0 || y < 0 || x > 100 || y > 100) return;
    const n = { id: Date.now().toString(36), file: sheets[cur].file, title: sheets[cur].title, no: sheets[cur].no, x, y, n: mine().length + 1, text: '' };
    notes.push(n); save(); openEditor(n, true); paintList();
  });
  function openEditor(n, fresh) {
    editing = n.id;
    $('editor').hidden = false;
    $('edNo').textContent = n.n;
    $('edText').value = n.text;
    paintPins();
    if (window.innerWidth < 900) $('editor').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (fresh && SR) $('edMic').click(); else $('edText').focus();
  }
  function closeEditor() { stopRec(); editing = null; $('editor').hidden = true; paintPins(); }
  $('edSave').onclick = () => {
    const n = notes.find(m => m.id === editing); if (!n) return closeEditor();
    n.text = $('edText').value.trim();
    if (!n.text) notes = notes.filter(m => m !== n);
    renumber(); save(); closeEditor(); paintList();
  };
  $('edDel').onclick = () => { notes = notes.filter(m => m.id !== editing); renumber(); save(); closeEditor(); paintList(); };
  function renumber() { const seq = {}; notes.forEach(n => { seq[n.file] = (seq[n.file] || 0) + 1; n.n = seq[n.file]; }); }
  $('general').onclick = () => {           // замечание ко всему листу, без точки
    if (!sheets.length) return;
    commitEditing();
    const n = { id: Date.now().toString(36), file: sheets[cur].file, title: sheets[cur].title, no: sheets[cur].no, x: null, y: null, n: mine().length + 1, text: '' };
    notes.push(n); save(); openEditor(n, true); paintList();
  };
  function paintList() {
    const m = mine();
    $('list').innerHTML = m.length ? m.map(n => `<li data-id="${n.id}"><b>${n.n}</b> ${esc(n.text || '…')}</li>`).join('') : '<li class="empty">На этом листе правок нет. Нажмите на место на чертеже — и скажите, что поменять.</li>';
    $('list').querySelectorAll('li[data-id]').forEach(li => { li.onclick = () => openEditor(notes.find(n => n.id === li.dataset.id)); });
  }
  function paintCount() {
    const n = notes.filter(m => m.text).length;
    $('sendBtn').textContent = n ? `Отправить правки (${n})` : 'Отправить правки';
    $('sendBtn').disabled = !n;
  }

  // голос
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  function stopRec() { if (rec) { try { rec.stop(); } catch (e) {} } }
  $('edMic').onclick = () => {
    if (!SR) { $('micHint').hidden = false; $('edText').focus(); return; }
    if (rec) { stopRec(); return; }
    rec = new SR(); rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = true;
    const f = $('edText'), base = f.value ? f.value.replace(/\s*$/, ' ') : '';
    let fin = '';
    rec.onresult = ev => {
      let mid = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) { const t = ev.results[i][0].transcript; if (ev.results[i].isFinal) fin += t.trim() + ' '; else mid += t; }
      f.value = base + fin + mid;
    };
    let err = '';
    const ERR = { 'no-speech': 'Не расслышали — нажмите 🎤 и говорите ближе к микрофону', 'audio-capture': 'Микрофон не найден — напишите текстом', 'network': 'Распознаванию нужен интернет — проверьте связь или напишите текстом', 'not-allowed': 'Микрофон не разрешён — напишите текстом', 'service-not-allowed': 'Микрофон не разрешён — напишите текстом' };
    rec.onend = () => { $('edMic').classList.remove('rec'); $('edState').textContent = err || 'Нажмите 🎤 и скажите, что исправить'; f.value = f.value.trim(); rec = null; };
    rec.onerror = ev => {
      if (ev.error === 'aborted') return;
      err = ERR[ev.error] || 'Голосовой ввод не сработал — нажмите 🎤 ещё раз или напишите текстом';
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { $('micHint').hidden = false; $('micHint').textContent = 'Микрофон не разрешён: нажмите значок замка в адресной строке и разрешите микрофон — или наберите текст (на телефоне — микрофон на клавиатуре).'; }
    };
    $('edMic').classList.add('rec'); $('edState').textContent = 'Слушаю… нажмите 🎤 ещё раз, чтобы закончить';
    try { rec.start(); } catch (e) { $('edMic').classList.remove('rec'); }
  };

  // отправка
  function summary() {
    const by = {};
    notes.filter(n => n.text).forEach(n => { (by[n.file] = by[n.file] || []).push(n); });
    const out = ['Правки к проекту «' + projName + '»' + (projName !== slug ? ' [' + slug + ']' : '') + ' (' + new Date().toLocaleDateString('ru-RU') + ')'];
    sheets.forEach(s => {
      const m = by[s.file]; if (!m) return;
      out.push('', (s.no ? 'Лист ' + s.no + ' · ' : '') + s.title);
      m.forEach(n => out.push(`  ${n.n}) ${n.text}${n.x != null ? ` [точка ${n.x}% / ${n.y}%]` : ' [весь лист]'}`));
    });
    return out.join('\n');
  }
  // телефон — чтобы правку незнакомого клиента сопоставить с заказом (только там, где правки уходят на сервер)
  if (API && $('who')) {
    $('who').closest('.field').insertAdjacentHTML('afterend', '<div class="field" style="margin:8px 0"><label for="whoPhone">Телефон</label><input type="tel" id="whoPhone" placeholder="чтобы мы могли уточнить"></div>'
      + '<p class="hint" id="sentOk" role="status" aria-live="polite" hidden></p>');
    try { $('whoPhone').value = localStorage.getItem('linea_review_phone') || ''; } catch (e) {}
  }
  function postNotes(who, phone) {
    return fetch(API + 'review.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: slug, t: (q.get('t') || '').replace(/[^0-9a-f]/gi, ''), from: who, phone, test: q.get('test') === '1' ? 1 : 0,
        notes: notes.filter(n => n.text).map(n => ({ file: n.file, n: n.n, text: n.text, x: n.x, y: n.y })) })
    }).then(r => r.json().then(j => ({ code: r.status, j })).catch(() => ({ code: r.status, j: null }))).catch(() => ({ code: 0, j: null }));
  }
  $('sendBtn').onclick = async () => {
    commitEditing(); paintList(); paintPins();
    const who = ($('who').value || '').trim();
    try { localStorage.setItem('linea_review_who', who); } catch (e) {}
    if (API) {
      const phone = ($('whoPhone') && $('whoPhone').value || '').trim();
      try { localStorage.setItem('linea_review_phone', phone); } catch (e) {}
      const btn = $('sendBtn'), old = btn.textContent;
      btn.disabled = true; btn.textContent = 'Отправляю…';
      const res = await postNotes(who, phone);
      btn.disabled = false; btn.textContent = old;
      const ok = $('sentOk');
      if (res.code === 200 && res.j && res.j.ok) {
        ok.hidden = false; ok.style.color = '';
        ok.innerHTML = '✓ <b>Правки приняты, № ' + esc(res.j.number) + '.</b> Разберём в течение рабочего дня и пришлём перевыпущенный альбом или вопросы. Правки остаются в этом браузере — можно добавить ещё и отправить снова.';
        $('sent').hidden = true;
        return;
      }
      if (res.j && res.j.error && res.code >= 400 && res.code < 500 && ![403, 404, 405].includes(res.code)) { ok.hidden = false; ok.style.color = '#e8a87c'; ok.textContent = res.j.error; return; }
      ok.hidden = false; ok.style.color = '#e8a87c';
      ok.textContent = 'Через сайт отправить не получилось — отправьте правки одним из способов ниже.';
    }
    const body = summary(), text = (who ? 'От: ' + who + '\n' : '') + body, json = JSON.stringify({ project: slug, from: who, date: new Date().toISOString(), notes: notes.filter(n => n.text) }, null, 2);
    const file = new File([json], `LINEA-pravki-${slug}${who ? '-' + who.replace(/[^\wа-яё]+/gi, '-') : ''}.json`, { type: 'application/json' });
    $('sent').hidden = false;
    $('waLink').href = 'https://wa.me/79257338640?text=' + encodeURIComponent(text.slice(0, 3500));
    $('cutNote').hidden = text.length <= 1800;
    $('dlJson').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); };
    $('mailLink').href = 'mailto:optteem@mail.ru?subject=' + encodeURIComponent('Правки к проекту ' + projName) + '&body=' + encodeURIComponent(text.slice(0, 1800));
    $('copyLink').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(text); $('copyLink').textContent = 'Скопировано ✓'; };
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ title: 'Правки LINEA', text, files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    if (navigator.share) { try { await navigator.share({ title: 'Правки LINEA', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  };
  try { $('who').value = localStorage.getItem('linea_review_who') || ''; } catch (e) {}
  paintCount();
})();
