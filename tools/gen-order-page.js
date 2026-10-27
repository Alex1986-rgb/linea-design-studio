#!/usr/bin/env node
'use strict';
/**
 * Страница заказа: site/order.html (статичная, на общем каркасе site-shell.js) + данные из api/order.php?t=<токен>.
 *   node tools/gen-order-page.js
 * Клиент попадает сюда после отправки брифа (js/brief.js → api/brief.php → order.html?t=…). Статус, сумма и оплата —
 * в js/order.js. noindex, в sitemap не идёт. На GitHub Pages приёмника нет (нет <meta name="linea-api">) — страница
 * честно говорит, что номер заказа приходит по ссылке после отправки брифа.
 */
const fs = require('fs');
const path = require('path');
const SHELL = require('./site-shell.js');

const u = '';
const title = 'Ваш заказ — LINEA';
const html = `<!DOCTYPE html>
<html lang="ru">
<head>
${SHELL.head(u, { title, desc: 'Статус заказа дизайн-проекта LINEA: бриф получен, оплата, работа, выдача альбома.', canonical: `${SHELL.BASE}/order.html` })}
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<style>
.ord{max-width:760px}
.ord-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:22px 0 26px;padding:0;list-style:none;counter-reset:s}
.ord-steps li{border-top:3px solid var(--line);padding-top:8px;font-size:13.5px;color:var(--mut);counter-increment:s}
.ord-steps li::before{content:counter(s) ". "}
.ord-steps li.done{border-color:var(--gold);color:inherit}
.ord-steps li.on{border-color:var(--gold);color:inherit;font-weight:600}
.ord-card{border:1px solid var(--line);border-radius:4px;background:var(--panel);padding:22px 24px;margin:0 0 18px}
.ord-card h2{margin:0 0 10px;font-size:22px}
.ord-card p{margin:0 0 10px;line-height:1.6}
.ord-sum{font-family:var(--serif);font-size:30px;color:var(--gold);margin:4px 0 12px}
.ord-meta{display:grid;grid-template-columns:auto 1fr;gap:6px 18px;font-size:14.5px;margin:0}
.ord-meta dt{color:var(--mut)}.ord-meta dd{margin:0}
.ord-test{display:inline-block;background:#b4462b;color:#fff;font-size:12px;padding:1px 8px;border-radius:10px;vertical-align:middle;margin-left:8px}
@media (max-width:640px){.ord-steps{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
${SHELL.beta(u)}

${SHELL.header(u, null)}

<section class="blk hero-page">
  <div class="wrap ord">
    <div class="kicker">Заказ</div>
    <h1 id="ordH">Ваш заказ</h1>
    <ol class="ord-steps" id="ordSteps" aria-label="Этапы заказа">
      <li>Бриф получен</li><li>Оплата</li><li>Проект в работе</li><li>Альбом выдан</li>
    </ol>
    <div class="ord-card" id="ordMain" aria-live="polite"><p>Загружаю заказ…</p></div>
    <div class="ord-card" id="ordInfo" hidden></div>
    <p class="hint">Сохраните эту страницу в закладки — по ссылке всегда виден статус. Вопросы — в WhatsApp
      <a href="https://wa.me/79257338640" target="_blank" rel="noopener">+7 925 733-86-40</a> или на <a href="mailto:optteem@mail.ru">optteem@mail.ru</a>, укажите номер заказа.</p>
  </div>
</section>

${SHELL.footer(u, null)}
<script src="js/order.js?v=1"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(__dirname, '..', 'site', 'order.html'), html);
console.log('site/order.html — собрано');
