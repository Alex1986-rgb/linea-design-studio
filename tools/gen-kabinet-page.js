#!/usr/bin/env node
'use strict';
/**
 * Кабинет клиента: site/kabinet/index.html (одна страница-приложение, js/kabinet.js ← api/kabinet.php, вход — api/vhod.php)
 * и site/vhod/index.html (вход для всех ролей = тот же кабинет). Каркас — site-shell.js, noindex, вне sitemap.
 *   node tools/gen-kabinet-page.js
 * На GitHub Pages приёмника нет (нет <meta name="linea-api">) — страница честно говорит, что кабинет работает на основном сайте.
 * Тексты условий (пересчёт суммы, круги правок) — из TERMS, руками не пишутся.
 */
const fs = require('fs');
const path = require('path');
const SHELL = require('./site-shell.js');

function page(u, canonical, title) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
${SHELL.head(u, { title, desc: 'Кабинет клиента LINEA: дизайн-проект, вопросы и правки, ремонт по проекту, документы.', canonical })}
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<link rel="stylesheet" href="${u}css/brigady.css?v=2">
<link rel="stylesheet" href="${u}css/kabinet.css?v=1">
</head>
<body class="kab-body">
${SHELL.header(u, null)}

<main class="kab" id="kab" aria-live="polite">
  <div class="wrap"><p class="kab-load">Открываем кабинет…</p></div>
</main>

<nav class="kab-tabbar" id="kabBar" hidden aria-label="Разделы кабинета">
  <a href="#/" data-r="o"><span aria-hidden="true">▦</span>Объекты</a>
  <a href="#/docs" data-r="docs"><span aria-hidden="true">▤</span>Документы</a>
  <a href="#/uvedomleniya" data-r="uv"><span aria-hidden="true">◔</span>Уведомления<b id="kabBell" hidden></b></a>
  <a href="#/profil" data-r="pr"><span aria-hidden="true">◉</span>Профиль</a>
</nav>

<div class="kab-modal" id="kabCode" hidden role="dialog" aria-modal="true" aria-labelledby="kabCodeH">
  <div class="kab-modal-in">
    <h2 id="kabCodeH">Подтвердите кодом из письма</h2>
    <p id="kabCodeTxt">Это действие юридически значимо — подтвердите, что это вы.</p>
    <form id="kabCodeF">
      <label class="kab-f" id="kabCodeMailL" hidden>Почта<input type="email" name="email" autocomplete="email"></label>
      <div class="kab-row"><button class="btn sm" type="button" id="kabCodeSend">Получить код</button></div>
      <label class="kab-f">Код из письма<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="6 цифр"></label>
      <p class="kab-err" role="alert"></p>
      <div class="kab-row"><button class="btn" type="submit">Подтвердить</button><button class="btn ghost" type="button" id="kabCodeX">Отмена</button></div>
    </form>
  </div>
</div>

${SHELL.footer(u, null)}
<script type="application/json" id="kabTerms">${JSON.stringify({ areaRecalc: SHELL.TERMS.areaRecalc, roundsText: SHELL.TERMS.roundsText, rounds: SHELL.TERMS.rounds, wa: 'https://wa.me/79257338640', mail: 'optteem@mail.ru' })}</script>
<script src="${u}js/remont.js?v=3"></script>
<script src="${u}js/kabinet.js?v=1"></script>
</body>
</html>
`;
}

const root = path.join(__dirname, '..', 'site');
for (const [dir, title] of [['kabinet', 'Кабинет — LINEA'], ['vhod', 'Вход — LINEA']]) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, dir, 'index.html'), page('../', `${SHELL.BASE}/${dir}/`, title));
  console.log(`site/${dir}/index.html — собрано`);
}
