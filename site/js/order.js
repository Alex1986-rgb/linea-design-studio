// LINEA · страница заказа: order.html?t=<токен> → api/order.php. Статус, сумма, оплата (ЮKassa или счёт вручную).
// Проект начинается только после оплаты — страница говорит это прямо на каждом шаге до неё.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = (document.querySelector('meta[name="linea-api"]') || {}).content || '';
  const q = new URLSearchParams(location.search);
  const t = (q.get('t') || '').replace(/[^0-9a-f]/gi, '');
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const rub = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
  const date = s => { const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); };
  const main = html => { $('ordMain').innerHTML = html; };
  const WA = '<a href="https://wa.me/79257338640" target="_blank" rel="noopener">WhatsApp</a>';

  if (!API) { main('<h2>Номер заказа приходит по ссылке</h2><p>Страница заказа открывается по ссылке, которую вы получаете после отправки брифа. Если вы отправили бриф в ' + WA + ' или письмом — номер заказа и сумму пришлём туда же.</p><p><a class="btn" href="brief.html">Заполнить бриф</a></p>'); return; }
  if (!t) { main('<h2>Нет номера заказа</h2><p>Откройте страницу по ссылке, которая пришла после отправки брифа. Потеряли ссылку — напишите нам в ' + WA + ', найдём по телефону.</p>'); return; }

  function steps(st) {
    const at = { new: 0, awaiting_payment: 1, paid: 2, delivered: 3, cancelled: -1 }[st];
    [...$('ordSteps').children].forEach((li, i) => { li.className = at < 0 ? '' : i < at ? 'done' : i === at ? 'on' : ''; if (i === 0 && at > 0) li.className = 'done'; });
  }
  function render(o) {
    $('ordH').innerHTML = 'Заказ № ' + esc(o.number) + (o.test ? '<span class="ord-test">тест</span>' : '');
    document.title = 'Заказ ' + o.number + ' — LINEA';
    steps(o.status);
    const days = o.kind === 'dom' ? 72 : 48;
    let h = '';
    if (o.status === 'awaiting_payment' || o.status === 'new') {
      h += '<h2>Бриф получен. Проект начнётся после оплаты</h2>';
      if (o.amount == null) {
        h += '<p>Разберём бриф и назовём цену в течение рабочего дня — пришлём в ' + WA + ' или на почту, и сумма появится здесь. '
          + 'Работу начинаем после оплаты: так мы не тратим ваше и своё время на проект, который ещё не решено заказывать.</p>';
      } else {
        h += '<div class="ord-sum">' + rub(o.amount) + '</div>';
        if (o.canPay) {
          h += '<p>Оплата через ЮKassa. Сразу после оплаты проект уходит в работу — первый вариант через ' + days + ' часов (при плане с размерами).</p>'
            + '<p><button class="btn" id="payBtn" type="button">Оплатить ' + rub(o.amount) + '</button></p><p class="hint" id="payState" role="status"></p>';
        } else {
          h += '<p>' + (o.invoiced ? 'Счёт выставлен — проверьте ' + WA + ' или почту.' : 'Счёт пришлём в течение рабочего дня в ' + WA + ' или на почту.')
            + ' Проект начнётся после оплаты: первый вариант — через ' + days + ' часов от оплаты (при плане с размерами).</p>';
        }
      }
      if (q.get('pay') === 'back') h += '<p class="hint">Вы вернулись с оплаты. Если деньги списались, а статус ещё «ждёт оплаты» — обновите страницу через минуту: подтверждение приходит не мгновенно.</p>';
    } else if (o.status === 'paid') {
      const due = o.paidAt ? new Date(new Date(String(o.paidAt).replace(' ', 'T')).getTime() + days * 3600e3) : null;
      h += '<h2>Оплачен — проект в работе</h2><p>Оплата получена ' + esc(date(o.paidAt)) + '.' + (due ? ' Первый вариант пришлём до <b>' + esc(date(due.toISOString())) + '</b>, если план с размерами уже у нас; если нужен обмер — договоримся о дате отдельно.' : '') + '</p>'
        + '<p class="hint">Пока по объекту есть открытые вопросы (обмер, материал стен, расположение стояков), листы альбома помечены «ПРЕДВАРИТЕЛЬНО». Пометка снимается, когда вы ответите на вопросы и мы сверим размеры.</p>';
    } else if (o.status === 'delivered') {
      h += '<h2>Альбом выдан</h2>' + (o.deliveredUrl ? '<p><a class="btn" href="' + esc(o.deliveredUrl) + '" target="_blank" rel="noopener">Открыть альбом</a></p>' : '')
        + '<p>Правки можно надиктовать прямо на листах — кнопка «Правка к этому листу» на каждой странице PDF. Перевыпускаем с правками.</p>';
    } else if (o.status === 'cancelled') {
      h += '<h2>Заказ отменён</h2><p>Если это ошибка — напишите нам в ' + WA + ', укажите номер заказа.</p>';
    }
    main(h);
    $('ordInfo').hidden = false;
    $('ordInfo').innerHTML = '<dl class="ord-meta"><dt>Номер</dt><dd>' + esc(o.number) + '</dd><dt>Услуга</dt><dd>' + esc(o.kindTitle) + '</dd>'
      + (o.name ? '<dt>Заказчик</dt><dd>' + esc(o.name) + '</dd>' : '') + '<dt>Принят</dt><dd>' + esc(date(o.created)) + '</dd>'
      + '<dt>Статус</dt><dd>' + esc(o.statusText) + '</dd></dl>';
    const pb = $('payBtn');
    if (pb) pb.onclick = () => {
      pb.disabled = true; $('payState').textContent = 'Открываю оплату…';
      fetch(API + 'pay.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t }) })
        .then(r => r.json()).then(j => { if (j.ok && j.url) location.href = j.url; else { pb.disabled = false; $('payState').textContent = j.error || 'Не получилось открыть оплату — попробуйте через минуту'; } })
        .catch(() => { pb.disabled = false; $('payState').textContent = 'Нет связи — попробуйте ещё раз'; });
    };
  }
  let tries = 0;
  function load() {
    fetch(API + 'order.php?t=' + t, { cache: 'no-store' }).then(r => r.json().then(j => ({ code: r.status, j })))
      .then(({ code, j }) => {
        if (!j.ok) { main('<h2>Заказ не найден</h2><p>' + esc(j.error || 'Проверьте ссылку') + '. Напишите нам в ' + WA + ' — найдём по телефону.</p>'); return; }
        render(j.order);
        // вернулись с оплаты, а подтверждения ещё нет — переспросить несколько раз
        if (q.get('pay') === 'back' && j.order.status === 'awaiting_payment' && ++tries < 6) setTimeout(load, 5000);
      })
      .catch(() => main('<h2>Нет связи с сервером</h2><p>Обновите страницу через минуту. Заказ сохранён — номер и ссылка не пропадут.</p>'));
  }
  load();
})();
