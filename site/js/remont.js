// LINEA · «Ремонт по проекту» на странице заказа (order.html?t=…): подбор бригады (необязательно), сравнение предложений
// по позициям сметы, выбор, договор подряда, этапы и приёмка по чек-листам, отзыв, рассмотрение разногласий. API — api/remont.php (доступ по токену заказа).
(function () {
  'use strict';
  // Кабинет клиента (js/kabinet.js) запускает тот же модуль внутри вкладки «Ремонт»: window.lineaRemont(box, токен, api).
  // Значимые действия требуют свежего входа кодом: ответ {needCode} → window.lineaNeedCode() (окно кода кабинета) → повтор.
  window.lineaRemont = start;
  const box0 = document.getElementById('ordRemont');
  const API0 = (document.querySelector('meta[name="linea-api"]') || {}).content || '';
  const t0 = (new URLSearchParams(location.search).get('t') || '').replace(/[^0-9a-f]/gi, '');
  if (box0 && API0 && t0 && !document.getElementById('kab')) start(box0, t0, API0);

  function start(box, t, API) {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rub = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
  const day = s => { if (!s) return '—'; const d = new Date(String(s).slice(0, 10) + 'T00:00'); return isNaN(d) ? s : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); };
  const dt = s => { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); };
  const st = (k, txt) => `<span class="bx-st ${esc(k)}">${esc(txt)}</span>`;
  const SPEC = { demontazh: 'Демонтаж', chernovye: 'Черновые работы', elektrika: 'Электрика', santehnika: 'Сантехника', plitka: 'Плитка', malyarka: 'Малярные работы', poly: 'Полы', potolki: 'Потолки и ГКЛ', mebel: 'Мебель и двери' };
  let S = {};

  async function call(a, json, again) {
    const r = await fetch(API + 'remont.php?t=' + t + (a ? '&a=' + a : ''), a ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF': S.csrf || '' }, body: JSON.stringify(json || {}) } : { cache: 'no-store', credentials: 'same-origin' });
    let j; try { j = await r.json(); } catch { j = { ok: false, error: 'Сервер не ответил' }; }
    if (j.needCode && !again && typeof window.lineaNeedCode === 'function' && await window.lineaNeedCode()) return call(a, json, true);
    if (j.needCode && !window.lineaNeedCode) j.error = 'Это действие — в кабинете после входа кодом из письма: откройте kabinet/';
    return j;
  }
  async function load() { const j = await call(); if (j.ok) { S = j; render(); } }
  const act = async (a, json, errEl) => { const j = await call(a, json); if (j.ok) { S = j; render(); } else if (errEl) { errEl.textContent = j.error; } else alert(j.error); };

  function render() {
    box.hidden = false;
    const R = S.request, J = S.job;
    let h = '<div class="kicker" style="margin:0 0 6px">Ремонт по проекту · необязательно</div>';
    if (J) h += jobView(J);
    else if (!R || R.status === 'cancelled') {
      if (!S.eligible) { box.innerHTML = h + '<h2>Ремонт по проекту</h2><p>${S.chooseAfter === 'final' ? 'Когда будет готов финальный альбом' : 'Когда проект будет оплачен и готов первый вариант альбома'}, здесь можно подобрать бригаду (бригады проходят проверку документов): бригады посчитают ремонт по вашей смете. Это необязательно — проект ваш, работать можно с кем угодно. <a href="remont/">Как это работает</a></p>'; return; }
      h += `<h2>Подобрать бригаду</h2><p>Бригады вашего района, прошедшие проверку документов, посчитают ремонт по позициям вашей сметы — вы сравните цены построчно и выберете. Для вас — без комиссии: вознаграждение студии платит бригада. Подбор необязателен. <a href="remont/" target="_blank" rel="noopener">Как это работает</a>${R ? '' : ''}</p>
        <form id="rmReq"><div class="bx-grid"><label class="bx-f">Район объекта<select name="district" required><option value="">Выберите</option>${Object.entries(S.districts).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        <label class="bx-f">Когда хотите начать<input name="startWish" maxlength="60" placeholder="например, с 15 ноября"></label></div>
        <label class="bx-cb"><input type="checkbox" name="consent" required> Согласен передать бригадам площадки проект <b>без</b> моего имени, адреса и телефона: район, площадь, смету, ведомости и листы (<a href="${esc(S.terms.href)}" target="_blank" rel="noopener">условия сервиса</a>, ред. ${esc(S.terms.ed)}). Контакты получит только бригада, которую я выберу, — когда условия договора подтвердим и я, и она.</label>
        <div class="bx-row"><button class="btn">Подобрать бригаду</button></div><p class="bx-err" role="status"></p></form>`;
    } else {
      h += `<h2>Подбор бригады ${st(R.status === 'sent' ? 'work' : 'new', R.statusText)}</h2><p>${esc(R.district)} · работы: ${esc(R.works.join(', ') || 'уточняем по смете')}${R.deadline ? ' · предложения до ' + esc(dt(R.deadline)) : ''}${R.sent ? ' · запрос получили бригад: ' + R.invitedCount : ' · готовим пакет проекта для бригад'}</p>
        ${R.invited.length ? '<p class="bx-mut">Вы пригласили: ' + R.invited.map(i => `<a href="brigady/${esc(i.slug)}/" target="_blank" rel="noopener">${esc(i.name)}</a>`).join(', ') + '</p>' : ''}
        ${R.status !== 'chosen' ? `<div class="bx-row"><a class="btn ghost sm" href="brigady/" id="rmCat">Пригласить бригаду из каталога</a><button type="button" class="btn ghost sm" id="rmCancel">Отказаться от подбора</button></div>` : ''}
        ${S.offers.length ? compare() : '<p class="bx-note">Предложений пока нет. Обычно бригады отвечают до срока; пришлём письмо, когда будет что сравнить.</p>'}`;
    }
    box.innerHTML = h;
    bind();
  }

  function compare() {
    const O = S.offers.filter(o => o.status !== 'rejected'), P = S.request.positions;
    const col = (f) => O.map(f).map(x => `<td>${x}</td>`).join('');
    const minTotal = Math.min(...O.map(o => o.total));
    let rows = `<tr><th>Бригада</th>${O.map(o => `<th><a href="brigady/${esc(o.brigade.slug)}/" target="_blank" rel="noopener">${esc(o.brigade.name)}</a></th>`).join('')}</tr>`;
    rows += `<tr><td><b>Итого по смете</b></td>${col(o => `<b class="${o.total === minTotal ? 'best' : ''}">${rub(o.total)}</b>`)}</tr>`;
    rows += `<tr><td>Срок</td>${col(o => `${o.days} дн., старт с ${esc(day(o.startDate))}`)}</tr>`;
    rows += `<tr><td>Гарантия</td>${col(o => o.warrantyMonths + ' мес.')}</tr>`;
    rows += `<tr><td>Материалы</td>${col(o => esc(o.materials) + (o.materialsNote ? '<br><span class="bx-mut">' + esc(o.materialsNote) + '</span>' : ''))}</tr>`;
    rows += `<tr><td>Рейтинг</td>${col(o => o.brigade.rating.n ? `★ ${o.brigade.rating.avg} (${o.brigade.rating.n})` : '<span class="bx-mut">отзывов нет</span>')}</tr>`;
    rows += `<tr><td>Проверка</td>${col(o => esc(o.brigade.legal) + (o.brigade.innChecked ? ', ИНН ✓' : '') + (o.brigade.callPassed ? ', звонок ✓' : '') + '<br><span class="bx-mut">объектов LINEA: ' + o.brigade.jobsDone + '</span>')}</tr>`;
    rows += `<tr><td>Этапы</td>${col(o => o.stages.map(s => esc(s.name) + ' — ' + s.days + ' дн.').join('<br>'))}</tr>`;
    rows += `<tr><td>Объекты</td>${col(o => '<div class="bx-ph">' + o.brigade.portfolio.slice(0, 3).flatMap(p => p.after.slice(0, 1)).map(id => `<img src="${API}brigade/file.php?f=${id}" alt="" loading="lazy">`).join('') + '</div>')}</tr>`;
    rows += `<tr><td>Комментарий</td>${col(o => esc(o.comment || '—'))}</tr>`;
    let cur = '';
    for (const p of P) {
      if (p.spec !== cur) { cur = p.spec; rows += `<tr class="grp"><td colspan="${O.length + 1}">${esc(SPEC[cur] || cur)}</td></tr>`; }
      const vals = O.map(o => o.items[p.id] && !o.items[p.id].skip ? o.items[p.id].sum / 100 : null);
      const min = Math.min(...vals.filter(v => v != null));
      rows += `<tr><td>${esc(p.name)} <span class="bx-mut">${p.qty != null ? esc(p.qty) + ' ' + esc(p.unit) : ''}</span></td>${vals.map(v => `<td class="r${v === min && vals.filter(x => x != null).length > 1 ? ' best' : ''}">${v == null ? '<span class="bx-mut">не делает</span>' : rub(v)}</td>`).join('')}</tr>`;
    }
    const canChoose = S.request.status === 'sent';
    return `<h3>Сравнение предложений</h3><div class="bx-tbl-wrap"><table class="bx-tbl">${rows}</table></div>
      ${canChoose ? `<label class="bx-cb"><input type="checkbox" id="rmCC"> Согласен передать выбранной бригаде моё имя, телефон, e-mail и адрес объекта — для договора подряда и работ. Остальные бригады контактов не получат. ${esc((S.brigTerms || {}).contactsText || '')}</label>
      <div class="bx-row">${O.map(o => `<button class="btn${o.total === minTotal ? '' : ' ghost'}" type="button" data-choose="${o.id}">Выбрать: ${esc(o.brigade.name)}</button>`).join('')}</div><p class="bx-err" id="rmChErr" role="status"></p>` : ''}`;
  }

  function jobView(J) {
    const B = J.brigade;
    const stages = J.stages.map(s => `<div class="bx-stage"><h4>${s.idx}. ${esc(s.name)} ${st(s.status, s.statusText)}</h4><div class="bx-mut">План: ${esc(day(s.planStart))} — ${esc(day(s.planEnd))}${s.acceptedAt ? ' · принят ' + esc(dt(s.acceptedAt)) : ''}</div>
      <div class="bx-ph">${s.photos.map(id => `<a href="${API}brigade/file.php?f=${id}&t=${t}" target="_blank" rel="noopener"><img src="${API}brigade/file.php?f=${id}&t=${t}" alt="Фото этапа" loading="lazy"></a>`).join('')}</div>
      ${s.remarks.length ? '<ul class="bx-check">' + s.remarks.map(r => `<li>${r.closedAt ? '✓' : '•'} <span>${esc(r.text)}${r.closedAt ? ' <span class="src">— бригада: ' + esc(r.closeNote) + '</span>' : ''}</span></li>`).join('') + '</ul>' : ''}
      ${s.status === 'ready' ? `<p><b>Чек-лист приёмки: ${esc(s.checklist.title)}</b></p><ul class="bx-check">${s.checklist.items.map((i, k) => `<li><input type="checkbox" data-ck="${s.id}" id="ck${s.id}-${k}"><label for="ck${s.id}-${k}">${esc(i.text)} <span class="src">(${esc(i.src)})</span></label></li>`).join('')}</ul>
        <div class="bx-row"><button class="btn sm" type="button" data-acc="${s.id}">Принять этап</button></div>
        <details><summary>Вернуть с замечаниями</summary><textarea class="bx-in" data-rt="${s.id}" rows="3" placeholder="Замечания — по одному в строке"></textarea><div class="bx-row"><button class="btn ghost sm" type="button" data-ret="${s.id}">Вернуть бригаде</button></div></details>` : ''}</div>`).join('');
    const msgs = (J.messages || []).map(m => `<p class="bx-msg ${esc(m.who)}"><b>${esc({ client: 'Вы', brigade: 'Бригада', admin: 'LINEA' }[m.who] || m.who)}</b> <span class="bx-mut">${esc(dt(m.at))}</span><br>${esc(m.text)}</p>`).join('');
    return `<h2>Ремонт: ${esc(B.name)} ${st(J.status, J.statusText)}</h2>
      <p><b>Бригада:</b> <a href="brigady/${esc(B.slug)}/" target="_blank" rel="noopener">${esc(B.name)}</a>${J.contactsOpen ? ` · ${esc(B.contact)} · <a href="tel:${esc(String(B.phone).replace(/[^\d+]/g, ''))}">${esc(B.phone)}</a> · <a href="mailto:${esc(B.email)}">${esc(B.email)}</a>` : ''}<br><span class="bx-mut">${esc(B.legalFull)}</span></p>
      ${J.contactsOpen ? '' : `<p class="bx-note">${esc(J.contactsText)}</p>`}
      <p>Договор подряда — напрямую с бригадой: <a href="${API}remont-dogovor.php?t=${t}" target="_blank" rel="noopener">шаблон с приложениями (печать в PDF)</a>. Условия подтвердили: вы — ${esc(J.clientSigned ? dt(J.clientSigned) : 'нет')}, бригада — ${esc(J.brigadeSigned ? dt(J.brigadeSigned) : 'нет')}.</p>
      ${docsBlock(J)}
      ${J.canCancel ? '<p><button class="btn ghost sm" type="button" id="rmJobCancel">Отказаться от этой бригады</button></p>' : ''}
      <h3>Переписка с бригадой</h3>${msgs || '<p class="bx-mut">Сообщений пока нет. Договоритесь здесь о просмотре объекта и деталях договора.</p>'}
      <form id="rmMsg"><label class="bx-f">Сообщение<textarea name="text" maxlength="2000" rows="2"></textarea></label><div class="bx-row"><button class="btn ghost sm">Отправить</button></div><p class="bx-err" role="status"></p></form>
      <h3>Этапы</h3>${stages}
      ${J.canReview ? `<h3>Отзыв о бригаде</h3><form id="rmRev"><div class="bx-chips">${[5, 4, 3, 2, 1].map(n => `<label><input type="radio" name="rating" value="${n}" required> ${'★'.repeat(n)}</label>`).join('')}</div><label class="bx-f" style="margin-top:8px">Текст<textarea name="text" maxlength="3000"></textarea></label><div class="bx-row"><button class="btn">Оставить отзыв</button></div><p class="bx-err"></p></form>` : ''}
      ${J.review ? `<p>Ваш отзыв: ${'★'.repeat(J.review.rating)} ${esc(J.review.text)}${J.review.hidden ? ' <span class="bx-mut">(скрыт модерацией по правилам площадки)</span>' : ''}</p>` : ''}
      <h3>Разногласия</h3><p class="bx-mut">Сначала напишите второй стороне в ленте сделки. Не договорились — попросите LINEA рассмотреть разногласие: мы сверим работы с проектом, фото и перепиской и дадим рекомендацию. Она необязательна, право обратиться в суд сохраняется.</p>${(J.disputes || []).map(d => `<div class="bx-stage"><h4>${esc(d.subject)} ${st(d.status === 'open' ? 'review' : 'done', d.status === 'open' ? 'на рассмотрении' : 'рассмотрено')}</h4>${d.messages.map(m => `<p><b>${esc({ client: 'Вы', brigade: 'Бригада', admin: 'LINEA' }[m.who])}</b> <span class="bx-mut">${esc(dt(m.at))}</span><br>${esc(m.text)}</p>`).join('')}${d.resolution ? '<p><b>Рекомендация LINEA:</b> ' + esc(d.resolution) + '</p>' : ''}</div>`).join('')}
      <details><summary>Попросить LINEA рассмотреть разногласие</summary><form id="rmDisp"><label class="bx-f">Тема<input name="subject" required maxlength="120"></label><label class="bx-f">Суть<textarea name="text" required></textarea></label><div class="bx-row"><button class="btn ghost">Отправить в LINEA</button></div><p class="bx-err"></p></form></details>`;
  }

  // документы сделки: договор и допсоглашения — только на сайте, одна версия для обеих сторон, подпись кодом (ПЭП)
  function docsBlock(J) {
    const D = J.docs || { contracts: [], log: [] };
    const docs = D.contracts.filter(c => c.status !== 'void').map(c => `<li><b>${esc(c.title)}</b> ${st(c.status === 'signed' ? 'done' : 'review', c.status === 'signed' ? 'подписан' : 'ждёт подписи')}
      ${c.kind === 'addendum' ? ` · ${c.delta >= 0 ? '+' : '−'}${esc(rub(Math.abs(c.delta)))}, итого ${esc(rub(c.total))}${c.daysAdd ? ', срок ' + (c.daysAdd > 0 ? '+' : '') + c.daysAdd + ' дн.' : ''}` : ''}
      <br><span class="bx-mut">вы: ${esc(c.clientSigned ? dt(c.clientSigned) : 'не подписано')} · бригада: ${esc(c.brigadeSigned ? dt(c.brigadeSigned) : 'не подписано')} · SHA-256 ${esc(c.hash.slice(0, 16))}…</span>
      ${c.waitAdmin ? '<br><span class="bx-mut">Цена заметно уменьшается — подписать можно после подтверждения LINEA (обычно в течение рабочего дня).</span>' : ''}${c.status === 'draft' && !c.clientSigned && !c.waitAdmin ? `<br><button class="btn sm" type="button" data-sign="${c.id}">Подписать кодом</button>` : ''}${c.status === 'draft' && c.kind === 'addendum' ? ` <button class="btn ghost sm" type="button" data-adc="${c.id}">Отозвать</button>` : ''}</li>`).join('');
    return `<h3>Документы сделки</h3><p class="bx-note">${esc(D.transparency || '')}</p><ul class="bx-list">${docs}</ul>
      <p><a href="${API}remont-dogovor.php?t=${t}" target="_blank" rel="noopener">Открыть все документы (печать в PDF, с хешами)</a>${D.dealTotal ? ' · сумма сделки: <b>' + esc(rub(D.dealTotal)) + '</b>' : ''}</p>
      ${J.canAdvance ? '<div class="bx-row"><button class="btn ghost sm" type="button" id="rmAdv">Аванс бригаде внесён</button></div>' : (J.advanceAt ? '<p class="bx-mut">Аванс отмечен ' + esc(dt(J.advanceAt)) + ({ declared: ' — ждём подтверждения бригады', disputed: ' — бригада не подтвердила получение, LINEA свяжется с вами', confirmed: ' — подтверждён' }[J.advanceState] || '') + '</p>' : '')}
      ${J.status === 'work' ? `<details><summary>Допработы или другой срок — допсоглашение</summary><form id="rmAdd"><div class="bx-grid"><label class="bx-f">Работа<input name="an" maxlength="200" required></label><label class="bx-f">Ед.<input name="au" value="шт" maxlength="12"></label><label class="bx-f">Кол-во<input name="aq" type="number" step="0.01" value="1"></label><label class="bx-f">Цена за ед., ₽<input name="ap" type="number" step="1" min="0"></label><label class="bx-f"><span><input type="checkbox" name="arm"> исключить эту работу из договора</span></label><label class="bx-f">Срок, ± дней<input name="ad" type="number" value="0"></label><label class="bx-f">Пояснение<input name="anote" maxlength="500"></label></div><div class="bx-row"><button class="btn ghost sm">Предложить бригаде</button></div><p class="bx-err"></p></form></details>` : ''}
      <details><summary>Журнал сделки</summary><ul class="bx-list">${(D.log || []).map(l => `<li><span class="bx-mut">${esc(dt(l.at))}</span> · ${esc(l.who)}: ${esc(l.text)}</li>`).join('') || '<li class="bx-mut">Пока пусто.</li>'}</ul></details>`;
  }
  async function signFlow(doc) {
    const pep = (S.job && S.job.docs && S.job.docs.pep) || {};
    if (!confirm('Подписать документ простой электронной подписью?\n\n' + (pep.text || '') + '\n(редакция ' + (pep.ed || '') + ')')) return;
    const r = await call('sign', { doc });
    if (!r.ok) { alert(r.error); return; }
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
    qa('[data-choose]').forEach(b => b.onclick = () => { const cc = q('#rmCC'); if (!cc.checked) { q('#rmChErr').textContent = 'Отметьте согласие на передачу контактов выбранной бригаде'; return; } if (confirm('Выбрать это предложение? Остальные бригады получат отказ.')) act('choose', { offer: +b.dataset.choose, consentContacts: true }, q('#rmChErr')); });
    qa('[data-sign]').forEach(b => b.onclick = () => signFlow(+b.dataset.sign));
    const adv = q('#rmAdv'); if (adv) adv.onclick = () => { if (confirm('Подтверждаете, что внесли бригаде аванс?')) act('advance'); };
    qa('[data-adc]').forEach(b => b.onclick = () => { if (confirm('Отозвать неподписанное допсоглашение?')) act('addendum_cancel', { doc: +b.dataset.adc }); });
    const af = q('#rmAdd'); if (af) af.onsubmit = e => { e.preventDefault(); act('addendum', { items: [{ name: af.an.value, unit: af.au.value, qty: +af.aq.value, price: +af.ap.value, remove: af.arm.checked }], daysAdd: +af.ad.value || 0, note: af.anote.value }, af.querySelector('.bx-err')); };
    const jc = q('#rmJobCancel'); if (jc) jc.onclick = () => { const why = prompt('Почему отказываетесь от бригады? (необязательно)'); if (why !== null) act('job_cancel', { reason: why }); };
    const mf = q('#rmMsg'); if (mf) mf.onsubmit = e => { e.preventDefault(); act('msg', { text: mf.text.value }, mf.querySelector('.bx-err')); };
    qa('[data-acc]').forEach(b => b.onclick = () => { const id = b.dataset.acc; const checks = [...qa(`[data-ck="${id}"]`)].map(i => i.checked); if (checks.some(x => !x)) { alert('Принять этап можно, когда отмечены все пункты чек-листа. Если что-то не выполнено — верните этап с замечаниями.'); return; } act('stage_accept', { stage: +id, checks }); });
    qa('[data-ret]').forEach(b => b.onclick = () => act('stage_return', { stage: +b.dataset.ret, remarks: q(`[data-rt="${b.dataset.ret}"]`).value }));
    const rv = q('#rmRev'); if (rv) rv.onsubmit = e => { e.preventDefault(); act('review', { rating: +(rv.querySelector('[name=rating]:checked') || {}).value, text: rv.text.value }, rv.querySelector('.bx-err')); };
    const ds = q('#rmDisp'); if (ds) ds.onsubmit = e => { e.preventDefault(); act('dispute', { subject: ds.subject.value, text: ds.text.value }, ds.querySelector('.bx-err')); };
  }
  load();
  }
})();
