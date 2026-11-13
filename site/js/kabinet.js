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
  // заказ «только смета» (kind = smeta): четыре шага, без альбома, правок и ремонта
  const STEPS_SMETA = ['Заявка', 'Оплата', 'Расчёт', 'Смета готова'];
  const stepsOf = kind => kind === 'smeta' ? STEPS_SMETA : STEPS;
  const steps = (n, kind) => { const S = stepsOf(kind); return `<p class="kab-stepn">Шаг ${n + 1} из ${S.length} · ${esc(S[n] || '')}</p>` + `<ol class="kab-steps" aria-label="${kind === 'smeta' ? 'Шаги заказа сметы' : 'Шаги проекта'}">` + S.map((s, i) => `<li class="${i < n ? 'done' : i === n ? 'on' : ''}">${esc(s)}</li>`).join('') + '</ol>'; };

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
    <h2>${esc(o.objectTitle)}</h2><div class="kab-bar" aria-hidden="true"><i style="width:${Math.round((o.step + 1) / stepsOf(o.kind).length * 100)}%"></i></div><div class="kab-mut">${esc(stepsOf(o.kind)[o.step] || '')} · ${esc(o.statusText)}</div>
    <div class="kab-next ${o.next.who === 'client' ? '' : 'studio'}">${o.next.who === 'client' ? '<b>Нужно от вас:</b> ' : ''}${esc(o.next.text)}</div></a>`;

  // ── объект
  const TABS = [['proekt', 'Проект'], ['brif', 'Бриф'], ['voprosy', 'Вопросы'], ['pravki', 'Правки'], ['istoriya', 'История'], ['remont', 'Ремонт'], ['docs', 'Документы']];
  const TABS_SMETA = [['proekt', 'Смета'], ['brif', 'Бриф'], ['voprosy', 'Вопросы'], ['istoriya', 'История'], ['docs', 'Документы']];
  async function object(num, tab) {
    const j = await api('object', null, '&o=' + encodeURIComponent(num));
    if (j.auth === false) return loginView();
    if (!j.ok) { set(top('o') + `<div class="kab-card"><p>${esc(j.error)}</p><a href="#/">← Мои объекты</a></div>`); bindTop(); return; }
    const O = j.order, R = j.registry;
    const openQ = R ? R.items.filter(i => !i.closed && !i.answer).length : 0;
    let h = top('o') + `<p class="kab-mut"><a href="#/">← Мои объекты</a></p><div class="kab-kick">${esc(O.kindTitle)} · ${esc(O.number)}</div><h1>${esc(O.objectTitle)}</h1>` + steps(j.step, O.kind) + nowBlock(j.next, true)
      + '<nav class="kab-tabs" aria-label="Разделы объекта">' + (O.kind === 'smeta' ? TABS_SMETA : TABS).map(([k, t]) => `<a href="#/o/${esc(O.number)}/${k}"${k === tab ? ' class="on" aria-current="page"' : ''}>${t}${k === 'voprosy' && openQ ? '<b>' + openQ + '</b>' : ''}</a>`).join('') + '</nav>';
    if (O.kind === 'smeta' && !['proekt', 'brif', 'voprosy', 'istoriya', 'docs'].includes(tab)) tab = 'proekt';
    h += ({ proekt: O.kind === 'smeta' ? smetaTab : proekt, brif: () => '<div id="kabBrief"><p class="kab-mut">Загружаю…</p></div>', voprosy: voprosy, pravki: pravki, istoriya: istoriya, remont: remontTab, docs: () => '<div id="kabDocs"><p class="kab-mut">Загружаю…</p></div>' }[tab] || proekt)(j);
    set(h); bindTop(); bindObject(j, tab);
    // активные вкладка и шаг — в видимой зоне ленты (на телефоне ленты прокручиваются вбок); страницу по вертикали не двигаем
    for (const [box, sel] of [['.kab-tabs', 'a.on'], ['.kab-steps', 'li.on']]) { const b = root.querySelector(box), e = b && b.querySelector(sel); if (e) b.scrollLeft = e.offsetLeft - (b.clientWidth - e.offsetWidth) / 2; }
    // главная кнопка — липкая на телефоне
    const src = root.querySelector('.kab-sticky-src');
    // (на телефоне) липкая копия главной кнопки показывается, только пока настоящая кнопка ушла с экрана — иначе две одинаковые кнопки
    if (src && matchMedia('(max-width:760px)').matches) {
      const st = document.createElement('div'); st.className = 'kab-sticky'; st.hidden = true; st.innerHTML = src.innerHTML; root.appendChild(st); bindPay(j);
      if ('IntersectionObserver' in window) new IntersectionObserver(es => { st.hidden = es[0].isIntersecting; }).observe(src); else st.hidden = false;
    }
    if (tab === 'remont') { const box = document.getElementById('ordRemont'); if (box && window.lineaRemont && (j.remont.eligible || j.remont.hasRequest)) window.lineaRemont(box, j.remont.rt, API); }
    if (tab === 'docs') docsInto(document.getElementById('kabDocs'), O.number);
    if (tab === 'brif') briefInto(document.getElementById('kabBrief'), j);
  }

  const payCard = (j, O) => {
    const P = j.pay || {};
    let pay = '';
    if (O.status === 'awaiting_payment' || O.status === 'new') {
      const bund = (j.options || []).filter(x => x.status === 'awaiting_payment' && x.bundled);
      // опции заказа («Смета на материалы») идут отдельными строками; в сумме платежа — вместе с проектом
      const optLines = bund.length ? bund.map(x => `<p class="kab-optline"><span>${esc(x.title)}</span><b>${x.amountKnown ? rub(x.amount) : 'сумму подтвердим'}</b></p>`).join('')
        + (P.totalDue && bund.every(x => x.amountKnown) ? `<p class="kab-optline kab-optsum"><span>Итого к оплате</span><b>${rub(P.totalDue / 100)}</b></p>` : '') : '';
      pay = O.amount ? `${bund.length ? '<p class="kab-optline"><span>Дизайн-проект</span><b>' + rub(O.amount) + '</b></p>' + optLines : `<div class="ord-sum" style="font-family:var(--serif);font-size:28px;color:var(--gold)">${rub(O.amount)}</div>`}${P.formula ? `<p class="kab-mut kab-formula">${esc(P.formula)}</p>` : O.area ? `<p class="kab-mut">${String(O.area).replace('.', ',')} м² по брифу</p>` : ''}${O.amountConfirmed === false ? '<p class="kab-mut">' + esc(T.areaRecalc || '') + '</p>' : ''}`
        + (O.canPay ? '<button class="btn" type="button" data-pay>Оплатить картой или СБП</button>' : O.invoiced ? '<p>Счёт отправлен на почту — оплатите по реквизитам из счёта.</p>' : '<p class="kab-mut">Счёт на оплату пришлём на почту.</p>')
        : '<p>Сумму пересчитаем по плану и подтвердим в течение рабочего дня.</p>';
      if (P.includes && P.includes.length) pay += `<details class="kab-det"><summary>Что входит в стоимость</summary><ul class="kab-ul">${P.includes.map(x => '<li>' + esc(x) + '</li>').join('')}</ul>${P.notIncluded && P.notIncluded.length ? '<p class="kab-mut">Не входит:</p><ul class="kab-ul">' + P.notIncluded.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : ''}</details>`;
      pay += `<p class="kab-mut kab-legal">${P.requisites ? esc(P.requisites) + '. ' : ''}<a href="../${esc(P.refund || 'oplata/')}" target="_blank" rel="noopener">Оплата и возврат</a> · <a href="../${esc(P.offer || 'oferta/')}" target="_blank" rel="noopener">Оферта</a></p>`;
      { const tc = j.termsCall || T.call; const tt = tc && typeof tc === 'object' ? [tc.title, tc.line].filter(Boolean).join('. ') : tc; if (tt) pay += '<p class="kab-mut">' + esc(tt) + '</p>'; }
    } else if (O.paidAt) pay = `<p><span class="kab-tag ok">Оплачено</span> ${O.amount ? rub(O.amount) : ''} · ${esc(dt(O.paidAt))}</p>${P.formula ? `<p class="kab-mut">${esc(P.formula)}</p>` : ''}<p class="kab-mut">Чек об оплате — в письме сервиса онлайн-оплаты; копия — в «Документах».</p>`;
    else pay = `<p>${esc(O.statusText)}</p>`;
    return pay;
  };
  // Опции заказа («Смета на материалы»): статус, оплата отдельной строкой, файлы после выдачи; кнопка «Добавить», если опции ещё нет
  const optionsCards = j => {
    const A = (j.pay && j.pay.addons) || {};
    const o = j.order, num = esc(o.number);
    const detail = ad => ad && ad.includes ? `<details class="kab-det"><summary>Что в смете</summary><ul class="kab-ul">${ad.includes.map(x => '<li><b>' + esc(x[0]) + ':</b> ' + esc(x[1]) + '</li>').join('')}</ul><ul class="kab-ul">${(ad.features || []).map(x => '<li>' + esc(x) + '</li>').join('')}</ul><p class="kab-mut">${esc(ad.priceNote || '')}. Формат: ${esc(ad.format || '')}.</p>${ad.excludes ? '<p class="kab-mut">Чего нет: ' + ad.excludes.map(esc).join('; ') + '.</p>' : ''}</details>` : '';
    let h = '';
    for (const x of j.options || []) {
      const ad = A[x.key] || {};
      let body = '';
      if (x.status === 'awaiting_payment') {
        body = `<p><span class="kab-tag g">Ждёт оплаты</span> ${x.amountKnown ? '<b>' + rub(x.amount) + '</b>' : 'сумму подтвердим в течение рабочего дня'}</p>`
          + (x.bundled ? '<p class="kab-mut">Оплачивается вместе с проектом — одной оплатой, в чеке отдельной строкой.</p>'
            : x.canPay ? `<button class="btn sm" type="button" data-optpay="${esc(x.key)}">Оплатить ${rub(x.amount)} картой или СБП</button>`
            : x.invoiced ? '<p>Счёт отправлен на почту — оплатите по реквизитам из счёта.</p>' : x.amountKnown ? '<p class="kab-mut">Счёт на оплату пришлём на почту.</p>' : '');
      } else if (x.status === 'paid') {
        body = `<p><span class="kab-tag ok">Оплачено</span> ${rub(x.amount)} · ${esc(dt(x.paidAt))}</p><p>Смета в работе. ${esc(ad.termLine || '')}. Файлы появятся здесь, письмо придёт на почту.</p>`;
      } else if (x.status === 'delivered') {
        body = `<p><span class="kab-tag ok">Готова</span> ${esc(dt(x.deliveredAt))}</p><div class="kab-row">${x.files.map(f => `<a class="btn sm" href="${API}kabinet.php?a=ofile&o=${encodeURIComponent(o.number)}&opt=${encodeURIComponent(x.key)}&f=${encodeURIComponent(f.name)}&dl=1" download>${esc(f.label)}</a>`).join('')}</div>`
          + `<p class="kab-mut">${esc(ad.priceNote || 'В смете количество материалов, без цен')}.</p>`;
      }
      h += `<div class="kab-card" data-opt-card="${esc(x.key)}"><h3>${esc(x.title)}</h3>${body}${detail(ad)}</div>`;
    }
    for (const av of j.optionsAvailable || []) {
      const ad = A[av.key] || {};
      h += `<div class="kab-card" data-opt-avail="${esc(av.key)}"><h3>${esc(av.title)} <span class="kab-tag">по желанию</span></h3>`
        + `<p>${esc(ad.what ? ad.what[0].toUpperCase() + ad.what.slice(1) : 'Дополнение к проекту')}.</p>`
        + `<p class="kab-mut">${av.amount ? rub(av.amount) + ' — ' : ''}${esc(ad.line || '')}. Оплачивается отдельной строкой.</p>`
        + `<button class="btn sm" type="button" data-optadd="${esc(av.key)}">Добавить ${esc(av.title.toLowerCase().replace(/^смета/, 'смету'))}${av.amount ? ' — ' + rub(av.amount) : ''}</button><p class="kab-err" role="alert"></p>${detail(ad)}</div>`;
    }
    return h;
  };
  const statusCard = j => {
    const ex = j.expected, st = j.stage;
    if (!ex && !st) return '';
    return `<div class="kab-card kab-status">${st ? `<p><b>${esc(st.title)}</b>${st.text ? ' — ' + esc(st.text) : ''} <span class="kab-mut">· ${esc(dt(st.at))}</span></p>` : ''}${ex ? `<p>Ожидаем к <b>${esc(ex.label)}</b>${ex.late ? ' <span class="kab-tag r">срок сдвинулся</span>' : ''}${ex.note ? '<br><span class="kab-mut">' + esc(ex.note) + '</span>' : ''}${ex.late ? '<br><span class="kab-mut">Мы напишем, когда будет точная дата.</span>' : ''}</p>` : ''}</div>`;
  };

  // заказ «только смета»: статус, бриф, оплата, готовые файлы, лента — без альбома, правок и ремонта
  function smetaTab(j) {
    const O = j.order, B = j.brief, A = ((j.pay && j.pay.addons) || {}).smeta || {}, S = A.solo || {};
    const x = (j.options || []).find(o => o.key === 'smeta');
    let files;
    if (x && x.status === 'delivered') files = `<p><span class="kab-tag ok">Готова</span> ${esc(dt(x.deliveredAt))}</p><div class="kab-row">${x.files.map(f => `<a class="btn sm" href="${API}kabinet.php?a=ofile&o=${encodeURIComponent(O.number)}&opt=smeta&f=${encodeURIComponent(f.name)}&dl=1" download>${esc(f.label)}</a>`).join('')}</div><p class="kab-mut">${esc(A.priceNote || 'В смете количество материалов, без цен')}.</p>`;
    else if (x && x.status === 'paid') files = `<p><span class="kab-tag g">В работе</span> Считаем смету. ${esc(S.term ? 'Срок — ' + S.term : '')}. Файлы появятся здесь, письмо придёт на почту.</p>`;
    else files = '<p class="kab-empty">Файлы появятся здесь после оплаты и расчёта: PDF для чтения и таблица для закупки.</p>';
    const accur = S.accuracyList ? `<details class="kab-det"><summary>Насколько точна смета</summary><ul class="kab-ul">${S.accuracyList.map(t => '<li>' + esc(t) + '</li>').join('')}</ul><p class="kab-mut">${esc(S.noCheck || '')}.</p></details>` : '';
    const inc = A.includes ? `<details class="kab-det"><summary>Что входит в смету</summary><ul class="kab-ul">${A.includes.map(t => '<li><b>' + esc(t[0]) + ':</b> ' + esc(t[1]) + '</li>').join('')}</ul><ul class="kab-ul">${(A.features || []).map(t => '<li>' + esc(t) + '</li>').join('')}</ul><p class="kab-mut">Формат: ${esc(A.format || '')}.</p></details>` : '';
    const msgs = j.lenta.slice().reverse();
    return statusCard(j) + `<div class="kab-grid">
      <div class="kab-card"><h3>Заказ</h3><p>Квартира${B.area ? ', ' + String(B.area).replace('.', ',') + ' м²' : ''}</p><p class="kab-mut">Отправлен ${esc(dt(B.sent))}, файлов: ${B.files}.</p><a class="btn ghost sm" href="#/o/${esc(O.number)}/brif">Посмотреть и догрузить файлы</a></div>
      <div class="kab-card"><h3>Оплата</h3>${payCard(j, O)}</div>
      <div class="kab-card" data-smeta-files><h3>Смета на материалы</h3>${files}${accur}${inc}</div>
    </div>
    <div class="kab-card"><h3>Лента заказа</h3>${msgs.length ? '<div class="kab-msgs">' + msgs.map(m => `<div class="kab-msg ${m.mine ? 'mine' : ''}">${esc(m.text)}<small>${esc(m.who)} · ${esc(dt(m.at))}</small></div>`).join('') + '</div>' : '<p class="kab-empty">Напишите нам, если есть вопрос по смете.</p>'}
      <form id="kabMsg"><textarea class="kab-in" name="text" rows="2" placeholder="Сообщение студии"></textarea><div class="kab-row"><button class="btn sm" type="submit">Отправить</button></div><p class="kab-err" role="alert"></p></form></div>`;
  }

  // эскиз (12.11.2026): 3D-вид квартиры сверху и интерьеры по плану клиента — до полного проекта; правки словами (круги), согласование
  function eskizCard(j) {
    const E = j.eskiz, num = j.order.number;
    if (!E) return '';
    if (E.state === 'work') return `<div class="kab-card kab-eskiz"><h3>Эскиз</h3><p class="kab-empty">${esc(E.text)}</p></div>`;
    const img = x => `<a href="${API}kabinet.php?a=${x.full}" target="_blank" rel="noopener"><img src="${API}kabinet.php?a=${x.img}" alt="" loading="lazy" style="width:100%;border-radius:8px;display:block"></a>`;
    const rooms = E.rooms.map(r => `<figure style="margin:0">${img(r)}<figcaption class="kab-mut">${esc(r.title)}</figcaption></figure>`).join('');
    const fixes = E.fixes.length ? '<ul class="kab-list">' + E.fixes.map((f, i) => `<li><div><b>Правка ${i + 1}</b> <span class="kab-mut">${esc(dt(f.date))}</span><div>${esc(f.text)}</div>${f.summary ? '<div class="kab-mut">Сделано: ' + esc(f.summary) + '</div>' : ''}${f.geometry && f.geometry.length ? '<div class="kab-mut">Про планировку: ' + esc(f.geometry.join('; ')) + ' — уточним с вами отдельно</div>' : ''}</div></li>`).join('') + '</ul>' : '';
    const busy = E.state === 'redraw' ? '<p><span class="kab-tag g">Перерисовываем по вашей правке</span> обычно 5–10 минут — обновите страницу.</p>' : '';
    const tools = E.approved ? `<p class="kab-ok">Эскиз согласован ${esc(dt(E.approved.date))} — начинаем полный проект.</p>`
      : E.state === 'redraw' ? '' : `${E.roundsLeft ? `<textarea class="kab-in" id="eskFix" rows="3" placeholder="Что поменять — словами: например, «диван зелёный бархат», «в детской кровать-домик», «кухню светлее»"></textarea>
        <div class="kab-row"><button class="btn ghost sm" type="button" id="eskFixBtn">Отправить правку</button><span class="kab-mut">Осталось кругов правок: ${E.roundsLeft} из ${E.rounds}</span></div>` : '<p class="kab-mut">Круги правок эскиза использованы — если нужно ещё, напишите в ленту заказа.</p>'}
        <div class="kab-row"><button class="btn sm" type="button" id="eskOk"${E.replanAnswered ? '' : ' disabled'}>Согласовать эскиз</button>${E.replanAnswered ? '' : '<span class="kab-mut">Сначала ответьте в брифе, менять ли планировку</span>'}</div><p class="kab-err" role="alert" id="eskErr"></p>`;
    return `<div class="kab-card kab-eskiz"><h3>Эскиз — версия ${E.version}</h3><p class="kab-mut">Так будет выглядеть квартира: вид сверху по вашему плану и интерьеры. Это эскиз до полного проекта — мебель и цвета обсуждаем словами.</p>
      ${E.top ? img(E.top) : ''}<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:12px">${rooms}</div>${busy}${fixes}${tools}</div>`;
  }

  function proekt(j) {
    const O = j.order, B = j.brief, rel = j.releases, last = rel[rel.length - 1];
    const R = j.registry, open = R ? R.items.filter(i => !i.closed && !i.answer) : [];
    const pay = payCard(j, O);
    const album = last ? `<p><b>${esc(last.title)}</b> · ${esc(day(last.date))} ${last.prelim ? '<span class="kab-tag g">Предварительный — для обсуждения</span>' : ''}${last.final ? '<span class="kab-tag ok">Финальный — для стройки</span>' : ''}</p>
        <div class="kab-row">${last.url && /^(https?:\/\/|\/|\.\.?\/)/i.test(last.url) ? `<a class="btn sm" href="${esc(last.url)}" target="_blank" rel="noopener">Открыть альбом</a>` : ''}${last.pdf ? `<a class="btn ghost sm" href="${API}kabinet.php?a=file&o=${encodeURIComponent(O.number)}&v=${encodeURIComponent(last.ver)}&f=album.pdf" target="_blank" rel="noopener">Скачать PDF</a>` : ''}</div>
        ${last.final && !last.accepted ? `<div class="kab-row"><button class="btn ghost sm" type="button" data-accept="${esc(last.ver)}">Принять альбом (акт сдачи-приёмки)</button></div>` : ''}${last.final && last.accepted ? '<p class="kab-ok">Альбом принят</p>' : ''}`
      : `<p class="kab-empty">Альбом появится здесь, как только будет готов первый вариант. Мы напишем на почту.</p>`;
    const vers = rel.length > 1 ? `<div class="kab-card"><h3>Версии альбома</h3><ul class="kab-list">${rel.slice().reverse().map(r => `<li><div><b>${esc(r.title)}</b> <span class="kab-mut">${esc(day(r.date))}</span>${r.changes.length ? '<div class="kab-mut">Что изменилось: ' + r.changes.map(esc).join('; ') + '</div>' : ''}</div>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Открыть</a>` : ''}</li>`).join('')}</ul></div>` : '';
    const msgs = j.lenta.slice().reverse();
    return statusCard(j) + eskizCard(j) + `<div class="kab-grid">
      <div class="kab-card"><h3>Бриф</h3><p>${esc(B.objectType || 'Объект')}${B.area ? ', ' + String(B.area).replace('.', ',') + ' м²' : ''}${B.rooms.length ? ' · ' + B.rooms.length + ' помещ.' : ''}</p>${B.style ? '<p class="kab-mut">Стиль: ' + esc(B.style) + '</p>' : ''}<p class="kab-mut">Отправлен ${esc(dt(B.sent))}, файлов: ${B.files}.</p><a class="btn ghost sm" href="#/o/${esc(O.number)}/brif">Посмотреть и дополнить</a></div>
      <div class="kab-card"><h3>Оплата</h3>${pay}</div>
      ${optionsCards(j)}
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
    let h = (R.answerBy && !R.items.every(i => i.answer || i.closed) ? `<div class="kab-card kab-status"><p>Просим ответить до <b>${esc(day(R.answerBy))}</b>, чтобы не сдвигать срок. Нужно время или документ — нажмите «Отвечу позже», вопрос не пропадёт.</p></div>` : '') + `<div class="kab-chips" role="tablist"><button type="button" data-qf="q" class="${qFilter === 'q' ? 'on' : ''}">Вопросы (${n('q')})</button><button type="button" data-qf="d" class="${qFilter === 'd' ? 'on' : ''}">Решения (${n('d')})</button><button type="button" data-qf="done" class="${qFilter === 'done' ? 'on' : ''}">Отвечено</button></div>`;
    if (!items.length) h += '<div class="kab-card"><p class="kab-empty">' + (qFilter === 'done' ? 'Пока ничего не отвечено.' : 'Здесь пусто — всё отвечено.') + '</p></div>';
    h += items.map(i => {
      const dec = i.kind === 'decision' || i.kind === 'change';
      const a = i.answer;
      const done = a ? `<p class="kab-ok">${a.decision === 'agree' ? 'Вы согласовали' : a.decision === 'disagree' ? 'Вы предложили своё: ' + esc(a.text) : 'Ваш ответ: ' + esc([a.option, a.text].filter(Boolean).join(' — '))} · ${esc(dt(a.at))}</p>` : i.closed ? '<p class="kab-ok">Учтено в проекте</p>' : '';
      const files = (i.files || []).length ? `<p class="kab-mut">Приложено: ${i.files.map(esc).join(', ')}</p>` : '';
      const tools = a || i.closed ? '' : `<div class="kab-row kab-qtools"><button class="btn ghost sm" type="button" data-later="${esc(i.id)}"${i.later ? ' data-undo="1"' : ''}>${i.later ? 'Вернуть в работу' : 'Отвечу позже'}</button>${dec ? '' : `<label class="btn ghost sm kab-file">Приложить фото или файл<input type="file" multiple hidden data-qup="${esc(i.id)}" accept="image/*,.pdf,.dwg,.dxf"></label>`}</div>`;
      const form = a || i.closed ? '' : dec
        ? `<div class="kab-row"><button class="btn sm" type="button" data-agree="${esc(i.id)}">Согласовать</button></div><details><summary class="kab-mut">Не согласен — предложить своё</summary><textarea class="kab-in" data-dt="${esc(i.id)}" rows="2" placeholder="Что предлагаете вместо этого"></textarea><div class="kab-row"><button class="btn ghost sm" type="button" data-disagree="${esc(i.id)}">Отправить</button></div></details>`
        : `${i.options.length ? '<div class="kab-opts">' + i.options.map(o => `<button type="button" data-opt="${esc(i.id)}" data-v="${esc(o)}">${esc(o)}</button>`).join('') + '</div>' : ''}<textarea class="kab-in" data-at="${esc(i.id)}" rows="2" placeholder="Свой ответ (необязательно, если выбрали вариант)"></textarea><div class="kab-row"><button class="btn sm" type="button" data-ans="${esc(i.id)}">Ответить</button></div>`;
      return `<div class="kab-card kab-q ${i.blocker ? 'blk' : ''} ${dec ? 'dec' : ''}"><div class="kab-kick">${esc(i.id)}${dec ? ' · решение проектировщика' : ''}</div>${i.blocker ? '<span class="kab-tag r">Нужно для финала</span>' : ''}
        ${i.later && !a ? '<span class="kab-tag g">Отвечу позже</span>' : ''}<p>${esc(i.text)}</p>${i.why ? '<p class="kab-mut">Почему: ' + esc(i.why) + '</p>' : ''}${i.sheet ? '<p class="kab-mut">Лист: ' + esc(i.sheet) + '</p>' : ''}${i.cost ? '<p class="kab-mut">Влияние на смету: ' + esc(i.cost) + '</p>' : ''}${done}${form}${files}${tools}<p class="kab-err" role="alert"></p></div>`;
    }).join('');
    return h + `<p class="kab-mut">Ответ можно изменить, пока не вышла следующая версия альбома — напишите в ленту заказа. Протокол ответов — в «Документах».</p>`;
  }

  function pravki(j) {
    const O = j.order, last = j.releases[j.releases.length - 1];
    const href = last && last.project ? `../review.html?p=${encodeURIComponent(last.project)}&t=${encodeURIComponent(j.remont.rt)}` : '';
    let h = `<div class="kab-card"><h3>Правки по листам</h3><p>Откройте любой лист и нажмите на место, которое хотите изменить, — напишите, что поменять.</p>${href ? `<a class="btn sm" href="${href}" target="_blank" rel="noopener">Отметить правку на листе</a>` : '<p class="kab-mut">Отмечать правки можно, когда выйдет первый вариант альбома.</p>'}
      <p class="kab-mut">${esc((j.pay && j.pay.roundsText) || T.roundsText || '')}</p>${j.rounds ? `<div class="kab-rounds" aria-label="Круги правок"><div class="kab-dots">${Array.from({ length: j.rounds.max }, (_, k) => `<i class="${k < j.rounds.used ? 'on' : ''}"></i>`).join('')}</div><span>Использовано ${j.rounds.used} из ${j.rounds.max}${j.rounds.left ? ' · осталось ' + j.rounds.left : ' · дальше — по согласованию со студией'}</span></div>` : ''}</div>`;
    if (!j.reviews.length) return h + '<div class="kab-card"><p class="kab-empty">Правок пока нет.</p></div>';
    return h + j.reviews.map(r => `<div class="kab-card"><div class="kab-kick">${esc(r.number)} · ${esc(dt(r.at))}</div><p><span class="kab-tag ${/Учтен/.test(r.status) ? 'ok' : /Не прин/.test(r.status) ? 'r' : 'g'}">${esc(r.status)}</span> ${r.count} ${r.count === 1 ? 'метка' : 'меток'}</p>
      ${r.reply ? '<p>Ответ студии: ' + esc(r.reply) + '</p>' : ''}<details><summary class="kab-mut">Что отмечено</summary><ul class="kab-list">${r.notes.map(n => `<li><div>${esc(n.text)}<div class="kab-mut">${esc(n.file)}</div></div></li>`).join('')}</ul></details></div>`).join('');
  }

  const HK = { brief: 'Бриф', money: 'Оплата', status: 'Статус', album: 'Альбом', answer: 'Ответ', sign: 'Подпись', review: 'Правки', file: 'Файл', stage: 'Этап', msg: 'Сообщение' };
  function istoriya(j) {
    const H = j.history || [];
    if (!H.length) return '<div class="kab-card"><p class="kab-empty">История появится, как только в заказе что-то произойдёт.</p></div>';
    let last = '';
    return '<div class="kab-card kab-hist">' + H.map(e => {
      const d = day(String(e.at).slice(0, 10)), head = d !== last ? `<h3 class="kab-hd">${esc(d)}</h3>` : ''; last = d;
      return `${head}<div class="kab-he ${e.who === 'client' ? 'mine' : ''}"><span class="kab-tag${e.kind === 'money' ? ' g' : ''}">${esc(HK[e.kind] || 'Событие')}</span><div><b>${esc(e.title)}</b>${e.text ? '<div class="kab-mut">' + esc(e.text) + '</div>' : ''}<small class="kab-mut">${esc(dt(e.at))}</small></div></div>`;
    }).join('') + '</div>';
  }

  // ── вкладка «Бриф»: ответы человеческими словами, файлы, догрузка, доп. вопросы
  async function briefInto(el, j) {
    const num = j.order.number, r = await api('brief', null, '&o=' + encodeURIComponent(num));
    if (!r.ok) { el.innerHTML = '<div class="kab-card"><p>' + esc(r.error || 'Не получилось загрузить бриф') + '</p></div>'; return; }
    const V = r.view, rows = rs => '<dl class="kab-dl">' + rs.map(x => `<dt>${esc(x[0])}</dt><dd${x[2] === 'unknown' ? ' class="kab-mut"' : ''}>${esc(x[1])}</dd>`).join('') + '</dl>';
    let h = `<div class="kab-card"><h3>Отправлено ${esc(dt(r.sent))}</h3><p class="kab-mut">${V.kind === 'smeta' ? 'Так ваш заказ видим мы' : 'Так ваш бриф видит дизайнер'}. Если что-то изменилось — напишите в ленте заказа или дополните ниже.</p></div>`;
    h += V.sections.map(sc => `<details class="kab-card kab-det" ${['object', 'story', 'smeta-mode'].includes(sc.id) ? 'open' : ''}><summary><b>${esc(sc.title)}</b></summary>${sc.text ? '<p class="kab-story">' + esc(sc.text) + '</p>' : ''}${sc.rows.length ? rows(sc.rows) : ''}</details>`).join('');
    const SOLO = V.kind === 'smeta';   // бриф сметы: шагов «жизнь / двери и свет / дом и ремонт» нет
    const SETS = SOLO ? [] : [['life', 'Жизнь в квартире'], ['tech', 'Двери, свет и электрика'], ['home', 'Дом и ремонт']];
    const missing = SETS.filter(([k]) => !V[k] || !V[k].present || V[k].info.skipped);
    for (const [k, t] of SETS) {
      const S = V[k]; if (!S || !S.present || !S.groups.length) continue;
      h += `<details class="kab-card kab-det"><summary><b>${esc(t)}</b> <span class="kab-mut">· ответов: ${S.info.answered}</span></summary>${S.groups.map(g => `<h4>${esc(g.title)}</h4>${rows(g.rows)}`).join('')}</details>`;
    }
    if (!SOLO) h += `<div class="kab-card"><h3>Дополнительные вопросы</h3>${missing.length ? `<p class="kab-mut">Не заполнено: ${missing.map(([, t]) => '«' + esc(t) + '»').join(', ')}. Это необязательно — но чем больше мы знаем, тем меньше уточнений на обмере.</p>` : '<p class="kab-mut">Все необязательные шаги заполнены. Можно поправить ответы.</p>'}<a class="btn sm" href="../brief.html?add=${encodeURIComponent(j.remont.rt)}">${missing.length ? 'Ответить на дополнительные вопросы' : 'Изменить ответы'}</a></div>`;
    const fl = r.files || [];
    h += `<div class="kab-card"><h3>Файлы (${fl.length})</h3>${fl.length ? '<ul class="kab-files">' + fl.map(f => {
      const u = `${API}kabinet.php?a=bfile&o=${encodeURIComponent(num)}&s=${encodeURIComponent(f.src)}&n=${encodeURIComponent(f.name)}`;
      return `<li>${f.img ? `<a href="${u}" target="_blank" rel="noopener"><img src="${u}&inl=1" alt="" loading="lazy" width="64" height="64"></a>` : '<span class="kab-ico" aria-hidden="true">📄</span>'}<div><a href="${u}" target="_blank" rel="noopener">${esc(f.orig || f.name)}</a><div class="kab-mut">${Math.max(1, Math.round(f.size / 1024))} КБ · ${esc(dt(f.at))}${f.q ? ' · к вопросу ' + esc(f.q) : ''}</div></div></li>`; }).join('') + '</ul>' : '<p class="kab-empty">Файлов нет.</p>'}
      <form id="kabUp"><label class="btn ghost sm kab-file">Догрузить план или фото<input type="file" name="files" multiple hidden accept="image/*,.pdf,.dwg,.dxf,.heic"></label> <span class="kab-mut" id="kabUpN"></span>
      <p class="kab-mut">До ${r.maxFiles} файлов за раз, каждый до ${r.maxMb} МБ. Загрузка подтверждается кодом из письма.</p><p class="kab-err" role="alert"></p></form></div>`;
    el.innerHTML = h;
    const f = el.querySelector('#kabUp'); if (f) f.querySelector('input').onchange = async e => { const er = f.querySelector('.kab-err'); er.textContent = ''; if (e.target.files.length) { const x = await upload(num, e.target.files, '', er); if (x) object(num, 'brif'); } };
  }
  // догрузка файлов (multipart): при needCode — окно кода и повтор
  async function upload(num, fl, q, errEl) {
    const go = async () => { const fd = new FormData(); fd.append('o', num); if (q) fd.append('q', q); [...fl].forEach(x => fd.append('files[]', x)); fd.append('csrf', ME.csrf || '');
      try { const r = await fetch(API + 'kabinet.php?a=upload', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF': ME.csrf || '' }, body: fd }); return await r.json(); } catch { return { ok: false, error: 'Нет связи с сервером' }; } };
    let j = await go();
    if (j.needCode && await needCode()) j = await go();
    if (!j.ok) { if (errEl) errEl.textContent = j.error || 'Не получилось загрузить'; return false; }
    if (j.errors && j.errors.length && errEl) errEl.textContent = j.errors.join('. ');
    return true;
  }

  function remontTab(j) {
    const R = j.remont;
    const intro = `<div class="kab-card"><h3>Ремонт по проекту — необязательно</h3><p>1. Бригады, прошедшие проверку документов, считают ремонт по вашей смете. 2. Вы выбираете и подписываете с бригадой договор на сайте кодом из письма. 3. Этапы с фото, вы принимаете их по чек-листу.</p>
      <p class="kab-mut">Бригада — самостоятельный подрядчик; LINEA сопровождает сделку («Сделка через LINEA»): договор, переписка, акты в одном месте, рассмотрение разногласий (рекомендация, право на суд сохраняется). Квалификацию и качество работ LINEA не проверяет.</p></div>`;
    if (!R.eligible && !R.hasRequest) return intro + `<div class="kab-card"><p class="kab-empty">${R.chooseAfter === 'final' ? 'Подбор бригады откроется, когда будет готов финальный альбом.' : 'Подбор откроется, когда будет готов первый вариант альбома.'}</p></div>`;
    return (R.hasRequest ? '' : intro) + '<div class="kab-card" id="ordRemont"><p class="kab-mut">Загружаю…</p></div>';
  }

  function bindPay(j) {
    root.querySelectorAll('[data-optpay]').forEach(b => b.onclick = async () => { b.disabled = true; const r = await act('opt_pay', { o: j.order.number, opt: b.dataset.optpay }); b.disabled = false; if (r.ok && r.url) location.href = r.url; });
    root.querySelectorAll('[data-optadd]').forEach(b => b.onclick = async () => {
      const r = await act('opt_add', { o: j.order.number, opt: b.dataset.optadd }, b.parentNode.querySelector('.kab-err'));
      if (r.ok) object(j.order.number, 'proekt');
    });
    root.querySelectorAll('[data-pay]').forEach(b => b.onclick = async () => { b.disabled = true; const r = await act('pay', { o: j.order.number }); b.disabled = false; if (r.ok && r.url) location.href = r.url; });
  }
  function bindObject(j, tab) {
    const num = j.order.number, q = s => root.querySelector(s), qa = s => root.querySelectorAll(s);
    bindPay(j);
    const m = q('#kabMsg'); if (m) m.onsubmit = async e => { e.preventDefault(); const r = await act('msg', { o: num, text: m.text.value }, m.querySelector('.kab-err')); if (r.ok) object(num, tab); };
    const ef = q('#eskFixBtn'); if (ef) ef.onclick = async () => { const r = await act('eskiz_fix', { o: num, text: q('#eskFix').value }, q('#eskErr')); if (r.ok) object(num, tab); };
    const eo = q('#eskOk'); if (eo) eo.onclick = async () => { if (!await ask('Согласовать эскиз? После этого начинаем полный проект: чертежи и альбом по этому эскизу.')) return; const r = await act('eskiz_approve', { o: num }, q('#eskErr')); if (r.ok) object(num, tab); };
    qa('[data-accept]').forEach(b => b.onclick = async () => { if (!await ask('Принять финальный альбом? Это подписание акта сдачи-приёмки проекта (кодом из письма).')) return; const r = await act('accept_album', { o: num, ver: b.dataset.accept }); if (r.ok) object(num, tab); });
    qa('[data-qf]').forEach(b => b.onclick = () => { qFilter = b.dataset.qf; object(num, 'voprosy'); });
    qa('[data-opt]').forEach(b => b.onclick = () => { qa(`[data-opt="${b.dataset.opt}"]`).forEach(x => x.classList.toggle('on', x === b)); });
    const errOf = el => el.closest('.kab-card').querySelector('.kab-err');
    qa('[data-ans]').forEach(b => b.onclick = async () => {
      const id = b.dataset.ans, opt = q(`[data-opt="${CSS.escape(id)}"].on`);
      const r = await act('answer', { o: num, id, option: opt ? opt.dataset.v : '', text: q(`[data-at="${CSS.escape(id)}"]`).value }, errOf(b));
      if (r.ok) object(num, 'voprosy');
    });
    qa('[data-later]').forEach(b => b.onclick = async () => { const r = await act('later', { o: num, id: b.dataset.later, undo: !!b.dataset.undo }, errOf(b)); if (r.ok) object(num, 'voprosy'); });
    qa('[data-qup]').forEach(inp => inp.onchange = async () => { if (!inp.files.length) return; if (await upload(num, inp.files, inp.dataset.qup, errOf(inp))) object(num, 'voprosy'); });
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
