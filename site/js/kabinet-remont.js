// LINEA · «Ремонт по проекту» во вкладке кабинета клиента (js/kabinet.js → window.lineaRemont(box, токен, api)), вместо прежнего remont.js:
// подбор бригады, сравнение предложений карточками (на телефоне — листаются пальцем; подробная таблица по строкам — по кнопке),
// договор и допсоглашения (ПЭП кодом), реестр оплат с подтверждением второй стороной, этапы с фото «до» и пошаговой приёмкой
// по пунктам чек-листа (один пункт — один экран), лента сделки, отзыв, разногласия. API — api/remont.php (доступ по токену заказа).
// Значимые действия требуют свежего входа кодом: {needCode} → window.lineaNeedCode() (окно кода кабинета) → повтор.
(function () {
  'use strict';
  window.lineaRemont = start;

  function start(box, t, API) {
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const rub = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
    const day = s => { if (!s) return '—'; const d = new Date(String(s).slice(0, 10) + 'T00:00'); return isNaN(d) ? s : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); };
    const dt = s => { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); };
    const st = (k, txt) => `<span class="bx-st ${esc(k)}">${esc(txt)}</span>`;
    const ph = id => `<a href="${API}brigade/file.php?f=${id}&t=${t}" target="_blank" rel="noopener"><img src="${API}brigade/file.php?f=${id}&t=${t}" alt="Фото" loading="lazy"></a>`;
    const SPEC = { demontazh: 'Демонтаж', chernovye: 'Черновые работы', elektrika: 'Электрика', santehnika: 'Сантехника', plitka: 'Плитка', malyarka: 'Малярные работы', poly: 'Полы', potolki: 'Потолки и ГКЛ', mebel: 'Мебель и двери' };
    let S = {}, showAll = false, table = false, sec = 'etapy';

    async function call(a, json, again) {
      let r, j;
      try { r = await fetch(API + 'remont.php?t=' + t + (a ? '&a=' + a : ''), a ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF': S.csrf || '' }, body: JSON.stringify(json || {}) } : { cache: 'no-store', credentials: 'same-origin' }); j = await r.json(); }
      catch { j = { ok: false, error: 'Нет связи с сервером — проверьте интернет' }; }
      if (j.needCode && !again && typeof window.lineaNeedCode === 'function' && await window.lineaNeedCode()) return call(a, json, true);
      return j;
    }
    async function load() { const j = await call(); if (j.ok) { S = j; render(); } else box.innerHTML = `<p class="bx-err">${esc(j.error)}</p>`; }
    const act = async (a, json, errEl) => { const j = await call(a, json); if (j.ok) { S = j; render(); } else if (errEl) { errEl.textContent = j.error; } else if (!j.needCode) alert(j.error); return j; };

    function render() {
      box.hidden = false;
      const R = S.request, J = S.job;
      let h = '<div class="kab-kick">Ремонт по проекту · необязательно</div>';
      if (J) h += jobView(J);
      else if (!R || R.status === 'cancelled') {
        if (!S.eligible) { box.innerHTML = h + '<h2>Ремонт по проекту</h2><p>' + (S.chooseAfter === 'final' ? 'Подбор бригады откроется, когда будет готов финальный альбом.' : 'Подбор откроется, когда проект оплачен и готов первый вариант альбома.') + '</p>'; return; }
        h += `<h2>Подобрать бригаду</h2><p>Бригады вашего района, прошедшие проверку документов, посчитают ремонт по позициям вашей сметы — вы сравните предложения и выберете. Без обязательств.</p>
          <form id="rmReq"><div class="bx-grid"><label class="bx-f">Район объекта<select name="district" required><option value="">Выберите</option>${Object.entries(S.districts).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
          <label class="bx-f">Когда хотите начать<input name="startWish" maxlength="60" placeholder="например, с 15 ноября"></label></div>
          <label class="bx-cb"><input type="checkbox" name="consent" required> Согласен передать бригадам площадки проект <b>без</b> моего имени, адреса и телефона: район, площадь, смету по позициям и листы проекта</label>
          <div class="bx-row"><button class="btn">Подобрать бригаду</button></div><p class="bx-err" role="status"></p></form>`;
      } else {
        h += `<h2>Подбор бригады ${st(R.status === 'sent' ? 'work' : 'new', R.statusText)}</h2><p>${esc(R.district)} · работы: ${esc(R.works.join(', ') || 'уточняем по смете')}${R.deadline ? ' · предложения до ' + esc(dt(R.deadline)) : ''}${R.invitedCount ? ' · разослано бригадам: ' + R.invitedCount : ''}</p>
          ${R.invited.length ? '<p class="bx-mut">Вы пригласили: ' + R.invited.map(i => `<a href="../brigady/${esc(i.slug)}/" target="_blank" rel="noopener">${esc(i.name)}</a>`).join(', ') + '</p>' : ''}
          ${R.status !== 'chosen' ? `<div class="bx-row"><a class="btn ghost sm" href="../brigady/" id="rmCat">Пригласить бригаду из каталога</a><button type="button" class="btn ghost sm" id="rmCancel">Отказаться от подбора</button></div>` : ''}
          ${S.offers.length ? compare() : '<p class="bx-note">Предложений пока нет. Обычно бригады отвечают до срока; пришлём письмо, когда будет что сравнить.</p>'}`;
      }
      box.innerHTML = h;
      bind();
    }

    // сравнение карточками: итог, срок, гарантия, материалы, аванс, рейтинг, проверка, этапы, разделы; лучшая цена — отмечена
    function compare() {
      const all = S.offers.filter(o => o.status !== 'rejected');
      const max = (S.brigTerms && S.brigTerms.offersShowMax) || 5;
      const O = showAll ? all : all.slice(0, max);
      const minTotal = Math.min(...O.map(o => o.total));
      const canChoose = S.request.status === 'sent';
      const P = S.request.positions;
      const bySec = o => { const m = {}; P.forEach(p => { const it = o.items[p.id]; if (it && !it.skip) m[p.spec] = (m[p.spec] || 0) + it.sum / 100; }); Object.entries(o.sections || {}).forEach(([k, v]) => { m[k] = v; }); return m; };
      const cards = O.map(o => {
        const b = o.brigade, s = bySec(o);
        return `<article class="rm-card${o.total === minTotal ? ' best' : ''}"><header><a href="../brigady/${esc(b.slug)}/" target="_blank" rel="noopener"><b>${esc(b.name)}</b></a>${o.total === minTotal && O.length > 1 ? ' <span class="bx-st done">лучшая цена</span>' : ''}</header>
          <p class="rm-total">${rub(o.total)}</p>
          <ul class="rm-facts"><li>Срок: ${o.days} дн., старт с ${esc(day(o.startDate))}</li><li>Гарантия: ${o.warrantyMonths} мес.</li><li>Материалы: ${esc(o.materials)}${o.materialsNote ? ' — ' + esc(o.materialsNote) : ''}</li>
          ${o.advancePct ? `<li>Аванс: ${o.advancePct} % — ${rub(o.total * o.advancePct / 100)}</li>` : '<li>Без аванса: оплата после приёмки этапов</li>'}
          <li>Рейтинг: ${b.rating.n ? `★ ${b.rating.avg} (${b.rating.n})` : 'отзывов пока нет'} · объектов через LINEA: ${b.jobsDone}</li>
          <li>Проверка: ${esc(b.legal)}${b.innChecked ? ', ИНН ✓' : ''}${b.callPassed ? ', видеозвонок ✓' : ''}</li></ul>
          <details><summary>По разделам${o.mode === 'sections' ? ' (цена за раздел целиком)' : ''}</summary><ul class="rm-facts">${Object.entries(s).map(([k, v]) => `<li>${esc(SPEC[k] || k)} — ${rub(v)}</li>`).join('')}</ul></details>
          <details><summary>Этапы (${o.stages.length})</summary><ol>${o.stages.map(x => `<li>${esc(x.name)} — ${x.days} дн.</li>`).join('')}</ol></details>
          ${o.comment ? `<p class="bx-mut">«${esc(o.comment)}»</p>` : ''}
          ${canChoose ? `<button class="btn${o.total === minTotal ? '' : ' ghost'}" type="button" data-choose="${o.id}">Выбрать эту бригаду</button>` : (o.status === 'chosen' ? st('done', 'выбрана') : '')}</article>`;
      }).join('');
      return `<h3>Предложения (${all.length})</h3><p class="bx-mut">Листайте карточки${O.length > 1 ? ' пальцем' : ''}. Контакты бригад откроются после подписания договора на сайте.</p>
        <div class="rm-cards">${cards}</div>
        <div class="bx-row">${all.length > O.length ? `<button class="btn ghost sm" type="button" id="rmMore">Ещё ${all.length - O.length}</button>` : ''}<button class="btn ghost sm" type="button" id="rmTbl">${table ? 'Скрыть' : 'Сравнить'} по строкам сметы</button></div>
        ${table ? lineTable(O) : ''}
        ${canChoose ? `<label class="bx-cb"><input type="checkbox" id="rmCC"> Согласен передать выбранной бригаде моё имя, телефон, e-mail и адрес объекта — для договора подряда и ремонта. Откроются после подписания договора обеими сторонами.</label><p class="bx-err" id="rmChErr" role="status"></p>` : ''}`;
    }
    function lineTable(O) {
      let rows = `<tr><th>Позиция</th>${O.map(o => `<th>${esc(o.brigade.name)}</th>`).join('')}</tr>`, cur = '';
      for (const p of S.request.positions) {
        if (p.spec !== cur) { cur = p.spec; rows += `<tr class="grp"><td colspan="${O.length + 1}">${esc(SPEC[cur] || cur)}</td></tr>`; }
        const vals = O.map(o => o.mode === 'sections' ? undefined : o.items[p.id] && !o.items[p.id].skip ? o.items[p.id].sum / 100 : null);
        const nums = vals.filter(v => v != null); const min = Math.min(...nums);
        rows += `<tr><td>${esc(p.name)} <span class="bx-mut">${p.qty != null ? esc(p.qty) + ' ' + esc(p.unit) : ''}</span></td>${vals.map(v => `<td class="r${v === min && nums.length > 1 ? ' best' : ''}">${v === undefined ? '<span class="bx-mut">в разделе</span>' : v == null ? '<span class="bx-mut">не делают</span>' : rub(v)}</td>`).join('')}</tr>`;
      }
      return `<div class="bx-tbl-wrap"><table class="bx-tbl">${rows}</table></div>`;
    }

    const SECS = [['etapy', 'Этапы'], ['oplaty', 'Оплаты'], ['dogovor', 'Договор'], ['lenta', 'Лента'], ['spor', 'Разногласия']];
    function jobView(J) {
      const B = J.brigade;
      let h = `<h2>Ремонт: ${esc(B.name)} ${st(J.status, J.statusText)}</h2>
        ${J.frozen ? `<p class="bx-err">Сделка приостановлена LINEA: ${esc(J.frozen)}. Лента и разногласия работают.</p>` : ''}
        <p><b>Бригада:</b> <a href="../brigady/${esc(B.slug)}/" target="_blank" rel="noopener">${esc(B.name)}</a>${J.contactsOpen ? ` · ${esc(B.contact)} · <a href="tel:${esc(String(B.phone).replace(/[^\d+]/g, ''))}">${esc(B.phone)}</a> · <a href="mailto:${esc(B.email)}">${esc(B.email)}</a>` : ''}<br><span class="bx-mut">${esc(B.legalFull || '')}</span></p>
        ${J.contactsOpen ? '' : `<p class="bx-note">${esc(J.contactsText)}</p>`}
        <nav class="kab-tabs">${SECS.map(([k, n]) => `<a href="#" data-sec="${k}"${k === sec ? ' class="on"' : ''}>${n}${k === 'etapy' && J.stages.some(s => s.status === 'ready') ? ' <b>!</b>' : ''}${k === 'oplaty' && (J.payments || []).some(p => p.status === 'declared' && p.declaredBy === 'brigade') ? ' <b>!</b>' : ''}</a>`).join('')}</nav>`;
      if (sec === 'etapy') h += J.stages.map(s => stageView(J, s)).join('') || '<p class="bx-mut">Этапы появятся после подписания договора.</p>';
      if (sec === 'oplaty') h += payView(J);
      if (sec === 'dogovor') h += docsBlock(J);
      if (sec === 'lenta') h += `${(J.messages || []).map(m => `<p class="bx-msg ${esc(m.who)}${m.who === 'system' ? ' bx-mut' : ''}"><b>${esc({ client: 'Вы', brigade: 'Бригада', admin: 'LINEA', system: 'Система' }[m.who] || m.who)}</b> <span class="bx-mut">${esc(dt(m.at))}</span><br>${esc(m.text)}</p>`).join('') || '<p class="bx-mut">Сообщений пока нет.</p>'}
        <form id="rmMsg"><label class="bx-f">Сообщение бригаде<textarea name="text" maxlength="2000" rows="2"></textarea></label><div class="bx-row"><button class="btn ghost sm">Отправить</button></div><p class="bx-err" role="status"></p></form>`;
      if (sec === 'spor') h += `${J.canReview ? `<h3>Отзыв о бригаде</h3><form id="rmRev"><div class="bx-chips">${[5, 4, 3, 2, 1].map(n => `<label><input type="radio" name="rating" value="${n}" required> ${'★'.repeat(n)}</label>`).join('')}</div><label class="bx-f">Отзыв<textarea name="text" maxlength="3000"></textarea></label><div class="bx-row"><button class="btn sm">Оставить отзыв</button></div><p class="bx-err"></p></form>` : ''}
        ${J.review ? `<p>Ваш отзыв: ${'★'.repeat(J.review.rating)} ${esc(J.review.text)}${J.review.hidden ? ' <span class="bx-mut">(скрыт модерацией по правилам площадки)</span>' : ''}</p>` : ''}
        <h3>Разногласия</h3><p class="bx-mut">Сначала напишите бригаде в ленте. Не договорились — попросите LINEA рассмотреть разногласие: мы сверим работы с проектом, фото и перепиской и дадим рекомендацию. Она необязательна: право на суд сохраняется.</p>
        ${(J.disputes || []).map(d => `<div class="bx-stage"><h4>${esc(d.subject)} ${st(d.status === 'open' ? 'review' : 'done', d.status === 'open' ? 'рассматривается' : 'закрыто')}</h4>${d.messages.map(m => `<p><b>${esc({ client: 'Вы', brigade: 'Бригада', admin: 'LINEA' }[m.who] || m.who)}</b> <span class="bx-mut">${esc(dt(m.at))}</span><br>${esc(m.text)}</p>`).join('')}${d.resolution ? '<p><b>Рекомендация LINEA:</b> ' + esc(d.resolution) + '</p>' : ''}
          ${d.status === 'open' ? `<form data-dm="${d.id}"><label class="bx-f">Ответ<textarea name="text" rows="2"></textarea></label><div class="bx-row"><button class="btn ghost sm">Отправить</button></div></form>` : ''}</div>`).join('')}
        <details><summary>Попросить LINEA рассмотреть разногласие</summary><form id="rmDisp"><label class="bx-f">Тема<input name="subject" required maxlength="120"></label><label class="bx-f">Суть<textarea name="text" required></textarea></label><div class="bx-row"><button class="btn ghost">Отправить в LINEA</button></div><p class="bx-err"></p></form></details>`;
      return h;
    }
    function stageView(J, s) {
      const before = (J.beforePhotos || []).filter(f => f.stage === s.id).map(f => f.id);
      return `<div class="bx-stage"><h4>${s.idx}. ${esc(s.name)} ${st(s.status, s.statusText)}</h4><div class="bx-mut">План: ${esc(day(s.planStart))} — ${esc(day(s.planEnd))}${s.startedAt ? ' · начат ' + esc(dt(s.startedAt)) : ''}${s.acceptedAt ? ' · принят ' + esc(dt(s.acceptedAt)) : ''}</div>
        ${before.length ? `<div class="bx-mut">Фото «до» начала работ:</div><div class="bx-ph">${before.map(ph).join('')}</div>` : ''}
        ${s.photos.length ? `<div class="bx-mut">Фото этапа:</div><div class="bx-ph">${s.photos.map(ph).join('')}</div>` : ''}
        ${s.remarks.length ? '<ul class="bx-check">' + s.remarks.map(r => `<li>${r.closedAt ? '✓' : '•'} <span>${esc(r.text)}${r.closedAt ? ' <span class="src">— бригада: ' + esc(r.closeNote) + '</span>' : ''}</span></li>`).join('') + '</ul>' : ''}
        ${s.status === 'ready' && !J.frozen ? `<div class="bx-row"><button class="btn" type="button" data-wiz="${s.id}">Принять этап по шагам</button></div><p class="bx-mut">${s.checklist.items.length} пунктов чек-листа «${esc(s.checklist.title)}» — по одному на экране, с фото бригады к пункту.</p>` : ''}</div>`;
    }
    // пошаговая приёмка: каждый пункт — «выполнено» или «нет» с замечанием; в конце — «принять» (все да) или «вернуть» (замечания)
    function wizard(s) {
      const items = s.checklist.items, ans = items.map(() => null), notes = items.map(() => '');
      const byItem = k => (S.job.stageItems || []).filter(f => f.stage === s.id && f.item === k).map(f => f.id);
      let k = 0;
      const m = document.createElement('div'); m.className = 'kab-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      const draw = () => {
        const last = k >= items.length, no = ans.map((a, i) => a === false ? i : -1).filter(i => i >= 0);
        m.innerHTML = `<div class="kab-modal-in brg-wiz"><div class="kab-kick">Приёмка «${esc(s.name)}» · ${last ? 'итог' : 'пункт ' + (k + 1) + ' из ' + items.length}</div>
          ${last ? (no.length ? `<h2>Вернуть этап с замечаниями (${no.length})?</h2><ul>${no.map(i => `<li>${esc(items[i].text)}${notes[i] ? ': ' + esc(notes[i]) : ''}</li>`).join('')}</ul>` : '<h2>Все пункты выполнены — принять этап?</h2><p class="bx-mut">Приёмка подписывается вашим входом по коду и видна бригаде и LINEA.</p>')
            : `<h2>${esc(items[k].text)}</h2><p class="bx-mut">${esc(items[k].src)}</p>${byItem(k).length ? '<div class="bx-ph">' + byItem(k).map(ph).join('') + '</div>' : '<p class="bx-mut">Фото к пункту бригада не приложила — проверьте на месте.</p>'}
              <div class="bx-row"><button class="btn" id="wzY"${ans[k] === true ? ' aria-pressed="true"' : ''}>Выполнено</button><button class="btn ghost" id="wzN"${ans[k] === false ? ' aria-pressed="true"' : ''}>Не выполнено</button></div>
              <label class="bx-f" id="wzNoteL"${ans[k] === false ? '' : ' hidden'}>Что не так<textarea id="wzNote" rows="2">${esc(notes[k])}</textarea></label>`}
          <p class="bx-err" id="wzE"></p><div class="bx-row">${k > 0 ? '<button class="btn ghost sm" id="wzB">Назад</button>' : ''}${last ? `<button class="btn" id="wzGo">${no.length ? 'Вернуть с замечаниями' : 'Принять этап'}</button>` : '<button class="btn ghost sm" id="wzF">Дальше</button>'}<button class="btn ghost sm" id="wzX">Закрыть</button></div></div>`;
        const q = id => m.querySelector(id);
        if (q('#wzY')) q('#wzY').onclick = () => { ans[k] = true; k++; draw(); };
        if (q('#wzN')) q('#wzN').onclick = () => { ans[k] = false; draw(); setTimeout(() => q('#wzNote') && q('#wzNote').focus(), 0); };
        if (q('#wzNote')) q('#wzNote').oninput = e => { notes[k] = e.target.value; };
        if (q('#wzB')) q('#wzB').onclick = () => { k--; draw(); };
        if (q('#wzF')) q('#wzF').onclick = () => { if (ans[k] === null) { q('#wzE').textContent = 'Отметьте: выполнено или нет'; return; } k++; draw(); };
        q('#wzX').onclick = () => m.remove();
        if (q('#wzGo')) q('#wzGo').onclick = async () => {
          const j = no.length ? await act('stage_return', { stage: s.id, remarks: no.map(i => items[i].text + (notes[i] ? ': ' + notes[i] : '')).join('\n') }, q('#wzE'))
            : await act('stage_accept', { stage: s.id, checks: ans.map(a => a === true) }, q('#wzE'));
          if (j.ok) m.remove();
        };
      };
      document.body.appendChild(m); draw();
    }
    function payView(J) {
      const P = J.payments || [], T = J.paySummary || {};
      return `<p>Оплата ремонта — напрямую бригаде, вне сайта. Отмечайте здесь каждую оплату: бригада подтвердит получение. Если бригада отметила раньше — подтвердите вы. Расхождение рассматривает LINEA.</p>
        <p>По плану <b>${rub(T.plan || 0)}</b> · подтверждено <b>${rub(T.confirmed || 0)}</b>${T.declared ? ' · ждёт подтверждения ' + rub(T.declared) : ''}${T.contested ? ' · расхождение ' + rub(T.contested) : ''}</p>
        <ul class="bx-list">${P.map(p => `<li><b>${esc(p.kindText)}${p.stage ? ' · этап ' + p.stage.idx + ' «' + esc(p.stage.name) + '»' : ''}</b> — ${p.amount ? rub(p.amount) : 'сумма не указана'} ${st(p.status === 'confirmed' ? 'done' : p.status === 'contested' ? 'blocked' : p.status === 'declared' ? 'review' : 'new', p.statusText)}
          <div class="bx-mut">${p.declaredBy ? (p.declaredBy === 'client' ? 'Вы отметили' : 'Бригада отметила получение') + ' ' + esc(dt(p.declaredAt)) : (p.kind === 'stage' ? 'После приёмки этапа' : 'По договору')}${p.confirmedAt ? ' · подтверждено ' + esc(dt(p.confirmedAt)) : ''}${p.contestNote ? ' · «' + esc(p.contestNote) + '»' : ''}</div>
          ${J.status !== 'cancelled' && !J.frozen && (p.status === 'planned' || (p.status === 'declared' && p.declaredBy === 'brigade')) ? `<div class="bx-row"><button class="btn sm" type="button" data-pay="${p.id}">${p.status === 'planned' ? 'Я передал(а) ' + rub(p.amount) : 'Подтверждаю'}</button>${p.status === 'declared' ? `<button class="btn ghost sm" type="button" data-payno="${p.id}">Не передавал(а)</button>` : ''}</div>` : ''}</li>`).join('') || '<li class="bx-mut">План оплат появится после подписания договора.</li>'}</ul>`;
    }
    // документы сделки: договор и допсоглашения — только на сайте, одна версия для обеих сторон, подпись кодом (ПЭП)
    function docsBlock(J) {
      const D = J.docs || { contracts: [], log: [] };
      const docs = D.contracts.filter(c => c.status !== 'void').map(c => `<li><b>${esc(c.title)}</b> ${st(c.status === 'signed' ? 'done' : 'review', c.status === 'signed' ? 'подписан' : 'ждёт подписи')}
        ${c.kind === 'addendum' ? ` · ${c.delta >= 0 ? '+' : '−'}${esc(rub(Math.abs(c.delta)))}, итого ${esc(rub(c.total))}${c.daysAdd ? ', срок ' + (c.daysAdd > 0 ? '+' : '') + c.daysAdd + ' дн.' : ''}` : ''}
        <br><span class="bx-mut">вы: ${esc(c.clientSigned ? dt(c.clientSigned) : 'не подписано')} · бригада: ${esc(c.brigadeSigned ? dt(c.brigadeSigned) : 'не подписано')} · отпечаток ${esc(c.hash.slice(0, 16))}…</span>
        ${c.waitAdmin ? '<br><span class="bx-mut">Цена заметно уменьшается — подписать можно после подтверждения LINEA.</span>' : ''}${c.status === 'draft' && !c.clientSigned && !c.waitAdmin && !J.frozen ? `<br><button class="btn sm" type="button" data-sign="${c.id}">Подписать кодом</button>` : ''}${c.status === 'draft' && c.kind === 'addendum' ? ` <button class="btn ghost sm" type="button" data-adc="${c.id}">Отозвать</button>` : ''}</li>`).join('');
      return `<p class="bx-note">${esc(D.transparency || '')}</p><ul class="bx-list">${docs}</ul>
        <p><a href="${API}remont-dogovor.php?t=${t}" target="_blank" rel="noopener">Открыть все документы (печать в PDF, с хешами)</a>${D.dealTotal ? ' · сумма сделки: <b>' + esc(rub(D.dealTotal)) + '</b>' : ''}</p>
        ${J.status === 'work' && !J.frozen ? `<details><summary>Допработы или другой срок — допсоглашение</summary><form id="rmAdd"><div class="bx-grid"><label class="bx-f">Работа<input name="an" maxlength="200" required></label><label class="bx-f">Ед.<input name="au" value="шт" maxlength="12"></label><label class="bx-f">Кол-во<input name="aq" type="number" step="0.01" value="1"></label><label class="bx-f">Цена за ед., ₽<input name="ap" type="number" step="1" min="0" required></label><label class="bx-f">Срок +/− дней<input name="ad" type="number" value="0"></label><label class="bx-cb"><input type="checkbox" name="arm"> исключить работу (минус)</label><label class="bx-f w2">Пояснение<input name="anote" maxlength="500"></label></div><div class="bx-row"><button class="btn ghost sm">Предложить допсоглашение</button></div><p class="bx-err"></p></form></details>` : ''}
        ${J.canCancel ? '<p><button class="btn ghost sm" type="button" id="rmJobCancel">Отказаться от этой бригады</button></p>' : ''}
        <details><summary>Журнал сделки</summary><ul class="bx-list">${(D.log || []).map(l => `<li><span class="bx-mut">${esc(dt(l.at))}</span> · ${esc(l.who)}: ${esc(l.text)}</li>`).join('') || '<li class="bx-mut">Пока пусто.</li>'}</ul></details>`;
    }
    async function signFlow(doc) {
      const pep = (S.job && S.job.docs && S.job.docs.pep) || {};
      if (!confirm('Подписать документ простой электронной подписью?\n\n' + (pep.text || '') + '\n(редакция ' + (pep.ed || '') + ')')) return;
      const r = await call('sign', { doc });
      if (!r.ok) { if (!r.needCode) alert(r.error); return; }
      const code = prompt('Код подписи отправлен на вашу почту. Введите 6 цифр:' + (r.devCode ? ' (проверка: ' + r.devCode + ')' : ''));
      if (code === null) return;
      act('sign', { doc: r.doc, code, pep: true });
    }

    function bind() {
      const q = s => box.querySelector(s), qa = s => box.querySelectorAll(s);
      const f = q('#rmReq');
      if (f) f.onsubmit = e => { e.preventDefault(); act('request', { district: f.district.value, startWish: f.startWish.value, consent: f.consent.checked }, f.querySelector('.bx-err')); };
      const c = q('#rmCancel'); if (c) c.onclick = () => { if (confirm('Отказаться от подбора бригады? Проект остаётся вашим.')) act('cancel'); };
      const cat = q('#rmCat'); if (cat) cat.onclick = () => { try { sessionStorage.setItem('linea_rt', t); } catch { } };
      const mo = q('#rmMore'); if (mo) mo.onclick = () => { showAll = true; render(); };
      const tb = q('#rmTbl'); if (tb) tb.onclick = () => { table = !table; render(); };
      qa('[data-choose]').forEach(b => b.onclick = () => { const cc = q('#rmCC'); if (!cc.checked) { q('#rmChErr').textContent = 'Отметьте согласие на передачу контактов выбранной бригаде'; cc.focus(); return; } if (confirm('Выбрать эту бригаду? Остальным уйдёт письмо, что выбрана другая.')) act('choose', { offer: +b.dataset.choose, consentContacts: true }, q('#rmChErr')); });
      qa('[data-sec]').forEach(a => a.onclick = e => { e.preventDefault(); sec = a.dataset.sec; render(); });
      qa('[data-sign]').forEach(b => b.onclick = () => signFlow(+b.dataset.sign));
      qa('[data-adc]').forEach(b => b.onclick = () => { if (confirm('Отозвать неподписанное допсоглашение?')) act('addendum_cancel', { doc: +b.dataset.adc }); });
      const af = q('#rmAdd'); if (af) af.onsubmit = e => { e.preventDefault(); act('addendum', { items: [{ name: af.an.value, unit: af.au.value, qty: +af.aq.value, price: +af.ap.value, remove: af.arm.checked }], daysAdd: +af.ad.value || 0, note: af.anote.value }, af.querySelector('.bx-err')); };
      const jc = q('#rmJobCancel'); if (jc) jc.onclick = () => { const why = prompt('Почему отказываетесь от бригады? (необязательно)'); if (why !== null) act('job_cancel', { reason: why }); };
      const mf = q('#rmMsg'); if (mf) mf.onsubmit = e => { e.preventDefault(); act('msg', { text: mf.text.value }, mf.querySelector('.bx-err')); };
      qa('[data-wiz]').forEach(b => b.onclick = () => wizard(S.job.stages.find(s => s.id === +b.dataset.wiz)));
      qa('[data-pay]').forEach(b => b.onclick = () => { if (confirm('Подтверждаете оплату? Отметка видна бригаде и LINEA.')) act('pay', { p: +b.dataset.pay }); });
      qa('[data-payno]').forEach(b => b.onclick = () => { const note = prompt('Что не так? (увидят бригада и LINEA)'); if (note) act('pay_contest', { p: +b.dataset.payno, note }); });
      const rv = q('#rmRev'); if (rv) rv.onsubmit = e => { e.preventDefault(); act('review', { rating: +(rv.querySelector('[name=rating]:checked') || {}).value, text: rv.text.value }, rv.querySelector('.bx-err')); };
      const ds = q('#rmDisp'); if (ds) ds.onsubmit = e => { e.preventDefault(); act('dispute', { subject: ds.subject.value, text: ds.text.value }, ds.querySelector('.bx-err')); };
      qa('[data-dm]').forEach(fm => fm.onsubmit = e => { e.preventDefault(); act('dispute_msg', { d: +fm.dataset.dm, text: fm.text.value }); });
    }
    load();
  }
})();
