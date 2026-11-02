// LINEA · кабинет бригады «Ремонт по проекту» (спецификация docs/brigady/spec-kabinety-adminka.md, раздел 4): единый вход кодом на почту
// (api/vhod.php; пароль — запасной для старых аккаунтов), главная «Сейчас от вас нужно», заказы и предложение (по строкам сметы или по разделам,
// аванс %, черновик бригадира), объекты (договор и допсоглашения ПЭП, «Начать работу» с фото «до», мастер сдачи этапа с фото к пунктам
// чек-листа, оплаты с подтверждением второй стороной, листы по запросу, разногласия), деньги, рейтинг, команда, профиль, документы, уведомления.
// API — api/brigada.php?m=…; права по роли в бригаде (владелец · бригадир · сотрудник) проверяет сервер, здесь — только показ.
(function () {
  'use strict';
  const root = document.getElementById('bx');
  const bar = document.getElementById('kabBar');
  const API = (document.querySelector('meta[name="linea-api"]') || {}).content || '';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rub = n => (Math.round(n * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
  const dt = s => { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const day = s => { if (!s) return '—'; const d = new Date(String(s).slice(0, 10) + 'T00:00'); return isNaN(d) ? s : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); };
  const st = (k, t) => `<span class="bx-st ${esc(k)}">${esc(t)}</span>`;
  const fileUrl = id => `${API}brigade/file.php?f=${id}`;
  const img = id => `<a href="${fileUrl(id)}" target="_blank" rel="noopener"><img src="${fileUrl(id)}" alt="" loading="lazy"></a>`;
  const TEST = new URLSearchParams(location.search).get('test') === '1';
  const S = { csrf: '', me: null, dict: null };
  const can = k => !!(S.me && S.me.can && S.me.can[k]);

  if (!API) { root.innerHTML = '<div class="bx-card"><h2>Кабинет на основном сайте</h2><p>Кабинет бригады работает на сайте студии с защищённым соединением. Условия — <a href="../brigadam/">на странице для бригад</a>.</p></div>'; return; }

  // ── запросы: «jobs.php?a=…» → brigada.php?m=jobs&a=…; 401 needCode → окно кода и повтор
  async function call(path, opt = {}) {
    const m = path.match(/^(kab|profile|feed|offer|jobs|finance|sheets|auth)\.php\??(.*)$/);
    const url = API + (m ? 'brigada.php?m=' + m[1] + (m[2] ? '&' + m[2] : '') : path);
    const h = {}; let body;
    if (opt.json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(opt.json); }
    if (opt.form) body = opt.form;
    const method = opt.method || (body ? 'POST' : 'GET');
    if (method === 'POST') h['X-CSRF'] = S.csrf;
    let r, j;
    try { r = await fetch(url, { method, headers: h, body, credentials: 'same-origin', cache: 'no-store' }); j = await r.json(); } catch { j = { ok: false, error: 'Нет связи с сервером — проверьте интернет и повторите' }; }
    if (j.csrf) S.csrf = j.csrf;
    j.code = r ? r.status : 0;
    return j;
  }
  async function api(path, opt = {}) {
    let j = await call(path, opt);
    if (j.needCode && await needCode()) j = await call(path, opt);
    return j;
  }
  const vh = async (a, json) => { const j = await call('vhod.php?a=' + a, json ? { json } : {}); return j; };
  const errBox = (el, j) => { if (!el) { if (!j.ok) alert(j.error || 'Не получилось'); return; } el.className = j.ok ? 'bx-ok' : 'bx-err'; el.textContent = j.ok ? (j.message || 'Сохранено') : (j.error || 'Ошибка'); };
  const form = el => Object.fromEntries([...new FormData(el)].filter(([k]) => !k.endsWith('[]')));
  const many = (el, name) => [...el.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
  const chips = (name, dict, sel = []) => `<div class="bx-chips">${Object.entries(dict).map(([k, t]) => `<label><input type="checkbox" name="${name}" value="${esc(k)}"${sel.includes(k) ? ' checked' : ''}> ${esc(t)}</label>`).join('')}</div>`;
  const opts = (dict, cur, empty) => (empty ? `<option value="">${esc(empty)}</option>` : '') + Object.entries(dict).map(([k, t]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(t)}</option>`).join('');

  // ── окно «Подтвердите кодом из письма» (значимые действия: предложение, оплаты, сдача этапа, разногласие, команда)
  function needCode() {
    return new Promise(resolve => {
      const m = document.getElementById('kabCode'), f = document.getElementById('kabCodeF'), err = f.querySelector('.kab-err');
      document.getElementById('kabCodeMailL').hidden = true;
      document.getElementById('kabCodeTxt').textContent = 'Это действие юридически значимо — пришлём код на почту ' + (S.email || 'бригады') + '.';
      err.textContent = ''; f.code.value = ''; m.hidden = false;
      document.getElementById('kabCodeSend').onclick = async () => { const j = await vh('code', { self: true }); err.textContent = j.ok ? (j.text || 'Код отправлен') : j.error; if (j.devCode) f.code.value = j.devCode; f.code.focus(); };
      const close = v => { m.hidden = true; resolve(v); };
      document.getElementById('kabCodeX').onclick = () => close(false);
      f.onsubmit = async e => { e.preventDefault(); const j = await vh('verify', { self: true, code: f.code.value }); if (!j.ok) { err.textContent = j.error; return; } if (j.csrf) S.csrf = j.csrf; close(true); };
    });
  }

  // ── фото с телефона: пережать до 1600 px в браузере, грузить по очереди с индикатором «загружено N из M»
  function shrink(file) {
    return new Promise(res => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) { res(file); return; }
      createImageBitmap(file).then(bm => {
        const k = Math.min(1, 1600 / Math.max(bm.width, bm.height));
        if (k === 1 && file.size < 1.5e6) { res(file); return; }
        const c = document.createElement('canvas'); c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k);
        c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
        c.toBlob(b => res(b ? new File([b], 'foto.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.85);
      }).catch(() => res(file));
    });
  }
  async function upload(files, fields, path, note) {
    let n = 0;
    for (const f of files) {
      if (note) note.textContent = `загружено ${n} из ${files.length}…`;
      const fd = new FormData(); Object.entries(fields).forEach(([k, v]) => fd.append(k, v)); fd.append('file', await shrink(f));
      let r = await api(path, { form: fd });
      if (!r.ok && !r.code) r = await api(path, { form: fd });   // одна повторная попытка при обрыве связи
      if (!r.ok) { alert(r.error); break; }
      n++;
    }
    if (note) note.textContent = `загружено ${n} из ${files.length}`;
    return n;
  }

  // ── старт: кто вошёл
  async function boot() {
    const j = await call('kab.php?a=me' + (TEST ? '&test=1' : ''));
    if (!j.ok) { root.innerHTML = `<div class="bx-card"><h2>Кабинет недоступен</h2><p>${esc(j.error)}</p></div>`; return; }
    S.dict = j; S.me = j.brigade; S.email = j.email;
    const hash = location.hash;
    if (hash.startsWith('#reset=')) return viewReset(hash.slice(7));
    if (!S.me) { bar.hidden = true; return viewAuth(hash === '#register' ? 'register' : 'code'); }
    route();
  }

  // ── вход кодом (основной), регистрация, пароль (запасной), восстановление
  function viewAuth(mode) {
    const D = S.dict;
    const modes = [['code', 'Вход по коду'], ['register', 'Регистрация бригады']].concat(D.passwordLogin ? [['login', 'Вход паролем'], ['forgot', 'Забыли пароль']] : []);
    const tabs = `<ul class="bx-tabs" role="tablist">${modes.map(([k, t]) => `<li><button type="button" data-m="${k}" class="${k === mode ? 'on' : ''}">${t}</button></li>`).join('')}</ul>`;
    let h = '';
    if (mode === 'code') h = `<form class="bx-card" id="fCode"><div class="kab-kick">Кабинет бригады</div><h2>Вход без пароля</h2><p class="bx-mut">Пришлём код на почту владельца бригады, бригадира или сотрудника. Один вход — для всех ролей LINEA.</p>
      <label class="bx-f">E-mail<input name="email" type="email" autocomplete="email" required></label><div class="bx-row"><button class="btn">Получить код</button></div>
      <div id="bxCodeStep" hidden><label class="bx-f">Код из письма<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="6 цифр"></label>
      <label class="bx-cb"><input type="checkbox" name="remember" value="1" checked> Запомнить это устройство на 30 дней</label><div class="bx-row"><button class="btn" type="button" id="bxVerify">Войти</button></div></div><p class="bx-err" role="status"></p></form>`;
    if (mode === 'login') h = `<form class="bx-card" id="fLogin"><h2>Вход паролем</h2><p class="bx-mut">Для аккаунтов, созданных до входа по коду. Подтверждать значимые действия всё равно нужно кодом из письма.</p><div class="bx-grid"><label class="bx-f">E-mail<input name="email" type="email" autocomplete="username" required></label><label class="bx-f">Пароль<input name="password" type="password" autocomplete="current-password" required></label></div><div class="bx-row"><button class="btn">Войти</button></div><p class="bx-err" role="status"></p></form>`;
    if (mode === 'forgot') h = `<form class="bx-card" id="fForgot"><h2>Восстановить пароль</h2><p>Пришлём ссылку на почту, указанную при регистрации. Ссылка действует 1 час. Проще — <a href="#" data-go="code">войти кодом</a>.</p><label class="bx-f">E-mail<input name="email" type="email" required></label><div class="bx-row"><button class="btn">Прислать ссылку</button></div><p class="bx-err" role="status"></p></form>`;
    if (mode === 'register') h = `<form class="bx-card" id="fReg"><h2>Регистрация бригады</h2>
      <p class="bx-note">После регистрации добавьте не меньше трёх объектов с фото «до» и «после» и отправьте анкету на проверку. Проверка — ИНН по базе ФНС и короткий видеозвонок. Копии паспортов не запрашиваем.</p>
      <div class="bx-grid">
        <label class="bx-f">Название бригады<input name="name" required maxlength="80" placeholder="Например: «Бригада Сергея Ковалёва»"></label>
        <label class="bx-f">Имя бригадира<input name="contactName" required maxlength="80" autocomplete="name"></label>
        <label class="bx-f">Телефон<input name="phone" type="tel" required autocomplete="tel" placeholder="+7 …"></label>
        <label class="bx-f">E-mail (вход кодом)<input name="email" type="email" required autocomplete="email"></label>
        <label class="bx-f">Форма работы<select name="legal" required>${opts(D.legal, '', 'Выберите')}</select></label>
        <label class="bx-f">ИНН<input name="inn" inputmode="numeric" required maxlength="12" placeholder="12 цифр (ООО — 10)"></label>
        <label class="bx-f w2">Название ИП/ООО (если есть)<input name="company" maxlength="120"></label>
        <div class="bx-f w2">Специализации${chips('specs', D.specs)}</div>
        <div class="bx-f w2">Районы работы${chips('districts', D.districts)}</div>
        <label class="bx-f">Человек в бригаде<input name="teamSize" type="number" min="1" max="200" value="3"></label>
        <label class="bx-f">Опыт, лет<input name="experience" type="number" min="0" max="60" value="5"></label>
        <label class="bx-f">Гарантия на работы, мес.<input name="warrantyMonths" type="number" min="1" max="120" value="24"></label>
        <label class="bx-f">Ориентир цены работ, ₽/м²<input name="priceFrom" type="number" min="0" step="100"></label>
        <label class="bx-f w2">Рекомендатели (кто может подтвердить работу)<textarea name="referees" maxlength="1000"></textarea></label>
        <label class="bx-f w2">О бригаде (будет в карточке каталога)<textarea name="about" maxlength="2000"></textarea></label>
        <label class="bx-f">Запасной пароль (8+ знаков, буквы и цифры)<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
      </div>
      <p class="bx-mut">Самозанятые допускаются с ограничениями: без вознаграждения LINEA до перехода в ИП, сумма договора — в пределах лимита дохода НПД, большие объекты — только ИП и ООО. Нанимать работников по трудовому договору самозанятый не может: в бригаде каждый мастер — сам самозанятый или ИП, либо вы работаете один.</p>
      <label class="bx-cb"><input type="checkbox" name="publicName" value="1"> Показывать имя бригадира в публичной карточке (телефон и почта не публикуются никогда)</label>
      ${Object.entries(D.docs).map(([k, d]) => `<label class="bx-cb"><input type="checkbox" name="c_${k}" value="${esc(d.ed)}" required> Принимаю: <a href="../${esc(d.href)}" target="_blank" rel="noopener">${esc(d.title)}</a>, редакция от ${esc(d.ed)}</label>`).join('')}
      <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
      <div class="bx-row"><button class="btn">Зарегистрировать бригаду</button></div><p class="bx-err" role="status"></p></form>`;
    root.innerHTML = tabs + h;
    root.querySelectorAll('[data-m],[data-go]').forEach(b => b.onclick = e => { e.preventDefault(); const k = b.dataset.m || b.dataset.go; history.replaceState(null, '', k === 'register' ? '#register' : location.pathname + location.search); viewAuth(k); });
    const f = root.querySelector('form'), e = f.querySelector('.bx-err');
    if (mode === 'code') {
      f.onsubmit = async ev => { ev.preventDefault(); await vh('me'); const j = await vh('code', { email: f.email.value }); errBox(e, j.ok ? { ok: true, message: j.text } : j); if (j.ok) { f.querySelector('#bxCodeStep').hidden = false; if (j.devCode) f.code.value = j.devCode; f.code.focus(); } };
      f.querySelector('#bxVerify').onclick = async () => {
        const j = await vh('verify', { email: f.email.value, code: f.code.value, remember: f.remember.checked });
        if (!j.ok) { errBox(e, j); return; }
        if (j.choose) { location.href = '../kabinet/#/rol'; return; }
        if (j.go === 'client') { location.href = '../kabinet/'; return; }
        boot();
      };
      return;
    }
    f.onsubmit = async ev => {
      ev.preventDefault();
      const btn = f.querySelector('button.btn'); btn.disabled = true;
      let j;
      if (mode === 'login') j = await call('auth.php?a=login', { json: form(f) });
      if (mode === 'forgot') j = await call('auth.php?a=forgot', { json: form(f) });
      if (mode === 'register') {
        const v = form(f);
        const consents = {}; Object.keys(S.dict.docs).forEach(k => { const c = f.querySelector(`[name="c_${k}"]`); if (c.checked) consents[k] = c.value; });
        j = await call('auth.php?a=register' + (TEST ? '&test=1' : ''), { json: { ...v, specs: many(f, 'specs'), districts: many(f, 'districts'), publicName: !!v.publicName, consents, test: TEST } });
      }
      btn.disabled = false;
      errBox(e, j);
      if (j.ok && j.brigade) { history.replaceState(null, '', location.pathname + location.search + '#/profil'); boot(); }
    };
  }
  function viewReset(token) {
    root.innerHTML = `<form class="bx-card" id="fReset"><h2>Новый пароль</h2><label class="bx-f">Пароль (8+ знаков, буквы и цифры)<input name="password" type="password" minlength="8" required autocomplete="new-password"></label><div class="bx-row"><button class="btn">Сохранить</button></div><p class="bx-err"></p></form>`;
    const f = root.querySelector('form');
    f.onsubmit = async ev => { ev.preventDefault(); const j = await call('auth.php?a=reset', { json: { token, password: form(f).password } }); errBox(f.querySelector('.bx-err'), j); if (j.ok) { history.replaceState(null, '', location.pathname); setTimeout(() => viewAuth('login'), 1200); } };
  }

  // ── каркас: левое меню (компьютер), нижняя панель (телефон); пункты — по роли в бригаде
  const MENU = () => [['', 'Главная'], ['zakazy', 'Заказы', 'feed'], ['obekty', 'Объекты'], ['dengi', 'Деньги', 'money'], ['reiting', 'Рейтинг'], ['komanda', 'Команда', 'team'],
    ['profil', 'Профиль'], ['docs', 'Документы'], ['uvedomleniya', 'Уведомления']].filter(x => !x[2] || can(x[2]));
  function shell(active, html) {
    const m = S.me;
    root.innerHTML = `<div class="brg-top"><div><b>${esc(m.name)}</b> ${st(m.status, m.statusText)}${m.test ? ' <span class="bx-st blocked">тест</span>' : ''}<div class="bx-mut">${esc(m.roleText)}${m.me ? ' · ' + esc(m.me) : ''}</div></div><button class="btn ghost sm" type="button" id="bxOut">Выйти</button></div>
      <div class="brg-lay"><nav class="brg-side" aria-label="Разделы">${MENU().map(([k, t]) => `<a href="#/${k}"${k === active ? ' class="on"' : ''}>${t}</a>`).join('')}</nav><div id="bxBody" class="brg-main">${html || '<p class="kab-load">Загружаю…</p>'}</div></div>`;
    root.querySelector('#bxOut').onclick = async () => { await vh('me'); await vh('logout', {}); S.me = null; location.hash = ''; boot(); };
    bar.hidden = false;
    bar.querySelectorAll('a').forEach(a => { a.classList.toggle('on', a.dataset.r === (active || 'home')); if (a.dataset.r === 'dengi') a.hidden = !can('money'); if (a.dataset.r === 'zakazy') a.hidden = !can('feed'); });
    window.scrollTo(0, 0);
  }
  const body = () => root.querySelector('#bxBody');
  function route() {
    if (!S.me) return boot();
    const p = location.hash.replace(/^#\/?/, '').split('/');
    const [a, id, sub, sid] = p;
    if (a === 'zakazy') { shell('zakazy'); return tabFeed(); }
    if (a === 'zakaz') { shell('zakazy'); return viewRequest(+id); }
    if (a === 'obekty') { shell('obekty'); return tabJobs(); }
    if (a === 'obekt') { shell('obekty'); return viewJob(+id, sub, +sid); }
    if (a === 'dengi') { shell('dengi'); return tabMoney(); }
    if (a === 'reiting') { shell('reiting'); return viewRating(); }
    if (a === 'komanda') { shell('komanda'); return viewTeam(); }
    if (a === 'profil') { shell('profil'); return tabProfile(); }
    if (a === 'docs') { shell('docs'); return viewDocs(); }
    if (a === 'uvedomleniya') { shell('uvedomleniya'); return viewNotices(); }
    if (a === 'eshche') { shell('eshche', `<div class="bx-card"><h2>Ещё</h2><ul class="brg-more">${MENU().slice(1).map(([k, t]) => `<li><a href="#/${k}">${t}</a></li>`).join('')}</ul></div>`); return; }
    shell(''); return viewHome();
  }
  window.addEventListener('hashchange', () => { if (S.me) route(); });

  // ── главная: «Сейчас от вас нужно» + плитки
  async function viewHome() {
    const j = await api('kab.php?a=home');
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    const todo = j.todo.length ? j.todo.map((t, i) => `<li class="${i === 0 ? 'hot' : ''}"><span>${esc(t.text)}</span>${t.btn ? `<a class="btn sm" href="${esc(t.href)}">${esc(t.btn)}</a>` : ''}</li>`).join('')
      : '<li><span>Всё сделано. Новые заказы придут на почту и сюда.</span></li>';
    body().innerHTML = (S.dict.passReset ? '<p class="bx-note">Почта подтверждена кодом. Прежний пароль и вход на других устройствах сброшены — входите кодом из письма; запасной пароль можно задать через «Забыли пароль».</p>' : '') + `<div class="bx-card kab-now"><div class="kab-kick">Сейчас от вас нужно</div><ul class="brg-todo">${todo}</ul></div>
      <div class="brg-tiles">${j.tiles.map(t => `<a class="brg-tile" href="${esc(t.href)}"><b>${t.n == null ? '—' : esc(t.n)}</b><span>${esc(t.t)}</span></a>`).join('')}</div>`;
    const n = await call('kab.php?a=notices'); const bell = document.getElementById('kabBell');
    if (bell && n.ok) { bell.hidden = !n.unread; bell.textContent = n.unread; }
  }

  // ── профиль и проверка (4.1–4.2): анкета, портфолио с модерацией, согласие на публичную карточку, подписант ООО
  async function tabProfile() {
    const j = await api('profile.php');
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    const m = j.brigade, D = S.dict, own = can('profile');
    const ph = f => img(f.id) + (f.moderated ? '' : '<span class="bx-st review" title="Видно в каталоге после проверки LINEA">на модерации</span>');
    const ports = j.portfolio.map(p => `<li><b>${esc(p.title)}</b> <span class="bx-mut">${esc(D.districts[p.district] || '')}${p.area ? ', ' + p.area + ' м²' : ''}${p.year ? ', ' + p.year : ''}</span>
      <p class="bx-mut">${esc(p.works)}</p>
      <div class="bx-mut">До:</div><div class="bx-ph">${p.photos.filter(f => f.kind === 'before').map(ph).join('') || '<span class="bx-mut">нет фото</span>'}</div>
      <div class="bx-mut">После:</div><div class="bx-ph">${p.photos.filter(f => f.kind === 'after').map(ph).join('') || '<span class="bx-mut">нет фото</span>'}</div>
      ${own ? `<div class="bx-row"><label class="btn ghost sm">+ фото «до»<input type="file" accept="image/jpeg,image/png,image/webp" data-up="${p.id}" data-kind="before" hidden multiple></label>
      <label class="btn ghost sm">+ фото «после»<input type="file" accept="image/jpeg,image/png,image/webp" data-up="${p.id}" data-kind="after" hidden multiple></label>
      <button class="btn ghost sm" type="button" data-del="${p.id}">Удалить объект</button></div>` : ''}</li>`).join('');
    const legalNote = m.legal === 'npd' ? `<p class="bx-note">Самозанятый: (1) нанимать работников по трудовому договору нельзя — в бригаде каждый мастер сам самозанятый или ИП, либо вы работаете один; (2) лимит дохода НПД — ${esc(rub(S.dict.npd.max_deal_kop / 100))} в год: предложение на большую сумму сервер не примет; (3) после каждой оплаты клиента — чек в «Мой налог». Объекты от ${esc(S.dict.npd.big_object_m2)} м² — только ИП и ООО. Вознаграждение LINEA для самозанятых — не начисляется до перехода в ИП.</p>` : '';
    body().innerHTML = `
      ${m.status === 'draft' ? `<div class="bx-card"><h2>Отправить анкету на проверку</h2><p>${j.missing.length ? 'Не хватает: ' + esc(j.missing.join('; ')) : 'Всё готово — отправьте анкету. Мы сверим ИНН и договоримся о видеозвонке.'}</p>${own ? `<div class="bx-row"><button class="btn" id="bxSubmit"${j.canSubmit ? '' : ' disabled'}>Отправить на проверку</button></div>` : ''}<p class="bx-err" id="bxSubErr"></p></div>` : ''}
      ${m.status === 'review' ? '<div class="bx-card"><h2>Анкета на проверке</h2><p>Сверяем ИНН и свяжемся для видеозвонка. После допуска в разделе «Заказы» появятся запросы.</p></div>' : ''}
      ${m.status === 'active' ? `<div class="bx-card"><h2>Бригада прошла проверку документов</h2><p>Карточка в каталоге: <a href="../brigady/${esc(m.slug)}/" target="_blank" rel="noopener">/brigady/${esc(m.slug)}/</a>. ИНН проверен ${esc(day(m.innChecked))}, видеозвонок ${esc(day(m.callAt))}.</p></div>` : ''}
      ${legalNote}
      <div class="bx-card"><h2>Портфолио: объекты «до/после»</h2><p class="bx-mut">Новые фото видны в каталоге после проверки LINEA (на фото может оказаться телефон или адрес). Объекты, сделанные через LINEA, добавятся сами после завершения — с согласия клиента.</p><ul class="bx-list">${ports || '<li class="bx-mut">Объектов пока нет — добавьте не меньше трёх.</li>'}</ul><p class="bx-mut" id="bxUpNote"></p>
        ${own ? `<form id="fPort" class="bx-grid" style="margin-top:14px"><label class="bx-f">Объект<input name="title" required placeholder="Квартира 62 м², Хамовники"></label>
        <label class="bx-f">Район<select name="district">${opts(D.districts, '', '—')}</select></label><label class="bx-f">Площадь, м²<input name="area" type="number" step="0.1"></label><label class="bx-f">Год<input name="year" type="number" min="1990" max="2030"></label>
        <label class="bx-f w2">Что делали<textarea name="works" maxlength="1500"></textarea></label><div class="bx-row w2"><button class="btn ghost">Добавить объект</button></div></form><p class="bx-err" id="bxPortErr"></p>` : ''}</div>
      <form class="bx-card" id="fProf"><h2>Анкета</h2><fieldset ${own ? '' : 'disabled'} style="border:0;padding:0;margin:0"><div class="bx-grid">
        <label class="bx-f">Название бригады<input name="name" value="${esc(m.name)}" maxlength="80"></label><label class="bx-f">Бригадир<input name="contactName" value="${esc(m.contactName)}"></label>
        <label class="bx-f">Телефон<input name="phone" value="${esc(m.phone)}"></label><label class="bx-f">E-mail<input value="${esc(m.email)}" disabled></label>
        <label class="bx-f">Форма и ИНН<input value="${esc(D.legal[m.legal] + ', ' + m.inn)}" disabled></label><label class="bx-f">ИП/ООО<input name="company" value="${esc(m.company)}"></label>
        <div class="bx-f w2">Специализации${chips('specs', D.specs, m.specs)}</div><div class="bx-f w2">Районы${chips('districts', D.districts, m.districts)}</div>
        <label class="bx-f">Человек в бригаде<input name="teamSize" type="number" value="${esc(m.teamSize)}"></label><label class="bx-f">Опыт, лет<input name="experience" type="number" value="${esc(m.experience)}"></label>
        <label class="bx-f">Гарантия, мес.<input name="warrantyMonths" type="number" value="${esc(m.warrantyMonths)}"></label><label class="bx-f">Ориентир, ₽/м²<input name="priceFrom" type="number" value="${esc(m.priceFrom || '')}"></label>
        <label class="bx-f w2">Рекомендатели<textarea name="referees">${esc(m.referees)}</textarea></label><label class="bx-f w2">О бригаде<textarea name="about">${esc(m.about)}</textarea></label></div>
        <label class="bx-cb"><input type="checkbox" name="publicName" value="1"${m.publicName ? ' checked' : ''}> Показывать имя бригадира в карточке каталога</label>
        ${own ? `<div class="bx-row"><label class="btn ghost sm">Логотип / фото бригады<input type="file" accept="image/jpeg,image/png,image/webp" id="bxLogo" hidden></label>${m.logo ? '<span class="bx-ph">' + img(m.logo) + '</span>' : ''}</div>
        <p class="bx-mut">Почта и ИНН меняются через администратора — их сверяли при допуске.</p><div class="bx-row"><button class="btn">Сохранить анкету</button></div>` : '<p class="bx-mut">Анкету меняет владелец бригады.</p>'}<p class="bx-err"></p></fieldset></form>
      ${own ? `<div class="bx-card"><h2>Публичная карточка</h2><p>${S.me.cardConsent ? 'Согласие на распространение данных в карточке каталога действует (название, «о бригаде», портфолио, отметки проверки, рейтинг и отзывы; имя бригадира — по отметке выше).' : 'Согласие отозвано — карточки нет в каталоге, новые заказы из каталога не приходят.'}</p>
        <div class="bx-row"><button class="btn ghost sm" type="button" id="bxCard">${S.me.cardConsent ? 'Отозвать согласие (снять карточку)' : 'Дать согласие снова'}</button></div><p class="bx-err" id="bxCardErr"></p></div>` : ''}
      ${own && m.legal === 'ooo' ? `<form class="bx-card" id="fSigner"><h2>Подписант ООО</h2><p class="bx-mut">Если договоры подписывает не владелец аккаунта: ФИО, должность и основание (устав, доверенность №). Код подписи всё равно приходит на почту бригады.</p>
        <div class="bx-grid"><label class="bx-f">ФИО<input name="name" value="${esc((S.me.signer || {}).name || '')}"></label><label class="bx-f">Должность<input name="position" value="${esc((S.me.signer || {}).position || '')}"></label><label class="bx-f w2">Основание<input name="basis" value="${esc((S.me.signer || {}).basis || '')}"></label></div><div class="bx-row"><button class="btn ghost sm">Сохранить</button></div><p class="bx-err"></p></form>` : ''}`;
    const B = body();
    const sb = B.querySelector('#bxSubmit');
    if (sb) sb.onclick = async () => { const r = await api('profile.php?a=submit', { method: 'POST' }); if (r.ok) { S.me = { ...S.me, ...r.brigade }; route(); } else errBox(B.querySelector('#bxSubErr'), r); };
    const fpo = B.querySelector('#fPort'); if (fpo) fpo.onsubmit = async ev => { ev.preventDefault(); const r = await api('profile.php?a=portfolio_add', { json: form(ev.target) }); if (r.ok) tabProfile(); else errBox(B.querySelector('#bxPortErr'), r); };
    B.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('Удалить объект и его фото?')) { await api('profile.php?a=portfolio_del', { json: { id: +b.dataset.del } }); tabProfile(); } });
    B.querySelectorAll('[data-up]').forEach(inp => inp.onchange = async () => { await upload([...inp.files], { portfolio: inp.dataset.up, kind: inp.dataset.kind }, 'profile.php?a=photo', B.querySelector('#bxUpNote')); tabProfile(); });
    const lg = B.querySelector('#bxLogo'); if (lg) lg.onchange = async e => { await upload([e.target.files[0]], {}, 'profile.php?a=logo'); tabProfile(); };
    const fp = B.querySelector('#fProf');
    fp.onsubmit = async ev => { ev.preventDefault(); const v = form(fp); const r = await api('profile.php?a=save', { json: { ...v, specs: many(fp, 'specs'), districts: many(fp, 'districts'), publicName: !!v.publicName } }); errBox(fp.querySelector('.bx-err'), r); };
    const cb = B.querySelector('#bxCard'); if (cb) cb.onclick = async () => { const give = !S.me.cardConsent; if (!give && !confirm('Снять карточку из каталога? Начатые объекты останутся, новые заказы из каталога приходить не будут.')) return; const r = await api('kab.php?a=card_consent', { json: { give } }); errBox(B.querySelector('#bxCardErr'), r); if (r.ok) { S.me.cardConsent = give; setTimeout(tabProfile, 900); } };
    const fs = B.querySelector('#fSigner'); if (fs) fs.onsubmit = async ev => { ev.preventDefault(); const r = await api('kab.php?a=signer', { json: form(fs) }); errBox(fs.querySelector('.bx-err'), r); };
  }

  // ── лента заказов и предложение (4.3–4.4)
  async function tabFeed() {
    const j = await api('feed.php');
    if (!j.ok) { body().innerHTML = `<div class="bx-card"><h2>Заказы</h2><p>${esc(j.error)}</p>${j.code === 402 ? '<p><a class="btn sm" href="#/dengi">К деньгам</a></p>' : ''}</div>`; return; }
    body().innerHTML = `<div class="bx-card"><h2>Заказы</h2><ul class="bx-list">${j.requests.map(r => `<li><a href="#/zakaz/${r.id}"><b>${esc(r.object)}</b></a> · ${esc(r.district)} ${st(r.open ? 'new' : r.status, r.declined ? 'отказались' : r.open ? 'принимаем предложения' : r.statusText)}
      <div class="bx-mut">${esc(r.works.join(', '))} · ответить до ${esc(dt(r.deadline))}${r.offerStatus ? ' · ваше предложение: ' + esc(rub(r.offerTotal)) + ' (' + esc({ draft: 'черновик', submitted: 'отправлено', withdrawn: 'отозвано', chosen: 'выбрано клиентом', rejected: 'не выбрано' }[r.offerStatus] || r.offerStatus) + ')' : ''}</div></li>`).join('') || '<li class="bx-mut">Новых заказов в ваших районах нет. Добавьте районы или специализации в <a href="#/profil">профиле</a> — заказов станет больше.</li>'}</ul></div>`;
  }
  async function viewRequest(rid) {
    const j = await api('feed.php?r=' + rid);
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    const R = j.request, O = j.offer, items = O ? O.items : {};
    const groups = {};
    R.positions.forEach(p => (groups[p.spec] = groups[p.spec] || []).push(p));
    const ro = !R.open;
    const mode = O && O.mode === 'sections' ? 'sections' : 'items';
    const rows = Object.entries(groups).map(([spec, ps]) => `<tr class="grp"><td colspan="5">${esc(j.specs[spec] || spec)}</td></tr>` + ps.map(p => {
      const it = items[p.id] || {}; const skip = O && mode === 'items' ? !!it.skip : false;
      return `<tr data-p="${p.id}" data-q="${p.qty == null ? 1 : p.qty}"${skip ? ' class="skip"' : ''}><td>${esc(p.name)}</td><td>${esc(p.unit)}</td><td class="r">${p.qty == null ? 'объём' : esc(p.qty)}</td>
        <td><input type="number" min="0" step="1" inputmode="decimal" aria-label="Цена за единицу" value="${it.price != null ? esc(it.price) : ''}"${skip || ro ? ' disabled' : ''}></td>
        <td><label class="bx-cb" style="margin:0"><input type="checkbox" class="sk"${skip ? ' checked' : ''}${ro ? ' disabled' : ''}> не делаем</label></td></tr>`;
    }).join('')).join('');
    const secs = R.sections.map(sp => `<label class="bx-f">${esc(j.specs[sp] || sp)} <span class="bx-mut">(${groups[sp] ? groups[sp].length : 0} поз.)</span><input type="number" min="0" step="100" inputmode="decimal" data-sec="${esc(sp)}" value="${O && O.sections && O.sections[sp] != null ? esc(O.sections[sp]) : ''}" placeholder="цена раздела, ₽"${ro ? ' disabled' : ''}></label>`).join('');
    const stg = (O ? O.stages : R.defaultStages);
    const ost = O ? { draft: 'черновик', submitted: 'отправлено', withdrawn: 'отозвано', chosen: 'выбрано', rejected: 'не выбрано' }[O.status] : '';
    body().innerHTML = `<p><a href="#/zakazy">← все заказы</a></p>
      <div class="bx-card"><h2>${esc(R.object)} · ${esc(R.district)}</h2><p>Работы: ${esc(R.works.join(', '))}. ${R.startWish ? 'Клиент хочет начать: ' + esc(R.startWish) + '. ' : ''}Ответить до <b>${esc(dt(R.deadline))}</b>. Пакет получили бригад: ${esc(R.invited)}.</p>
      <p class="bx-mut">Помещения: ${esc(R.rooms.map(r => r.name + (r.area ? ' ' + r.area + ' м²' : '')).join(', '))}</p>
      <p>Файлы проекта: ${R.files.map(f => `<a href="${fileUrl(f.id)}" target="_blank" rel="noopener">${esc(f.title || 'файл')}</a> <span class="bx-mut">(${f.mime.includes('pdf') ? 'PDF' : 'xlsx'}, ${Math.round(f.bytes / 1024)} КБ)</span>`).join(' · ') || '—'}</p>
      <p class="bx-note">Контакты и адрес клиента откроются, когда договор подпишут на сайте обе стороны. Вознаграждение LINEA для вашей бригады — ${esc(R.rateText)} от цены договора, к оплате — после первых денег.</p></div>
      <form class="bx-card" id="fOffer"><h2>Ваше предложение ${O ? st(O.status === 'submitted' ? 'active' : O.status, ost) : ''}</h2>
      ${O && O.status === 'draft' && O.draftedBy ? '<p class="bx-mut">Черновик подготовил бригадир — проверьте и отправьте.</p>' : ''}
      <div class="bx-row" role="radiogroup"><label class="bx-cb"><input type="radio" name="mode" value="items"${mode === 'items' ? ' checked' : ''}${ro ? ' disabled' : ''}> По строкам сметы</label><label class="bx-cb"><input type="radio" name="mode" value="sections"${mode === 'sections' ? ' checked' : ''}${ro ? ' disabled' : ''}> По разделам — цена за раздел целиком</label></div>
      <div id="bxItems"${mode === 'sections' ? ' hidden' : ''}><div class="bx-tbl-wrap"><table class="bx-tbl bx-offer"><thead><tr><th>Позиция сметы</th><th>Ед.</th><th class="r">Кол-во</th><th>Цена, ₽</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div id="bxSecs" class="bx-grid"${mode === 'items' ? ' hidden' : ''}>${secs}</div>
      <div class="bx-sum" id="bxTotal"></div>
      <div class="bx-grid"><label class="bx-f">Материалы<select name="materials"${ro ? ' disabled' : ''}>${opts(j.materials, O ? O.materials : '', 'Кто закупает материалы')}</select></label>
      <label class="bx-f">Уточнение по материалам<input name="materialsNote" value="${esc(O ? O.materialsNote : '')}"${ro ? ' disabled' : ''}></label>
      <label class="bx-f">Можем начать с<input name="startDate" type="date" value="${esc(O ? O.startDate : '')}"${ro ? ' disabled' : ''}></label>
      <label class="bx-f">Гарантия, мес.<input name="warrantyMonths" type="number" min="1" max="120" value="${esc(O ? O.warrantyMonths : R.warrantyDefault || 24)}"${ro ? ' disabled' : ''}></label>
      <label class="bx-f">Аванс, % (0–50)<input name="advancePct" type="number" min="0" max="50" value="${esc(O ? O.advancePct : 0)}"${ro ? ' disabled' : ''}></label></div>
      <p class="bx-mut">План оплат в договоре: аванс — из этого поля, остаток — равными долями после приёмки каждого этапа. Каждую оплату одна сторона отмечает, вторая подтверждает.</p>
      <h3>График этапов</h3><div id="bxStages">${stg.map(s => stageRow(s, ro)).join('')}</div>${ro ? '' : '<button type="button" class="btn ghost sm" id="bxAddSt">+ этап</button>'}
      <label class="bx-f" style="margin-top:12px">Комментарий для клиента<textarea name="comment"${ro ? ' disabled' : ''}>${esc(O ? O.comment : '')}</textarea></label>
      ${R.legal === 'npd' ? `<p class="bx-note">Самозанятый: предложение больше ${esc(rub(R.npd.max_deal_kop / 100))} и объекты от ${esc(R.npd.big_object_m2)} м² — только для ИП и ООО.</p>` : ''}
      ${ro ? '<p class="bx-mut">Срок ответа прошёл или клиент уже выбрал бригаду — предложение не меняется.</p>' : `<div class="bx-row">${R.canSend ? `<button class="btn">${O && O.status === 'submitted' ? 'Сохранить и отправить' : 'Отправить клиенту'}</button>` : ''}<button type="button" class="btn ghost" id="bxDraft">Сохранить черновик</button>${O && O.status === 'submitted' && R.canSend ? '<button type="button" class="btn ghost" id="bxWd">Отозвать</button>' : ''}${!O && R.canSend ? '<button type="button" class="btn ghost" id="bxDecl">Не берём</button>' : ''}</div>${R.canSend ? '' : '<p class="bx-mut">Отправляет клиенту владелец бригады — он получит уведомление о черновике.</p>'}`}
      <p class="bx-err" role="status"></p></form>`;
    const f = body().querySelector('#fOffer');
    const curMode = () => (f.querySelector('[name=mode]:checked') || {}).value || 'items';
    const total = () => {
      let t = 0;
      if (curMode() === 'sections') f.querySelectorAll('[data-sec]').forEach(i => { t += parseFloat(i.value) || 0; });
      else f.querySelectorAll('tr[data-p]').forEach(tr => { const sk = tr.querySelector('.sk').checked; const v = parseFloat(tr.querySelector('input[type=number]').value); tr.classList.toggle('skip', sk); tr.querySelector('input[type=number]').disabled = sk || ro; if (!sk && v > 0) t += v * +tr.dataset.q; });
      const adv = Math.min(50, Math.max(0, +f.advancePct.value || 0));
      body().querySelector('#bxTotal').textContent = 'Итого: ' + rub(t) + (adv ? ` · аванс ${adv} % — ${rub(t * adv / 100)}` : '');
    };
    f.addEventListener('input', total); total();
    f.querySelectorAll('[name=mode]').forEach(r => r.onchange = () => { body().querySelector('#bxItems').hidden = curMode() === 'sections'; body().querySelector('#bxSecs').hidden = curMode() !== 'sections'; total(); });
    const add = body().querySelector('#bxAddSt'); if (add) add.onclick = () => { body().querySelector('#bxStages').insertAdjacentHTML('beforeend', stageRow({ name: '', days: 5 }, false)); };
    f.addEventListener('click', e => { if (e.target.matches('[data-rm]')) e.target.closest('.bx-grid').remove(); });
    const send = async draft => {
      const items = {}; f.querySelectorAll('tr[data-p]').forEach(tr => { items[tr.dataset.p] = tr.querySelector('.sk').checked ? { skip: true } : { price: parseFloat(tr.querySelector('input[type=number]').value) }; });
      const sections = {}; f.querySelectorAll('[data-sec]').forEach(i => { if (parseFloat(i.value) > 0) sections[i.dataset.sec] = parseFloat(i.value); });
      const stages = [...f.querySelectorAll('#bxStages .bx-grid')].map(g => ({ name: g.querySelector('[name=sn]').value, days: +g.querySelector('[name=sd]').value }));
      const v = form(f);
      const r = await api('offer.php?a=save', { json: { r: rid, mode: curMode(), items, sections, stages, materials: v.materials, materialsNote: v.materialsNote, startDate: v.startDate, warrantyMonths: +v.warrantyMonths, advancePct: +v.advancePct || 0, comment: v.comment, draft } });
      errBox(f.querySelector('.bx-err'), r.ok ? { ok: true, message: (r.message || 'Сохранено') + ' · ' + rub(r.total) } : r);
    };
    f.onsubmit = ev => { ev.preventDefault(); send(false); };
    const dr = body().querySelector('#bxDraft'); if (dr) dr.onclick = () => send(true);
    const wd = body().querySelector('#bxWd'); if (wd) wd.onclick = async () => { if (confirm('Отозвать предложение?')) { await api('offer.php?a=withdraw', { json: { r: rid } }); viewRequest(rid); } };
    const dc = body().querySelector('#bxDecl'); if (dc) dc.onclick = async () => { if (confirm('Отказаться от заказа?')) { await api('offer.php?a=decline', { json: { r: rid } }); location.hash = '#/zakazy'; } };
  }
  const stageRow = (s, ro) => `<div class="bx-grid" style="grid-template-columns:1fr 110px auto;margin:0 0 6px"><input class="bx-in" name="sn" value="${esc(s.name)}" placeholder="Этап"${ro ? ' disabled' : ''}><input class="bx-in" name="sd" type="number" min="1" max="365" value="${esc(s.days)}" aria-label="Дней"${ro ? ' disabled' : ''}>${ro ? '<span></span>' : '<button type="button" class="btn ghost sm" data-rm>×</button>'}</div>`;

  // ── объекты (4.6)
  async function tabJobs() {
    const j = await api('jobs.php');
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    body().innerHTML = `<div class="bx-card"><h2>Объекты</h2><ul class="bx-list">${j.jobs.map(x => `<li><a href="#/obekt/${x.id}"><b>${esc(x.object)}</b></a> ${st(x.status, x.statusText)} <span class="bx-mut">${esc(rub(x.total))} · с ${esc(day(x.created))}</span></li>`).join('') || '<li class="bx-mut">Когда клиент выберет ваше предложение, объект появится здесь.</li>'}</ul></div>`;
  }
  const OBJ_TABS = [['glavnaya', 'Главное'], ['etapy', 'Этапы'], ['dogovor', 'Договор'], ['oplaty', 'Оплаты'], ['lenta', 'Лента'], ['listy', 'Листы'], ['spor', 'Разногласия']];
  async function viewJob(jid, sub, sid) {
    const [j, sh] = await Promise.all([api('jobs.php?j=' + jid), can('sheets') ? api('sheets.php?j=' + jid) : Promise.resolve({})]);
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    const J = j.job, C = J.client, T = sub === 'etap' ? 'etapy' : (sub || 'glavnaya');
    const tabs = `<nav class="kab-tabs">${OBJ_TABS.filter(([k]) => k !== 'oplaty' || J.can.money).filter(([k]) => k !== 'listy' || J.can.sheets).map(([k, t]) => `<a href="#/obekt/${jid}/${k}"${k === T ? ' class="on"' : ''}>${t}</a>`).join('')}</nav>`;
    const head = `<p><a href="#/obekty">← объекты</a></p><h2 style="margin:0 0 6px">${esc(J.object)} ${st(J.status, J.statusText)}</h2>${J.frozen ? `<p class="bx-err">Сделка приостановлена LINEA: ${esc(J.frozen)}. Лента и разногласия работают.</p>` : ''}${tabs}`;
    let h = '';
    if (T === 'glavnaya') {
      const now = J.status === 'contract' ? (J.can.sign ? 'Проверьте и подпишите договор — после подписи заказчиком откроются контакты.' : 'Договор ждёт подписи владельца бригады.')
        : J.status === 'work' ? (J.stages.find(s => s.status === 'returned') ? 'Этап вернули с замечаниями — закройте их с фото.' : J.stages.find(s => s.status === 'work' && !s.startedAt) ? 'Начните работу по текущему этапу.' : 'Ведите этап и сдайте его, когда готово.') : J.status === 'done' ? 'Объект завершён. Гарантия — по договору.' : '';
      h = `<div class="bx-card kab-now"><div class="kab-kick">Сейчас</div><p class="big">${esc(now)}</p></div>
        <div class="bx-card">${J.contactsOpen ? `<p><b>Заказчик:</b> ${esc(C.name)} · <a href="tel:${esc(String(C.phone).replace(/[^\d+]/g, ''))}">${esc(C.phone)}</a> · <a href="mailto:${esc(C.email)}">${esc(C.email)}</a>${C.address ? '<br><b>Адрес:</b> ' + esc(C.address) : ''}</p>` : `<p class="bx-note">${esc(J.terms.contactsText)}</p>`}
        ${J.debt && J.debt.text ? `<p class="bx-err">${esc(J.debt.text)}</p>` : ''}
        <p>Смета: <b>${esc(rub(J.total))}</b>${J.can.money ? (J.commission != null ? ' · вознаграждение LINEA ' + esc(J.rateText || J.terms.rate) + ': ' + esc(rub(J.commission)) + (J.commissionDueAt ? ' — к оплате с ' + esc(day(J.commissionDueAt)) + ' (' + esc(J.commissionDueWhy) + ')' : ' — к оплате после первых денег') : ' · вознаграждение начислится при подписании договора') : ''}</p>
        ${J.canCancel && J.can.sign ? '<p><button class="btn ghost sm" type="button" id="bxCancel">Отказаться от объекта</button></p>' : ''}</div>`;
    }
    if (T === 'etapy') h = J.stages.map(s => stageCard(J, s, sid)).join('') || '<p class="bx-mut">Этапы появятся после подписания договора.</p>';
    if (T === 'dogovor') {
      h = `<div class="bx-card"><p>Договор подряда: <a href="${API}remont-dogovor.php?j=${J.id}" target="_blank" rel="noopener">текст с приложениями (печать в PDF)</a> · подписали: заказчик — ${esc(J.clientSigned ? dt(J.clientSigned) : 'нет')}, бригада — ${esc(J.brigadeSigned ? dt(J.brigadeSigned) : 'нет')}</p>
        <p class="bx-note">${esc((J.docs || {}).transparency || '')}</p>
        <ul class="bx-list">${((J.docs || {}).contracts || []).filter(c => c.status !== 'void').map(c => `<li><b>${esc(c.title)}</b> ${st(c.status === 'signed' ? 'done' : 'review', c.status === 'signed' ? 'подписан' : 'ждёт подписи')}${c.kind === 'addendum' ? ` · ${c.delta >= 0 ? '+' : '−'}${esc(rub(Math.abs(c.delta)))}, итого ${esc(rub(c.total))}` : ''}${c.kind === 'termination' ? ` · принято работ на ${esc(rub(c.total))}${c.delta > 0 ? ', заказчик доплачивает ' + esc(rub(c.delta)) : c.delta < 0 ? ', вы возвращаете ' + esc(rub(-c.delta)) : ', расчёты завершены'}` : ''}
          <br><span class="bx-mut">заказчик: ${esc(c.clientSigned ? dt(c.clientSigned) : 'не подписано')} · бригада: ${esc(c.brigadeSigned ? dt(c.brigadeSigned) : 'не подписано')} · отпечаток ${esc(c.hash.slice(0, 16))}…</span>
          ${c.waitAdmin ? '<br><span class="bx-mut">Цена заметно уменьшается — подписать можно после подтверждения LINEA.</span>' : ''}
          ${c.status === 'draft' && !c.brigadeSigned && !c.waitAdmin ? (J.can.sign ? `<br><button class="btn sm" type="button" data-sign="${c.id}">Подписать кодом</button>` : `<br><button class="btn ghost sm" type="button" data-ask="${c.id}">Попросить владельца подписать</button>`) : ''}
          ${c.status === 'draft' && (c.kind === 'addendum' || c.kind === 'termination') && J.can.sign ? ` <button class="btn ghost sm" type="button" data-adc="${c.id}">Отозвать</button>` : ''}</li>`).join('')}</ul>
        ${J.status === 'work' && J.can.sign ? `<details><summary>Допработы или другой срок — допсоглашение</summary><form id="fAdd"><div class="bx-grid"><label class="bx-f">Работа<input name="an" maxlength="200" required></label><label class="bx-f">Ед.<input name="au" value="шт" maxlength="12"></label><label class="bx-f">Кол-во<input name="aq" type="number" step="0.01" value="1"></label><label class="bx-f">Цена за ед., ₽<input name="ap" type="number" step="1" min="0" required></label><label class="bx-f">Срок +/− дней<input name="ad" type="number" value="0"></label><label class="bx-cb"><input type="checkbox" name="arm"> исключить работу (минус)</label><label class="bx-f w2">Пояснение<input name="anote" maxlength="500"></label></div><div class="bx-row"><button class="btn ghost sm">Предложить допсоглашение</button></div><p class="bx-err"></p></form></details>` : ''}
        ${J.status === 'work' && J.can.sign ? `<details><summary>Расторгнуть договор</summary><form id="fTerm"><p class="bx-mut">Сайт соберёт соглашение о расторжении и акт: принятые заказчиком этапы с суммами по договору, что уже оплачено и итоговый расчёт. Подписывают обе стороны кодом. Вознаграждение LINEA пересчитывается от фактически принятого объёма.</p><label class="bx-f">Причина<textarea name="reason" maxlength="500" required></textarea></label><div class="bx-grid"><label class="bx-f">Работы сверх принятых этапов, ₽ (если заказчик признаёт)<input name="extra" type="number" min="0" step="1" value="0"></label><label class="bx-f">Какие работы<input name="extraNote" maxlength="500"></label></div><div class="bx-row"><button class="btn ghost sm">Подготовить соглашение о расторжении</button></div><p class="bx-err"></p></form></details>` : ''}
        <details><summary>Журнал сделки</summary><ul class="bx-list">${((J.docs || {}).log || []).map(l => `<li><span class="bx-mut">${esc(dt(l.at))}</span> · ${esc(l.who)}: ${esc(l.text)}</li>`).join('') || '<li class="bx-mut">Пока пусто.</li>'}</ul></details></div>`;
    }
    if (T === 'oplaty') {
      const P = J.payments || [], S2 = J.paySummary || {};
      h = `<div class="bx-card"><p>Оплата ремонта — напрямую вам, вне сайта. Здесь — реестр: каждую оплату одна сторона отмечает, вторая подтверждает или говорит «не получал» — тогда LINEA разберёт расхождение.</p>
        <p>По плану <b>${esc(rub(S2.plan || 0))}</b> · подтверждено <b>${esc(rub(S2.confirmed || 0))}</b> · ждёт подтверждения ${esc(rub(S2.declared || 0))}${S2.contested ? ' · расхождение ' + esc(rub(S2.contested)) : ''}</p>
        <ul class="bx-list">${P.map(p => `<li><b>${esc(p.kindText)}${p.stage ? ' · этап ' + p.stage.idx + ' «' + esc(p.stage.name) + '»' : ''}</b> — ${p.amount ? esc(rub(p.amount)) : 'сумма не указана'} ${st(p.status === 'confirmed' ? 'done' : p.status === 'contested' ? 'blocked' : p.status === 'declared' ? 'review' : 'new', p.statusText)}
          <div class="bx-mut">${p.declaredBy ? (p.declaredBy === 'client' ? 'Заказчик отметил' : 'Вы отметили') + ' ' + esc(dt(p.declaredAt)) : 'Срок — ' + esc(p.due ? day(p.due) : 'по приёмке этапа')}${p.confirmedAt ? ' · подтверждено ' + esc(dt(p.confirmedAt)) : ''}${p.contestNote ? ' · «' + esc(p.contestNote) + '»' : ''}</div>
          ${J.status !== 'cancelled' && (p.status === 'planned' || (p.status === 'declared' && p.declaredBy === 'client') || p.status === 'contested') ? `<div class="bx-row"><button class="btn sm" type="button" data-pay="${p.id}">${p.status === 'planned' ? 'Деньги получены' : 'Подтвердить получение'}</button>${p.status === 'declared' ? `<button class="btn ghost sm" type="button" data-payno="${p.id}">Не получали</button>` : ''}</div>` : ''}</li>`).join('') || '<li class="bx-mut">План оплат появится после подписания договора.</li>'}</ul>
        ${J.status === 'work' ? `<details><summary>Другая оплата (доплата по договорённости)</summary><form id="fPay" class="bx-grid"><label class="bx-f">Сумма, ₽<input name="amount" type="number" min="1" required></label><label class="bx-f">Пояснение<input name="note" maxlength="200"></label><div class="bx-row w2"><button class="btn ghost sm">Отметить: получено</button></div><p class="bx-err"></p></form></details>` : ''}</div>`;
    }
    if (T === 'lenta') h = `<div class="bx-card">${(J.messages || []).map(m => `<p class="${m.who === 'system' ? 'bx-mut' : ''}"><b>${esc({ client: 'Заказчик', brigade: 'Бригада', admin: 'LINEA', system: 'Система' }[m.who] || m.who)}</b> <span class="bx-mut">${esc(dt(m.at))}</span><br>${esc(m.text)}</p>`).join('') || '<p class="bx-mut">Сообщений пока нет.</p>'}
      ${J.contactsOpen ? '' : '<p class="bx-mut">До подписания договора телефоны, почта, ссылки и ники в сообщениях скрываются автоматически.</p>'}
      ${J.can.msg ? '<form id="fMsg"><label class="bx-f">Сообщение<textarea name="text" maxlength="2000" rows="2"></textarea></label><div class="bx-row"><button class="btn ghost sm">Отправить</button></div><p class="bx-err"></p></form>' : '<p class="bx-mut">Писать в ленту сотрудникам владелец не разрешил — только читать.</p>'}</div>`;
    if (T === 'listy') h = `<div class="bx-card" id="bxSheets">${sheetsBlock(J, sh)}</div>`;
    if (T === 'spor') h = `<div class="bx-card"><p class="bx-mut">Сначала напишите второй стороне в ленте сделки. Не договорились — попросите LINEA рассмотреть разногласие: мы сверим работы с проектом, фото и перепиской и дадим рекомендацию. Она необязательна: право на суд у сторон сохраняется.</p>
      ${(J.disputes || []).map(d => `<div class="bx-stage"><h4>${esc(d.subject)} ${st(d.status === 'open' ? 'review' : 'done', d.status === 'open' ? 'рассматривается' : 'закрыто')}</h4>${d.messages.map(m => `<p><b>${esc({ client: 'Заказчик', brigade: 'Бригада', admin: 'LINEA' }[m.who] || m.who)}</b> <span class="bx-mut">${esc(dt(m.at))}</span><br>${esc(m.text)}</p>`).join('')}${d.resolution ? '<p><b>Рекомендация LINEA:</b> ' + esc(d.resolution) + '</p>' : ''}
        ${d.status === 'open' ? `<form data-dm="${d.id}"><label class="bx-f">Ответ<textarea name="text" rows="2"></textarea></label><div class="bx-row"><button class="btn ghost sm">Отправить</button></div></form>` : ''}</div>`).join('')}
      ${J.can.sign ? '<details><summary>Попросить LINEA рассмотреть разногласие</summary><form id="fDisp"><label class="bx-f">Тема<input name="subject" required maxlength="120"></label><label class="bx-f">Суть<textarea name="text" required></textarea></label><div class="bx-row"><button class="btn ghost">Отправить в LINEA</button></div><p class="bx-err"></p></form></details>' : ''}</div>`;
    body().innerHTML = head + h;
    bindJob(J, jid, sid);
  }

  // этап: «Начать работу» с фото «до» → фото по ходу → мастер «Сдать этап» по пунктам чек-листа
  function stageCard(J, s, open) {
    const before = (J.beforePhotos || []).filter(f => f.stage === s.id).map(f => f.id);
    const items = (J.stageItems || []).filter(f => f.stage === s.id);
    const hidden = (J.hiddenStages || []).includes(s.id);
    const needBefore = (s.idx === 1 || hidden) && !s.startedAt;
    const live = J.status === 'work' && !J.frozen && J.can.stage;
    return `<div class="bx-stage" id="st${s.id}"><h4>${s.idx}. ${esc(s.name)} ${st(s.status, s.statusText)}${hidden ? ' <span class="bx-st review">скрытые работы</span>' : ''}</h4>
      <div class="bx-mut">План: ${esc(day(s.planStart))} — ${esc(day(s.planEnd))}${s.startedAt ? ' · начат ' + esc(dt(s.startedAt)) : ''}${s.acceptedAt ? ' · принят ' + esc(dt(s.acceptedAt)) : ''}</div>
      ${before.length ? `<div class="bx-mut">Фото «до» (${before.length}):</div><div class="bx-ph">${before.map(img).join('')}</div>` : ''}
      <details${open === s.id ? ' open' : ''}><summary class="bx-mut">Чек-лист приёмки: ${esc(s.checklist.title)}</summary><ul class="bx-check">${s.checklist.items.map((i, k) => `<li>${items.some(f => f.item === k) ? '📷' : '•'} <span>${esc(i.text)} <span class="src">(${esc(i.src)})</span></span></li>`).join('')}</ul></details>
      <div class="bx-ph">${s.photos.map(img).join('')}</div>
      ${s.remarks.length ? '<ul class="bx-check">' + s.remarks.map(r => `<li>${r.closedAt ? '✓' : '•'} <span>${esc(r.text)}${r.closedAt ? ' <span class="src">— ' + esc(r.closeNote) + '</span>' : (live ? ` <input class="bx-in" style="max-width:260px;padding:4px 8px" placeholder="что сделано" data-rn="${r.id}"> <button type="button" class="btn ghost sm" data-rc="${r.id}">Закрыть</button>` : '')}</span></li>`).join('') + '</ul>' : ''}
      ${live && s.status === 'work' && !s.startedAt ? `<div class="bx-row">${needBefore ? `<label class="btn ghost sm">📷 Фото «до» (${before.length} из ${J.startPhotos})<input type="file" accept="image/*" capture="environment" data-before="${s.id}" hidden multiple></label>` : ''}<button type="button" class="btn sm" data-start="${s.id}"${needBefore && before.length < J.startPhotos ? ' disabled' : ''}>Начать работу</button></div>` : ''}
      ${live && J.can.photo && (s.status === 'work' || s.status === 'returned') && s.startedAt ? `<div class="bx-row"><label class="btn ghost sm">+ фото этапа<input type="file" accept="image/*,application/pdf" capture="environment" data-sp="${s.id}" hidden multiple></label>${J.can.stage ? `<button type="button" class="btn sm" data-wiz="${s.id}">Сдать этап</button>` : ''}</div><p class="bx-mut" data-note="${s.id}"></p>` : ''}</div>`;
  }
  // мастер сдачи этапа: пункты чек-листа по одному, камера из пункта, затем «Отправить заказчику»
  function wizard(J, s, jid) {
    const items = s.checklist.items; let k = 0;
    const m = document.createElement('div'); m.className = 'kab-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    const draw = () => {
      const done = (J.stageItems || []).filter(f => f.stage === s.id).map(f => f.item);
      const last = k >= items.length;
      m.innerHTML = `<div class="kab-modal-in brg-wiz"><div class="kab-kick">Сдать этап «${esc(s.name)}» · ${last ? 'итог' : 'пункт ' + (k + 1) + ' из ' + items.length}</div>
        ${last ? `<h2>Отправить заказчику?</h2><p>Фото этапа: ${s.photos.length + (J._added || 0)} (нужно не меньше ${J.readyPhotos}). Заказчик примет этап по чек-листу или вернёт с замечаниями.</p>`
          : `<h2>${esc(items[k].text)}</h2><p class="bx-mut">${esc(items[k].src)}</p>${done.includes(k) ? '<p class="bx-ok">Фото к пункту есть ✓</p>' : ''}<label class="btn">📷 Снять фото к пункту<input type="file" accept="image/*" capture="environment" hidden multiple id="wzF"></label><p class="bx-mut" id="wzN"></p>`}
        <p class="bx-err" id="wzE"></p><div class="bx-row">${k > 0 ? '<button class="btn ghost sm" id="wzB">Назад</button>' : ''}${last ? '<button class="btn" id="wzGo">Отправить заказчику</button>' : '<button class="btn ghost sm" id="wzN2">Дальше</button>'}<button class="btn ghost sm" id="wzX">Закрыть</button></div></div>`;
      const f = m.querySelector('#wzF');
      if (f) f.onchange = async () => { const n = await upload([...f.files], { stage: s.id, item: k }, 'jobs.php?a=stage_photo', m.querySelector('#wzN')); J._added = (J._added || 0) + n; (J.stageItems = J.stageItems || []).push({ stage: s.id, item: k }); draw(); };
      const b = m.querySelector('#wzB'); if (b) b.onclick = () => { k--; draw(); };
      const n2 = m.querySelector('#wzN2'); if (n2) n2.onclick = () => { k++; draw(); };
      m.querySelector('#wzX').onclick = () => { m.remove(); viewJob(jid, 'etapy', s.id); };
      const go = m.querySelector('#wzGo'); if (go) go.onclick = async () => { const r = await api('jobs.php?a=stage_ready', { json: { stage: s.id } }); if (!r.ok) { m.querySelector('#wzE').textContent = r.error; return; } m.remove(); viewJob(jid, 'etapy', s.id); };
    };
    document.body.appendChild(m); draw();
  }
  function bindJob(J, jid, sid) {
    const B = body(), re = (sub) => viewJob(jid, sub || 'etapy', sid);
    B.querySelectorAll('[data-sign]').forEach(b => b.onclick = async () => {
      const pep = (J.docs || {}).pep || {};
      if (!confirm('Подписать документ простой электронной подписью? Когда договор подпишет и заказчик, откроются контакты сторон.\n\n' + (pep.text || '') + '\n(ред. ' + (pep.ed || '') + ')')) return;
      const r = await api('jobs.php?a=sign', { json: { j: jid, doc: +b.dataset.sign } }); if (!r.ok) { alert(r.error); return; }
      const code = prompt('Код подписи отправлен на почту бригады. Введите 6 цифр:' + (r.devCode ? ' (проверка: ' + r.devCode + ')' : '')); if (code === null) return;
      const r2 = await api('jobs.php?a=sign', { json: { j: jid, doc: r.doc, code, pep: true } }); if (!r2.ok) alert(r2.error); re('dogovor');
    });
    B.querySelectorAll('[data-ask]').forEach(b => b.onclick = async () => { const r = await api('jobs.php?a=sign_ask', { json: { j: jid } }); alert(r.ok ? r.message : r.error); });
    B.querySelectorAll('[data-adc]').forEach(b => b.onclick = async () => { if (!confirm('Отозвать неподписанный документ?')) return; const r = await api('jobs.php?a=addendum_cancel', { json: { j: jid, doc: +b.dataset.adc } }); if (!r.ok) alert(r.error); re('dogovor'); });
    const ft = B.querySelector('#fTerm'); if (ft) ft.onsubmit = async ev => { ev.preventDefault(); if (!confirm('Подготовить соглашение о расторжении договора?')) return; const r = await api('jobs.php?a=terminate', { json: { j: jid, reason: ft.reason.value, extra: +ft.extra.value || 0, extraNote: ft.extraNote.value } }); errBox(ft.querySelector('.bx-err'), r); if (r.ok) re('dogovor'); };
    const fa = B.querySelector('#fAdd'); if (fa) fa.onsubmit = async ev => { ev.preventDefault(); const r = await api('jobs.php?a=addendum', { json: { j: jid, items: [{ name: fa.an.value, unit: fa.au.value, qty: +fa.aq.value, price: +fa.ap.value, remove: fa.arm.checked }], daysAdd: +fa.ad.value || 0, note: fa.anote.value } }); errBox(fa.querySelector('.bx-err'), r); if (r.ok) re('dogovor'); };
    const bc = B.querySelector('#bxCancel'); if (bc) bc.onclick = async () => { const why = prompt('Почему отказываетесь от объекта? (необязательно)'); if (why === null) return; const r = await api('jobs.php?a=cancel', { json: { j: jid, reason: why } }); if (!r.ok) alert(r.error); location.hash = '#/obekty'; };
    const fm = B.querySelector('#fMsg'); if (fm) fm.onsubmit = async ev => { ev.preventDefault(); const r = await api('jobs.php?a=msg', { json: { j: jid, text: ev.target.text.value } }); errBox(ev.target.querySelector('.bx-err'), r); if (r.ok) re('lenta'); };
    B.querySelectorAll('[data-sp]').forEach(inp => inp.onchange = async () => { await upload([...inp.files], { stage: inp.dataset.sp }, 'jobs.php?a=stage_photo', B.querySelector(`[data-note="${inp.dataset.sp}"]`)); re(); });
    B.querySelectorAll('[data-before]').forEach(inp => inp.onchange = async () => { await upload([...inp.files], { stage: inp.dataset.before, kind: 'before' }, 'jobs.php?a=stage_photo'); re(); });
    B.querySelectorAll('[data-start]').forEach(b => b.onclick = async () => { if (!confirm('Отметить начало работ по этапу? Дата старта и фото «до» видны заказчику.')) return; const r = await api('jobs.php?a=stage_start', { json: { stage: +b.dataset.start } }); if (!r.ok) alert(r.error); re(); });
    B.querySelectorAll('[data-wiz]').forEach(b => b.onclick = () => wizard(J, J.stages.find(s => s.id === +b.dataset.wiz), jid));
    B.querySelectorAll('[data-rc]').forEach(b => b.onclick = async () => { const note = B.querySelector(`[data-rn="${b.dataset.rc}"]`).value; const r = await api('jobs.php?a=remark_close', { json: { remark: +b.dataset.rc, note } }); if (!r.ok) alert(r.error); re(); });
    B.querySelectorAll('[data-pay]').forEach(b => b.onclick = async () => { if (!confirm('Подтверждаете, что деньги получены? Отметка видна заказчику и LINEA.')) return; const r = await api('jobs.php?a=pay', { json: { j: jid, p: +b.dataset.pay } }); if (!r.ok) alert(r.error); re('oplaty'); });
    B.querySelectorAll('[data-payno]').forEach(b => b.onclick = async () => { const note = prompt('Что не так с оплатой? (увидят заказчик и LINEA)'); if (!note) return; const r = await api('jobs.php?a=pay_contest', { json: { j: jid, p: +b.dataset.payno, note } }); if (!r.ok) alert(r.error); re('oplaty'); });
    const fpay = B.querySelector('#fPay'); if (fpay) fpay.onsubmit = async ev => { ev.preventDefault(); const r = await api('jobs.php?a=pay', { json: { j: jid, kind: 'extra', amount: +fpay.amount.value, note: fpay.note.value } }); errBox(fpay.querySelector('.bx-err'), r); if (r.ok) re('oplaty'); };
    const fd = B.querySelector('#fDisp'); if (fd) fd.onsubmit = async ev => { ev.preventDefault(); const r = await api('jobs.php?a=dispute', { json: { j: jid, ...form(ev.target) } }); errBox(ev.target.querySelector('.bx-err'), r); if (r.ok) re('spor'); };
    B.querySelectorAll('[data-dm]').forEach(f => f.onsubmit = async ev => { ev.preventDefault(); const r = await api('jobs.php?a=dispute_msg', { json: { d: +f.dataset.dm, text: f.text.value } }); if (!r.ok) alert(r.error); re('spor'); });
    if (sid) { const el = document.getElementById('st' + sid); if (el) el.scrollIntoView({ block: 'start' }); }
    bindSheets(J, jid);
  }

  // «Нужен лист» (4.7): текст или надиктовка в текст; голосовую запись сервер листов пока не расшифровывает — честно говорим
  function sheetsBlock(J, sh) {
    const list = (sh.sheets || []).map(s => `<li>${st(s.status, s.statusText)} ${esc(s.text)} <span class="bx-mut">${esc(s.room)}${s.wall ? ', стена ' + esc(s.wall) : ''} · ${esc(dt(s.created))}</span>
      ${s.result ? `<br><a href="${fileUrl(s.result)}" target="_blank" rel="noopener">Лист PDF</a>${s.note ? ' <span class="bx-mut">' + esc(s.note) + '</span>' : ''}${s.license ? '<br><span class="bx-mut"><b>Условия использования листа.</b> ' + esc(s.license) + '</span>' : ''}` : ''}
      ${s.status === 'question' ? `<br><b>Вопрос:</b> ${esc(s.question)} <input class="bx-in" style="max-width:320px;padding:4px 8px" data-an="${s.id}" placeholder="ответ"> <button type="button" class="btn ghost sm" data-ab="${s.id}">Ответить</button>` : ''}</li>`).join('');
    const used = (sh.sheets || []).filter(s => s.status !== 'rejected').length, lim = (sh.terms || {}).sheetsFreeLimit || 15;
    const inDeal = sh.inDeal != null ? sh.inDeal : J.status === 'work';
    const speech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    return `<p class="bx-mut">Не хватает узла, развёртки или размера — опишите, что нужно. Статус: принят → в работе → готов (или уточняющий вопрос). Использовано ${used} из ${lim} на этот объект.</p>
      <p class="bx-note">${esc((sh.terms || {}).sheetsText || '')}</p>
      ${inDeal ? `<form id="fSheet"><div class="bx-grid"><label class="bx-f">Помещение<select name="room"><option value="">—</option>${(sh.rooms || []).map(r => `<option>${esc(r)}</option>`).join('')}</select></label>
      <label class="bx-f">Стена <span class="bx-mut">(A — верх плана, B — право, C — низ, D — лево)</span><select name="wall"><option value="">—</option><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
      <label class="bx-f w2">Какой лист нужен<textarea name="text" maxlength="900" placeholder="Например: развёртка стены B кухни с выводами под технику и высотами розеток"></textarea></label></div>
      <p class="bx-mut">Пока принимаем только текст: голосовые записи сервер листов не расшифровывает. ${speech ? 'Кнопка «Надиктовать» сразу превращает речь в текст — проверьте его перед отправкой.' : 'На телефоне удобно надиктовать текст микрофоном клавиатуры.'}</p>
      <div class="bx-row">${speech ? '<button type="button" class="btn ghost bx-mic" id="bxDict">🎙 Надиктовать</button>' : ''}<button class="btn">Нужен лист</button></div><p class="bx-err"></p></form>` : '<p class="bx-mut">Листы по запросу — пока сделка идёт через LINEA (договор подписан, объект в работе).</p>'}
      <ul class="bx-list" style="margin-top:12px">${list || '<li class="bx-mut">Запросов листов пока не было.</li>'}</ul>`;
  }
  function bindSheets(J, jid) {
    const f = body().querySelector('#fSheet');
    body().querySelectorAll('[data-ab]').forEach(b => b.onclick = async () => { const r = await api('sheets.php?a=answer', { json: { s: +b.dataset.ab, answer: body().querySelector(`[data-an="${b.dataset.ab}"]`).value } }); if (!r.ok) alert(r.error); viewJob(jid, 'listy'); });
    if (!f) return;
    const d = f.querySelector('#bxDict');
    if (d) d.onclick = () => {
      const R = new (window.SpeechRecognition || window.webkitSpeechRecognition)(); R.lang = 'ru-RU'; R.interimResults = false; R.continuous = false;
      d.classList.add('rec'); d.textContent = '🎙 Говорите…';
      R.onresult = e => { const t = [...e.results].map(x => x[0].transcript).join(' '); const ta = f.querySelector('[name=text]'); ta.value = (ta.value ? ta.value + ' ' : '') + t; };
      R.onend = () => { d.classList.remove('rec'); d.textContent = '🎙 Надиктовать'; };
      R.onerror = () => { d.classList.remove('rec'); d.textContent = '🎙 Не получилось — напишите текстом'; };
      R.start();
    };
    f.onsubmit = async ev => {
      ev.preventDefault();
      if (!f.querySelector('[name=text]').value.trim()) { const e = f.querySelector('.bx-err'); e.className = 'bx-err'; e.textContent = 'Напишите или надиктуйте, какой лист нужен — пока принимаем только текст'; return; }
      const fd = new FormData(f); fd.append('j', jid); fd.append('lang', 'ru');
      const r = await api('sheets.php?a=create', { form: fd });
      if (r.ok) viewJob(jid, 'listy'); else errBox(f.querySelector('.bx-err'), r);
    };
  }

  // ── деньги (4.8): начислено · к оплате · оплачено · долг; «отложено до ИП LINEA»; проводки простыми словами; пилот; счета
  async function tabMoney() {
    const j = await api('finance.php');
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    body().innerHTML = `<div class="brg-tiles"><div class="brg-tile"><b>${esc(rub(j.accrued))}</b><span>начислено</span></div><div class="brg-tile"><b>${esc(rub(j.due))}</b><span>к оплате</span></div><div class="brg-tile"><b>${esc(rub(j.paid))}</b><span>оплачено</span></div><div class="brg-tile"><b>${esc(rub(j.debt))}</b><span>долг</span></div></div>
      ${j.deferred ? `<p class="bx-note">${esc(j.deferredText)}</p>` : ''}${j.npd ? `<p class="bx-note">${esc(j.npd)}</p>` : ''}${j.pilotLeft != null ? `<p class="bx-note">Вы в пилоте: ещё ${esc(j.pilotLeft)} ${j.pilotLeft === 1 ? 'сделка' : 'сделки'} по пониженной ставке.</p>` : ''}
      ${j.debtLadder && j.debtLadder.text ? `<p class="bx-err">${esc(j.debtLadder.text)}</p>` : ''}
      <div class="bx-card"><h2>Когда я плачу?</h2><p>${esc(j.whenPay)}</p><p class="bx-mut">Оплата ремонта — напрямую вам от заказчика; вознаграждение LINEA ${esc(j.rate)} — по счёту. ${j.requisites ? 'Реквизиты: ' + esc(j.requisites) : 'Реквизиты будут в счёте.'}</p></div>
      <div class="bx-card"><h2>По объектам</h2><div class="bx-tbl-wrap"><table class="bx-tbl"><thead><tr><th>Объект</th><th>Статус</th><th class="r">Договор</th><th class="r">Вознаграждение</th><th>Счёт</th></tr></thead><tbody>${j.jobs.map(x => `<tr><td>${esc(x.object)}</td><td>${esc(x.status)}</td><td class="r">${esc(rub(x.total))}</td><td class="r">${x.commission != null ? esc(rub(x.commission)) + (x.rate ? ' (' + esc(x.rate) + ')' : '') + (x.dueAt ? '<br><span class="bx-mut">к оплате с ' + esc(day(x.dueAt)) + '</span>' : '') : '—'}</td><td>${x.invoice ? esc(x.invoice.number) + ' · ' + esc(rub(x.invoice.amount)) + (x.invoice.paid ? ' ✓ оплачен' : ' · до ' + esc(day(x.invoice.due))) : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="bx-mut">Пока нет.</td></tr>'}</tbody></table></div></div>
      <div class="bx-card"><h2>История</h2><ul class="bx-list">${(j.ledger || []).map(l => `<li><span class="bx-mut">${esc(dt(l.at))}</span> · ${esc(l.text)} ${esc(rub(l.amount))} — ${esc(l.object)}${l.note ? ' <span class="bx-mut">(' + esc(l.note) + ')</span>' : ''}${l.status === 'deferred' ? ' <span class="bx-st review">отложено до ИП LINEA</span>' : ''}</li>`).join('') || '<li class="bx-mut">Проводок пока нет.</li>'}</ul></div>`;
  }

  // ── рейтинг и отзывы (4.9)
  async function viewRating() {
    const j = await api('kab.php?a=rating');
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    const s = j.stats;
    body().innerHTML = `<div class="brg-tiles"><div class="brg-tile"><b>${s.rating.avg != null ? esc(s.rating.avg) : '—'}</b><span>оценка (${esc(s.rating.n)} отзывов)</span></div><div class="brg-tile"><b>${esc(s.deals)}</b><span>сделок через LINEA</span></div>
      <div class="brg-tile"><b>${s.firstTime != null ? esc(s.firstTime) + ' %' : '—'}</b><span>этапов принято с первого раза</span></div><div class="brg-tile"><b>${s.responseHours != null ? esc(Math.round(s.responseHours)) + ' ч' : '—'}</b><span>среднее время ответа</span></div>
      <div class="brg-tile"><b>${esc(s.late)}</b><span>просрочек этапов</span></div><div class="brg-tile"><b>${esc(s.disputes)}</b><span>разногласий</span></div></div>
      <p class="bx-mut">${esc(j.formula)}</p>
      ${s.warnings.length ? `<div class="bx-card"><h2>Предупреждения</h2><ul class="bx-list">${s.warnings.map(w => `<li>Шаг ${w.step}: ${esc(w.rule)} <span class="bx-mut">${esc(dt(w.at))}${w.until ? ', действует до ' + esc(day(w.until)) : ''}</span></li>`).join('')}</ul><p class="bx-mut">1-е — предупреждение; 2-е — ниже в подборе на 14 дней; 3-е за 90 дней — лента заказов закрыта на 14 дней.</p></div>` : ''}
      <div class="bx-card"><h2>Отзывы</h2><ul class="bx-list">${j.reviews.map(r => `<li>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} <span class="bx-mut">${esc(dt(r.at))}${r.hidden ? ' · скрыт по правилам площадки' : ''}</span><br>${esc(r.text)}
        ${r.reply ? `<p class="bx-mut"><b>Ваш ответ:</b> ${esc(r.reply)}</p>` : (can('profile') ? `<form data-rr="${r.id}"><label class="bx-f">Ответить (один раз, публично)<textarea name="text" rows="2" maxlength="1500"></textarea></label><div class="bx-row"><button class="btn ghost sm">Ответить</button></div></form>` : '')}</li>`).join('') || '<li class="bx-mut">Отзывов пока нет: их оставляют заказчики после завершения объекта.</li>'}</ul></div>`;
    body().querySelectorAll('[data-rr]').forEach(f => f.onsubmit = async ev => { ev.preventDefault(); const r = await api('kab.php?a=review_reply', { json: { id: +f.dataset.rr, text: f.text.value } }); if (!r.ok) alert(r.error); viewRating(); });
  }

  // ── команда (4.10): бригадир и сотрудник — свои входы кодом; объекты; удалённый теряет доступ сразу
  async function viewTeam() {
    const j = await api('kab.php?a=team');
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    const jobs = j.jobs;
    const objSel = (m, role) => jobs.map(x => `<label class="bx-cb"><input type="checkbox" name="obj" value="${x.id}"${m && m.objects && m.objects.includes(x.id) ? ' checked' : ''}> ${esc(x.object)}</label>`).join('') || '<span class="bx-mut">Объектов пока нет.</span>';
    body().innerHTML = `<div class="bx-card"><h2>Команда</h2><p class="bx-mut">Владелец — всё: анкета, предложения, подпись, деньги, команда. Бригадир — лента сделки, фото и сдача этапов, замечания, листы, черновик предложения. Сотрудник — фото этапов своих объектов и листы.</p>
      <ul class="bx-list"><li><b>${esc(j.owner.name)}</b> — Владелец <span class="bx-mut">${esc(j.owner.email)}</span></li>${j.members.map(m => `<li><b>${esc(m.name)}</b> — ${esc(m.roleText)} <span class="bx-mut">${esc(m.email)} · ${m.objects === null ? 'все объекты' : m.objects.length ? 'объекты: ' + m.objects.length : 'объекты не назначены'}${m.lastLogin ? ' · входил ' + esc(dt(m.lastLogin)) : ' · ещё не входил'}</span>
        <form class="bx-row" data-mu="${m.id}"><select name="role">${opts(j.roles, m.role).replace(/<option value="owner"[^>]*>[^<]*<\/option>/, '')}</select>${objSel(m)}<label class="bx-cb"><input type="checkbox" name="all"${m.objects === null ? ' checked' : ''}> все объекты (только бригадир)</label><button class="btn ghost sm">Сохранить</button><button type="button" class="btn ghost sm" data-mx="${m.id}">Удалить</button></form></li>`).join('')}</ul>
      <label class="bx-cb"><input type="checkbox" id="bxWm"${j.workerMsg ? ' checked' : ''}> Сотрудники могут писать заказчику в ленту сделки</label></div>
      <form class="bx-card" id="fInv"><h2>Пригласить</h2><div class="bx-grid"><label class="bx-f">Имя<input name="name" required maxlength="80"></label><label class="bx-f">Почта (вход — кодом)<input name="email" type="email" required></label>
      <label class="bx-f">Роль<select name="role"><option value="foreman">Бригадир</option><option value="worker">Сотрудник</option></select></label></div><div class="bx-f">Объекты${objSel(null)}</div><div class="bx-row"><button class="btn">Пригласить</button></div><p class="bx-err"></p></form>`;
    const B = body();
    const objs = f => f.all && f.all.checked ? null : [...f.querySelectorAll('[name=obj]:checked')].map(i => +i.value);
    B.querySelectorAll('[data-mu]').forEach(f => f.onsubmit = async ev => { ev.preventDefault(); const r = await api('kab.php?a=team_update', { json: { id: +f.dataset.mu, role: f.role.value, objects: objs(f) } }); if (!r.ok) alert(r.error); viewTeam(); });
    B.querySelectorAll('[data-mx]').forEach(b => b.onclick = async () => { if (!confirm('Удалить человека из команды? Доступ закроется сразу; его фото и сообщения останутся в сделках.')) return; const r = await api('kab.php?a=team_remove', { json: { id: +b.dataset.mx } }); if (!r.ok) alert(r.error); viewTeam(); });
    B.querySelector('#bxWm').onchange = async e => { await api('kab.php?a=worker_msg', { json: { on: e.target.checked } }); };
    const fi = B.querySelector('#fInv'); fi.onsubmit = async ev => { ev.preventDefault(); const sel = [...fi.querySelectorAll('[name=obj]:checked')].map(i => +i.value); const r = await api('kab.php?a=team_invite', { json: { name: fi.name.value, email: fi.email.value, role: fi.role.value, objects: fi.role.value === 'foreman' && !sel.length ? null : sel } }); errBox(fi.querySelector('.bx-err'), r); if (r.ok) setTimeout(viewTeam, 900); };
  }

  // ── документы (4.0б)
  async function viewDocs() {
    const j = await api('kab.php?a=docs');
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    body().innerHTML = `<div class="bx-card"><h2>Принятые документы</h2><ul class="bx-list">${j.accepted.map(d => `<li>${d.href ? `<a href="../${esc(d.href)}" target="_blank" rel="noopener">${esc(d.title)}</a>` : esc(d.title)} <span class="bx-mut">ред. ${esc(d.ed)}${d.at ? ' · ' + esc(dt(d.at)) : ''}${d.ip ? ' · IP ' + esc(d.ip) : ''}</span></li>`).join('')}</ul></div>
      ${j.jobs.map(x => `<div class="bx-card"><h2>${esc(x.object)} <span class="bx-mut">${esc(x.status)}</span></h2><ul class="bx-list">
        ${x.contracts.map(c => `<li><a href="${API}remont-dogovor.php?j=${x.id}" target="_blank" rel="noopener">${c.kind === 'main' ? 'Договор подряда' : 'Допсоглашение № ' + c.num}</a> <span class="bx-mut">${esc(c.status === 'signed' ? 'подписан' : 'ждёт подписи')} · отпечаток ${esc(String(c.hash).slice(0, 16))}…</span></li>`).join('')}
        ${x.acts.map(a => `<li>Акт этапа ${a.idx} «${esc(a.name)}» <span class="bx-mut">принят ${esc(dt(a.accepted))}</span></li>`).join('')}
        ${x.sheets.map(s => `<li>${s.file ? `<a href="${fileUrl(s.file)}" target="_blank" rel="noopener">Лист: ${esc(s.text)}</a>` : esc(s.text)}</li>`).join('')}</ul></div>`).join('')}
      ${j.invoices.length ? `<div class="bx-card"><h2>Счета LINEA</h2><ul class="bx-list">${j.invoices.map(i => `<li>${esc(i.number)} · ${esc(rub(i.amount))} <span class="bx-mut">${esc(day(i.issued))}${i.paid ? ' · оплачен ' + esc(day(i.paid)) : ' · до ' + esc(day(i.due))}</span></li>`).join('')}</ul></div>` : ''}`;
  }

  // ── уведомления (4.11)
  async function viewNotices() {
    const j = await api('kab.php?a=notices');
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    body().innerHTML = `<div class="bx-card"><h2>Уведомления</h2>${j.unread ? '<div class="bx-row"><button class="btn ghost sm" id="bxRead">Отметить все прочитанными</button></div>' : ''}<ul class="bx-list">${j.list.map(n => `<li class="${n.read ? 'bx-mut' : ''}">${n.read ? '' : '● '}${n.link ? `<a href="${esc(n.link)}">${esc(n.text)}</a>` : esc(n.text)} <span class="bx-mut">${esc(dt(n.at))} · ${esc(j.groups[n.grp] || n.grp)}</span></li>`).join('') || '<li class="bx-mut">Пока ничего.</li>'}</ul></div>
      <form class="bx-card" id="fPrefs"><h2>Письма на почту</h2>${Object.entries(j.groups).map(([k, t]) => `<label class="bx-cb"><input type="checkbox" name="${k}"${j.prefs[k] === false ? '' : ' checked'}> ${esc(t)}</label>`).join('')}<p class="bx-mut">${esc(j.must)}.</p><div class="bx-row"><button class="btn ghost sm">Сохранить</button></div><p class="bx-err"></p></form>`;
    const rd = body().querySelector('#bxRead'); if (rd) rd.onclick = async () => { await api('kab.php?a=notices_read', { json: { all: true } }); viewNotices(); };
    const fp = body().querySelector('#fPrefs'); fp.onsubmit = async ev => { ev.preventDefault(); const groups = {}; Object.keys(j.groups).forEach(k => { groups[k] = fp[k].checked; }); errBox(fp.querySelector('.bx-err'), await api('kab.php?a=prefs', { json: { groups } })); };
  }

  boot();
})();
