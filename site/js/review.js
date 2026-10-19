// LINEA · правки к листам голосом: review.html?p=<слаг проекта>&s=<файл листа>
// Клиент открывает лист, нажимает на место на чертеже — ставится метка, к ней замечание голосом или текстом.
// Правки хранятся в браузере (localStorage) по проекту и уходят одним сообщением / файлом через «Поделиться».
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const q = new URLSearchParams(location.search), slug = (q.get('p') || '').replace(/[^a-z0-9-]/gi, '');
  const KEY = 'linea_review_' + slug;
  let sheets = [], cur = 0, zoom = 1, notes = [], editing = null;
  try { notes = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { notes = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch (e) {} paintCount(); };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  if (!slug) { $('title').textContent = 'Не указан проект'; return; }
  $('back').href = 'portfolio/' + slug + '/';

  fetch('portfolio/' + slug + '/sheets.json').then(r => r.json()).then(list => {
    sheets = list;
    $('pick').innerHTML = list.map((s, i) => `<option value="${i}">${esc(s.no ? 'Лист ' + s.no + ' · ' : '')}${esc(s.title)}</option>`).join('');
    const want = q.get('s'), i = list.findIndex(s => s.file === want);
    show(i >= 0 ? i : 0);
  }).catch(() => { $('title').textContent = 'Листы проекта не загрузились'; });

  function show(i) {
    cur = Math.max(0, Math.min(sheets.length - 1, i));
    const s = sheets[cur];
    $('pick').value = String(cur);
    $('title').textContent = (s.no ? 'Лист ' + s.no + ' · ' : '') + s.title;
    $('img').src = 'portfolio/' + slug + '/sheets/' + encodeURIComponent(s.file);
    $('raw').href = $('img').src;
    history.replaceState(null, '', '?p=' + slug + '&s=' + encodeURIComponent(s.file));
    closeEditor();
    paintPins(); paintList();
  }
  $('prev').onclick = () => show(cur - 1);
  $('next').onclick = () => show(cur + 1);
  $('pick').onchange = e => show(+e.target.value);

  // масштаб: кнопки и колесо с Ctrl; прокрутка контейнера — перемещение
  function setZoom(z) { zoom = Math.max(1, Math.min(5, z)); $('stage').style.width = (zoom * 100) + '%'; $('zoomv').textContent = Math.round(zoom * 100) + '%'; }
  $('zin').onclick = () => setZoom(zoom * 1.5);
  $('zout').onclick = () => setZoom(zoom / 1.5);
  $('zfit').onclick = () => setZoom(1);

  // метки
  const mine = () => notes.filter(n => n.file === sheets[cur].file);
  function paintPins() {
    $('pins').innerHTML = mine().map(n => `<button type="button" class="pin${editing === n.id ? ' on' : ''}" data-id="${n.id}" style="left:${n.x}%;top:${n.y}%">${n.n}</button>`).join('');
  }
  $('stage').addEventListener('click', e => {
    const pin = e.target.closest('.pin');
    if (pin) { openEditor(notes.find(n => n.id === pin.dataset.id)); return; }
    const r = $('img').getBoundingClientRect();
    const x = +((e.clientX - r.left) / r.width * 100).toFixed(1), y = +((e.clientY - r.top) / r.height * 100).toFixed(1);
    if (x < 0 || y < 0 || x > 100 || y > 100) return;
    const n = { id: Date.now().toString(36), file: sheets[cur].file, title: sheets[cur].title, no: sheets[cur].no, x, y, n: mine().length + 1, text: '' };
    notes.push(n); save(); openEditor(n, true);
  });
  function openEditor(n, fresh) {
    editing = n.id;
    $('editor').hidden = false;
    $('edNo').textContent = n.n;
    $('edText').value = n.text;
    paintPins();
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
    const n = { id: Date.now().toString(36), file: sheets[cur].file, title: sheets[cur].title, no: sheets[cur].no, x: null, y: null, n: mine().length + 1, text: '' };
    notes.push(n); save(); openEditor(n, true);
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
    rec.onend = () => { $('edMic').classList.remove('rec'); $('edState').textContent = 'Нажмите 🎤 и скажите, что исправить'; f.value = f.value.trim(); rec = null; };
    rec.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') alert('Разрешите доступ к микрофону для этой страницы — или нажмите микрофон на клавиатуре телефона.'); };
    $('edMic').classList.add('rec'); $('edState').textContent = 'Слушаю… нажмите 🎤 ещё раз, чтобы закончить';
    try { rec.start(); } catch (e) { $('edMic').classList.remove('rec'); }
  };

  // отправка
  function summary() {
    const by = {};
    notes.filter(n => n.text).forEach(n => { (by[n.file] = by[n.file] || []).push(n); });
    const out = ['Правки к проекту ' + slug + ' (' + new Date().toLocaleDateString('ru-RU') + ')'];
    sheets.forEach(s => {
      const m = by[s.file]; if (!m) return;
      out.push('', (s.no ? 'Лист ' + s.no + ' · ' : '') + s.title);
      m.forEach(n => out.push(`  ${n.n}) ${n.text}${n.x != null ? ` [точка ${n.x}% / ${n.y}%]` : ' [весь лист]'}`));
    });
    return out.join('\n');
  }
  $('sendBtn').onclick = async () => {
    const text = summary(), json = JSON.stringify({ project: slug, date: new Date().toISOString(), notes: notes.filter(n => n.text) }, null, 2);
    const file = new File([json], `LINEA-pravki-${slug}.json`, { type: 'application/json' });
    $('sent').hidden = false;
    $('waLink').href = 'https://wa.me/79257338640?text=' + encodeURIComponent(text.slice(0, 3500));
    $('mailLink').href = 'mailto:optteem@mail.ru?subject=' + encodeURIComponent('Правки к проекту ' + slug) + '&body=' + encodeURIComponent(text.slice(0, 1800));
    $('copyLink').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(text); $('copyLink').textContent = 'Скопировано ✓'; };
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ title: 'Правки LINEA', text, files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    if (navigator.share) { try { await navigator.share({ title: 'Правки LINEA', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  };
  paintCount();
})();
