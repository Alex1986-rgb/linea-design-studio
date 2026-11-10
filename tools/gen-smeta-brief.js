#!/usr/bin/env node
'use strict';
/**
 * Бриф сметы на материалы — отдельным заказом: site/smeta/zakaz/index.html (+ site/js/smeta-brief.js).
 *
 *   node tools/gen-smeta-brief.js
 *
 * Решение владельца 09.11.2026: смету продаём и как самостоятельную услугу, без заказа дизайн-проекта. Цена та же, что у опции к проекту —
 * tools/site-shell.js → TERMS.addons.smeta (ставка, минимум, срок, «чего нет», «что прислать», «о точности» — всё оттуда, руками не вписывать).
 * Страница — посадочная форма (в индексе, canonical), на общем каркасе. Три шага: «Квартира и план» → «Проект или ответы „что где“» → «Контакты».
 * Приём — api/brief.php с meta.service = 'smeta' (заказ вида smeta, номер LN-…, кабинет, оплата до работы); мету linea-api («../../api/»)
 * вставляет tools/site-rebase.js при выкладке. Без приёмника (GitHub Pages, http) форма собирает архив и предлагает отправить его в WhatsApp.
 * Страница стоит в sitemap.xml (добавляет этот же скрипт); touch-sitemap.js проставляет дату — запускать последним.
 */
const fs = require('fs');
const path = require('path');
const SHELL = require('./site-shell.js');
const { BASE, TERMS } = SHELL;
const AS = TERMS.addons.smeta, SO = AS.solo;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cap = s => s[0].toUpperCase() + s.slice(1);

const u = '../../';
const title = `Смета на материалы отдельным заказом — ${AS.fromLine} | LINEA`;
const desc = `Смета на материалы по вашему проекту или плану: площадь, план с размерами, готовый проект либо ответы «что где» — и список черновых материалов на весь ремонт с расчётом в каждой строке. ${AS.fromLine}.`;
const canonical = `${BASE}/${SO.url}`;
const ld = { '@context': 'https://schema.org', '@graph': [
  { '@type': 'WebPage', name: 'Заказ сметы на материалы', url: canonical, isPartOf: { '@type': 'WebSite', name: 'LINEA', url: BASE + '/' } },
  { '@type': 'BreadcrumbList', itemListElement: [['LINEA', BASE + '/'], [AS.title, `${BASE}/smeta/`], ['Заказать отдельно', canonical]].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: c[1] })) },
] };

const css = `<style>
/* бриф сметы 09.11.2026: три шага, на каждый — один экран телефона */
.sz-h{padding:34px 0 8px}
.sz-h h1{font-family:var(--serif);font-weight:500;font-size:clamp(26px,4vw,40px);margin:6px 0 8px;line-height:1.2}
.sz-h .lead{color:var(--mut);max-width:680px;margin:0}
.sz-h .kicker{color:var(--gold);letter-spacing:5px;font-size:12px;text-transform:uppercase}
.sz-prog{margin:18px 0 0;max-width:760px}
.sz-prog-t{display:flex;justify-content:space-between;gap:12px;font-size:14px;color:var(--mut)}
.sz-prog-t b{color:var(--ink);font-weight:600}
.sz-seg{display:flex;gap:3px;margin-top:8px}
.sz-seg i{flex:1;height:5px;border-radius:3px;background:var(--line)}
.sz-seg i.on{background:var(--gold)}
#szw,.sz-h .wrap{max-width:760px}
#szw{padding-bottom:40px;color-scheme:dark}
#szw .panel{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:28px 32px;margin-bottom:16px}
#szw .panel h2{margin:0 0 6px;font-size:24px}
#szw [hidden]{display:none!important}
#szw .hint{font-size:14px;color:var(--mut);margin:0 0 14px;line-height:1.55}
#szw .qw{margin:-4px 0 10px;font-size:13px;line-height:1.45;color:var(--mut)}
.sz-note{border-left:3px solid var(--gold);padding:6px 0 6px 14px;margin:14px 0;color:var(--mut);font-size:14px;line-height:1.55}
.sz-note b{color:var(--ink)}
.sz-sum{border:1px solid var(--gold);border-radius:8px;padding:12px 16px;background:#c29a5b10;margin:16px 0 0}
.sz-sum .l{font-size:14px;color:var(--mut)}
.sz-sum b{display:block;font-family:var(--serif);font-size:28px;color:var(--gold2);font-weight:500;margin:2px 0}
.sz-sum p{margin:2px 0 0;font-size:13px;color:var(--mut)}
.sz-up{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:110px;padding:16px;border:2px dashed #5a4f3c;border-radius:8px;text-align:center;cursor:pointer;color:var(--ink);font-size:18px;background:#c29a5b0a;transition:.15s}
.sz-up:hover,.sz-up.over{border-color:var(--gold);background:#c29a5b18}
.sz-up small{color:var(--mut);font-size:14px}
.sz-up .ico{font-size:28px;line-height:1}
.sz-upw{position:relative}
.sz-upw input[type=file]{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden}
.sz-upw:focus-within .sz-up{outline:2px solid var(--gold);outline-offset:2px}
.sz-cam{display:none;margin-top:8px}
@media(hover:none) and (pointer:coarse){.sz-cam{display:block}}
.sz-cam label{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border:1px solid var(--line);border-radius:6px;width:100%;cursor:pointer;font-size:16px}
.sz-th{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;padding:0;list-style:none}
.sz-th li{position:relative;width:76px;height:76px;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--bg2);font-size:11px;color:var(--mut);display:flex;align-items:center;justify-content:center;text-align:center;padding:4px;box-sizing:border-box;word-break:break-all}
.sz-th img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sz-th button{position:absolute;top:0;right:0;width:44px;height:44px;border:0;background:none;padding:0;cursor:pointer;display:flex;align-items:flex-start;justify-content:flex-end}
.sz-th button i{display:block;width:24px;height:24px;border-radius:50%;background:#0F0E0Cdd;color:#EDE7DC;font-style:normal;font-size:13px;line-height:24px;text-align:center;margin:2px}
#szw label.t{display:block;font-size:13px;letter-spacing:.5px;color:var(--mut);margin:16px 0 6px}
#szw input[type=text],#szw input[type=tel],#szw input[type=email],#szw select,#szw textarea{min-height:48px;font-size:16px;box-sizing:border-box;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:4px;background:#ffffff0a;color:var(--ink);font-family:inherit}
#szw textarea{min-height:90px;line-height:1.5;resize:vertical}
#szw select option{background:#1B1812;color:var(--ink)}
.sz-err{color:#e8a87c;font-size:14px;margin:8px 0 0}
.sz-err:empty{display:none}
[aria-invalid=true]{border-color:#e8a87c!important}
.sz-mode{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0 6px;border:0;padding:0}
.sz-mode legend{font-size:14px;color:var(--mut);margin-bottom:8px;padding:0}
.sz-mode label{position:relative;display:block}
.sz-mode input{position:absolute;opacity:0;inset:0;margin:0}
.sz-mode span{display:flex;flex-direction:column;gap:2px;justify-content:center;min-height:72px;padding:12px 14px;border:1px solid var(--line);border-radius:8px;cursor:pointer;line-height:1.35}
.sz-mode span b{font-weight:600;font-size:16px}
.sz-mode span small{color:var(--mut);font-size:13px}
.sz-mode input:checked+span{border-color:var(--gold);background:#2a241b}
.sz-mode input:focus-visible+span{outline:2px solid var(--gold);outline-offset:2px}
.sz-rt{border:1px solid var(--line);border-radius:8px;margin:0 0 10px;background:#c29a5b06}
.sz-rt>label{display:flex;gap:12px;align-items:center;min-height:52px;padding:6px 14px;cursor:pointer;font-size:16px}
.sz-rt>label input{width:22px;height:22px;flex:none;accent-color:var(--gold)}
.sz-rt-f{padding:2px 14px 14px;border-top:1px solid var(--line);display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
.sz-rt-f label.t{margin-top:12px}
.sz-rt-f .c1{grid-column:1/-1}
.sz-chips{display:flex;flex-wrap:wrap;gap:8px}
.sz-chips label{position:relative}
.sz-chips input{position:absolute;opacity:0;inset:0;margin:0}
.sz-chips span{display:inline-flex;align-items:center;min-height:44px;padding:6px 16px;border-radius:22px;border:1px solid var(--line);cursor:pointer;font-size:15px}
.sz-chips input:checked+span{border-color:var(--gold);color:var(--gold2);background:#2a241b}
.sz-chips input:focus-visible+span{outline:2px solid var(--gold);outline-offset:2px}
.sz-chk{display:flex;gap:12px;align-items:flex-start;cursor:pointer;min-height:44px;padding:6px 0;font-size:15px;line-height:1.45}
.sz-chk input{width:22px;height:22px;margin:1px 0 0;flex:none;accent-color:var(--gold)}
.sz-row3{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
.sz-recap{border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:0 0 16px}
.sz-recap h3{margin:0 0 4px;font-size:16px;font-family:var(--sans);font-weight:600}
.sz-recap p{margin:0 0 8px;font-size:13px;color:var(--mut)}
.sz-recap ol{margin:0;padding:0 0 0 20px}
.sz-recap li{margin:8px 0;font-size:14px;line-height:1.5}
.sz-recap li b{color:var(--gold2);font-weight:600}
.sz-recap .fix{margin-left:6px;min-height:32px;font-size:13px;padding:4px 10px}
.sz-next{margin:16px 0 0;padding:14px 16px 14px 36px;border:1px solid var(--line);border-radius:8px;color:var(--mut);font-size:14px;line-height:1.55}
.sz-next h3{margin:0 0 6px -20px;font-size:15px;color:var(--ink);font-family:var(--sans);font-weight:600}
.sz-next li{margin:4px 0}
.sz-send{width:100%;min-height:54px;font-size:16px;margin-top:16px}
.sz-nav{position:sticky;bottom:0;z-index:5;background:linear-gradient(transparent,var(--bg) 30%);padding:14px 0 12px;display:flex;gap:10px}
.sz-nav .btn{margin:0;min-height:50px;font-size:15px}
.sz-nav #szNext{flex:1}
.sz-nav.last{position:static;background:none}
.sz-draft{font-size:13px;color:var(--gold2);margin:10px 0 0}
.sz-draft button{background:none;border:0;color:var(--gold);text-decoration:underline;cursor:pointer;font:inherit;padding:0}
.sz-saved{font-size:13px;color:var(--gold2)}
.sz-saved:empty{display:none}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:640px){
  #szw .panel{padding:20px 16px}
  .sz-mode{grid-template-columns:1fr}
  .sz-rt-f{grid-template-columns:1fr}
  .sz-row3{grid-template-columns:1fr}
}
</style>`;

const needList = items => `<ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
${SHELL.head(u, { title, desc, canonical, extra: `\n<script type="application/ld+json">${JSON.stringify(ld)}</script>` })}
${css}
</head>
<body>
${SHELL.beta(u)}

${SHELL.header(u, null)}

<section class="sz-h">
  <div class="wrap">
    <div class="kicker">Смета на материалы · отдельным заказом</div>
    <h1>Смета на материалы по вашему проекту или плану</h1>
    <p class="lead">Дизайн-проект у нас заказывать не нужно. Площадь, план с размерами и либо ваш готовый проект, либо пара ответов «что где отделано» — и вы получаете список покупок на весь ремонт с количеством. Цена ${esc(AS.fromLine)}; срок — ${esc(SO.term)}.</p>
    <div class="sz-prog" id="szProg" aria-live="polite">
      <div class="sz-prog-t"><span id="szStep">Шаг 1 из 3</span><b id="szName">Квартира и план</b></div>
      <div class="sz-seg" id="szSeg" aria-hidden="true"><i class="on"></i><i></i><i></i></div>
      <span class="sr-only" id="szLive"></span>
    </div>
  </div>
</section>

<form class="wrap" id="szw" novalidate onsubmit="return false">

  <!-- 1. Квартира и план -->
  <section class="panel" data-step="0" aria-labelledby="szh0">
    <h2 id="szh0">Квартира и план</h2>
    <p class="hint">Площадь нужна для суммы, план с размерами — для количеств. Это обязательные данные.</p>
    <label class="t" for="szArea" style="margin-top:0">Площадь квартиры, м² <span style="text-transform:none;letter-spacing:0">— можно примерно</span></label>
    <input type="text" id="szArea" inputmode="decimal" autocomplete="off" placeholder="например, 62" aria-describedby="szAreaW szAreaErr" required aria-required="true">
    <p class="qw" id="szAreaW">Зачем спрашиваем: по площади считается сумма — ${esc(AS.rateText)}, не меньше ${esc(AS.minText)}; точные площади помещений берём из плана.</p>
    <p class="sz-err" id="szAreaErr" role="alert"></p>
    <div class="sz-sum" id="szSum" aria-live="polite"><div class="l" id="szSumL">Сумма за вашу площадь</div><b id="szSumV">${esc(AS.fromLine)}</b><p id="szSumN">${esc(AS.rateText)} × площадь, не меньше ${esc(AS.minText)} (как за ${AS.minArea} м²). Укажите площадь — сумма появится сразу. Оплата до начала работы.</p></div>

    <label class="t" for="szFilePlan">План квартиры с размерами</label>
    <div class="sz-upw">
      <label class="sz-up" id="szDropPlan" for="szFilePlan"><span class="ico" aria-hidden="true">📎</span><b id="szPlanT">Загрузить план</b><small>PDF, скан или фото, чтобы читались размеры</small></label>
      <input type="file" id="szFilePlan" multiple accept="image/*,.heic,.heif,.pdf,.dwg,.dxf" aria-describedby="szPlanW szPlanErr">
    </div>
    <div class="sz-cam sz-upw"><label for="szCamPlan"><span aria-hidden="true">📷</span> Сфотографировать план</label><input type="file" id="szCamPlan" accept="image/*" capture="environment"></div>
    <p class="qw" id="szPlanW" style="margin-top:10px">Зачем спрашиваем: сколько квадратных метров стен, пола и потолка в каждом помещении, где проёмы и мокрые зоны. План застройщика, БТИ или листок от руки — лишь бы читались размеры.</p>
    <ul class="sz-th" id="szPlanList" aria-label="Загруженный план"></ul>
    <p class="sz-err" id="szPlanErr" role="alert"></p>
    <div class="sz-note"><b>Плана нет?</b> Измерьте каждую стену по полу от угла до угла рулеткой, нарисуйте контур от руки и сфотографируйте листок — этого достаточно. Окна и двери: ширина и расстояние до ближайшего угла.</div>
  </section>

  <!-- 2. Проект или ответы -->
  <section class="panel" data-step="1" hidden aria-labelledby="szh1">
    <h2 id="szh1">Проект или ответы «что где»</h2>
    <p class="hint">От этого зависит точность. ${esc(SO.accuracy)}.</p>
    <fieldset class="sz-mode">
      <legend>Что у вас есть</legend>
      <label><input type="radio" name="szMode" value="project"><span><b>У меня есть проект</b><small>считаем по его листам</small></span></label>
      <label><input type="radio" name="szMode" value="answers"><span><b>Проекта нет</b><small>короткий опрос «что где»</small></span></label>
    </fieldset>
    <p class="sz-err" id="szModeErr" role="alert"></p>

    <div id="szProject" hidden>
      <p class="qw">Зачем спрашиваем: на листах проекта уже есть отделка каждой поверхности, электрика и сантехника — количества берём оттуда, без догадок.</p>
      <div class="sz-upw">
        <label class="sz-up" id="szDropProj" for="szFileProj"><span class="ico" aria-hidden="true">📐</span><b id="szProjT">Загрузить файлы проекта</b><small>PDF или изображения листов</small></label>
        <input type="file" id="szFileProj" multiple accept="image/*,.heic,.heif,.pdf,.dwg,.dxf" aria-describedby="szProjErr">
      </div>
      <ul class="sz-th" id="szProjList" aria-label="Загруженные листы проекта"></ul>
      <p class="sz-err" id="szProjErr" role="alert"></p>
      <div class="sz-note"><b>Какие листы нужны.</b> ${esc(cap(SO.needProject[0]))}. ${esc(SO.noCheck)}.</div>
      <label class="t" for="szNoteP">Что учесть <span style="text-transform:none;letter-spacing:0">— по желанию</span></label>
      <textarea id="szNoteP" rows="3" placeholder="Например: стены неровные, штукатурка слоем 30 мм; стяжка 50 мм"></textarea>
    </div>

    <div id="szAnswers" hidden>
      <p class="hint" style="margin-top:6px">Отметьте типы помещений в квартире и чем они отделаны. «Не знаю» — тоже ответ: посчитаем по типовому решению и пометим это в смете.</p>
      <div id="szRooms"></div>
      <p class="sz-err" id="szRoomsErr" role="alert"></p>
      <div class="sz-row3">
        <div><label class="t">Электрику считать?</label>
          <div class="sz-chips" role="radiogroup" aria-label="Электрику считать?" id="szElec"></div>
          <p class="qw" style="margin-top:6px">Зачем спрашиваем: кабель, подрозетники, розетки и автоматы щита — отдельный раздел сметы.</p></div>
        <div><label class="t">Сантехнику считать?</label>
          <div class="sz-chips" role="radiogroup" aria-label="Сантехнику считать?" id="szPlumb"></div>
          <p class="qw" style="margin-top:6px">Зачем спрашиваем: трубы, фитинги, приборы — отдельный раздел сметы.</p></div>
      </div>
      <div class="sz-row3">
        <div><label class="t" for="szH">Высота потолков, м</label>
          <input type="text" id="szH" inputmode="decimal" autocomplete="off" placeholder="например, 2,7" aria-describedby="szHW">
          <label class="sz-chk" style="margin-top:4px"><input type="checkbox" id="szHUnk"><span>Не знаю</span></label>
          <p class="qw" id="szHW">Зачем спрашиваем: от высоты зависит площадь стен и расход краски, обоев и плитки. Не знаете — возьмём типовую для вашего дома.</p></div>
        <div><label class="t" for="szState">Состояние квартиры</label>
          <select id="szState"></select>
          <p class="qw" style="margin-top:6px">Зачем спрашиваем: что убираем, а что остаётся — это меняет объём черновых материалов.</p></div>
      </div>
      <label class="t" for="szNoteA">Что учесть <span style="text-transform:none;letter-spacing:0">— по желанию</span></label>
      <textarea id="szNoteA" rows="3" placeholder="Например: штукатурка слоем 30 мм, стяжка 50 мм; на кухне плитка только фартуком"></textarea>
    </div>
  </section>

  <!-- 3. Контакты -->
  <section class="panel" data-step="2" hidden aria-labelledby="szh2">
    <h2 id="szh2">Куда прислать смету</h2>
    <div class="sz-recap" id="szRecap" hidden></div>
    <div class="sz-sum"><div class="l" id="szSumL2">Сумма</div><b id="szSumV2">—</b><p id="szSumN2"></p></div>
    <label class="t" for="szName1">Как к вам обращаться</label>
    <input type="text" id="szName1" autocomplete="name">
    <div class="sz-row3">
      <div><label class="t" for="szPhone">Телефон</label><input type="tel" id="szPhone" autocomplete="tel" inputmode="tel" placeholder="+7 900 000-00-00" aria-describedby="szContactErr"></div>
      <div><label class="t" for="szEmail">E-mail <span style="text-transform:none;letter-spacing:0">— можно вместо телефона</span></label><input type="email" id="szEmail" autocomplete="email" placeholder="you@mail.ru" aria-describedby="szContactErr"></div>
    </div>
    <p class="qw" style="margin-top:6px">Зачем спрашиваем: на почту придёт ссылка на заказ, а файлы сметы появятся в кабинете.</p>
    <p class="sz-err" id="szContactErr" role="alert"></p>
    <label class="sz-chk" style="margin-top:12px"><input type="checkbox" id="szConsent" aria-describedby="szConsentErr"><span>Даю согласие на обработку персональных данных на условиях <a href="${u}soglasie/" target="_blank" rel="noopener">согласия</a> и <a href="${u}policy/" target="_blank" rel="noopener">политики</a>.</span></label>
    <p class="sz-err" id="szConsentErr" role="alert"></p>
    <div class="sz-next"><h3>Что будет дальше</h3><ol>
      <li>Сумма уже посчитана по вашей площади — подтверждаем её в заказе до оплаты</li>
      <li>Вы оплачиваете картой или СБП либо по счёту — расчёт начинается после оплаты</li>
      <li>${esc(SO.termLine)}. Файлы (${esc(AS.format)}) появятся в кабинете, письмо придёт на почту</li></ol>
      <p style="margin:8px 0 0">${esc(AS.priceNote)}. ${esc(SO.noCheck)}.</p></div>
    <button class="btn sz-send" id="szSend" type="button">Собрать заказ сметы</button>
    <div id="szBar" hidden style="height:6px;background:rgba(201,164,95,.18);border-radius:3px;overflow:hidden;margin:12px 0 4px"><i style="display:block;height:100%;width:0;background:#C9A45F;transition:width .2s"></i></div>
    <p class="hint" id="szUp" role="status" aria-live="polite" hidden></p>
    <div aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden"><label>Сайт <input type="text" id="szHp" tabindex="-1" autocomplete="off"></label></div>
  </section>

  <!-- 4. Готово без приёмника -->
  <section class="panel" data-step="3" hidden aria-labelledby="szh3">
    <h2 id="szh3">Заказ собран — отправьте его нам</h2>
    <p class="hint" id="szManual">Через сайт отправить не получилось (или у страницы нет приёмника). Скачайте архив и пришлите его в <a href="https://wa.me/79257338640" target="_blank" rel="noopener">WhatsApp на +7 925 733-86-40</a> или на <a href="mailto:optteem@mail.ru">optteem@mail.ru</a>.</p>
    <button class="btn sz-send" id="szDl" type="button">Скачать архив заказа</button>
    <p class="hint" style="margin-top:12px"><a id="szWa" href="https://wa.me/79257338640" target="_blank" rel="noopener">Текст заказа в WhatsApp</a> · <a id="szMail" href="mailto:optteem@mail.ru">письмом</a></p>
  </section>

  <p class="sz-draft" id="szDraft" hidden></p>
  <div class="sz-nav" id="szNav">
    <button class="btn ghost" id="szPrev" type="button" hidden>← Назад</button>
    <button class="btn" id="szNext" type="button">Дальше →</button>
  </div>
  <p class="sz-saved" id="szSaved" aria-live="polite"></p>
</form>

${SHELL.footer(u, null)}
<script type="application/json" id="smetaTerms">${JSON.stringify({ rate: AS.rate, min: AS.min, minArea: AS.minArea, rateText: AS.rateText, minText: AS.minText, title: AS.title, edition: '27.10.2026', maxMb: 100,
  line: AS.line, term: SO.term })}</script>
<script src="${u}js/smeta-brief.js?v=1"></script>
</body>
</html>
`;

const dir = path.join(__dirname, '..', 'site', 'smeta', 'zakaz');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'index.html'), html);

// sitemap: страница посадочная, в индексе
const smPath = path.join(__dirname, '..', 'site', 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8');
if (!sm.includes(canonical)) {
  sm = sm.replace('</urlset>', `  <url><loc>${canonical}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>\n</urlset>`);
  fs.writeFileSync(smPath, sm);
}
console.log('site/smeta/zakaz/index.html — собрано');
