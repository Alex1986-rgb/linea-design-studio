// LINEA · каталог бригад: «Пригласить в мой запрос». Токен заказа приходит со страницы заказа через sessionStorage (не через адрес —
// чтобы он не попал в историю, журналы и Referer). Без токена кнопок нет — карточка остаётся обычной публичной страницей.
(function () {
  'use strict';
  let t = '';
  try { t = (sessionStorage.getItem('linea_rt') || '').replace(/[^0-9a-f]/gi, ''); } catch { }
  if (!t) return;
  const API = '/api/';
  const blocks = document.querySelectorAll('.k-invite');
  if (!blocks.length) {
    const h = document.querySelector('.hero-page .wrap');
    if (h) h.insertAdjacentHTML('afterbegin', '<p class="bx-note">Вы подбираете бригаду для своего заказа: откройте карточку бригады и нажмите «Пригласить в мой запрос». <a href="/order.html?t=' + t + '">Вернуться к заказу</a></p>');
    return;
  }
  blocks.forEach(b => {
    b.hidden = false;
    const btn = b.querySelector('button'), out = b.querySelector('[role=status]');
    btn.onclick = async () => {
      btn.disabled = true; out.textContent = ' Отправляю…';
      try {
        const s = await (await fetch(API + 'remont.php?t=' + t, { cache: 'no-store' })).json();
        const r = await (await fetch(API + 'remont.php?t=' + t + '&a=invite', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF': s.csrf || '' }, body: JSON.stringify({ slug: b.dataset.slug }) })).json();
        out.innerHTML = r.ok ? ' Приглашена. <a href="/order.html?t=' + t + '">Вернуться к заказу</a>' : ' ' + (r.error || 'Не получилось');
      } catch { out.textContent = ' Нет связи — попробуйте ещё раз'; }
      btn.disabled = false;
    };
  });
})();
