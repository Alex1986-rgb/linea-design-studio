// LINEA · кабинет бригады «Ремонт по проекту»: вход/регистрация/восстановление, анкета и портфолио, лента запросов,
// предложение по позициям сметы, объекты (контакты после выбора клиента, договор, этапы, замечания, листы по запросу), финансы.
// API — api/brigade/*.php (мета linea-api ставит site-rebase.js при выкладке). Без меты (GitHub Pages) кабинет честно говорит, где он работает.
(function () {
  'use strict';
  const root = document.getElementById('bx');
  const API = (document.querySelector('meta[name="linea-api"]') || {}).content || '';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rub = n => (Math.round(n * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
  const dt = s => { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const day = s => { if (!s) return '—'; const d = new Date(String(s).slice(0, 10) + 'T00:00'); return isNaN(d) ? s : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); };
  const st = (k, t) => `<span class="bx-st ${esc(k)}">${esc(t)}</span>`;
  const img = id => `<a href="${API}brigade/file.php?f=${id}" target="_blank" rel="noopener"><img src="${API}brigade/file.php?f=${id}" alt="" loading="lazy"></a>`;
  const TEST = new URLSearchParams(location.search).get('test') === '1';
  let S = { csrf: '', me: null, dict: null, tab: 'profile' };

  if (!API) { root.innerHTML = '<div class="bx-card"><h2>Кабинет на основном сайте</h2><p>Кабинет бригады работает на сайте студии с защищённым соединением. Условия — <a href="../brigadam/">на странице для бригад</a>.</p></div>'; return; }

  async function api(path, opt = {}) {
    const h = {};
    let body;
    if (opt.json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(opt.json); }
    if (opt.form) body = opt.form;
    if ((opt.method || (body ? 'POST' : 'GET')) === 'POST') h['X-CSRF'] = S.csrf;
    const r = await fetch(API + 'brigade/' + path, { method: opt.method || (body ? 'POST' : 'GET'), headers: h, body, credentials: 'same-origin', cache: 'no-store' });
    let j; try { j = await r.json(); } catch { j = { ok: false, error: 'Сервер не ответил — попробуйте через минуту' }; }
    if (j.csrf) S.csrf = j.csrf;
    if (r.status === 401) { S.me = null; }
    j.code = r.status;
    return j;
  }
  const errBox = (el, j) => { el.className = j.ok ? 'bx-ok' : 'bx-err'; el.textContent = j.ok ? (j.message || 'Сохранено') : (j.error || 'Ошибка'); };
  const form = el => Object.fromEntries([...new FormData(el)].filter(([k]) => !k.endsWith('[]')));
  const many = (el, name) => [...el.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
  const chips = (name, dict, sel = []) => `<div class="bx-chips">${Object.entries(dict).map(([k, t]) => `<label><input type="checkbox" name="${name}" value="${esc(k)}"${sel.includes(k) ? ' checked' : ''}> ${esc(t)}</label>`).join('')}</div>`;
  const opts = (dict, cur, empty) => (empty ? `<option value="">${esc(empty)}</option>` : '') + Object.entries(dict).map(([k, t]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(t)}</option>`).join('');

  async function boot() {
    const j = await api('auth.php?a=me' + (TEST ? '&test=1' : ''));
    if (!j.ok) { root.innerHTML = `<div class="bx-card"><h2>Кабинет недоступен</h2><p>${esc(j.error)}</p></div>`; return; }
    S.dict = j; S.me = j.brigade;
    const hash = location.hash;
    if (hash.startsWith('#reset=')) return viewReset(hash.slice(7));
    if (!S.me) return viewAuth(hash === '#register' ? 'register' : 'login');
    viewCabinet();
  }

  // ───────────── вход, регистрация, восстановление
  function viewAuth(mode) {
    const D = S.dict;
    const tabs = `<ul class="bx-tabs" role="tablist">${[['login', 'Вход'], ['register', 'Регистрация бригады'], ['forgot', 'Забыли пароль']].map(([k, t]) => `<li><button type="button" data-m="${k}" class="${k === mode ? 'on' : ''}">${t}</button></li>`).join('')}</ul>`;
    let h = '';
    if (mode === 'login') h = `<form class="bx-card" id="fLogin"><h2>Вход в кабинет</h2><div class="bx-grid"><label class="bx-f">E-mail<input name="email" type="email" autocomplete="username" required></label><label class="bx-f">Пароль<input name="password" type="password" autocomplete="current-password" required></label></div><div class="bx-row"><button class="btn">Войти</button></div><p class="bx-err" role="status"></p></form>`;
    if (mode === 'forgot') h = `<form class="bx-card" id="fForgot"><h2>Восстановить пароль</h2><p>Пришлём ссылку на почту, указанную при регистрации. Ссылка действует 1 час.</p><label class="bx-f">E-mail<input name="email" type="email" required></label><div class="bx-row"><button class="btn">Прислать ссылку</button></div><p class="bx-err" role="status"></p></form>`;
    if (mode === 'register') h = `<form class="bx-card" id="fReg"><h2>Регистрация бригады</h2>
      <p class="bx-note">После регистрации добавьте не меньше трёх объектов с фото «до» и «после» и отправьте анкету на проверку. Проверка — ИНН по базе ФНС и короткий видеозвонок. Копии паспортов не нужны.</p>
      <div class="bx-grid">
        <label class="bx-f">Название бригады<input name="name" required maxlength="80" placeholder="Например: «Бригада Сергея Ковалёва»"></label>
        <label class="bx-f">Имя бригадира<input name="contactName" required maxlength="80" autocomplete="name"></label>
        <label class="bx-f">Телефон<input name="phone" type="tel" required autocomplete="tel" placeholder="+7 …"></label>
        <label class="bx-f">E-mail (логин)<input name="email" type="email" required autocomplete="email"></label>
        <label class="bx-f">Форма работы<select name="legal" required>${opts(D.legal, '', 'Выберите')}</select></label>
        <label class="bx-f">ИНН<input name="inn" inputmode="numeric" required maxlength="12" placeholder="12 цифр (ООО — 10)"></label>
        <label class="bx-f w2">Название ИП/ООО (если есть)<input name="company" maxlength="120"></label>
        <div class="bx-f w2">Специализации${chips('specs', D.specs)}</div>
        <div class="bx-f w2">Районы работы${chips('districts', D.districts)}</div>
        <label class="bx-f">Человек в бригаде<input name="teamSize" type="number" min="1" max="200" value="3"></label>
        <label class="bx-f">Опыт, лет<input name="experience" type="number" min="0" max="60" value="5"></label>
        <label class="bx-f">Гарантия на работы, мес.<input name="warrantyMonths" type="number" min="1" max="120" value="24"></label>
        <label class="bx-f">Ориентир цены работ, ₽/м² (для фильтра каталога)<input name="priceFrom" type="number" min="0" step="100"></label>
        <label class="bx-f w2">Рекомендатели (кто может подтвердить работу: имя, объект, как связаться)<textarea name="referees" maxlength="1000"></textarea></label>
        <label class="bx-f w2">О бригаде (будет в карточке каталога)<textarea name="about" maxlength="2000"></textarea></label>
        <label class="bx-f">Пароль (8+ знаков, буквы и цифры)<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
      </div>
      <label class="bx-cb"><input type="checkbox" name="publicName" value="1"> Показывать имя бригадира в публичной карточке (телефон и почта не публикуются никогда)</label>
      ${Object.entries(D.docs).map(([k, d]) => `<label class="bx-cb"><input type="checkbox" name="c_${k}" value="${esc(d.ed)}" required> Принимаю: <a href="../${esc(d.href)}" target="_blank" rel="noopener">${esc(d.title)}</a>, редакция от ${esc(d.ed)}</label>`).join('')}
      <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
      <div class="bx-row"><button class="btn">Зарегистрировать бригаду</button></div><p class="bx-err" role="status"></p></form>`;
    root.innerHTML = tabs + h;
    root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { history.replaceState(null, '', b.dataset.m === 'register' ? '#register' : location.pathname + location.search); viewAuth(b.dataset.m); });
    const f = root.querySelector('form'), e = f.querySelector('.bx-err');
    f.onsubmit = async ev => {
      ev.preventDefault();
      const btn = f.querySelector('button.btn'); btn.disabled = true;
      let j;
      if (mode === 'login') j = await api('auth.php?a=login', { json: form(f) });
      if (mode === 'forgot') j = await api('auth.php?a=forgot', { json: form(f) });
      if (mode === 'register') {
        const v = form(f);
        const consents = {}; Object.keys(S.dict.docs).forEach(k => { const c = f.querySelector(`[name="c_${k}"]`); if (c.checked) consents[k] = c.value; });
        j = await api('auth.php?a=register' + (TEST ? '&test=1' : ''), { json: { ...v, specs: many(f, 'specs'), districts: many(f, 'districts'), publicName: !!v.publicName, consents, test: TEST } });
      }
      btn.disabled = false;
      errBox(e, j);
      if (j.ok && j.brigade) { S.me = j.brigade; history.replaceState(null, '', location.pathname + location.search); viewCabinet(); }
      if (j.ok && j.devLink) e.innerHTML += ` <a href="${esc(j.devLink.replace(/^.*\/brigada\//, ''))}">(проверка: ссылка)</a>`;
    };
  }
  function viewReset(token) {
    root.innerHTML = `<form class="bx-card" id="fReset"><h2>Новый пароль</h2><label class="bx-f">Пароль (8+ знаков, буквы и цифры)<input name="password" type="password" minlength="8" required autocomplete="new-password"></label><div class="bx-row"><button class="btn">Сохранить</button></div><p class="bx-err" role="status"></p></form>`;
    const f = root.querySelector('form');
    f.onsubmit = async ev => { ev.preventDefault(); const j = await api('auth.php?a=reset', { json: { token, password: form(f).password } }); errBox(f.querySelector('.bx-err'), j); if (j.ok) { history.replaceState(null, '', location.pathname); setTimeout(() => viewAuth('login'), 1200); } };
  }

  // ───────────── кабинет
  const TABS = [['profile', 'Анкета и портфолио'], ['feed', 'Запросы'], ['jobs', 'Объекты'], ['money', 'Финансы']];
  function viewCabinet() {
    const m = S.me;
    root.innerHTML = `<div class="bx-row" style="justify-content:space-between;margin:0 0 12px"><div><b>${esc(m.name)}</b> ${st(m.status, m.statusText)}${m.test ? ' <span class="bx-st blocked">тест</span>' : ''}</div><button class="btn ghost sm" type="button" id="bxOut">Выйти</button></div>
      ${m.statusReason && m.status !== 'active' ? `<p class="bx-note">Причина: ${esc(m.statusReason)}</p>` : ''}
      <ul class="bx-tabs">${TABS.map(([k, t]) => `<li><button type="button" data-t="${k}" class="${k === S.tab ? 'on' : ''}">${t}</button></li>`).join('')}</ul><div id="bxBody"></div>`;
    root.querySelector('#bxOut').onclick = async () => { await api('auth.php?a=logout', { method: 'POST' }); S.me = null; viewAuth('login'); };
    root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.tab = b.dataset.t; viewCabinet(); });
    ({ profile: tabProfile, feed: tabFeed, jobs: tabJobs, money: tabMoney })[S.tab]();
  }
  const body = () => root.querySelector('#bxBody');

  async function tabProfile() {
    const j = await api('profile.php');
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    S.me = j.brigade; const m = j.brigade, D = S.dict;
    const ports = j.portfolio.map(p => `<li><b>${esc(p.title)}</b> <span class="bx-mut">${esc(D.districts[p.district] || '')}${p.area ? ', ' + p.area + ' м²' : ''}${p.year ? ', ' + p.year : ''}</span>
      <p class="bx-mut">${esc(p.works)}</p>
      <div class="bx-mut">До:</div><div class="bx-ph">${p.photos.filter(f => f.kind === 'before').map(f => img(f.id)).join('') || '<span class="bx-mut">нет фото</span>'}</div>
      <div class="bx-mut">После:</div><div class="bx-ph">${p.photos.filter(f => f.kind === 'after').map(f => img(f.id)).join('') || '<span class="bx-mut">нет фото</span>'}</div>
      <div class="bx-row"><label class="btn ghost sm">+ фото «до»<input type="file" accept="image/jpeg,image/png,image/webp" data-up="${p.id}" data-kind="before" hidden multiple></label>
      <label class="btn ghost sm">+ фото «после»<input type="file" accept="image/jpeg,image/png,image/webp" data-up="${p.id}" data-kind="after" hidden multiple></label>
      <button class="btn ghost sm" type="button" data-del="${p.id}">Удалить объект</button></div></li>`).join('');
    body().innerHTML = `
      ${m.status === 'draft' ? `<div class="bx-card"><h2>Отправить анкету на проверку</h2><p>${j.missing.length ? 'Не хватает: ' + esc(j.missing.join('; ')) : 'Всё готово — отправьте анкету. Мы сверим ИНН и договоримся о видеозвонке.'}</p><div class="bx-row"><button class="btn" id="bxSubmit"${j.canSubmit ? '' : ' disabled'}>Отправить на проверку</button></div><p class="bx-err" id="bxSubErr"></p></div>` : ''}
      ${m.status === 'review' ? '<div class="bx-card"><h2>Анкета на проверке</h2><p>Сверяем ИНН и свяжемся для видеозвонка. После допуска в разделе «Запросы» появятся заказы.</p></div>' : ''}
      ${m.status === 'active' ? `<div class="bx-card"><h2>Бригада допущена</h2><p>Карточка в каталоге: <a href="../brigady/${esc(m.slug)}/" target="_blank" rel="noopener">/brigady/${esc(m.slug)}/</a>. ИНН проверен ${esc(day(m.innChecked))}, видеозвонок ${esc(day(m.callAt))}.</p></div>` : ''}
      <div class="bx-card"><h2>Портфолио: объекты «до/после»</h2><ul class="bx-list">${ports || '<li class="bx-mut">Объектов пока нет — добавьте не меньше трёх.</li>'}</ul>
        <form id="fPort" class="bx-grid" style="margin-top:14px"><label class="bx-f">Объект<input name="title" required placeholder="Квартира 62 м², Хамовники"></label>
        <label class="bx-f">Район<select name="district">${opts(D.districts, '', '—')}</select></label><label class="bx-f">Площадь, м²<input name="area" type="number" step="0.1"></label><label class="bx-f">Год<input name="year" type="number" min="1990" max="2030"></label>
        <label class="bx-f w2">Что делали<textarea name="works" maxlength="1500"></textarea></label><div class="bx-row w2"><button class="btn ghost">Добавить объект</button></div></form><p class="bx-err" id="bxPortErr"></p></div>
      <form class="bx-card" id="fProf"><h2>Анкета</h2><div class="bx-grid">
        <label class="bx-f">Название бригады<input name="name" value="${esc(m.name)}" maxlength="80"></label><label class="bx-f">Бригадир<input name="contactName" value="${esc(m.contactName)}"></label>
        <label class="bx-f">Телефон<input name="phone" value="${esc(m.phone)}"></label><label class="bx-f">E-mail<input value="${esc(m.email)}" disabled></label>
        <label class="bx-f">Форма и ИНН<input value="${esc(D.legal[m.legal] + ', ' + m.inn)}" disabled></label><label class="bx-f">ИП/ООО<input name="company" value="${esc(m.company)}"></label>
        <div class="bx-f w2">Специализации${chips('specs', D.specs, m.specs)}</div><div class="bx-f w2">Районы${chips('districts', D.districts, m.districts)}</div>
        <label class="bx-f">Человек в бригаде<input name="teamSize" type="number" value="${esc(m.teamSize)}"></label><label class="bx-f">Опыт, лет<input name="experience" type="number" value="${esc(m.experience)}"></label>
        <label class="bx-f">Гарантия, мес.<input name="warrantyMonths" type="number" value="${esc(m.warrantyMonths)}"></label><label class="bx-f">Ориентир, ₽/м²<input name="priceFrom" type="number" value="${esc(m.priceFrom || '')}"></label>
        <label class="bx-f w2">Рекомендатели<textarea name="referees">${esc(m.referees)}</textarea></label><label class="bx-f w2">О бригаде<textarea name="about">${esc(m.about)}</textarea></label></div>
        <label class="bx-cb"><input type="checkbox" name="publicName" value="1"${m.publicName ? ' checked' : ''}> Показывать имя бригадира в карточке каталога</label>
        <div class="bx-row"><label class="btn ghost sm">Логотип / фото бригады<input type="file" accept="image/jpeg,image/png,image/webp" id="bxLogo" hidden></label>${m.logo ? '<span class="bx-ph">' + img(m.logo) + '</span>' : ''}</div>
        <p class="bx-mut">Почта и ИНН меняются через администратора — их сверяли при допуске.</p><div class="bx-row"><button class="btn">Сохранить анкету</button></div><p class="bx-err"></p></form>`;
    const sb = body().querySelector('#bxSubmit');
    if (sb) sb.onclick = async () => { const r = await api('profile.php?a=submit', { method: 'POST' }); if (r.ok) { S.me = r.brigade; viewCabinet(); } else errBox(body().querySelector('#bxSubErr'), r); };
    body().querySelector('#fPort').onsubmit = async ev => { ev.preventDefault(); const r = await api('profile.php?a=portfolio_add', { json: form(ev.target) }); if (r.ok) tabProfile(); else errBox(body().querySelector('#bxPortErr'), r); };
    body().querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('Удалить объект и его фото?')) { await api('profile.php?a=portfolio_del', { json: { id: +b.dataset.del } }); tabProfile(); } });
    body().querySelectorAll('[data-up]').forEach(inp => inp.onchange = async () => {
      for (const file of inp.files) { const fd = new FormData(); fd.append('portfolio', inp.dataset.up); fd.append('kind', inp.dataset.kind); fd.append('file', file); const r = await api('profile.php?a=photo', { form: fd }); if (!r.ok) { alert(r.error); break; } }
      tabProfile();
    });
    body().querySelector('#bxLogo').onchange = async e => { const fd = new FormData(); fd.append('file', e.target.files[0]); const r = await api('profile.php?a=logo', { form: fd }); if (!r.ok) alert(r.error); tabProfile(); };
    const fp = body().querySelector('#fProf');
    fp.onsubmit = async ev => { ev.preventDefault(); const v = form(fp); const r = await api('profile.php?a=save', { json: { ...v, specs: many(fp, 'specs'), districts: many(fp, 'districts'), publicName: !!v.publicName } }); errBox(fp.querySelector('.bx-err'), r); if (r.ok) S.me = r.brigade; };
  }

  // ───────────── запросы и предложение
  async function tabFeed() {
    const j = await api('feed.php');
    if (!j.ok) { body().innerHTML = `<div class="bx-card"><h2>Запросы</h2><p>${esc(j.error)}</p></div>`; return; }
    body().innerHTML = `<div class="bx-card"><h2>Запросы клиентов</h2><ul class="bx-list">${j.requests.map(r => `<li><a href="#" data-r="${r.id}"><b>${esc(r.object)}</b></a> · ${esc(r.district)} ${st(r.open ? 'new' : r.status, r.declined ? 'отказались' : r.open ? 'принимаем предложения' : r.statusText)}
      <div class="bx-mut">${esc(r.works.join(', '))} · ответить до ${esc(dt(r.deadline))}${r.offerStatus ? ' · ваше предложение: ' + esc(rub(r.offerTotal)) + ' (' + esc({ submitted: 'подано', withdrawn: 'отозвано', chosen: 'выбрано клиентом', rejected: 'не выбрано' }[r.offerStatus]) + ')' : ''}</div></li>`).join('') || '<li class="bx-mut">Новых запросов нет — они появятся здесь и придут на почту.</li>'}</ul></div>`;
    body().querySelectorAll('[data-r]').forEach(a => a.onclick = e => { e.preventDefault(); viewRequest(+a.dataset.r); });
  }
  async function viewRequest(rid) {
    const j = await api('feed.php?r=' + rid);
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    const R = j.request, O = j.offer, items = O ? O.items : {};
    const groups = {};
    R.positions.forEach(p => (groups[p.spec] = groups[p.spec] || []).push(p));
    const ro = !R.open;
    const rows = Object.entries(groups).map(([spec, ps]) => `<tr class="grp"><td colspan="5">${esc(j.specs[spec] || spec)}</td></tr>` + ps.map(p => {
      const it = items[p.id] || {}; const skip = O ? !!it.skip : false;
      return `<tr data-p="${p.id}" data-q="${p.qty == null ? 1 : p.qty}"${skip ? ' class="skip"' : ''}><td>${esc(p.name)}</td><td>${esc(p.unit)}</td><td class="r">${p.qty == null ? 'объём' : esc(p.qty)}</td>
        <td><input type="number" min="0" step="1" inputmode="decimal" aria-label="Цена за единицу" value="${it.price != null ? esc(it.price) : ''}"${skip || ro ? ' disabled' : ''}></td>
        <td><label class="bx-cb" style="margin:0"><input type="checkbox" class="sk"${skip ? ' checked' : ''}${ro ? ' disabled' : ''}> не делаем</label></td></tr>`;
    }).join('')).join('');
    const stg = (O ? O.stages : R.defaultStages);
    body().innerHTML = `<p><a href="#" id="bxBack">← все запросы</a></p>
      <div class="bx-card"><h2>${esc(R.object)} · ${esc(R.district)}</h2><p>Работы: ${esc(R.works.join(', '))}. ${R.startWish ? 'Клиент хочет начать: ' + esc(R.startWish) + '. ' : ''}Ответить до <b>${esc(dt(R.deadline))}</b>.</p>
      <p class="bx-mut">Помещения: ${esc(R.rooms.map(r => r.name + (r.area ? ' ' + r.area + ' м²' : '')).join(', '))}</p>
      <p>Файлы проекта: ${R.files.map(f => `<a href="${API}brigade/file.php?f=${f.id}" target="_blank" rel="noopener">${esc(f.title || 'файл')}</a> <span class="bx-mut">(${f.mime.includes('pdf') ? 'PDF' : 'xlsx'}, ${Math.round(f.bytes / 1024)} КБ)</span>`).join(' · ') || '—'}</p>
      <p class="bx-note">Контакты и адрес клиента откроются, если клиент выберет ваше предложение. Цена — за единицу; «объём» — цена за весь объём позиции.</p></div>
      <form class="bx-card" id="fOffer"><h2>Ваше предложение ${O ? st(O.status, { submitted: 'подано', withdrawn: 'отозвано', chosen: 'выбрано', rejected: 'не выбрано' }[O.status]) : ''}</h2>
      <div class="bx-tbl-wrap"><table class="bx-tbl bx-offer"><thead><tr><th>Позиция сметы</th><th>Ед.</th><th class="r">Кол-во</th><th>Цена, ₽</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="bx-sum" id="bxTotal"></div>
      <div class="bx-grid"><label class="bx-f">Материалы<select name="materials"${ro ? ' disabled' : ''}>${opts(j.materials, O ? O.materials : '', 'Выберите')}</select></label>
      <label class="bx-f">Уточнение по материалам<input name="materialsNote" value="${esc(O ? O.materialsNote : '')}"${ro ? ' disabled' : ''}></label>
      <label class="bx-f">Можем начать с<input name="startDate" type="date" value="${esc(O ? O.startDate : '')}"${ro ? ' disabled' : ''}></label>
      <label class="bx-f">Гарантия, мес.<input name="warrantyMonths" type="number" min="1" max="120" value="${esc(O ? O.warrantyMonths : R.warrantyDefault || 24)}"${ro ? ' disabled' : ''}></label></div>
      <h3>График этапов</h3><div id="bxStages">${stg.map(s => stageRow(s, ro)).join('')}</div>${ro ? '' : '<button type="button" class="btn ghost sm" id="bxAddSt">+ этап</button>'}
      <label class="bx-f" style="margin-top:12px">Комментарий для клиента<textarea name="comment"${ro ? ' disabled' : ''}>${esc(O ? O.comment : '')}</textarea></label>
      ${ro ? '<p class="bx-mut">Срок ответа прошёл или клиент уже выбрал бригаду — предложение не меняется.</p>' : `<div class="bx-row"><button class="btn">${O ? 'Сохранить изменения' : 'Отправить предложение'}</button>${O && O.status === 'submitted' ? '<button type="button" class="btn ghost" id="bxWd">Отозвать</button>' : ''}${!O ? '<button type="button" class="btn ghost" id="bxDecl">Не возьмёмся</button>' : ''}</div>`}
      <p class="bx-err" role="status"></p></form>`;
    body().querySelector('#bxBack').onclick = e => { e.preventDefault(); tabFeed(); };
    const f = body().querySelector('#fOffer');
    const total = () => { let t = 0; f.querySelectorAll('tr[data-p]').forEach(tr => { const sk = tr.querySelector('.sk').checked; const v = parseFloat(tr.querySelector('input[type=number]').value); tr.classList.toggle('skip', sk); tr.querySelector('input[type=number]').disabled = sk || ro; if (!sk && v > 0) t += v * +tr.dataset.q; }); body().querySelector('#bxTotal').textContent = 'Итого: ' + rub(t); };
    f.addEventListener('input', total); total();
    const add = body().querySelector('#bxAddSt'); if (add) add.onclick = () => { body().querySelector('#bxStages').insertAdjacentHTML('beforeend', stageRow({ name: '', days: 5 }, false)); };
    f.addEventListener('click', e => { if (e.target.matches('[data-rm]')) e.target.closest('.bx-grid').remove(); });
    f.onsubmit = async ev => {
      ev.preventDefault();
      const items = {}; f.querySelectorAll('tr[data-p]').forEach(tr => { items[tr.dataset.p] = tr.querySelector('.sk').checked ? { skip: true } : { price: parseFloat(tr.querySelector('input[type=number]').value) }; });
      const stages = [...f.querySelectorAll('#bxStages .bx-grid')].map(g => ({ name: g.querySelector('[name=sn]').value, days: +g.querySelector('[name=sd]').value }));
      const v = form(f);
      const r = await api('offer.php?a=save', { json: { r: rid, items, stages, materials: v.materials, materialsNote: v.materialsNote, startDate: v.startDate, warrantyMonths: +v.warrantyMonths, comment: v.comment } });
      errBox(f.querySelector('.bx-err'), r.ok ? { ok: true, message: 'Предложение сохранено: ' + rub(r.total) } : r);
    };
    const wd = body().querySelector('#bxWd'); if (wd) wd.onclick = async () => { if (confirm('Отозвать предложение?')) { await api('offer.php?a=withdraw', { json: { r: rid } }); viewRequest(rid); } };
    const dc = body().querySelector('#bxDecl'); if (dc) dc.onclick = async () => { if (confirm('Отказаться от запроса?')) { await api('offer.php?a=decline', { json: { r: rid } }); tabFeed(); } };
  }
  const stageRow = (s, ro) => `<div class="bx-grid" style="grid-template-columns:1fr 110px auto;margin:0 0 6px"><input class="bx-in" name="sn" value="${esc(s.name)}" placeholder="Этап"${ro ? ' disabled' : ''}><input class="bx-in" name="sd" type="number" min="1" max="365" value="${esc(s.days)}" aria-label="Дней"${ro ? ' disabled' : ''}>${ro ? '<span></span>' : '<button type="button" class="btn ghost sm" data-rm>×</button>'}</div>`;

  // ───────────── объекты
  async function tabJobs() {
    const j = await api('jobs.php');
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    body().innerHTML = `<div class="bx-card"><h2>Объекты</h2><ul class="bx-list">${j.jobs.map(x => `<li><a href="#" data-j="${x.id}"><b>${esc(x.object)}</b></a> ${st(x.status, x.statusText)} <span class="bx-mut">${esc(rub(x.total))} · с ${esc(day(x.created))}</span></li>`).join('') || '<li class="bx-mut">Когда клиент выберет ваше предложение, объект появится здесь.</li>'}</ul></div>`;
    body().querySelectorAll('[data-j]').forEach(a => a.onclick = e => { e.preventDefault(); viewJob(+a.dataset.j); });
  }
  async function viewJob(jid) {
    const [j, sh] = await Promise.all([api('jobs.php?j=' + jid), api('sheets.php?j=' + jid)]);
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    const J = j.job, C = J.client;
    const stages = J.stages.map(s => `<div class="bx-stage"><h4>${s.idx}. ${esc(s.name)} ${st(s.status, s.statusText)}</h4><div class="bx-mut">План: ${esc(day(s.planStart))} — ${esc(day(s.planEnd))}${s.acceptedAt ? ' · принят ' + esc(dt(s.acceptedAt)) : ''}</div>
      <details><summary class="bx-mut">Чек-лист приёмки: ${esc(s.checklist.title)}</summary><ul class="bx-check">${s.checklist.items.map(i => `<li>• <span>${esc(i.text)} <span class="src">(${esc(i.src)})</span></span></li>`).join('')}</ul></details>
      <div class="bx-ph">${s.photos.map(img).join('')}</div>
      ${s.remarks.length ? '<ul class="bx-check">' + s.remarks.map(r => `<li>${r.closedAt ? '✓' : '•'} <span>${esc(r.text)}${r.closedAt ? ' <span class="src">— ' + esc(r.closeNote) + '</span>' : ` <input class="bx-in" style="max-width:260px;padding:4px 8px" placeholder="что сделано" data-rn="${r.id}"> <button type="button" class="btn ghost sm" data-rc="${r.id}">Закрыть</button>`}</span></li>`).join('') + '</ul>' : ''}
      ${J.status === 'work' && s.status === 'work' && !s.startedAt ? `<div class="bx-row"><button type="button" class="btn sm" data-start="${s.id}">Начать работу</button></div>` : ''}
      ${J.status === 'work' && s.status !== 'accepted' && s.status !== 'ready' ? `<div class="bx-row"><label class="btn ghost sm">+ фото этапа<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" data-sp="${s.id}" hidden multiple></label><button type="button" class="btn sm" data-ready="${s.id}">Этап готов к приёмке</button></div>` : ''}</div>`).join('');
    body().innerHTML = `<p><a href="#" id="bxBack">← объекты</a></p>
      <div class="bx-card"><h2>${esc(J.object)} ${st(J.status, J.statusText)}</h2>
      ${J.contactsOpen ? `<p><b>Клиент:</b> ${esc(C.name)} · <a href="tel:${esc(String(C.phone).replace(/[^\d+]/g, ''))}">${esc(C.phone)}</a> · <a href="mailto:${esc(C.email)}">${esc(C.email)}</a>${C.address ? '<br><b>Адрес:</b> ' + esc(C.address) : ''}</p>` : `<p class="bx-note">${esc(J.terms.contactsText)}</p>`}
      ${J.debt && J.debt.text ? `<p class="bx-err">${esc(J.debt.text)}</p>` : ''}
      <p>Смета: <b>${esc(rub(J.total))}</b>${J.commission != null ? ' · вознаграждение LINEA ' + esc(J.rateText || J.terms.rate) + ': ' + esc(rub(J.commission)) + (J.commissionDueAt ? ' — к оплате с ' + esc(day(J.commissionDueAt)) + ' (' + esc(J.commissionDueWhy) + ')' : ' — к оплате по самой ранней из дат (см. «Финансы»)') : ' · вознаграждение LINEA ' + esc(J.rateText || J.terms.rate) + ' начислится при подписании договора'}</p>
      ${J.status === 'work' ? (J.advanceState === 'declared' ? `<div class="bx-row"><span>Клиент отметил аванс ${esc(dt(J.advanceAt))}.</span> <button class="btn sm" type="button" id="bxAdvOk">Подтвердить получение</button> <button class="btn ghost sm" type="button" id="bxAdvNo">Не получали — оспорить</button></div>`
        : (!J.advanceAt ? '<div class="bx-row"><button class="btn ghost sm" type="button" id="bxAdvOk">Аванс получен</button></div>' : `<p class="bx-mut">Аванс: ${esc(dt(J.advanceAt))}${J.advanceState === 'disputed' ? ' — вы оспорили отметку клиента, LINEA разбирается' : ''}</p>`)) : ''}
      <p>Договор подряда: <a href="${API}remont-dogovor.php?j=${J.id}" target="_blank" rel="noopener">шаблон с приложениями (печать в PDF)</a> · условия подтвердили: клиент — ${esc(J.clientSigned ? dt(J.clientSigned) : 'нет')}, вы — ${esc(J.brigadeSigned ? dt(J.brigadeSigned) : 'нет')}</p>
      <p class="bx-note">${esc((J.docs || {}).transparency || '')}</p>
      <ul class="bx-list">${((J.docs || {}).contracts || []).filter(c => c.status !== 'void').map(c => `<li><b>${esc(c.title)}</b> ${st(c.status === 'signed' ? 'done' : 'review', c.status === 'signed' ? 'подписан' : 'ждёт подписи')}${c.kind === 'addendum' ? ` · ${c.delta >= 0 ? '+' : '−'}${esc(rub(Math.abs(c.delta)))}, итого ${esc(rub(c.total))}` : ''}
        <br><span class="bx-mut">клиент: ${esc(c.clientSigned ? dt(c.clientSigned) : 'не подписано')} · вы: ${esc(c.brigadeSigned ? dt(c.brigadeSigned) : 'не подписано')} · SHA-256 ${esc(c.hash.slice(0, 16))}…</span>
        ${c.waitAdmin ? '<br><span class="bx-mut">Цена заметно уменьшается — подписать можно после подтверждения LINEA.</span>' : ''}${c.status === 'draft' && !c.brigadeSigned && !c.waitAdmin ? `<br><button class="btn sm" type="button" data-sign="${c.id}">Подписать кодом</button>` : ''}${c.status === 'draft' && c.kind === 'addendum' ? ` <button class="btn ghost sm" type="button" data-adc="${c.id}">Отозвать</button>` : ''}</li>`).join('')}</ul>
      ${J.status === 'work' ? `<details><summary>Допработы или другой срок — допсоглашение</summary><form id="fAdd"><div class="bx-grid"><label class="bx-f">Работа<input name="an" maxlength="200" required></label><label class="bx-f">Ед.<input name="au" value="шт" maxlength="12"></label><label class="bx-f">Кол-во<input name="aq" type="number" step="0.01" value="1"></label><label class="bx-f">Цена за ед., ₽<input name="ap" type="number" step="1" min="0"></label><label class="bx-f"><span><input type="checkbox" name="arm"> исключить эту работу из договора</span></label><label class="bx-f">Срок, ± дней<input name="ad" type="number" value="0"></label><label class="bx-f">Пояснение<input name="anote" maxlength="500"></label></div><div class="bx-row"><button class="btn ghost sm">Предложить клиенту</button></div><p class="bx-err"></p></form></details>` : ''}
      <details><summary>Журнал сделки</summary><ul class="bx-list">${((J.docs || {}).log || []).map(l => `<li><span class="bx-mut">${esc(dt(l.at))}</span> · ${esc(l.who)}: ${esc(l.text)}</li>`).join('') || '<li class="bx-mut">Пока пусто.</li>'}</ul></details>
      ${J.canCancel ? '<p><button class="btn ghost sm" type="button" id="bxCancel">Отказаться от объекта</button></p>' : ''}</div>
      <div class="bx-card"><h2>Переписка с клиентом</h2>${(J.messages || []).map(m => `<p><b>${esc({ client: 'Клиент', brigade: 'Вы', admin: 'LINEA' }[m.who] || m.who)}</b> <span class="bx-mut">${esc(dt(m.at))}</span><br>${esc(m.text)}</p>`).join('') || '<p class="bx-mut">Сообщений пока нет.</p>'}
      ${J.contactsOpen ? '' : '<p class="bx-mut">До подтверждения договора телефоны, почта, ссылки и ники в сообщениях скрываются автоматически.</p>'}
      <form id="fMsg"><label class="bx-f">Сообщение<textarea name="text" maxlength="2000" rows="2"></textarea></label><div class="bx-row"><button class="btn ghost sm">Отправить</button></div><p class="bx-err"></p></form></div>
      <div class="bx-card"><h2>Этапы</h2>${stages}</div>
      <div class="bx-card" id="bxSheets"><h2>Листы по запросу</h2>${sheetsBlock(J, sh)}</div>
      <div class="bx-card"><h2>Разногласия</h2><p class="bx-mut">Сначала напишите второй стороне в ленте сделки. Не договорились — попросите LINEA рассмотреть разногласие: мы сверим работы с проектом, фото и перепиской и дадим рекомендацию. Она необязательна, право обратиться в суд сохраняется.</p>${(J.disputes || []).map(d => `<div class="bx-stage"><h4>${esc(d.subject)} ${st(d.status === 'open' ? 'review' : 'done', d.status === 'open' ? 'на рассмотрении' : 'рассмотрено')}</h4>${d.messages.map(m => `<p><b>${esc({ client: 'Клиент', brigade: 'Бригада', admin: 'LINEA' }[m.who])}</b> <span class="bx-mut">${esc(dt(m.at))}</span><br>${esc(m.text)}</p>`).join('')}${d.resolution ? '<p><b>Рекомендация LINEA:</b> ' + esc(d.resolution) + '</p>' : ''}</div>`).join('') || '<p class="bx-mut">Разногласий нет.</p>'}
      <details><summary>Попросить LINEA рассмотреть разногласие</summary><form id="fDisp"><label class="bx-f">Тема<input name="subject" required maxlength="120"></label><label class="bx-f">Суть<textarea name="text" required></textarea></label><div class="bx-row"><button class="btn ghost">Отправить в LINEA</button></div><p class="bx-err"></p></form></details></div>`;
    const B = body();
    B.querySelector('#bxBack').onclick = e => { e.preventDefault(); tabJobs(); };
    B.querySelectorAll('[data-sign]').forEach(b => b.onclick = async () => {
      const pep = (J.docs || {}).pep || {};
      if (!confirm('Подписать документ простой электронной подписью? Когда договор подпишет и клиент, откроются контакты сторон; вознаграждение LINEA ' + (J.rateText || J.terms.rate) + ' станет к оплате, когда вы получите первые деньги.\n\n' + (pep.text || '') + '\n(редакция ' + (pep.ed || '') + ')')) return;
      const r = await api('jobs.php?a=sign', { json: { j: jid, doc: +b.dataset.sign } }); if (!r.ok) { alert(r.error); return; }
      const code = prompt('Код подписи отправлен на почту бригады. Введите 6 цифр:' + (r.devCode ? ' (проверка: ' + r.devCode + ')' : '')); if (code === null) return;
      const r2 = await api('jobs.php?a=sign', { json: { j: jid, doc: r.doc, code, pep: true } }); if (!r2.ok) alert(r2.error); viewJob(jid);
    });
    B.querySelectorAll('[data-adc]').forEach(b => b.onclick = async () => { if (!confirm('Отозвать неподписанное допсоглашение?')) return; const r = await api('jobs.php?a=addendum_cancel', { json: { j: jid, doc: +b.dataset.adc } }); if (!r.ok) alert(r.error); viewJob(jid); });
    const fa = B.querySelector('#fAdd'); if (fa) fa.onsubmit = async ev => { ev.preventDefault(); const r = await api('jobs.php?a=addendum', { json: { j: jid, items: [{ name: fa.an.value, unit: fa.au.value, qty: +fa.aq.value, price: +fa.ap.value, remove: fa.arm.checked }], daysAdd: +fa.ad.value || 0, note: fa.anote.value } }); errBox(fa.querySelector('.bx-err'), r); if (r.ok) viewJob(jid); };
    const bc = B.querySelector('#bxCancel'); if (bc) bc.onclick = async () => { const why = prompt('Почему отказываетесь от объекта? (необязательно)'); if (why === null) return; const r = await api('jobs.php?a=cancel', { json: { j: jid, reason: why } }); if (!r.ok) alert(r.error); tabJobs(); };
    B.querySelector('#fMsg').onsubmit = async ev => { ev.preventDefault(); const r = await api('jobs.php?a=msg', { json: { j: jid, text: ev.target.text.value } }); errBox(ev.target.querySelector('.bx-err'), r); if (r.ok) viewJob(jid); };
    B.querySelectorAll('[data-sp]').forEach(inp => inp.onchange = async () => { for (const f of inp.files) { const fd = new FormData(); fd.append('stage', inp.dataset.sp); fd.append('file', f); const r = await api('jobs.php?a=stage_photo', { form: fd }); if (!r.ok) { alert(r.error); break; } } viewJob(jid); });
    B.querySelectorAll('[data-start]').forEach(b => b.onclick = async () => { if (!confirm('Отметить начало работ по этапу? Дата старта видна клиенту в журнале сделки.')) return; const r = await api('jobs.php?a=stage_start', { json: { stage: +b.dataset.start } }); if (!r.ok) alert(r.error); viewJob(jid); });
    const ao = B.querySelector('#bxAdvOk'); if (ao) ao.onclick = async () => { if (!confirm('Подтверждаете получение аванса? С этой даты вознаграждение LINEA становится к оплате.')) return; const r = await api('jobs.php?a=advance', { json: { j: jid } }); if (!r.ok) alert(r.error); viewJob(jid); };
    const an = B.querySelector('#bxAdvNo'); if (an) an.onclick = async () => { const why = prompt('Что не так с авансом? (LINEA увидит и свяжется со сторонами)'); if (!why) return; const r = await api('jobs.php?a=advance_dispute', { json: { j: jid, reason: why } }); if (!r.ok) alert(r.error); viewJob(jid); };
    B.querySelectorAll('[data-ready]').forEach(b => b.onclick = async () => { const r = await api('jobs.php?a=stage_ready', { json: { stage: +b.dataset.ready } }); if (!r.ok) alert(r.error); viewJob(jid); });
    B.querySelectorAll('[data-rc]').forEach(b => b.onclick = async () => { const note = B.querySelector(`[data-rn="${b.dataset.rc}"]`).value; const r = await api('jobs.php?a=remark_close', { json: { remark: +b.dataset.rc, note } }); if (!r.ok) alert(r.error); viewJob(jid); });
    B.querySelector('#fDisp').onsubmit = async ev => { ev.preventDefault(); const r = await api('jobs.php?a=dispute', { json: { j: jid, ...form(ev.target) } }); errBox(ev.target.querySelector('.bx-err'), r); if (r.ok) viewJob(jid); };
    bindSheets(J, jid);
  }

  // «Нужен лист»: текст или надиктовка (Web Speech API там, где есть; иначе запись голоса и загрузка)
  function sheetsBlock(J, sh) {
    const list = (sh.sheets || []).map(s => `<li>${st(s.status, s.statusText)} ${esc(s.text)} <span class="bx-mut">${esc(s.room)}${s.wall ? ', стена ' + esc(s.wall) : ''} · ${esc(dt(s.created))}</span>
      ${s.result ? `<br><a href="${API}brigade/file.php?f=${s.result}" target="_blank" rel="noopener">Лист PDF</a>${s.note ? ' <span class="bx-mut">' + esc(s.note) + '</span>' : ''}${s.license ? '<br><span class="bx-mut"><b>Условия использования листа.</b> ' + esc(s.license) + '</span>' : ''}` : ''}
      ${s.status === 'question' ? `<br><b>Вопрос:</b> ${esc(s.question)} <input class="bx-in" style="max-width:320px;padding:4px 8px" data-an="${s.id}" placeholder="ответ"> <button type="button" class="btn ghost sm" data-ab="${s.id}">Ответить</button>` : ''}</li>`).join('');
    const can = sh.inDeal != null ? sh.inDeal : J.status === 'work';
    const speech = !!(window.SpeechRecognition || window.webkitSpeechRecognition), rec = !!(window.MediaRecorder && navigator.mediaDevices);
    return `<p class="bx-mut">Не хватает узла, развёртки или размера — опишите, что нужно. Лист выпускает движок проекта; статус: принят → в работе → готов (или уточняющий вопрос).</p>
      <p class="bx-note">${esc((sh.terms || {}).sheetsText || '')}</p>
      ${can ? `<form id="fSheet"><div class="bx-grid"><label class="bx-f">Помещение (необязательно)<select name="room"><option value="">—</option>${(sh.rooms || []).map(r => `<option>${esc(r)}</option>`).join('')}</select></label>
      <label class="bx-f">Стена (необязательно)<select name="wall"><option value="">—</option><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
      <label class="bx-f w2">Какой лист нужен<textarea name="text" maxlength="900" placeholder="Например: развёртка стены B кухни с выводами под технику и высотами розеток"></textarea></label></div>
      <p class="bx-mut">${speech ? '🎙 «Надиктовать» сразу превращает речь в текст — проверьте его перед отправкой. ' : 'Этот браузер не умеет диктовку в текст — напишите запрос (на телефоне помогает микрофон клавиатуры). '}Запись голоса прикладывается только вместе с текстом: сервер листов записи пока не расшифровывает.</p>
      <div class="bx-row">${speech ? '<button type="button" class="btn ghost sm bx-mic" id="bxDict">🎙 Надиктовать</button>' : ''}${rec ? '<button type="button" class="btn ghost sm bx-mic" id="bxRec">● Приложить запись</button><span class="bx-mut" id="bxRecSt"></span>' : ''}<button class="btn sm">Нужен лист</button></div><p class="bx-err"></p></form>` : ''}
      <ul class="bx-list" style="margin-top:12px">${list || '<li class="bx-mut">Запросов листов пока не было.</li>'}</ul>`;
  }
  function bindSheets(J, jid) {
    const f = body().querySelector('#fSheet');
    body().querySelectorAll('[data-ab]').forEach(b => b.onclick = async () => { const r = await api('sheets.php?a=answer', { json: { s: +b.dataset.ab, answer: body().querySelector(`[data-an="${b.dataset.ab}"]`).value } }); if (!r.ok) alert(r.error); viewJob(jid); });
    if (!f) return;
    let audio = null;
    const d = f.querySelector('#bxDict');
    if (d) d.onclick = () => {
      const R = new (window.SpeechRecognition || window.webkitSpeechRecognition)(); R.lang = 'ru-RU'; R.interimResults = false; R.continuous = false;
      d.classList.add('rec'); d.textContent = '🎙 Говорите…';
      R.onresult = e => { const t = [...e.results].map(x => x[0].transcript).join(' '); const ta = f.querySelector('[name=text]'); ta.value = (ta.value ? ta.value + ' ' : '') + t; };
      R.onend = () => { d.classList.remove('rec'); d.textContent = '🎙 Надиктовать'; };
      R.onerror = () => { d.classList.remove('rec'); d.textContent = '🎙 Не получилось — напишите текстом'; };
      R.start();
    };
    const rb = f.querySelector('#bxRec');
    if (rb) {
      let mr = null, chunks = [];
      rb.onclick = async () => {
        if (mr && mr.state === 'recording') { mr.stop(); return; }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mr = new MediaRecorder(stream); chunks = [];
          mr.ondataavailable = e => chunks.push(e.data);
          mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); audio = new Blob(chunks, { type: mr.mimeType || 'audio/webm' }); rb.classList.remove('rec'); rb.textContent = '● Перезаписать запись'; f.querySelector('#bxRecSt').textContent = 'запись ' + Math.round(audio.size / 1024) + ' КБ готова'; };
          mr.start(); rb.classList.add('rec'); rb.textContent = '■ Остановить';
          setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, 120000);
        } catch { f.querySelector('#bxRecSt').textContent = 'микрофон недоступен — напишите текстом'; }
      };
    }
    f.onsubmit = async ev => {
      ev.preventDefault();
      if (!f.querySelector('[name=text]').value.trim()) { const e = f.querySelector('.bx-err'); e.className = 'bx-err'; e.textContent = audio ? 'Запись без текста сервер пока не расшифровывает — нажмите «Надиктовать» или напишите, какой лист нужен' : 'Напишите или надиктуйте, какой лист нужен'; return; }
      const fd = new FormData(f); fd.append('j', jid); fd.append('lang', 'ru');
      if (audio) fd.append('audio', audio, 'zapis.' + (/mp4/.test(audio.type) ? 'm4a' : /ogg/.test(audio.type) ? 'ogg' : 'webm'));
      const r = await api('sheets.php?a=create', { form: fd });
      if (r.ok) viewJob(jid); else errBox(f.querySelector('.bx-err'), r);
    };
  }

  // ───────────── финансы
  async function tabMoney() {
    const j = await api('finance.php');
    if (!j.ok) { body().innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; return; }
    body().innerHTML = `<div class="bx-card"><h2>Финансы</h2><p>Вознаграждение LINEA — ${esc(j.rate)} от сметы по выбранному предложению; начисляется в момент, когда открываются контакты сторон. ${esc(j.terms.contactsText)} ${j.terms.pilot ? esc(j.terms.pilot) + ' ' : ''}Оплата ремонта — напрямую между вами и клиентом.</p>
      ${j.debtLadder && j.debtLadder.text ? `<p class="bx-err">${esc(j.debtLadder.text)}</p>` : ''}<p>${esc(j.terms.dueText)}</p><p>Начислено <b>${esc(rub(j.accrued))}</b> · стало к оплате <b>${esc(rub(j.due))}</b> · оплачено <b>${esc(rub(j.paid))}</b> · долг <b>${esc(rub(j.debt))}</b></p>
      ${j.requisites ? '<p class="bx-mut">Реквизиты для оплаты: ' + esc(j.requisites) + '</p>' : '<p class="bx-mut">Реквизиты для оплаты счетов будут в счёте.</p>'}
      <div class="bx-tbl-wrap"><table class="bx-tbl"><thead><tr><th>Объект</th><th>Статус</th><th class="r">Смета</th><th class="r">Комиссия</th><th>Счёт</th></tr></thead><tbody>${j.jobs.map(x => `<tr><td>${esc(x.object)}</td><td>${esc(x.status)}</td><td class="r">${esc(rub(x.total))}</td><td class="r">${x.commission != null ? esc(rub(x.commission)) + (x.rate ? ' (' + esc(x.rate) + ')' : '') + (x.dueAt ? '<br><span class="bx-mut">к оплате с ' + esc(day(x.dueAt)) + (x.dueWhy ? ': ' + esc(x.dueWhy) : '') + '</span>' : '<br><span class="bx-mut">к оплате — по самой ранней из дат</span>') : '—'}</td><td>${x.invoice ? esc(x.invoice.number) + ' — ' + (x.invoice.paid ? '<span class="best">оплачен ' + esc(day(x.invoice.paid)) + '</span>' : 'к оплате до ' + esc(day(x.invoice.due))) : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="bx-mut">Начислений нет.</td></tr>'}</tbody></table></div></div>
      <div class="bx-card"><h2>Рейтинг и отзывы</h2><p>${j.rating.n ? `Рейтинг <b>${j.rating.avg}</b> по ${j.rating.n} отзывам` : 'Отзывов пока нет: их оставляют клиенты после приёмки объекта.'}</p><ul class="bx-list">${j.reviews.map(r => `<li>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} <span class="bx-mut">${esc(r.object)} · ${esc(day(r.at))}</span><br>${esc(r.text)}</li>`).join('')}</ul></div>`;
  }

  boot();
})();
