'use strict';
// ================================================================
// LINEA · документы ландшафтного альбома (HTML) и входы в папку
// ================================================================
const fs = require('fs');
const path = require('path');
const BOM = require('./land-bom');
const VAL = require('./land-validate');

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nm = v => String(v).replace('.', ',');
const money = BOM.money;

const CSS = `body{font-family:Inter,"Helvetica Neue",Arial,sans-serif;margin:0;background:#FAF9F6;color:#2E2A26;padding:48px 24px;line-height:1.55}
main{max-width:940px;margin:0 auto;background:#fff;border:1px solid #E5E0D6;padding:48px 56px}
h1{font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:30px;margin:0 0 6px}
h2{font-family:Georgia,serif;font-size:20px;margin:34px 0 10px;border-bottom:1px solid #E5E0D6;padding-bottom:6px}
h3{font-family:Georgia,serif;font-size:16px;margin:22px 0 6px}
.sub{color:#7A756D;margin:0 0 24px;font-size:14px}
table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0 18px}
td,th{border:1px solid #E5E0D6;padding:7px 10px;text-align:left;vertical-align:top}
th{background:#F1EDE4;font-weight:600}
td.k{width:190px;color:#7A756D;background:#FBFAF7}
td.num,th.num{text-align:right;white-space:nowrap}
tr.sec td{background:#2E2A26;color:#EDE7DC;font-weight:600}
tr.tot td{background:#F1EDE4;font-weight:700}
ul,ol{margin:6px 0 14px;padding-left:22px}
li{margin:4px 0}
.card{border:1px solid #E5E0D6;padding:16px 20px;margin:12px 0;background:#FBFAF7}
.warn{border-left:3px solid #C0392B;background:#FDF5F4}
.ok{border-left:3px solid #4E8464;background:#F5F9F5}
.mut{color:#7A756D;font-size:13px}
.note{color:#7A756D;font-size:12px;border-top:1px solid #E5E0D6;padding-top:14px;margin-top:28px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:12px 0}
.kpi{border:1px solid #E5E0D6;background:#FBFAF7;padding:12px 14px}
.kpi b{display:block;font-size:22px;font-family:Georgia,serif}
footer{max-width:940px;margin:14px auto 0;color:#9A937F;font-size:11px;letter-spacing:2px}
a{color:#2E2A26}
@media print{body{padding:0}main{border:0;padding:24px}}`;

const page = (title, body, sub) => `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — LINEA</title><style>${CSS}</style></head><body><main>
<h1>${esc(title)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
${body}
</main><footer>LINEA · ЛАНДШАФТНЫЙ ПРОЕКТ</footer></body></html>`;

function build({ M, brief, author, date, sheets, outDir }) {
  const B = brief, files = [];
  const V = VAL.validate(B);
  const A = V.areas;
  const est = BOM.estimate(B);
  const plants = BOM.plantsTotal(B);
  const bld = BOM.buildingsRows();
  const bldTotal = bld.reduce((s, r) => s + r[2] * r[3], 0);
  const write = (rel, html) => { const abs = path.join(outDir, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, html); files.push(rel); };

  // ---------- пояснительная записка ----------
  const zt = B.zones.map(z => `<tr><td>${esc(z.name)}</td><td class="num">${Math.round(z.w * z.d)} м²</td><td>${esc(z.idea)}</td></tr>`).join('');
  write('00-obshchie-dannye/poyasnitelnaya-zapiska.html', page('Пояснительная записка', `
<div class="grid">
<div class="kpi"><b>${B.site.area} м²</b><span class="mut">площадь участка (${nm((B.site.area / 100).toFixed(2))} сотки)</span></div>
<div class="kpi"><b>${A.lawn} м²</b><span class="mut">газон после благоустройства</span></div>
<div class="kpi"><b>${A.bed} м²</b><span class="mut">цветники и куртины</span></div>
<div class="kpi"><b>${plants.qty}</b><span class="mut">растений по ведомости</span></div>
</div>

<h2>1. Исходные данные</h2>
<p>Участок ${nm(B.site.width)} × ${nm(B.site.depth)} м с существующим жилым домом ${nm(8.5)} × ${nm(10)} м. Дом двухэтажный, с мансардным этажом под ломаной крышей: тёмно-коричневая штукатурка «шуба», кремовые обрамления окон и межэтажный пояс, цоколь светлой плиткой под кирпич, коричневая металлочерепица, белые водостоки. <b>Дом, крыльцо с навесом, навес для автомобилей и беседка сохраняются без изменений</b> — проект работает только с территорией.</p>
<p>Учтено по фотофиксации и схеме заказчика: мощение въезда и парадной дорожки, отмостка по периметру дома, рядовая посадка туи вдоль северной границы, две ивы шаровидные на штамбе у въезда, молодые плодовые деревья в задней части, кусты роз у крыльца, забор из профлиста по трём сторонам, откатные ворота и калитка, воздушная линия электропередачи вдоль северной границы, уклон местности в сторону задней границы с открытым видом на поле.</p>
<p>Проблемы существующего состояния: два ржавых металлических ларя и остатки стройматериалов, деревянный каркас у торца дома, куртины золотарника и зонтичных сорняков по границам, вытоптанный и прореженный газон, сушилка и мангал стоят посреди будущей зоны отдыха, голый профлист забора визуально давит на участок.</p>

<h2>2. Концепция</h2>
<p>Участок делится на две продольные полосы. <b>Южная — техническая:</b> от ворот вдоль границы идёт проезд шириной 4,0 м к гаражу на два автомобиля 10 × 6 м, который ставится за домом; рядом с гаражом — хозпостройка с дровником и ягодник. <b>Северная и западная — жилая:</b> беседка слева от дома между воротами и крыльцом, патио под перголой у западной стены дома, дальше баня с террасой и купелью, костровая площадка с видом на поле, хозпостройка с дровником в дальнем северо-западном углу.</p>
<p>Главный приём — разведение потоков: автомобиль доезжает до гаража, не пересекая зону отдыха и беседку; хозяйственная тачка идёт по своей дорожке за ширмой. И при этом <b>от дома к задней границе держится открытая перспектива</b>: западная часть не застраивается, вид на поле и вечернее солнце остаются главным ресурсом участка.</p>
<p>Стиль решения — сдержанный современный сад: простая геометрия дорожек, крупные массивы одного растения вместо коллекции по одному кусту, три-четыре повторяющихся вида как «рифма» по всему участку. Цветовая гамма подобрана под тёмный фасад дома: белый, кремовый, серебристо-голубой и пурпурный (дёрен «Elegantissima», пузыреплодник «Diabolo», яблоня «Royalty», злаки и лаванда) — на коричневом фоне они читаются, а летний зелёный не сливается со стеной.</p>

<h2>3. Функциональное зонирование</h2>
<table><tr><th>Зона</th><th class="num">Площадь</th><th>Замысел</th></tr>${zt}</table>

<h2>4. Дорожки и покрытия</h2>
<p>Проезд к гаражу выполняется в усиленной конструкции (брусчатка 80 мм, основание ЩПС 250 мм) — он держит легковой автомобиль. Пешеходные дорожки идут отдельно: от крыльца к беседке, от дома через патио к бане и террасе, от бани к костровой площадке. Хозяйственный проход к постройке и грядам убран за ширму и не пересекает зону отдыха.</p>
<table>
<tr><th>Покрытие</th><th class="num">Площадь</th><th>Где</th></tr>
<tr><td>Существующее мощение (сохраняется)</td><td class="num">${A.paveOld} м²</td><td>въезд, парковка, парадная дорожка, отмостка</td></tr>
<tr><td>Новое мощение брусчаткой</td><td class="num">${(A.paveNew + A.path).toFixed(1)} м²</td><td>патио, дорожки, площадки</td></tr>
<tr><td>Отсыпка гранитная и шаговые дорожки</td><td class="num">${A.gravel} м²</td><td>тропа к костровищу, хозяйственный проезд, огород</td></tr>
<tr><td>Газон</td><td class="num">${A.lawn} м²</td><td>парадная часть, поляна, сад</td></tr>
<tr><td>Цветники и куртины</td><td class="num">${A.bed} м²</td><td>по всему участку</td></tr>
<tr><td>Живые изгороди</td><td class="num">${A.hedge} м² (${A.hedgeLen} п.м)</td><td>границы участка</td></tr>
<tr><td>Гряды</td><td class="num">${A.veg} м²</td><td>огород</td></tr>
</table>

<h2>5. Вертикальная планировка и вода</h2>
<p>За условный ноль принята отметка мощёной отмостки у крыльца. Общий уклон участка — в сторону задней границы, перепад около ${nm(B.site.relief.fall)} м на ${nm(B.site.depth)} м (${nm(B.site.relief.grade)} %). Это благоприятный рельеф: вода уходит от дома самотёком, задача проекта — организовать её сбор и не дать застаиваться в нижней части.</p>
<ul>
<li>Вода с кровли собирается четырьмя дождеприёмниками под водосточными выпусками и уходит трубой Ø 110 в дренажный колодец в нижней точке участка.</li>
<li>Пристенный дренаж дома и дрена вдоль западной границы разгружают участок от верховодки после ливней.</li>
<li>Приём воды — два дренажных тоннеля по 300 л в самой низкой части, поле рассеивания под газоном.</li>
<li>Площадки мостятся с уклоном 0,005–0,01 от построек, газон — не менее 0,005.</li>
</ul>

<h2>6. Постройки</h2>
<table><tr><th>Постройка</th><th class="num">Габарит</th><th>Состав и отделка</th></tr>
${B.buildingsNew.map(b => `<tr><td>${esc(b.name)}</td><td class="num">${nm(b.w)} × ${nm(b.d)} м</td><td>${esc(b.spec)}</td></tr>`).join('')}
</table>
<p class="mut">Отступы выдержаны по СП 53.13330.2019 (п. 6.7): хозяйственные постройки и баня — не ближе 1,0 м от границы участка. Все постройки решаются в отделке дома, чтобы участок читался как одно целое.</p>

<h2>7. Озеленение</h2>
<p>Подбор ассортимента исходит из трёх ограничений: зона зимостойкости 4, разное освещение по сторонам дома и воздушная линия вдоль северной границы, под которой нельзя сажать ничего выше 3 м.</p>
<ul>
<li><b>Границы.</b> Профлист закрывается зелёным экраном: туевая изгородь продлевается по северной стороне, по южной идёт дёрен белый «Elegantissima», по западной — только низкая свободная группа спиреи и пузыреплодника, чтобы не потерять вид.</li>
<li><b>Тень.</b> Северная полоса у беседки — теневой миксбордер: хосты, страусник, астильбы, бруннера, герань.</li>
<li><b>Солнце.</b> Южная сторона и поляна — гортензии, спиреи, злаки, лилейники, эхинацея, лаванда, очитки.</li>
<li><b>Структура зимой.</b> Хвойные акценты (ель «Glauca Globosa», сосна горная, можжевельник «Blue Arrow») и злаки, которые не срезаются до весны.</li>
<li><b>Плодовые и ягоды.</b> Существующие деревья сохраняются с санитарной обрезкой, добавляются яблоня и груша; ягодник (смородина, крыжовник, жимолость) вынесен в солнечную полосу у хозяйственного двора, три гряды — в дальний северо-западный угол.</li>
</ul>
<p>Всего по ведомости — ${plants.qty} растений ${plants.list.length} наименований на сумму ${money(plants.total)} ₽.</p>

<h2>8. Освещение и полив</h2>
<p>Освещение разделено на четыре группы: парадная, маршрутная, зона отдыха и хозяйственно-охранная. Это позволяет держать участок «дежурно» освещённым по дорожкам, не включая свет во всём саду. Кабель — в гофре на глубине 0,5 м, каждая группа со своим УЗО 30 мА.</p>
<p>Автополив — шесть зон: два газонных контура на роторах, веерные в парадной части, три капельных контура (цветники, огород, живые изгороди). Управление контроллером с датчиком дождя, консервация продувкой.</p>

<h2>9. Очерёдность и бюджет</h2>
<table>
<tr><th>Что</th><th class="num">Сумма</th></tr>
<tr><td>Работы и материалы благоустройства</td><td class="num">${money(est.total)} ₽</td></tr>
<tr><td>Посадочный материал</td><td class="num">${money(plants.total)} ₽</td></tr>
<tr class="tot"><td>Итого ландшафтные работы</td><td class="num">${money(est.total + plants.total)} ₽</td></tr>
<tr><td>Постройки (баня, хозблок, пергола, купель, мангал) — отдельным договором</td><td class="num">${money(bldTotal)} ₽</td></tr>
</table>
<p>Проект разбит на две очереди: первый сезон — подготовка, дренаж, вертикальная планировка, мощение, постройки, магистрали света и полива; второй — озеленение, газон, гряды, ягодник, чистовое освещение. Такая последовательность обязательна: все земляные и «грязные» работы должны закончиться до посадок.</p>

<h2>10. Границы проекта</h2>
<ul>
<li>Геодезическая съёмка не выполнялась: отметки условные, до земляных работ нужна нивелировка.</li>
<li>Размеры участка и положение дома приняты по схеме заказчика — требуется контрольный замер.</li>
<li>Конструктивные решения бани, хозблока и перголы разрабатываются отдельно; в проекте они показаны габаритами и привязками.</li>
<li>Гидрогеология (уровень грунтовых вод) не исследовалась; при обнаружении верховодки выше 1,0 м дренаж потребует пересчёта.</li>
</ul>
<p class="note">Разработал: ${esc(author.name)}, ${esc(author.role)} · ${esc(author.phone)} · ${esc(author.email)} · ${esc(date)}</p>
`, `${B.meta.address} · ${B.site.area} м² · стадия ${B.meta.stage}`));

  // ---------- ведомость растений ----------
  const prows = plants.list.map((r, i) => `<tr><td class="num">${i + 1}</td><td>${esc(r.ru)}</td><td class="mut">${esc(r.lat)}</td><td>${esc(r.form)}</td><td>${esc(r.size)}</td><td class="num">${r.qty}</td><td class="num">${r.price ? money(r.price) : '—'}</td><td class="num">${r.sum ? money(r.sum) : '—'}</td></tr>`).join('');
  write('07-vedomosti/vedomost-rasteniy.html', page('Ассортиментная ведомость посадочного материала', `
<table><tr><th class="num">№</th><th>Наименование</th><th>Латинское название</th><th>Форма</th><th>Размер</th><th class="num">Кол-во</th><th class="num">Цена, ₽</th><th class="num">Сумма, ₽</th></tr>
${prows}
<tr class="tot"><td colspan="5">Итого</td><td class="num">${plants.qty}</td><td></td><td class="num">${money(plants.total)}</td></tr></table>
<h2>Условия приёмки</h2>
<ul>
<li>Растения принимаются с закрытой корневой системой, ком без пересушки и разрушения, без механических повреждений коры.</li>
<li>Хвойные — с плотной хвоей без бурых пятен; листопадные — с живыми почками и здоровым камбием (проверяется срезом).</li>
<li>Замена сорта возможна только на равноценный по зимостойкости, размеру и срокам цветения, по согласованию с автором проекта.</li>
<li>Цены указаны розничные, на сентябрь 2026 года; при закупке партией в питомнике скидка обычно 15–25 %.</li>
</ul>`, `${plants.qty} растений · ${plants.list.length} наименований · зона зимостойкости 4`));

  // ---------- смета ----------
  let secHtml = '';
  let cur = null;
  est.rows.forEach(r => {
    if (r.sec !== cur) { cur = r.sec; secHtml += `<tr class="sec"><td colspan="6">${esc(cur)} — ${money(est.bySec.get(cur))} ₽</td></tr>`; }
    secHtml += `<tr><td>${esc(r.name)}</td><td>${esc(r.unit)}</td><td class="num">${nm(r.qty)}</td><td class="num">${r.mat ? money(r.mat) : '—'}</td><td class="num">${r.work ? money(r.work) : '—'}</td><td class="num">${money(r.sum)}</td></tr>`;
  });
  write('08-smeta/smeta.html', page('Смета на благоустройство участка', `
<div class="grid">
<div class="kpi"><b>${money(est.total + plants.total)} ₽</b><span class="mut">ландшафтные работы под ключ</span></div>
<div class="kpi"><b>${money(est.matTotal + plants.total)} ₽</b><span class="mut">материалы и растения</span></div>
<div class="kpi"><b>${money(est.workTotal)} ₽</b><span class="mut">работы</span></div>
<div class="kpi"><b>${money(bldTotal)} ₽</b><span class="mut">постройки, отдельный договор</span></div>
</div>
<table><tr><th>Наименование</th><th>Ед.</th><th class="num">Кол-во</th><th class="num">Материал, ₽</th><th class="num">Работа, ₽</th><th class="num">Сумма, ₽</th></tr>
${secHtml}
<tr class="sec"><td colspan="6">Посадочный материал</td></tr>
<tr><td>Растения по ассортиментной ведомости</td><td>компл</td><td class="num">${plants.qty}</td><td class="num">${money(plants.total)}</td><td class="num">—</td><td class="num">${money(plants.total)}</td></tr>
<tr class="tot"><td colspan="5">Итого ландшафтные работы</td><td class="num">${money(est.total + plants.total)}</td></tr>
</table>
<h2>Постройки — ориентировочно, отдельным договором</h2>
<table><tr><th>Наименование</th><th>Ед.</th><th class="num">Кол-во</th><th class="num">Сумма, ₽</th></tr>
${bld.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td class="num">${r[2]}</td><td class="num">${money(r[3] * r[2])}</td></tr>`).join('')}
<tr class="tot"><td colspan="3">Итого постройки</td><td class="num">${money(bldTotal)}</td></tr></table>
<div class="card"><b>Как читать смету.</b> Количества посчитаны по фактической геометрии проекта: площади покрытий, цветников и газона взяты из чертежей, количество растений — из ассортиментной ведомости. Если планировка меняется, числа пересчитываются автоматически, а не правятся вручную — расхождения между чертежом и сметой быть не может.</div>
<h2>Как уменьшить бюджет без потери качества</h2>
<ul>
<li>Разнести работы на два-три сезона по очередям (см. график) — самый безболезненный способ.</li>
<li>Автополив выполнить только магистралью и газонными зонами, капельные контуры добавить позже.</li>
<li>Проезд к гаражу сделать в первую очередь, а декоративное мощение дорожек — вторым сезоном.</li>
<li>Часть многолетников купить делёнками весной или вырастить из своих: экономия до 30 % по цветникам.</li>
<li>Костровую площадку и часть дорожек выполнить в отсыпке вместо брусчатки — минус около 70 тыс. ₽.</li>
<li>Хозблок и дровник собрать своими силами по типовому проекту.</li>
</ul>
<p class="mut">Цены — средняя полоса России, сентябрь 2026 г. Смета ориентировочная: точная стоимость определяется после замеров и коммерческих предложений подрядчиков.</p>`,
    `${B.meta.address} · расчёт по геометрии проекта`));

  // ---------- график работ ----------
  write('08-smeta/grafik-rabot.html', page('Календарный график работ', `
<h2>Первый сезон — «грязные» работы</h2>
<table><tr><th>Этап</th><th>Срок</th><th>Содержание</th></tr>
<tr><td>1. Подготовка</td><td>1 неделя</td><td>Вывоз мусора и металлолома, демонтаж каркаса, удаление сорных куртин, вынос разбивочной сетки в натуру, контрольный замер и нивелировка</td></tr>
<tr><td>2. Земляные работы</td><td>1–2 недели</td><td>Снятие дернины, черновая планировка с проектными уклонами, складирование плодородного грунта</td></tr>
<tr><td>3. Дренаж и ливнёвка</td><td>1 неделя</td><td>Траншеи, дождеприёмники, трубы, колодец, дренажные тоннели, обратная засыпка; отвод воды с кровли гаража</td></tr>
<tr><td>4. Подземные магистрали</td><td>3–5 дней</td><td>Кабель освещения в гофре, магистраль полива ПНД, гильзы под дорожками</td></tr>
<tr><td>5. Постройки</td><td>6–9 недель</td><td>Гараж на 2 автомобиля (плита, стены, кровля, ворота), баня с террасой, хозпостройка, пергола — параллельно с мощением</td></tr>
<tr><td>6. Мощение</td><td>2 недели</td><td>Основания, борта, брусчатка, отсыпки, ремонт просадок существующего мощения</td></tr>
</table>
<h2>Второй сезон — сад</h2>
<table><tr><th>Этап</th><th>Срок</th><th>Содержание</th></tr>
<tr><td>7. Плодородный грунт</td><td>3–4 дня</td><td>Завоз и распределение грунта под газон и цветники, финишная планировка</td></tr>
<tr><td>8. Посадки</td><td>1–2 недели</td><td>Деревья и кустарники, живые изгороди, цветники, мульчирование</td></tr>
<tr><td>9. Газон</td><td>1 неделя + 4–6 недель на всходы</td><td>Ремонт существующего газона, посев на нарушенных участках</td></tr>
<tr><td>10. Полив и свет</td><td>1 неделя</td><td>Дождеватели, капельные линии, контроллер, светильники, пусконаладка</td></tr>
<tr><td>11. Огород и хозяйственный двор</td><td>3–5 дней</td><td>Гряды-короба, ягодник, компостер, сушилка, шпалера-ширма</td></tr>
<tr><td>12. Приёмка</td><td>1 день</td><td>Проверка по чертежам, паспорта на оборудование, регламент ухода</td></tr>
</table>
<div class="card ok"><b>Правило очерёдности.</b> Посадки и газон делаются только после того, как по участку перестала ездить техника и закончены все земляные работы. Нарушение этого порядка — самая частая причина, по которой сад приходится переделывать через год.</div>
<h2>Сезонные окна</h2>
<ul>
<li>Земляные работы и мощение — с мая по октябрь, в сухую погоду.</li>
<li>Посадка контейнерных растений — апрель–октябрь, кроме жары выше +28 °C.</li>
<li>Посев газона — до 15 сентября, чтобы трава успела укорениться до морозов.</li>
<li>Пусконаладка автополива — после схода снега и до +5 °C осенью, консервация до устойчивых заморозков.</li>
</ul>`, 'Две очереди: инженерия и покрытия → сад'));

  // ---------- уход ----------
  write('09-uhod/uhod-po-sezonam.html', page('Уход за садом по сезонам', `
<h2>Первый год после посадки — критический</h2>
<ul>
<li>Полив: деревья — 30–40 л раз в неделю, кустарники — 15–20 л, цветники — по капельной линии через день. В жару частота удваивается.</li>
<li>Мульча обновляется до слоя 60 мм — она держит влагу и не даёт сорнякам подняться.</li>
<li>Подвязка деревьев снимается через сезон, чтобы не пережать ствол.</li>
<li>Подкормки в первый год — только после приживания, во второй половине лета, без азота.</li>
</ul>
<h2>Весна (апрель–май)</h2>
<ul>
<li>Снять зимние укрытия, убрать растительные остатки, срезать злаки и сухие стебли многолетников.</li>
<li>Санитарная обрезка деревьев и кустарников, формовка ив шаровидных, омолаживающая обрезка гортензий метельчатых на 2–3 почки.</li>
<li>Скарификация газона, подсев проплешин, первая подкормка азотным удобрением.</li>
<li>Запуск автополива, проверка форсунок и промывка фильтра.</li>
<li>Обработка от вредителей и профилактика грибковых заболеваний по плодовым.</li>
</ul>
<h2>Лето (июнь–август)</h2>
<ul>
<li>Стрижка газона раз в 5–7 дней на высоту 5–6 см, скошенное убирать.</li>
<li>Стрижка туевой изгороди — дважды за сезон (июнь и август), дёрена — после цветения.</li>
<li>Прополка цветников и подсыпка мульчи, удаление отцветших соцветий.</li>
<li>Подкормка комплексным удобрением в июне, калийно-фосфорным в конце августа.</li>
<li>Полив огорода и теплицы капельно, проветривание теплицы в жару.</li>
</ul>
<h2>Осень (сентябрь–октябрь)</h2>
<ul>
<li>Последняя стрижка газона в октябре, аэрация, осенняя подкормка без азота.</li>
<li>Уборка листвы с газона и мощения (с цветников листву можно оставить как укрытие).</li>
<li>Влагозарядковый полив деревьев и хвойных перед морозами — обязательно для хвойных.</li>
<li>Консервация автополива: продувка компрессором, слив из клапанов.</li>
<li>Побелка штамбов плодовых, установка защиты от грызунов.</li>
</ul>
<h2>Зима</h2>
<ul>
<li>Стряхивать мокрый снег с туй и можжевельника, чтобы не разваливались кроны; на зиму — мягкая обвязка.</li>
<li>Не сваливать снег с дорожек на цветники с лавандой и очитками — они не любят вымокания.</li>
<li>Реагенты на мощении не применять: соль убивает и швы, и растения по краям. Только песок или гранитная крошка.</li>
<li>В феврале — проверка обвязок и защиты от солнечных ожогов у хвойных с южной стороны.</li>
</ul>
<h2>Что нельзя делать</h2>
<ul>
<li>Стричь газон ниже 4 см — вылезет мох и сорняки.</li>
<li>Сажать под воздушной линией деревья выше 3 м.</li>
<li>Заваливать корневые шейки мульчей вплотную к стволу — начинается подпревание.</li>
<li>Складывать снег и стройматериалы на приствольные круги и дренажное поле.</li>
</ul>`, 'Регламент на первый и последующие годы'));

  // ---------- замечания и допущения ----------
  const li = arr => arr.length ? `<ul>${arr.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="mut">нет</p>';
  write('00-obshchie-dannye/zamechaniya-i-dopushcheniya.html', page('Замечания, допущения и вопросы к заказчику', `
<div class="card ${V.errors.length ? 'warn' : 'ok'}"><b>Автоматическая проверка планировки:</b> ошибок — ${V.errors.length}, предупреждений — ${V.warnings.length}, замечаний — ${V.notes.length}.
Проверяются наложения построек, покрытий, цветников и дорожек, отступы от границ по СП 53.13330.2019, ширина проходов, смыкание крон, высота посадок под воздушной линией и сходимость площадей.</div>
<h3>Ошибки</h3>${li(V.errors)}
<h3>Предупреждения</h3>${li(V.warnings)}
<h3>Замечания</h3>${li(V.notes)}

<h2>Допущения, принятые при проектировании</h2>
<p>Проект выполнен по фотографиям и рукописной схеме без выезда на объект. Ниже — всё, что принято «по умолчанию». Каждый пункт правится в один приём: меняется значение в исходных данных, и весь альбом со сметой пересобирается заново.</p>
<table>
<tr><th>Что принято</th><th>Значение</th><th>Как проверить</th></tr>
<tr><td>Размеры участка</td><td>${nm(B.site.width)} × ${nm(B.site.depth)} м = ${B.site.area} м²</td><td>рулетка по границам или выписка из ЕГРН</td></tr>
<tr><td>Габарит дома и его положение</td><td>8,5 × 10,0 м, ${nm(12)} м от улицы, ${nm(6)} м от северной границы</td><td>замер по цоколю и отступам</td></tr>
<tr><td>Габарит гаража</td><td>10,0 × 6,0 м, 4 м за домом, 1,0 м от южной границы</td><td>подтвердить размер и место по схеме</td></tr>
<tr><td>Ориентация по сторонам света</td><td>улица на востоке, задняя граница на западе (вид на закат)</td><td>компас в телефоне, встать спиной к воротам</td></tr>
<tr><td>Перепад высот</td><td>${nm(B.site.relief.fall)} м на длину участка, уклон к задней границе</td><td>нивелир или лазерный уровень с рейкой</td></tr>
<tr><td>Положение воздушной ЛЭП</td><td>вдоль северной границы, охранная зона 2 м</td><td>фотография пролёта и замер</td></tr>
<tr><td>Существующие деревья</td><td>2 ивы у въезда, туи по северной границе, 4 плодовых в задней части</td><td>отметить фактические стволы на плане</td></tr>
<tr><td>Климат</td><td>${esc(B.meta.region)}</td><td>подтвердить регион — от него зависит ассортимент</td></tr>
</table>

<h2>Вопросы, на которые нужен ответ заказчика</h2>
<ol>
<li>Гараж 10 × 6 м: нужны ли отопление, смотровая яма или подвал? Это меняет конструкцию плиты и стоимость.</li>
<li>Ворота гаража: две секции по 3,0 м (как в проекте) или одни широкие 5,0 м? Второй вариант дешевле, но теснее внутри.</li>
<li>Существующий навес у въезда сохраняется как гостевая парковка — или его планируется убрать после постройки гаража?</li>
<li>Баня 6,0 × 4,0 м — устраивает ли размер и место у северной границы?</li>
<li>Нужна ли детская площадка? В схеме её нет, но газон между беседкой и террасой бани (около 30 м²) под неё зарезервирован.</li>
<li>Огород: двух гряд и ягодника достаточно, или нужен полноценный огород — тогда придётся ужать газон в задней части?</li>
<li>Есть ли действующая скважина или колодец и какой у источника фактический расход? От этого зависит схема автополива.</li>
<li>Бюджет и очерёдность: делаем всё за один сезон или разносим на два-три этапа?</li>
</ol>
<p class="note">${esc(author.name)} · ${esc(author.role)} · ${esc(author.phone)} · ${esc(date)}</p>`,
    'Что проверить перед началом работ'));

  return files;
}

// ---------- входы в альбом ----------
function entries({ brief, author, date, sheets, files, outDir }) {
  const B = brief, out = [];
  const write = (rel, html) => { fs.writeFileSync(path.join(outDir, rel), html); out.push(rel); };
  const svgFiles = files.filter(f => f.endsWith('.svg'));
  const docs = files.filter(f => f.endsWith('.html'));
  const docTitle = f => ({
    '00-obshchie-dannye/poyasnitelnaya-zapiska.html': 'Пояснительная записка',
    '00-obshchie-dannye/zamechaniya-i-dopushcheniya.html': 'Замечания, допущения и вопросы к заказчику',
    '07-vedomosti/vedomost-rasteniy.html': 'Ассортиментная ведомость растений',
    '08-smeta/smeta.html': 'Смета на благоустройство',
    '08-smeta/grafik-rabot.html': 'Календарный график работ',
    '09-uhod/uhod-po-sezonam.html': 'Уход за садом по сезонам'
  }[f] || f);

  const listHtml = sheets.map((sh, i) => {
    const f = svgFiles[i];
    return `<li><span class="n">${String(i + 1).padStart(2, '0')}</span> <a href="${f}">${esc(sh.name)}</a> <em>${esc(sh.scaleHint || '')}</em></li>`;
  }).join('');

  write('index.html', `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ландшафтный проект · ${sheets.length} листов — LINEA</title><style>${CSS}
ol,ul.sheets{list-style:none;padding:0}
ul.sheets li{border-bottom:1px solid #EFEAE0;padding:9px 0;display:flex;gap:12px;align-items:baseline}
.n{font-family:Georgia,serif;color:#B4AB99;width:28px}
em{color:#9A937F;font-style:normal;font-size:12px;margin-left:auto}
</style></head><body><main>
<h1>Ландшафтный проект участка</h1>
<p class="sub">${esc(B.meta.address)} · ${B.site.area} м² · выпуск ${esc(date)}</p>
<div class="grid">
<div class="kpi"><b>${sheets.length}</b><span class="mut">листов чертежей A3</span></div>
<div class="kpi"><b>${docs.length}</b><span class="mut">документов и ведомостей</span></div>
<div class="kpi"><b>8</b><span class="mut">функциональных зон</span></div>
</div>
<p><a href="presentation.html"><b>Смотреть альбомом →</b></a> · <a href="print.html">версия для печати в PDF</a></p>
<h2>Чертежи</h2><ul class="sheets">${listHtml}</ul>
<h2>Документы</h2><ul class="sheets">${docs.map(d => `<li><a href="${d}">${esc(docTitle(d))}</a></li>`).join('')}</ul>
<p class="note">${esc(author.name)} · ${esc(author.role)} · ${esc(author.phone)} · ${esc(author.email)}</p>
</main><footer>LINEA · ЛАНДШАФТНЫЙ ПРОЕКТ</footer></body></html>`);

  write('presentation.html', `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ландшафтный проект — альбом · LINEA</title><style>
body{margin:0;background:#15130F;color:#EDE7DC;font-family:Inter,Arial,sans-serif}
header{padding:16px 22px;display:flex;gap:16px;align-items:center;border-bottom:1px solid #2C2822}
header b{font-family:Georgia,serif;font-weight:600;letter-spacing:1px}
.sp{margin-left:auto;color:#9A937F;font-size:13px}
.stage{padding:22px;display:flex;justify-content:center}
img{max-width:100%;max-height:80vh;background:#fff;box-shadow:0 20px 60px #0008}
nav{display:flex;gap:10px;justify-content:center;padding:0 22px 26px;flex-wrap:wrap}
button{background:#221F1A;color:#EDE7DC;border:1px solid #3A352C;padding:9px 16px;cursor:pointer;font-size:14px}
button:hover{background:#2E2A22}
.cap{text-align:center;color:#C9C0AE;padding:0 22px 12px;font-size:14px}
a{color:#C9B08A}
</style></head><body>
<header><b>LINEA</b><span class="sp" id="sp"></span></header>
<div class="stage"><img id="im" alt=""></div>
<div class="cap" id="cap"></div>
<nav><button onclick="go(-1)">← Назад</button><button onclick="go(1)">Вперёд →</button><a href="index.html"><button>Все файлы</button></a><a href="print.html"><button>Печать</button></a></nav>
<script>
const S=${JSON.stringify(sheets.map((sh, i) => ({ f: svgFiles[i], n: sh.name })))};
let i=0;
function draw(){const s=S[i];document.getElementById('im').src=s.f;document.getElementById('cap').textContent=(i+1)+' / '+S.length+' · '+s.n;document.getElementById('sp').textContent='Ландшафтный проект · ${esc(B.meta.address)}';}
function go(d){i=(i+d+S.length)%S.length;draw();}
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')go(1);if(e.key==='ArrowLeft')go(-1);});
draw();
</script></body></html>`);

  write('print.html', `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Ландшафтный проект — печать</title><style>
@page{size:A3 landscape;margin:0}
body{margin:0;background:#fff}
img{width:100%;display:block;page-break-after:always}
.t{padding:60px;font-family:Georgia,serif}
.t h1{font-size:38px;margin:0 0 10px}.t p{color:#7A756D;font-size:15px;margin:4px 0}
</style></head><body>
<div class="t"><h1>Ландшафтный проект участка</h1><p>${esc(B.meta.address)} · ${B.site.area} м²</p>
<p>${esc(author.name)} · ${esc(author.role)} · ${esc(author.phone)} · ${esc(author.email)}</p><p>${esc(date)}</p></div>
${svgFiles.map(f => `<img src="${f}" alt="">`).join('\n')}
</body></html>`);

  return out;
}

module.exports = { build, entries };
