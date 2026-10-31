// LINEA · «Ремонт по проекту» на странице заказа (order.html?t=…): подбор бригады (необязательно), сравнение предложений
// по позициям сметы, выбор, договор подряда, этапы и приёмка по чек-листам, отзыв, споры. API — api/remont.php (доступ по токену заказа).
(function () {
  'use strict';
  const box = document.getElementById('ordRemont');
  const API = (document.querySelector('meta[name="linea-api"]') || {}).content || '';
  const t = (new URLSearchParams(location.search).get('t') || '').replace(/[^0-9a-f]/gi, '');
  if (!box || !API || !t) return;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rub = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
  const day = s => { if (!s) return '—'; const d = new Date(String(s).slice(0, 10) + 'T00:00'); return isNaN(d) ? s : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); };
  const dt = s => { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); };
  const st = (k, txt) => `<span class="bx-st ${esc(k)}">${esc(txt)}</span>`;
  const SPEC = { demontazh: 'Демонтаж', chernovye: 'Черновые работы', elektrika: 'Электрика', santehnika: 'Сантехника', plitka: 'Плитка', malyarka: 'Малярные работы', poly: 'Полы', potolki: 'Потолки и ГКЛ', mebel: 'Мебель и двери' };
  let S = {};

  async function call(a, json) {
    const r = await fetch(API + 'remont.php?t=' + t + (a ? '&a=' + a : ''), a ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF': S.csrf || '' }, body: JSON.stringify(json || {}) } : { cache: 'no-store' });
    let j; try { j = await r.json(); } catch { j = { ok: false, error: 'Сервер не ответил' }; }
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
      if (!S.eligible) { box.innerHTML = h + '<h2>Ремонт по проекту</h2><p>Когда проект будет оплачен, здесь можно подобрать проверенную бригаду: бригады посчитают ремонт по вашей смете. Это необязательно — проект ваш, работать можно с кем угодно. <a href="remont/">Как это работает</a></p>'; return; }
      h += `<h2>Подобрать бригаду</h2><p>Проверенные бригады вашего района посчитают ремонт по позициям вашей сметы — вы сравните цены построчно и выберете. Для вас бесплатно; подбор необязателен. <a href="remont/" target="_blank" rel="noopener">Как это работает</a>${R ? '' : ''}</p>
        <form id="rmReq"><div class="bx-grid"><label class="bx-f">Район объекта<select name="district" required><option value="">Выберите</option>${Object.entries(S.districts).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        <label class="bx-f">Когда хотите начать<input name="startWish" maxlength="60" placeholder="например, с 15 ноября"></label></div>
        <label class="bx-cb"><input type="checkbox" name="consent" required> Согласен передать бригадам площадки проект <b>без</b> моего имени, адреса и телефона: район, площадь, смету, ведомости и листы (<a href="${esc(S.terms.href)}" target="_blank" rel="noopener">условия сервиса</a>, ред. ${esc(S.terms.ed)}). Контакты получит только бригада, которую я выберу.</label>
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
      ${canChoose ? `<label class="bx-cb"><input type="checkbox" id="rmCC"> Согласен передать выбранной бригаде моё имя, телефон, e-mail и адрес объекта — для договора подряда и работ. Остальные бригады контактов не получат.</label>
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
    return `<h2>Ремонт: ${esc(B.name)} ${st(J.status, J.statusText)}</h2>
      <p><b>Бригада:</b> <a href="brigady/${esc(B.slug)}/" target="_blank" rel="noopener">${esc(B.name)}</a> · ${esc(B.contact)} · <a href="tel:${esc(String(B.phone).replace(/[^\d+]/g, ''))}">${esc(B.phone)}</a> · <a href="mailto:${esc(B.email)}">${esc(B.email)}</a><br><span class="bx-mut">${esc(B.legalFull)}</span></p>
      <p>Договор подряда — напрямую с бригадой: <a href="${API}remont-dogovor.php?t=${t}" target="_blank" rel="noopener">шаблон с приложениями (печать в PDF)</a>. Подписан вами: ${esc(J.clientSigned ? dt(J.clientSigned) : 'нет')}, бригадой: ${esc(J.brigadeSigned ? dt(J.brigadeSigned) : 'нет')}.</p>
      ${J.status === 'contract' && !J.clientSigned ? '<div class="bx-row"><button class="btn" type="button" id="rmSign">Договор подписан</button></div>' : ''}
      <h3>Этапы</h3>${stages}
      ${J.canReview ? `<h3>Отзыв о бригаде</h3><form id="rmRev"><div class="bx-chips">${[5, 4, 3, 2, 1].map(n => `<label><input type="radio" name="rating" value="${n}" required> ${'★'.repeat(n)}</label>`).join('')}</div><label class="bx-f" style="margin-top:8px">Текст<textarea name="text" maxlength="3000"></textarea></label><div class="bx-row"><button class="btn">Оставить отзыв</button></div><p class="bx-err"></p></form>` : ''}
      ${J.review ? `<p>Ваш отзыв: ${'★'.repeat(J.review.rating)} ${esc(J.review.text)}${J.review.hidden ? ' <span class="bx-mut">(скрыт модерацией по правилам площадки)</span>' : ''}</p>` : ''}
      <h3>Споры</h3>${(J.disputes || []).map(d => `<div class="bx-stage"><h4>${esc(d.subject)} ${st(d.status === 'open' ? 'review' : 'done', d.status === 'open' ? 'открыт' : 'решён')}</h4>${d.messages.map(m => `<p><b>${esc({ client: 'Вы', brigade: 'Бригада', admin: 'LINEA' }[m.who])}</b> <span class="bx-mut">${esc(dt(m.at))}</span><br>${esc(m.text)}</p>`).join('')}${d.resolution ? '<p><b>Решение:</b> ' + esc(d.resolution) + '</p>' : ''}</div>`).join('')}
      <details><summary>Открыть спор</summary><form id="rmDisp"><label class="bx-f">Тема<input name="subject" required maxlength="120"></label><label class="bx-f">Суть<textarea name="text" required></textarea></label><div class="bx-row"><button class="btn ghost">Отправить в LINEA</button></div><p class="bx-err"></p></form></details>`;
  }

  function bind() {
    const q = s => box.querySelector(s), qa = s => box.querySelectorAll(s);
    const f = q('#rmReq');
    if (f) f.onsubmit = e => { e.preventDefault(); act('request', { district: f.district.value, startWish: f.startWish.value, consent: f.consent.checked }, f.querySelector('.bx-err')); };
    const c = q('#rmCancel'); if (c) c.onclick = () => { if (confirm('Отказаться от подбора бригады? Проект остаётся вашим.')) act('cancel'); };
    const cat = q('#rmCat'); if (cat) cat.onclick = () => { try { sessionStorage.setItem('linea_rt', t); } catch { } };
    qa('[data-choose]').forEach(b => b.onclick = () => { const cc = q('#rmCC'); if (!cc.checked) { q('#rmChErr').textContent = 'Отметьте согласие на передачу контактов выбранной бригаде'; return; } if (confirm('Выбрать это предложение? Остальные бригады получат отказ.')) act('choose', { offer: +b.dataset.choose, consentContacts: true }, q('#rmChErr')); });
    const sg = q('#rmSign'); if (sg) sg.onclick = () => { if (confirm('Подтверждаете, что договор подряда с бригадой подписан?')) act('sign'); };
    qa('[data-acc]').forEach(b => b.onclick = () => { const id = b.dataset.acc; const checks = [...qa(`[data-ck="${id}"]`)].map(i => i.checked); if (checks.some(x => !x) && !confirm('Не все пункты чек-листа отмечены. Всё равно принять этап?')) return; act('stage_accept', { stage: +id, checks }); });
    qa('[data-ret]').forEach(b => b.onclick = () => act('stage_return', { stage: +b.dataset.ret, remarks: q(`[data-rt="${b.dataset.ret}"]`).value }));
    const rv = q('#rmRev'); if (rv) rv.onsubmit = e => { e.preventDefault(); act('review', { rating: +(rv.querySelector('[name=rating]:checked') || {}).value, text: rv.text.value }, rv.querySelector('.bx-err')); };
    const ds = q('#rmDisp'); if (ds) ds.onsubmit = e => { e.preventDefault(); act('dispute', { subject: ds.subject.value, text: ds.text.value }, ds.querySelector('.bx-err')); };
  }
  load();
})();
