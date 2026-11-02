// LINEA · кабинет клиента (site/kabinet/): вход кодом на почту, мои объекты, «сейчас от вас нужно», дизайн-проект (бриф, оплата,
// альбом и версии, вопросы К-N и решения, правки), ремонт (модуль js/kabinet-remont.js), документы, уведомления, профиль и согласия (152-ФЗ).
// API — api/kabinet.php и api/vhod.php. Старая ссылка order.html?t= приходит сюда как #t=… (гостевой просмотр; действия — после кода).
(function () {
  'use strict';
  const root = document.getElementById('kab');
  if (!root) return;
  const API = (document.querySelector('meta[name="linea-api"]') || {}).content || '';
  const T = JSON.parse((document.getElementById('kabTerms') || {}).textContent || '{}');
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const rub = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
  const dt = s => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); };
  const day = s => { if (!s) return ''; const d = new Date(String(s).slice(0, 10) + 'T12:00'); return isNaN(d) ? s : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); };
  const set = h => { root.innerHTML = '<div class="wrap">' + h + '</div>'; };
  const STEPS = ['Бриф', 'Оплата', 'Работа над проектом', 'Первый вариант', 'Вопросы и правки', 'Финальный альбом', 'Ремонт'];
  let ME = {};
  // «Айфон, Safari» вместо строки User-Agent
  const uaName = ua => { ua = String(ua || ''); const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
    const br = /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
    return [os, br].filter(Boolean).join(', ') || 'Устройство'; };

  if (!API) { set('<h1>Кабинет</h1><div class="kab-card"><p>Кабинет работает на основном сайте студии. Если вы отправили бриф в WhatsApp или письмом — номер заказа и ссылку пришлём туда же.</p><p><a class="btn" href="../brief.html">Заполнить бриф</a></p></div>'); return; }

  async function call(file, a, json, q) {
    const url = API + file + '?a=' + a + (q || '');
    const opt = json ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF': ME.csrf || '' }, body: JSON.stringify(json) } : { credentials: 'same-origin', cache: 'no-store' };
    let r, j;
    try { r = await fetch(url, opt); j = await r.json(); } catch { j = { ok: false, error: 'Нет связи с сервером — проверьте интернет' }; }
    return j;
  }
  const api = (a, json, q) => call('kabinet.php', a, json, q);
  const vh = (a, json) => call('vhod.php', a, json);
  // значимое действие: при needCode — окно кода, затем повтор
  async function act(a, json, errEl) {
    let j = await api(a, json);
    if (j.needCode && await needCode()) j = await api(a, json);
    if (!j.ok && errEl) errEl.textContent = j.error || 'Не получилось';
    else if (!j.ok && !j.needCode) say(j.error || 'Не получилось');
    return j;
  }

  // ── окно «Подтвердите кодом из письма» (общий для кабинета и модуля ремонта)
  function needCode() {
    return new Promise(resolve => {
      const m = document.getElementById('kabCode'), f = document.getElementById('kabCodeF'), err = f.querySelector('.kab-err');
      const guest = !ME.auth && ME.guest;
      const askMail = guest && !ME.guest.hasEmail;
      document.getElementById('kabCodeMailL').hidden = !askMail;
      document.getElementById('kabCodeTxt').textContent = guest ? (askMail ? 'Укажите почту — пришлём код. Почта станет почтой заказа и входом в кабинет.' : 'Пришлём код на почту заказа ' + (ME.guest.email || '') + '. Это подтверждает, что действует владелец заказа.')
        : 'Это действие юридически значимо — пришлём код на вашу почту ' + (ME.email || '') + '.';
      err.textContent = ''; f.code.value = ''; m.hidden = false;
      const body = () => askMail ? { email: f.email.value, guest: true } : guest ? { guest: true } : { self: true };
      document.getElementById('kabCodeSend').onclick = async () => { const j = await vh('code', body()); err.textContent = j.ok ? (j.text || 'Код отправлен') : j.error; if (j.devCode) f.code.value = j.devCode; f.code.focus(); };
      const close = v => { m.hidden = true; resolve(v); };
      document.getElementById('kabCodeX').onclick = () => close(false);
      f.onsubmit = async e => { e.preventDefault(); const j = await vh('verify', { ...body(), code: f.code.value }); if (!j.ok) { err.textContent = j.error; return; } ME = j; close(true); };
    });
  }
  window.lineaNeedCode = needCode;

  // ── свои окна вместо confirm/alert/prompt (в стиле кабинета, на телефоне не блокируют страницу)
  function dialog(text, { ok = 'Да', cancel = 'Отмена', input = false, alertOnly = false } = {}) {
    return new Promise(resolve => {
      const m = document.createElement('div'); m.className = 'kab-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      m.innerHTML = `<div class="kab-modal-in"><p style="white-space:pre-line">${esc(text)}</p>${input ? '<label class="kab-f"><textarea rows="3" id="kabDlgT"></textarea></label>' : ''}
        <div class="kab-row"><button class="btn" type="button" id="kabDlgOk">${esc(alertOnly ? 'Понятно' : ok)}</button>${alertOnly ? '' : `<button class="btn ghost" type="button" id="kabDlgNo">${esc(cancel)}</button>`}</div></div>`;
      document.body.appendChild(m);
      const done = v => { m.remove(); resolve(v); };
      m.querySelector('#kabDlgOk').onclick = () => done(input ? m.querySelector('#kabDlgT').value : true);
      const no = m.querySelector('#kabDlgNo'); if (no) no.onclick = () => done(input ? null : false);
      (m.querySelector('#kabDlgT') || m.querySelector('#kabDlgOk')).focus();
    });
  }
  const ask = (t, ok) => dialog(t, { ok });
  const say = t => dialog(t, { alertOnly: true });
  const askText = t => dialog(t, { input: true, ok: 'Отправить' });
  window.lineaAsk = ask; window.lineaSay = say;

  // ── вход
  function loginView(note) {
    set(`<div class="kab-login"><div class="kab-kick">Кабинет LINEA</div><h1>Вход</h1><p class="kab-mut">${esc(note || 'Без пароля: пришлём код на почту, которую вы указали в брифе (бригадам — почту анкеты).')}</p>
      <div class="kab-card"><form id="kabL"><label class="kab-f">Ваша почта<input type="email" name="email" autocomplete="email" required></label>
      <div class="kab-row"><button class="btn" type="submit">Получить код</button></div><p class="kab-err" role="alert"></p></form>
      <form id="kabV" hidden><p class="kab-ok" id="kabVt"></p><label class="kab-f">Код из письма<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="6 цифр" required></label>
      <label class="kab-cb"><input type="checkbox" name="remember" checked> Запомнить это устройство на 30 дней</label>
      <div class="kab-row"><button class="btn" type="submit">Войти</button><button class="btn ghost sm" type="button" id="kabAgain">Другая почта</button></div><p class="kab-err" role="alert"></p></form></div>
      <p class="kab-mut">Ещё нет проекта? <a href="../brief.html">Заполните бриф</a> — кабинет появится сам.</p></div>`);
    const L = document.getElementById('kabL'), V = document.getElementById('kabV');
    L.onsubmit = async e => { e.preventDefault(); const j = await vh('code', { email: L.email.value }); if (!j.ok) { L.querySelector('.kab-err').textContent = j.error; return; } L.hidden = true; V.hidden = false; document.getElementById('kabVt').textContent = j.text; if (j.devCode) V.code.value = j.devCode; V.code.focus(); };
    document.getElementById('kabAgain').onclick = () => { V.hidden = true; L.hidden = false; };
    V.onsubmit = async e => {
      e.preventDefault();
      const j = await vh('verify', { email: L.email.value, code: V.code.value, remember: V.remember.checked });
      if (!j.ok) { V.querySelector('.kab-err').textContent = j.error; return; }
      ME = j; afterLogin(j);
    };
  }
  function afterLogin(j) {
    if (j.choose) return chooseRole(j.choose);
    go(j.go);
  }
  function go(role) {
    if (role === 'brigade') { location.href = '../brigada/'; return; }
    if (role === 'admin') { location.href = API + 'admin.php'; return; }
    location.hash = '#/'; route();
  }
  function chooseRole(roles) {
    const R = { client: ['Мои проекты и ремонт', 'Дизайн-проект, вопросы, ремонт, документы'], brigade: ['Кабинет бригады', 'Заказы, объекты, деньги'], admin: ['Админка', 'Вход паролем администратора'] };
    set('<div class="kab-login"><h1>Куда войти?</h1><div class="kab-roles">' + roles.map(r => `<button type="button" data-role="${r}"><b>${esc(R[r][0])}</b><span class="kab-mut">${esc(R[r][1])}</span></button>`).join('') + '</div></div>');
    root.querySelectorAll('[data-role]').forEach(b => b.onclick = async () => { const j = await vh('role', { role: b.dataset.role }); if (j.ok) { ME = j; try { localStorage.setItem('linea_role', b.dataset.role); } catch { } go(j.go); } else say(j.error); });
  }

  // ── каркас
  function top(on) {
    const u = ME.unread || 0;
    document.getElementById('kabBar').hidden = false;
    document.querySelectorAll('#kabBar a').forEach(a => a.classList.toggle('on', a.dataset.r === on));
    const bell = document.getElementById('kabBell'); bell.hidden = !u; bell.textContent = u;
    return `<div class="kab-top"><div class="kab-kick" style="margin:0">Кабинет LINEA${ME.name ? ' · ' + esc(ME.name) : ''}</div><nav aria-label="Кабинет">
      <a href="#/"${on === 'o' ? ' class="on"' : ''}>Мои объекты</a><a href="#/docs"${on === 'docs' ? ' class="on"' : ''}>Документы</a>
      <a href="#/uvedomleniya"${on === 'uv' ? ' class="on"' : ''}>Уведомления${u ? '<b>' + u + '</b>' : ''}</a><a href="#/profil"${on === 'pr' ? ' class="on"' : ''}>Профиль</a>
      ${ME.roles && ME.roles.length > 1 ? '<a href="#/rol">Сменить роль</a>' : ''}</nav></div>`
      + (!ME.auth && ME.guest ? `<div class="kab-guest">Вы открыли заказ по ссылке. Смотреть можно всё; чтобы оплатить, ответить на вопросы или подписать — подтвердите почту кодом. <button class="btn ghost sm" type="button" id="kabGuestCode">Подтвердить почту</button></div>` : '');
  }
  function bindTop() { const g = document.getElementById('kabGuestCode'); if (g) g.onclick = async () => { if (await needCode()) route(); }; }

  function nowBlock(nx, sticky) {
    if (!nx) return '';
    const num = (String(nx.href || '').match(/#\/o\/([A-Za-z0-9-]+)/) || [])[1];
    if (nx.act === 'album' && num && nx.ver) return `<div class="kab-card kab-now"><div class="kab-kick">Сейчас от вас нужно</div><p class="big">${esc(nx.text)}</p>${(sticky ? '<div class="kab-sticky-src">' : '') + `<a class="btn" href="${API}kabinet.php?a=file&o=${encodeURIComponent(num)}&v=${encodeURIComponent(nx.ver)}&f=album.pdf" target="_blank" rel="noopener">Открыть альбом (PDF)</a>` + (sticky ? '</div>' : '')}</div>`;
    const btn = nx.btn ? (nx.act === 'pay' ? `<button class="btn" type="button" data-pay>${esc(nx.btn)}</button>` : `<a class="btn" href="${esc(nx.href)}">${esc(nx.btn)}</a>`) : '';
    return `<div class="kab-card kab-now ${nx.who === 'client' ? '' : 'studio'}"><div class="kab-kick">${nx.who === 'client' ? 'Сейчас от вас нужно' : 'Сейчас'}</div><p class="big">${esc(nx.text)}</p>${nx.blocker ? '<p><span class="kab-tag r">Нужно для финального альбома</span></p>' : ''}${btn ? (sticky ? '<div class="kab-sticky-src">' + btn + '</div>' : btn) : ''}</div>`;
  }
  const steps = n => '<ol class="kab-steps" aria-label="Шаги проекта">' + STEPS.map((s, i) => `<li class="${i < n ? 'done' : i === n ? 'on' : ''}">${esc(s)}</li>`).join('') + '</ol>';

  // ── мои объекты
  async function objects() {
    const j = await api('objects');
    if (j.auth === false) return loginView();
    ME.unread = j.unread; ME.name = j.name;
    const L = j.objects || [];
    let h = top('o') + '<h1>Мои объекты</h1>';
    if (!L.length) h += `<div class="kab-card"><p class="big">Здесь будут ваши проекты. Заполните бриф — это около 5 минут.</p><a class="btn" href="../brief.html">Заполнить бриф</a></div>`;
    const act0 = L.filter(o => !o.archived), arch = L.filter(o => o.archived);
    h += act0.map(card).join('');
    if (arch.length) h += `<details><summary class="kab-mut">Архив (${arch.length})</summary>${arch.map(card).join('')}</details>`;
    if (L.length && !ME.guest) h += '<p><a class="btn ghost sm" href="../brief.html">Новый проект</a></p>';
    set(h); bindTop();
    // один объект — сразу в него
    if (L.length === 1 && !sessionStorage.getItem('kab_list')) { sessionStorage.setItem('kab_list', '1'); location.hash = '#/o/' + L[0].number; }
  }
  const card = o => `<a class="kab-card kab-obj" href="#/o/${esc(o.number)}"><div class="kab-kick">${esc(o.kindTitle)} · ${esc(o.number)}${o.test ? ' · тест' : ''}</div>
    <h2>${esc(o.objectTitle)}</h2><div class="kab-bar" aria-hidden="true"><i style="width:${Math.round((o.step + 1) / STEPS.length * 100)}%"></i></div><div class="kab-mut">${esc(STEPS[o.step] || '')} · ${esc(o.statusText)}</div>
    <div class="kab-next ${o.next.who === 'client' ? '' : 'studio'}">${o.next.who === 'client' ? '<b>Нужно от вас:</b> ' : ''}${esc(o.next.text)}</div></a>`;

  // ── объект
  const TABS = [['proekt', 'Проект'], ['voprosy', 'Вопросы'], ['pravki', 'Правки'], ['remont', 'Ремонт'], ['docs', 'Документы']];
  async function object(num, tab) {
    const j = await api('object', null, '&o=' + encodeURIComponent(num));
    if (j.auth === false) return loginView();
    if (!j.ok) { set(top('o') + `<div class="kab-card"><p>${esc(j.error)}</p><a href="#/">← Мои объекты</a></div>`); bindTop(); return; }
    const O = j.order, R = j.registry;
    const openQ = R ? R.items.filter(i => !i.closed && !i.answer).length : 0;
    let h = top('o') + `<p class="kab-mut"><a href="#/">← Мои объекты</a></p><div class="kab-kick">${esc(O.kindTitle)} · ${esc(O.number)}</div><h1>${esc(O.objectTitle)}</h1>` + steps(j.step) + nowBlock(j.next, true)
      + '<nav class="kab-tabs" aria-label="Разделы объекта">' + TABS.map(([k, t]) => `<a href="#/o/${esc(O.number)}/${k}"${k === tab ? ' class="on" aria-current="page"' : ''}>${t}${k === 'voprosy' && openQ ? '<b>' + openQ + '</b>' : ''}</a>`).join('') + '</nav>';
    h += ({ proekt: proekt, voprosy: voprosy, pravki: pravki, remont: remontTab, docs: () => '<div id="kabDocs"><p class="kab-mut">Загружаю…</p></div>' }[tab] || proekt)(j);
    set(h); bindTop(); bindObject(j, tab);
    // активные вкладка и шаг — в видимой зоне ленты (на телефоне ленты прокручиваются вбок); страницу по вертикали не двигаем
    for (const [box, sel] of [['.kab-tabs', 'a.on'], ['.kab-steps', 'li.on']]) { const b = root.querySelector(box), e = b && b.querySelector(sel); if (e) b.scrollLeft = e.offsetLeft - (b.clientWidth - e.offsetWidth) / 2; }
    // главная кнопка — липкая на телефоне
    const src = root.querySelector('.kab-sticky-src');
    if (src && matchMedia('(max-width:760px)').matches) { const st = document.createElement('div'); st.className = 'kab-sticky'; st.innerHTML = src.innerHTML; src.remove(); root.appendChild(st); bindPay(j); }
    if (tab === 'remont') { const box = document.getElementById('ordRemont'); if (box && window.lineaRemont && (j.remont.eligible || j.remont.hasRequest)) window.lineaRemont(box, j.remont.rt, API); }
    if (tab === 'docs') docsInto(document.getElementById('kabDocs'), O.number);
  }

  function proekt(j) {
    const O = j.order, B = j.brief, rel = j.releases, last = rel[rel.length - 1];
    const R = j.registry, open = R ? R.items.filter(i => !i.closed && !i.answer) : [];
    let pay = '';
    if (O.status === 'awaiting_payment' || O.status === 'new') {
      pay = O.amount ? `<div class="ord-sum" style="font-family:var(--serif);font-size:28px;color:var(--gold)">${rub(O.amount)}</div>${O.area ? `<p class="kab-mut">${String(O.area).replace('.', ',')} м² по брифу</p>` : ''}${O.amountConfirmed === false ? '<p class="kab-mut">' + esc(T.areaRecalc || '') + '</p>' : ''}`
        + (O.canPay ? '<button class="btn" type="button" data-pay>Оплатить картой или СБП</button>' : O.invoiced ? '<p>Счёт отправлен на почту — оплатите по реквизитам из счёта.</p>' : '<p class="kab-mut">Счёт на оплату пришлём на почту.</p>')
        : '<p>Сумму пересчитаем по плану и подтвердим в течение рабочего дня.</p>';
    } else if (O.paidAt) pay = `<p><span class="kab-tag ok">Оплачено</span> ${O.amount ? rub(O.amount) : ''} · ${esc(dt(O.paidAt))}</p><p class="kab-mut">Чек об оплате — в письме сервиса онлайн-оплаты; копия — в «Документах».</p>`;
    else pay = `<p>${esc(O.statusText)}</p>`;
    const album = last ? `<p><b>${esc(last.title)}</b> · ${esc(day(last.date))} ${last.prelim ? '<span class="kab-tag g">Предварительный — для обсуждения</span>' : ''}${last.final ? '<span class="kab-tag ok">Финальный — для стройки</span>' : ''}</p>
        <div class="kab-row">${last.url && /^(https?:\/\/|\/|\.\.?\/)/i.test(last.url) ? `<a class="btn sm" href="${esc(last.url)}" target="_blank" rel="noopener">Открыть альбом</a>` : ''}${last.pdf ? `<a class="btn ghost sm" href="${API}kabinet.php?a=file&o=${encodeURIComponent(O.number)}&v=${encodeURIComponent(last.ver)}&f=album.pdf" target="_blank" rel="noopener">Скачать PDF</a>` : ''}</div>
        ${last.final && !last.accepted ? `<div class="kab-row"><button class="btn ghost sm" type="button" data-accept="${esc(last.ver)}">Принять альбом (акт сдачи-приёмки)</button></div>` : ''}${last.final && last.accepted ? '<p class="kab-ok">Альбом принят</p>' : ''}`
      : `<p class="kab-empty">Альбом появится здесь, как только будет готов первый вариант. Мы напишем на почту.</p>`;
    const vers = rel.length > 1 ? `<div class="kab-card"><h3>Версии альбома</h3><ul class="kab-list">${rel.slice().reverse().map(r => `<li><div><b>${esc(r.title)}</b> <span class="kab-mut">${esc(day(r.date))}</span>${r.changes.length ? '<div class="kab-mut">Что изменилось: ' + r.changes.map(esc).join('; ') + '</div>' : ''}</div>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Открыть</a>` : ''}</li>`).join('')}</ul></div>` : '';
    const msgs = j.lenta.slice().reverse();
    return `<div class="kab-grid">
      <div class="kab-card"><h3>Бриф</h3><p>${esc(B.objectType || 'Объект')}${B.area ? ', ' + String(B.area).replace('.', ',') + ' м²' : ''}${B.rooms.length ? ' · ' + B.rooms.length + ' помещ.' : ''}</p>${B.style ? '<p class="kab-mut">Стиль: ' + esc(B.style) + '</p>' : ''}<p class="kab-mut">Отправлен ${esc(dt(B.sent))}, файлов: ${B.files}. Дополнить — сообщением ниже.</p></div>
      <div class="kab-card"><h3>Оплата</h3>${pay}</div>
      <div class="kab-card"><h3>Альбом</h3>${album}</div>
      <div class="kab-card"><h3>Вопросы к вам</h3>${R ? (open.length ? `<p>Открыто: <b>${open.length}</b>, отвечено: ${R.items.length - open.length}</p><a class="btn sm" href="#/o/${esc(O.number)}/voprosy">Ответить</a>` : '<p class="kab-empty">Все вопросы отвечены. Спасибо!</p>') : '<p class="kab-empty">Вопросов нет — всё понятно из брифа.</p>'}</div>
      <div class="kab-card"><h3>Правки</h3>${j.reviews.length ? `<p>Последние: ${esc(j.reviews[0].number)} от ${esc(dt(j.reviews[0].at))} — ${esc(j.reviews[0].status)}</p>` : '<p class="kab-empty">Хотите что-то изменить на листе? Отметьте прямо на листе.</p>'}<a class="btn ghost sm" href="#/o/${esc(O.number)}/pravki">К правкам</a></div>
    </div>${vers}
    <div class="kab-card"><h3>Лента заказа</h3>${msgs.length ? '<div class="kab-msgs">' + msgs.map(m => `<div class="kab-msg ${m.mine ? 'mine' : ''}">${esc(m.text)}<small>${esc(m.who)} · ${esc(dt(m.at))}</small></div>`).join('') + '</div>' : '<p class="kab-empty">Напишите нам, если есть вопрос по проекту.</p>'}
      <form id="kabMsg"><textarea class="kab-in" name="text" rows="2" placeholder="Сообщение студии"></textarea><div class="kab-row"><button class="btn sm" type="submit">Отправить</button></div><p class="kab-err" role="alert"></p></form></div>`;
  }

  let qFilter = 'q';
  function voprosy(j) {
    const R = j.registry;
    if (!R) return '<div class="kab-card"><p class="kab-empty">Вопросов к вам нет — всё понятно из брифа. Если появятся, напишем на почту.</p></div>';
    const items = R.items.filter(i => qFilter === 'done' ? i.answer || i.closed : !i.answer && !i.closed && (qFilter === 'q' ? i.kind === 'question' || i.kind === 'conflict' : i.kind === 'decision' || i.kind === 'change'));
    const n = k => R.items.filter(i => !i.answer && !i.closed && (k === 'q' ? i.kind === 'question' || i.kind === 'conflict' : i.kind === 'decision' || i.kind === 'change')).length;
    let h = `<div class="kab-chips" role="tablist"><button type="button" data-qf="q" class="${qFilter === 'q' ? 'on' : ''}">Вопросы (${n('q')})</button><button type="button" data-qf="d" class="${qFilter === 'd' ? 'on' : ''}">Решения (${n('d')})</button><button type="button" data-qf="done" class="${qFilter === 'done' ? 'on' : ''}">Отвечено</button></div>`;
    if (!items.length) h += '<div class="kab-card"><p class="kab-empty">' + (qFilter === 'done' ? 'Пока ничего не отвечено.' : 'Здесь пусто — всё отвечено.') + '</p></div>';
    h += items.map(i => {
      const dec = i.kind === 'decision' || i.kind === 'change';
      const a = i.answer;
      const done = a ? `<p class="kab-ok">${a.decision === 'agree' ? 'Вы согласовали' : a.decision === 'disagree' ? 'Вы предложили своё: ' + esc(a.text) : 'Ваш ответ: ' + esc([a.option, a.text].filter(Boolean).join(' — '))} · ${esc(dt(a.at))}</p>` : i.closed ? '<p class="kab-ok">Учтено в проекте</p>' : '';
      const form = a || i.closed ? '' : dec
        ? `<div class="kab-row"><button class="btn sm" type="button" data-agree="${esc(i.id)}">Согласовать</button></div><details><summary class="kab-mut">Не согласен — предложить своё</summary><textarea class="kab-in" data-dt="${esc(i.id)}" rows="2" placeholder="Что предлагаете вместо этого"></textarea><div class="kab-row"><button class="btn ghost sm" type="button" data-disagree="${esc(i.id)}">Отправить</button></div></details>`
        : `${i.options.length ? '<div class="kab-opts">' + i.options.map(o => `<button type="button" data-opt="${esc(i.id)}" data-v="${esc(o)}">${esc(o)}</button>`).join('') + '</div>' : ''}<textarea class="kab-in" data-at="${esc(i.id)}" rows="2" placeholder="Свой ответ (необязательно, если выбрали вариант)"></textarea><div class="kab-row"><button class="btn sm" type="button" data-ans="${esc(i.id)}">Ответить</button></div>`;
      return `<div class="kab-card kab-q ${i.blocker ? 'blk' : ''} ${dec ? 'dec' : ''}"><div class="kab-kick">${esc(i.id)}${dec ? ' · решение проектировщика' : ''}</div>${i.blocker ? '<span class="kab-tag r">Нужно для финала</span>' : ''}
        <p>${esc(i.text)}</p>${i.why ? '<p class="kab-mut">Почему: ' + esc(i.why) + '</p>' : ''}${i.sheet ? '<p class="kab-mut">Лист: ' + esc(i.sheet) + '</p>' : ''}${i.cost ? '<p class="kab-mut">Влияние на смету: ' + esc(i.cost) + '</p>' : ''}${done}${form}<p class="kab-err" role="alert"></p></div>`;
    }).join('');
    return h + `<p class="kab-mut">Ответ можно изменить, пока не вышла следующая версия альбома — напишите в ленту заказа. Протокол ответов — в «Документах».</p>`;
  }

  function pravki(j) {
    const O = j.order, last = j.releases[j.releases.length - 1];
    const href = last && last.project ? `../review.html?p=${encodeURIComponent(last.project)}&t=${encodeURIComponent(j.remont.rt)}` : '';
    let h = `<div class="kab-card"><h3>Правки по листам</h3><p>Откройте любой лист и нажмите на место, которое хотите изменить, — напишите, что поменять.</p>${href ? `<a class="btn sm" href="${href}" target="_blank" rel="noopener">Отметить правку на листе</a>` : '<p class="kab-mut">Отмечать правки можно, когда выйдет первый вариант альбома.</p>'}
      <p class="kab-mut">${esc(T.roundsText || '')}${j.rounds ? ' · использовано ' + j.rounds.used + ' из ' + j.rounds.max : ''}</p></div>`;
    if (!j.reviews.length) return h + '<div class="kab-card"><p class="kab-empty">Правок пока нет.</p></div>';
    return h + j.reviews.map(r => `<div class="kab-card"><div class="kab-kick">${esc(r.number)} · ${esc(dt(r.at))}</div><p><span class="kab-tag ${/Учтен/.test(r.status) ? 'ok' : /Не прин/.test(r.status) ? 'r' : 'g'}">${esc(r.status)}</span> ${r.count} ${r.count === 1 ? 'метка' : 'меток'}</p>
      ${r.reply ? '<p>Ответ студии: ' + esc(r.reply) + '</p>' : ''}<details><summary class="kab-mut">Что отмечено</summary><ul class="kab-list">${r.notes.map(n => `<li><div>${esc(n.text)}<div class="kab-mut">${esc(n.file)}</div></div></li>`).join('')}</ul></details></div>`).join('');
  }

  function remontTab(j) {
    const R = j.remont;
    const intro = `<div class="kab-card"><h3>Ремонт по проекту — необязательно</h3><p>1. Бригады, прошедшие проверку документов, считают ремонт по вашей смете. 2. Вы выбираете и подписываете с бригадой договор на сайте кодом из письма. 3. Этапы с фото, вы принимаете их по чек-листу.</p>
      <p class="kab-mut">Бригада — самостоятельный подрядчик; LINEA сопровождает сделку («Сделка через LINEA»): договор, переписка, акты в одном месте, рассмотрение разногласий (рекомендация, право на суд сохраняется). Квалификацию и качество работ LINEA не проверяет.</p></div>`;
    if (!R.eligible && !R.hasRequest) return intro + `<div class="kab-card"><p class="kab-empty">${R.chooseAfter === 'final' ? 'Подбор бригады откроется, когда будет готов финальный альбом.' : 'Подбор откроется, когда будет готов первый вариант альбома.'}</p></div>`;
    return (R.hasRequest ? '' : intro) + '<div class="kab-card" id="ordRemont"><p class="kab-mut">Загружаю…</p></div>';
  }

  function bindPay(j) {
    root.querySelectorAll('[data-pay]').forEach(b => b.onclick = async () => { b.disabled = true; const r = await act('pay', { o: j.order.number }); b.disabled = false; if (r.ok && r.url) location.href = r.url; });
  }
  function bindObject(j, tab) {
    const num = j.order.number, q = s => root.querySelector(s), qa = s => root.querySelectorAll(s);
    bindPay(j);
    const m = q('#kabMsg'); if (m) m.onsubmit = async e => { e.preventDefault(); const r = await act('msg', { o: num, text: m.text.value }, m.querySelector('.kab-err')); if (r.ok) object(num, tab); };
    qa('[data-accept]').forEach(b => b.onclick = async () => { if (!await ask('Принять финальный альбом? Это подписание акта сдачи-приёмки проекта (кодом из письма).')) return; const r = await act('accept_album', { o: num, ver: b.dataset.accept }); if (r.ok) object(num, tab); });
    qa('[data-qf]').forEach(b => b.onclick = () => { qFilter = b.dataset.qf; object(num, 'voprosy'); });
    qa('[data-opt]').forEach(b => b.onclick = () => { qa(`[data-opt="${b.dataset.opt}"]`).forEach(x => x.classList.toggle('on', x === b)); });
    const errOf = el => el.closest('.kab-card').querySelector('.kab-err');
    qa('[data-ans]').forEach(b => b.onclick = async () => {
      const id = b.dataset.ans, opt = q(`[data-opt="${CSS.escape(id)}"].on`);
      const r = await act('answer', { o: num, id, option: opt ? opt.dataset.v : '', text: q(`[data-at="${CSS.escape(id)}"]`).value }, errOf(b));
      if (r.ok) object(num, 'voprosy');
    });
    qa('[data-agree]').forEach(b => b.onclick = async () => { const r = await act('decide', { o: num, id: b.dataset.agree, decision: 'agree' }, errOf(b)); if (r.ok) object(num, 'voprosy'); });
    qa('[data-disagree]').forEach(b => b.onclick = async () => { const id = b.dataset.disagree; const r = await act('decide', { o: num, id, decision: 'disagree', text: q(`[data-dt="${CSS.escape(id)}"]`).value }, errOf(b)); if (r.ok) object(num, 'voprosy'); });
  }

  // ── документы
  async function docsInto(el, num) {
    const j = await api('docs', null, num ? '&o=' + encodeURIComponent(num) : '');
    if (!j.ok) { el.innerHTML = '<p>' + esc(j.error) + '</p>'; return; }
    const D = j.docs || [], C = j.consents || [];
    const groups = {}; D.forEach(d => { (groups[d.o] = groups[d.o] || []).push(d); });
    const when = s => !s ? '' : /^\d{4}-\d{2}-\d{2}$/.test(s) ? day(s) : dt(s);
    const item = d => `<li><div><span class="kab-tag">${esc(d.kind)}</span> <b>${esc(d.title)}</b><div class="kab-mut">${esc(when(d.at))}${d.note ? (d.at ? ' · ' : '') + esc(d.note) : ''}</div></div>`
      + (d.href ? `<a class="btn ghost sm" href="${API}kabinet.php?a=${d.href}" target="_blank" rel="noopener">Открыть</a>` : d.ext ? `<a class="btn ghost sm" href="${API}${esc(d.ext)}" target="_blank" rel="noopener">Открыть</a>` : '') + '</li>';
    const cons = o => C.filter(c => (c.order || '') === (o || '')).map(c => `<li><div><span class="kab-tag">Согласие</span> ${esc(c.title)}<div class="kab-mut">редакция ${esc(c.edition)} · дано ${esc(when(c.given))}${c.revoked ? ' · <b>отозвано ' + esc(when(c.revoked)) + '</b>' : ''}</div></div></li>`).join('');
    const orders = Object.keys(groups).concat([...new Set(C.map(c => c.order).filter(o => o && !groups[o]))]);
    let h = orders.map(o => `<div class="kab-card">${num ? '' : `<h3>Заказ ${esc(o)}</h3>`}<ul class="kab-list">${(groups[o] || []).map(item).join('')}${cons(o)}</ul></div>`).join('');
    const general = cons(null);
    if (general) h += `<div class="kab-card"><h3>Общие согласия</h3><ul class="kab-list">${general}</ul></div>`;
    el.innerHTML = h || '<div class="kab-card"><p class="kab-empty">Документы появятся по мере работы: счёт, оплата, альбом, протокол решений.</p></div>';
  }
  async function docsPage() { set(top('docs') + '<h1>Документы</h1><div id="kabDocs"><p class="kab-mut">Загружаю…</p></div>'); bindTop(); docsInto(document.getElementById('kabDocs')); }

  // ── уведомления
  async function notices() {
    const j = await api('notices');
    if (j.auth === false) return loginView();
    const N = j.notices || [];
    let h = top('uv') + '<h1>Уведомления</h1>';
    if (j.guest) h += '<div class="kab-card"><p class="kab-empty">Уведомления — после подтверждения почты кодом.</p></div>';
    else {
      h += N.length ? `<div class="kab-card"><div class="kab-row" style="margin:0 0 6px"><button class="btn ghost sm" type="button" id="kabRead">Отметить всё прочитанным</button></div><ul class="kab-list">${N.map(n => `<li class="${n.unread ? 'unread' : ''}"><div><span class="kab-tag">${esc((j.groups || {})[n.grp] || '')}</span> ${n.link ? `<a href="${esc(n.link)}">${esc(n.text)}</a>` : esc(n.text)}<div class="kab-mut">${esc(dt(n.at))}</div></div></li>`).join('')}</ul></div>` : '<div class="kab-card"><p class="kab-empty">Новостей нет.</p></div>';
      const P = j.prefs || { groups: {} };
      h += `<div class="kab-card"><h3>Письма на почту</h3><form id="kabPrefs">${Object.entries(j.groups || {}).map(([k, t]) => `<label class="kab-cb"><input type="checkbox" name="${k}" ${(P.groups[k] || {}).mail !== false ? 'checked' : ''}> ${esc(t)}</label>`).join('')}
        <label class="kab-f">Сообщения и фото этапов<select name="digest"><option value="now">сразу</option><option value="day"${P.digest === 'day' ? ' selected' : ''}>сводкой раз в день</option></select></label>
        <p class="kab-mut">Оплата, подписи, разногласия и заявки по данным приходят всегда — это юридически значимо, отключить нельзя.</p><button class="btn sm" type="submit">Сохранить</button> <span class="kab-ok" id="kabPrefsOk"></span></form></div>`;
    }
    set(h); bindTop();
    const rd = document.getElementById('kabRead'); if (rd) rd.onclick = async () => { await api('notices_read', {}); ME.unread = 0; notices(); };
    const pf = document.getElementById('kabPrefs');
    if (pf) pf.onsubmit = async e => { e.preventDefault(); const groups = {}; Object.keys(j.groups).forEach(k => groups[k] = { mail: pf[k].checked }); const r = await act('prefs', { groups, digest: pf.digest.value }); if (r.ok) document.getElementById('kabPrefsOk').textContent = 'Сохранено'; };
  }

  // ── профиль и согласия
  async function profile() {
    const j = await api('profile');
    if (j.auth === false) return loginView();
    if (!j.ok) { set(top('pr') + '<h1>Профиль</h1><div class="kab-card"><p>Профиль — после подтверждения почты кодом.</p><button class="btn" type="button" id="kabPC">Подтвердить почту</button></div>'); bindTop(); document.getElementById('kabPC').onclick = async () => { if (await needCode()) route(); }; return; }
    const P = j.profile;
    let h = top('pr') + '<h1>Профиль</h1>';
    h += `<div class="kab-card"><h3>Контакты</h3><form id="kabProf"><label class="kab-f">Как к вам обращаться<input name="name" value="${esc(P.name)}" autocomplete="name"></label><label class="kab-f">Телефон<input name="phone" value="${esc(P.phone)}" autocomplete="tel" inputmode="tel"></label>
      <p class="kab-mut">Почта для входа: ${esc(P.email)}. Сменить почту — напишите нам: подтвердим кодом на старую и новую.</p><button class="btn sm" type="submit">Сохранить</button> <span class="kab-ok"></span><p class="kab-err" role="alert"></p></form></div>`;
    h += `<div class="kab-card"><h3>Устройства</h3><ul class="kab-list">${j.devices.map(d => `<li><div>${esc(uaName(d.ua))} <span class="kab-mut">· ${esc(d.ip)}</span>${d.current ? ' <span class="kab-tag ok">это устройство</span>' : ''}<div class="kab-mut">последний вход ${esc(dt(d.last))}</div></div>${d.current ? '' : `<button class="btn ghost sm" type="button" data-dev="${d.id}">Выйти</button>`}</li>`).join('')}</ul>
      <div class="kab-row"><button class="btn ghost sm" type="button" id="kabOutAll">Выйти на всех устройствах</button></div></div>`;
    h += `<div class="kab-card"><h3>Согласия</h3>${j.consents.length ? '<ul class="kab-list">' + j.consents.map(c => `<li><div>${esc(c.title)}${c.order ? ' <span class="kab-mut">· ' + esc(c.order) + '</span>' : ''}<div class="kab-mut">редакция ${esc(c.edition)} · дано ${esc(dt(c.given))}${c.revoked ? ' · <b>отозвано ' + esc(dt(c.revoked)) + '</b>' : ''}</div></div>${c.revoked ? '' : c.whyNot ? `<div class="kab-mut">${esc(c.whyNot)}</div>` : `<button class="btn ghost sm" type="button" data-rev="${c.id}">Отозвать</button>`}</li>`).join('') + '</ul>' : '<p class="kab-empty">Согласий пока нет.</p>'}<p class="kab-err" id="kabRevErr" role="alert"></p></div>`;
    const blk = j.blockers || [];
    h += `<div class="kab-card"><h3>Мои персональные данные</h3>
      <p><b>Выгрузить мои данные.</b> Соберём архив: бриф, ответы, согласия, подписи. Готовим до ${j.pdDays} рабочих дней (обычно быстрее), скачать — здесь.</p><div class="kab-row"><button class="btn ghost sm" type="button" data-pd="export">Запросить выгрузку</button></div>
      <p style="margin-top:18px"><b>Удалить мои данные.</b> Удалим контакты, бриф, фото и переписку. Договоры, чеки, акты и подписи по закону храним ${j.retentionYears} лет — доступ к ним закрыт. Альбом обезличим.</p>
      ${blk.length ? '<p class="kab-guest">Сейчас удалить нельзя: ' + blk.map(esc).join('; ') + '. Удалим после завершения. Остановить обработку для новых целей можно заявкой «Исправить данные».</p>' : ''}
      <div class="kab-row"><button class="btn ghost sm" type="button" data-pd="delete"${blk.length ? ' data-later="1"' : ''}>${blk.length ? 'Подать заявку на удаление после завершения' : 'Удалить мои данные'}</button><button class="btn ghost sm" type="button" data-pd="fix">Исправить данные / остановить обработку</button></div><p class="kab-err" id="kabPdErr" role="alert"></p>
      ${j.pd.length ? '<h3 style="margin-top:16px">Мои заявки</h3><ul class="kab-list">' + j.pd.map(p => `<li><div>${esc(p.title)} · ${esc(dt(p.created))}<div class="kab-mut">${p.status === 'new' ? 'в работе, срок до ' + esc(day(p.due)) : p.status === 'done' ? 'выполнена ' + esc(dt(p.done)) : 'закрыта'}${p.reply ? ' · ' + esc(p.reply) : ''}</div></div>${p.file ? `<a href="${API}kabinet.php?a=file&pd=${p.id}">Скачать</a>` : ''}</li>`).join('') + '</ul>' : ''}</div>`;
    h += '<p><button class="btn ghost sm" type="button" id="kabOut">Выйти</button></p>';
    set(h); bindTop();
    const f = document.getElementById('kabProf');
    f.onsubmit = async e => { e.preventDefault(); const r = await act('profile', { name: f.name.value, phone: f.phone.value }, f.querySelector('.kab-err')); if (r.ok) f.querySelector('.kab-ok').textContent = 'Сохранено'; };
    root.querySelectorAll('[data-dev]').forEach(b => b.onclick = async () => { await api('device_end', { id: +b.dataset.dev }); profile(); });
    document.getElementById('kabOutAll').onclick = async () => { if (await ask('Выйти на всех устройствах, включая это?')) { await vh('logout', { all: true }); location.hash = '#/'; location.reload(); } };
    document.getElementById('kabOut').onclick = async () => { await vh('logout', {}); location.hash = '#/'; location.reload(); };
    root.querySelectorAll('[data-rev]').forEach(b => b.onclick = async () => { if (!await ask('Отозвать это согласие? Что произойдёт — покажем в ответе.')) return; const r = await act('consent_revoke', { id: +b.dataset.rev }, document.getElementById('kabRevErr')); if (r.ok) { await say(r.message); profile(); } });
    root.querySelectorAll('[data-pd]').forEach(b => b.onclick = async () => {
      const k = b.dataset.pd;
      const note = k === 'fix' ? await askText('Что исправить или остановить?') : '';
      if (note === null) return;
      const later = !!b.dataset.later;
      if (k === 'delete' && later) { if (!await ask('Принять заявку: удалить ваши данные, как только закончатся работы по заказу? Напишем на почту, когда выполним.', 'Подать заявку')) return; const r = await act('pd', { kind: 'delete', later: true }, document.getElementById('kabPdErr')); if (r.ok) { await say(r.message); profile(); } return; }
      if (k === 'delete' && !await ask('Удалить ваши данные? Контакты, бриф и переписку удалим; договоры и подписи — сохраним на срок хранения. Отменить будет нельзя.')) return;
      const r = await act('pd', { kind: k, note }, document.getElementById('kabPdErr'));
      if (r.ok) { await say(r.message); profile(); }
    });
  }

  // ── маршруты
  async function route() {
    const hsh = location.hash || '#/';
    const tk = hsh.match(/^#t=([0-9a-f]{32})/i);
    if (tk) {   // старая ссылка order.html?t= → кабинет: токен сразу убираем из адреса
      history.replaceState(null, '', location.pathname + '#/');
      ME = await vh('me');   // ревью В-1: без csrf сессии link отвечал 403 — «ссылка устарела» у всех старых ссылок
      const j = await vh('link', { t: tk[1] });
      if (!j.ok) return loginView('Ссылка устарела — войдите по почте. Код придёт на почту из брифа.');
      ME = j; location.hash = '#/o/' + j.number; return;
    }
    if (!ME.csrf || !ME.auth) ME = await vh('me');   // не вошли — спросить сервер заново (вход мог случиться в другой вкладке)
    if (!ME.ok) { set('<div class="kab-card"><p>Сервер не ответил. Обновите страницу через минуту.</p></div>'); return; }
    if (hsh === '#/rol' && ME.roles && ME.roles.length > 1) return chooseRole(ME.roles);
    if (!ME.auth && !ME.guest) { document.getElementById('kabBar').hidden = true; return ME.roles && ME.roles.length > 1 && !ME.role ? chooseRole(ME.roles) : loginView(); }
    if (ME.auth && ME.role === 'brigade') { location.href = '../brigada/'; return; }
    const m = hsh.match(/^#\/o\/([A-Za-z0-9-]+)(?:\/([a-z]+))?/);
    if (m) return object(m[1], m[2] || 'proekt');
    if (hsh.startsWith('#/docs')) return docsPage();
    if (hsh.startsWith('#/uvedomleniya')) return notices();
    if (hsh.startsWith('#/profil')) return profile();
    return objects();
  }
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
  route();
})();
