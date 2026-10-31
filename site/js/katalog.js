// LINEA · каталог бригад: «Пригласить». Токен заказа приходит со страницы заказа через sessionStorage (не через адрес —
// чтобы он не попал в историю, журналы и Referer). Без токена «Пригласить» ведёт на /remont/ (как это работает).
(function () {
  'use strict';
  let t = '';
  try { t = (sessionStorage.getItem('linea_rt') || '').replace(/[^0-9a-f]/gi, ''); } catch { }
  if (!t) return;
  const API = '/api/';
  const top = document.querySelector('.k-page .wrap');
  if (top) top.insertAdjacentHTML('afterbegin', '<p class="bx-note">Вы подбираете бригаду для своего заказа: нажмите «Пригласить» у бригады — она получит ваш обезличенный проект. <a href="/order.html?t=' + t + '">Вернуться к заказу</a></p>');
  document.querySelectorAll('.k-invite').forEach(b => {
    const a = b.querySelector('[data-inv]'), out = b.querySelector('[role=status]');
    a.addEventListener('click', async e => {
      e.preventDefault();
      if (a.dataset.busy) return; a.dataset.busy = '1'; out.textContent = ' Отправляю…';
      try {
        const s = await (await fetch(API + 'remont.php?t=' + t, { cache: 'no-store' })).json();
        const r = await (await fetch(API + 'remont.php?t=' + t + '&a=invite', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF': s.csrf || '' }, body: JSON.stringify({ slug: b.dataset.slug }) })).json();
        out.innerHTML = r.ok ? ' Приглашена. <a href="/order.html?t=' + t + '">К заказу</a>' : ' ' + (r.error || 'Не получилось');
      } catch { out.textContent = ' Нет связи — попробуйте ещё раз'; }
      delete a.dataset.busy;
    });
  });
})();
