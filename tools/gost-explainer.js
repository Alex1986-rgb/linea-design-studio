'use strict';
/**
 * Страница «Что в альбоме ещё не проверено» и её врезки на хабе и страницах альбомов.
 *
 * Правило раздела: каждое слово страницы подтверждается листом альбома, на который можно дать ссылку.
 *   • Числа читает tools/gost-open-issues.js из НАПЕЧАТАННОГО на листах (сводки, строки таблиц, пометка, штамп);
 *     данные из метаданных SVG, которых нет на бумаге, на страницу не попадают.
 *   • Цитаты вынимаются из листов регулярными выражениями вместе с номером листа.
 *   • Фразы, которые страница говорит своими словами, перечислены в CLAIMS и проверяются теми же листами при каждой
 *     сборке. Не нашлось — сборка падает, а не публикует то, чего в выпуске нет.
 *   • Слова «каждый», «всегда», «все», «полностью» страница о листах не пишет: там стоит пара «N из M», посчитанная
 *     по выпуску. Перевыпустят альбом, и N станет равно M, — страница сама покажет «M из M».
 *   • Чего страница не доказывает, сказано в разделе «Чего этот механизм не обещает».
 */

const SLUG = 'otkrytye-voprosy';
const RU_KINDS = ['Спорно', 'Отсутствует', 'Непонятно'];

// что страница говорит своими словами или цитирует; каждая фраза обязана находиться на листах обоих альбомов
// (имена — чтобы не считать индексы: Q ссылается на эти же выражения)
const R = {
  preliminary: /Комплект предварительный по пунктам этих таблиц\. Пока по пункту нет ответа или решения, показанное на указанном листе — допущение проектировщика, а не утверждённое решение\./,
  onSite: /ответ на которые лежит на объекте, а не за столом проектировщика/,
  decisionRule: /Пункты, ждущие решения человека, на объекте не закрываются/,
  note2: /Графа «Если решения нет» показывает состояние решения на листах; влияние на сроки и стоимость по пунктам не оценивалось\./,
  note3: /Пункт, по которому принято решение, при следующем выпуске комплекта из таблиц исключается\./,
  noOrder: /Что заказывается по размеру из задания, до закрытия пункта не заказывают/,
  qArchitect: /Архитектор — выполняет обмер, составляет акт контрольного обмера и подписывает результаты по размерам и конструкциям\./,
  qCustomer: /Заказчик или его представитель — передаёт документы \([^)]*\), подписывает акт\./,
  qForeman: /Прораб \(отвечает за проведение\) — назначает день и порядок обхода, открывает объект и освобождает помещения, ведёт это задание и реестр изменений\./,
  qTech: /Технадзор — при вскрытиях и обследованиях: фото с рулеткой до закрытия\./,
  noDecisions: /Проектных решений на обмере не принимают: обмер даёт факт, решения — по реестру открытых вопросов/,
  accept: /В пределах допуска пункта — принимается измеренное значение, лист перевыпускается, знак «\*» снимается\./,
  mismatch: /Больше допуска или контрольные промеры расходятся более чем на 2 % — промер повторяют; не подтвердилось — запись в реестр изменений \(дата, лист, было, стало, кто решил, подпись\), работы в этом месте не начинают\./,
  escalate: /Затронуты несущая стена, стояк, вентканал или мокрая зона — сразу владельцу раздела и ГИПу \(главному инженеру проекта\)/,
  noOral: /На объекте устно ничего не согласуется: каждое решение — записью в реестр с подписью/,
  surveyNote: /Пункт исключается из задания при следующем выпуске, когда акт подписан, значение внесено в проект и листы перевыпущены; знак «\*» у величины снимается только замером\./,
  stage1: /Этап 1\. До демонтажа/,
  offsite: /Документы и данные закупки/,
  headField: /№ Где Способ Что сделать Кто выполняет Точность Что пересчитается в альбоме Чем подтверждается Закрывает вопросы реестра/,
  headOff: /№ У кого, откуда Способ Что получить К какому сроку Что пересчитается в альбоме Чем подтверждается Закрывает вопросы реестра/,
  headReg: /№ Формулировка Вид Кто решает Если решения нет Лист, где это проявляется/,
  headChanges: /№ Дата Лист Было Стало Кто решил, подпись/,
  basis: /Основа листа: размеры сняты с/,
  assumed: /Знак «\*» — принято, не замерено и не подтверждено(?: \([^)]*\))?: [^.]*\./,
  legend: /«\*\*» — предложение проектировщика, заказчиком не утверждено(?: \([^)]*\))?/,
  // «пом.» внутри фразы — сокращение, а не конец предложения
  proposalNote: /Знак «\*\*» — предложение проектировщика, заказчиком не утверждено(?: \([^)]*\))?: (?:[^.]|(?<=пом)\.)*\./,
  heat: /\* тип и мощность — по теплотехническому расчёту/,
  seeRegistry: /См\. лист открытых вопросов \([^)]*\)/,
};
const CLAIMS = Object.values(R);
const Q = {
  ...R,
  stamp: /Общая площадь [\d,]+\* м² · \* размеры со скана, не замерены \(реестр — л\. [^)]*\)/,
  mark: /ПРЕДВАРИТЕЛЬНО · не для производства работ · открыто пунктов: \d+ \(реестр — л\. [^)]+\)/,
  lift: /Вертикальные размеры альбома: [^.]*?до потолка\)/,
  conflictHead: /Конфликты между разделами № Формулировка Разделы Статус Кто решает Если решения нет Лист, где это проявляется/,
};

function build(ctx) {
  const { ALBUMS, releases, H, esc, plural, word, page, BASE, crumbsLd } = ctx;
  const A = releases.map(({ a, r }) => ({ a, r, h: H[a.slug] }));
  for (const x of A) for (const re of CLAIMS) x.h.need(re);
  for (const x of A) {                                  // виды вопросов — только три названных
    const n = Object.entries(x.h.kinds).filter(([k]) => RU_KINDS.includes(k)).reduce((s, [, v]) => s + v, 0);
    if (n !== x.h.sum.open) throw new Error(`${x.a.slug}: у вопросов реестра есть вид, которого страница не называет (${JSON.stringify(x.h.kinds)})`);
  }

  const clip = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n)).replace(/[,;:—-]$/, '') + '…');
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const sheetHref = (u, h, no) => `${u}portfolio/${h.slug}/sheets/${encodeURIComponent(h.sheetFile(no))}`;
  const ln = (u, h, no, text) => h.sheetFile(no)
    ? `<a href="${sheetHref(u, h, no)}" target="_blank" rel="noopener">${text == null ? 'лист ' + no : text}</a>` : (text == null ? 'лист ' + no : text);
  const cite = (u, x, q) => `<blockquote style="margin:16px 0 0;padding:2px 0 2px 16px;border-left:2px solid var(--gold);font-size:14px;line-height:1.55;color:var(--ink)">${esc(q.text)}<br><span style="color:var(--dim);font-size:12.5px">${esc(cap(x.a.short))} · ${ln(u, x.h, q.no)}</span></blockquote>`;
  const alb = x => `«${esc(x.a.name)}»`;
  const per = f => A.map(x => `${esc(cap(x.a.short))}: ${f(x)}`).join('; ');
  const kind = (x, k) => x.h.kinds[k] || 0;
  const of = (n, m) => `${n} из ${m}`;
  const tot = x => x.r.total;
  const u = '../../';
  const dim = s => `<span style="color:var(--dim);font-size:12.5px">${s}</span>`;
  // первая цитата из любого альбома (порядок — как в ALBUMS)
  const firstQ = (re, { optional = false } = {}) => {
    for (const x of A) { const q = x.h.quote(re, { optional: true }); if (q) return { x, q }; }
    if (optional) return null;
    throw new Error(`ни в одном альбоме не найдено ${re}`);
  };
  const citeQ = (re, opt) => { const o = firstQ(re, { optional: opt }); return o ? cite(u, o.x, o.q) : ''; };

  // ---------- общие числа ----------
  const sumOf = f => A.reduce((s, x) => s + f(x), 0);
  const T = {
    open: sumOf(x => x.h.sum.open), facts: sumOf(x => x.h.sum.facts),
    starSheets: sumOf(x => x.h.stars.sheets), sheets: sumOf(tot),
    survey: sumOf(x => x.h.survey.rows.length),
  };
  const awaitsN = x => x.h.questions.filter(q => /^Ждёт:/.test(q.awaits)).length;
  const fieldsN = x => x.h.questions.length - x.h.qIncomplete.length;

  // ---------- исполнители и способы пунктов задания — по напечатанным графам ----------
  const executors = x => {
    const field = x.h.survey.rows.filter(r => ['measure', 'uncover', 'inspect'].includes(r.method));
    const arch = field.filter(r => /^Архитектор$/.test(r.cols[4] || '')).length;
    const others = [...new Set(field.map(r => r.cols[4]).filter(c => c && !/^Архитектор$/.test(c)))];
    return { field: field.length, arch, others };
  };
  const methods = x => [...new Set(x.h.survey.rows.map(r => (r.cols[2] || '').toLowerCase()).filter(Boolean))];
  const execLine = x => {
    const e = executors(x);
    return `${of(e.arch, e.field)} пунктов на объекте исполняет архитектор${e.others.length ? `, в остальных — «${e.others.map(o => esc(o.toLowerCase())).join('», «')}»` : ''}`;
  };

  // ---------- таблица «в цифрах» ----------
  const reg = x => ln(u, x.h, x.h.issuesSheets[0], 'л. ' + x.h.issuesRange);
  const surv = x => ln(u, x.h, x.h.surveySheets[0], 'л. ' + x.h.surveyRange);
  const rowsTbl = [
    ['Листов в альбоме', x => tot(x)],
    ['Листов с пометкой «ПРЕДВАРИТЕЛЬНО · не для производства работ»', x => `${of(x.h.markSheets, tot(x))} ${dim('(' + ln(u, x.h, 1, 'л. 1') + ')')}`],
    ['Листов со строкой в штампе «размеры со скана, не замерены»', x => `${of(x.h.stampSheets, tot(x))} ${dim('(' + ln(u, x.h, 1, 'л. 1') + ')')}`],
    ['Листов, где знак «*» стоит у значения в чертеже', x => `${of(x.h.stars.sheets, tot(x))} ${dim('(' + ln(u, x.h, x.h.stars.nos[0], 'л. ' + x.h.stars.nos[0]) + ')')}`],
    ['…из них с расшифровкой знака на этом же листе', x => of(x.h.stars.legend, x.h.stars.sheets)],
    ['…из них с названной записью реестра (К-… или ИЗ-…) помимо штампа', x => of(x.h.stars.records, x.h.stars.sheets)],
    ['Листов с блоком «Допущения и предложения на листе»', x => of(x.h.blockSheets, tot(x))],
    ['Открытых вопросов в реестре', x => `<b>${x.h.sum.open}</b> ${dim('(' + reg(x) + ')')}`],
    ['…из них ждут факта (обмера, обследования или документа)', x => x.h.sum.facts],
    ['…по видам: спорно / отсутствует / непонятно', x => RU_KINDS.map(k => kind(x, k)).join(' / ')],
    ['Конфликтов между разделами', x => x.h.stated.conflicts ? x.h.sum.conflicts : 'в сводке не названы, таблицы нет'],
    ['Записей в реестре изменений', x => `${x.h.sum.changes}${x.h.sum.unsigned ? `, без подписи — ${x.h.sum.unsigned}` : ''}`],
    ['…в графе «Кто решил, подпись»: автор проекта / исполнитель', x => {
      const au = x.h.changes.filter(c => /решение автора проекта/.test(c.by)).length;
      const ex = x.h.changes.filter(c => /решение исполнителя/.test(c.by)).length;
      return au + ex + x.h.sum.unsigned === x.h.sum.changes ? `${au} / ${ex}` : 'см. реестр';
    }],
    ['Пунктов в самой полной строке «Основа листа»', x => `${x.h.basis.n} ${dim('(' + ln(u, x.h, x.h.basis.no, 'л. ' + x.h.basis.no) + ')')}`],
    ['Пунктов задания на обмер', x => `${x.h.survey.rows.length}: на объекте — ${x.h.survey.onsite}, документом и при закупке — ${x.h.survey.off} ${dim('(' + surv(x) + ')')}`],
    ['…вопросов реестра, которые задание называет закрываемыми', x => x.h.survey.closesN],
    ['Листов с пустыми графами «Пров.» и «Н. контр.» в основной надписи', x => of(x.h.unsignedCells.empty, tot(x))],
  ];
  const tbl = `<div class="scroll-x"><table class="tbl">
        <thead><tr><th></th>${A.map(x => `<th class="hi">${esc(x.a.short)}</th>`).join('')}</tr></thead>
        <tbody>
        ${rowsTbl.map(([k, f]) => `<tr><td>${esc(k)}</td>${A.map(x => `<td>${f(x)}</td>`).join('')}</tr>`).join('\n        ')}
        </tbody></table></div>`;

  // ---------- «если решения нет»: самый короткий живой пример для каждого вида ----------
  const kindRows = RU_KINDS.map(k => {
    const all = A.flatMap(x => x.h.questions.filter(q => q.kind === k && q.ifNo).map(q => ({ x, q })));
    if (!all.length) return '';
    const ex = all.sort((p, q) => p.q.ifNo.length - q.q.ifNo.length)[0];
    return `<tr><td>${esc(k)}</td><td>${A.map(x => `${kind(x, k)} — ${esc(x.a.short)}`).join('<br>')}</td><td>${esc(ex.q.ifNo.replace(/^./, c => c.toUpperCase()))}
      <br>${dim(`${esc(cap(ex.x.a.short))} · вопрос ${esc(ex.q.id)}, ${ln(u, ex.x.h, ex.q.sheet)}`)}</td></tr>`;
  }).join('\n');

  // ---------- примеры из реестра ----------
  const proposal = A.map(x => ({ x, q: x.h.questions.find(q => /Предложение, в проект не принято/.test(q.text)) })).find(o => o.q);
  const proposalText = proposal && proposal.q.text.match(/Предложение, в проект не принято: [^.]*\./);
  const conflictEx = A.map(x => ({ x, c: x.h.conflicts[0] })).find(o => o.c);
  const noCheck = A.map(x => ({ x, c: x.h.changes.find(c => /«Пров\.»/.test(c.was)) })).filter(o => o.c);

  // ---------- блоки страницы ----------
  const stampQuotes = A.map(x => cite(u, x, x.h.quote(Q.stamp))).join('');
  const markQuotes = A.map(x => cite(u, x, x.h.quote(Q.mark))).join('');
  const liftEx = A.map(x => ({ x, q: x.h.quote(Q.lift, { optional: true }) })).find(o => o.q);
  const note2 = firstQ(Q.note2);
  const conflictHead = firstQ(Q.conflictHead, { optional: true });
  const decRule = firstQ(Q.decisionRule);

  const plates = A.flatMap(x => [x.h.issuesSheets[0], x.h.surveySheets[0]].map(no => {
    const s = x.h.byNo.get(no);
    return `<a class="plate" href="${sheetHref(u, x.h, no)}" target="_blank" rel="noopener">
        <span class="plate-img"><img loading="lazy" src="${sheetHref(u, x.h, no)}" alt="${esc(s.title)}"></span>
        <span class="plate-cap"><i>Лист ${no}</i><span>${esc(cap(x.a.short))}. ${esc(s.title)}</span></span>
      </a>`;
  })).join('\n      ');

  const digest = A.map(x => {
    const uniq = refs => [...new Map(refs.map(r => [r.no, r])).values()];
    const rows = x.h.questions.map(q => `<tr><td>${esc(q.id)}</td><td>${esc(clip(q.text, 240))}</td><td>${esc(q.kind)}<br><span style="color:var(--dim)">${esc(q.awaits)}</span></td><td>${esc(q.owner)}</td>
          <td>${uniq(q.refs).map(r => ln(u, x.h, r.no, 'л. ' + r.no)).join(', ')}</td></tr>`).join('\n          ');
    const conf = x.h.conflicts.map(c => `<tr><td>${esc(c.id)}</td><td>${esc(clip(c.text, 240))}</td><td>конфликт<br><span style="color:var(--dim)">между разделами</span></td><td>—</td>
          <td>${uniq(c.refs).map(r => ln(u, x.h, r.no, 'л. ' + r.no)).join(', ')}</td></tr>`).join('\n          ');
    return `<details${A.indexOf(x) === 0 ? ' open' : ''}><summary>${esc(x.a.name)}: ${plural(x.h.sum.open, 'открытый вопрос', 'открытых вопроса', 'открытых вопросов')}${x.h.sum.conflicts ? ` и ${plural(x.h.sum.conflicts, 'конфликт', 'конфликта', 'конфликтов')}` : ''}</summary>
      <div class="scroll-x" style="padding-top:18px"><table class="tbl cmp">
        <thead><tr><th>№</th><th>Что неизвестно (начало формулировки с листа)</th><th>Вид / ждёт</th><th>Кто решает</th><th>Листы</th></tr></thead>
        <tbody>
          ${rows}${conf ? '\n          ' + conf : ''}
        </tbody></table></div>
      <p style="padding-top:14px">Полная формулировка, последствия «если решения нет» и все листы — на ${ln(u, x.h, x.h.issuesSheets[0], 'листах ' + x.h.issuesRange)} альбома.</p>
    </details>`;
  }).join('\n    ');

  // ---------- вопросы и ответы (ответ — простой текст для разметки, источники — ссылками рядом) ----------
  const plain = s => s.replace(/<[^>]+>/g, '');
  const srcAll = f => A.map(x => `${esc(cap(x.a.short))}: ${f(x)}`).join('; ');
  const faq = [
    ['Можно ли по такому альбому вести работы?',
      `Комплект для этого не предназначен: на листах напечатано «ПРЕДВАРИТЕЛЬНО · не для производства работ» (листов с пометкой: ${plain(per(x => of(x.h.markSheets, tot(x))))}), а в задании на обмер записано, что заказываемое по размеру из задания до закрытия пункта не заказывают. Что именно зависит от пункта, видно в графе «Что пересчитается в альбоме».`,
      `На листах: ${srcAll(x => `задание — ${surv(x)}`)}.`],
    ['Кто делает контрольный обмер?',
      `По листу задания: архитектор выполняет обмер, составляет акт контрольного обмера и подписывает результаты по размерам и конструкциям; прораб отвечает за проведение — назначает день и порядок обхода, открывает объект и освобождает помещения; заказчик или его представитель передаёт документы и подписывает акт; технадзор — при вскрытиях и обследованиях. В графе «Кто выполняет» архитектор указан в ${plain(per(x => `${of(executors(x).arch, executors(x).field)} пунктов на объекте`))}.`,
      `На листах: ${srcAll(x => surv(x))}.`],
    ['Что, если замер не совпал с проектом?',
      'В пределах допуска пункта принимается измеренное значение, лист перевыпускается, знак «*» снимается. Если разница больше допуска или контрольные промеры расходятся более чем на 2 %, промер повторяют; не подтвердилось — запись в реестр изменений (дата, лист, было, стало, кто решил, подпись), и работы в этом месте не начинают. Если затронуты несущая стена, стояк, вентканал или мокрая зона, об этом сразу сообщают владельцу раздела и ГИПу (главному инженеру проекта). На объекте устно ничего не согласуется: каждое решение — записью в реестр с подписью.',
      `На листах: ${srcAll(x => surv(x))}, блок «Если факт не совпал с проектом».`],
    ['Точно ли знак «*» стоит у каждого неподтверждённого значения?',
      `Эта страница такого не доказывает. Она считает то, что напечатано на листах: листов, где знак «*» или «**» стоит у значения в чертеже: ${plain(per(x => of(x.h.stars.sheets, tot(x))))}; из них с расшифровкой знака на этом же листе: ${plain(per(x => of(x.h.stars.legend, x.h.stars.sheets)))}. Полноту можно проверить только чтением листов и реестра; у каждого вопроса реестра есть графа «Лист, где это проявляется».`,
      `На листах: ${srcAll(x => reg(x))}.`],
    ['Откуда на этой странице числа?',
      'Страница собирается из самих выпусков. Числа читаются из напечатанного на листах текста: сводок реестра и задания, строк их таблиц, пометки «ПРЕДВАРИТЕЛЬНО» и строки штампа. Перед публикацией они сверяются: строки таблиц со сводкой, пометка листов с реестром. Если что-то не сходится, страница не собирается. Перевыпустили альбом — пересобралась и страница.',
      ''],
  ];

  const body = `  <section class="blk">
    <div class="wrap">
      <div class="kicker">Масштаб</div>
      <h2>Сколько в этих альбомах открыто</h2>
      <p class="sub">Числа прочитаны с напечатанного на листах и обновляются при каждой пересборке страницы: закрыли вопрос, перевыпустили альбом — цифры изменятся. Там, где речь о листах, стоит пара «N из M»: если N меньше M, часть листов этого не содержит.</p>
      ${tbl}
      <p class="sub" style="margin:22px 0 0;font-size:13.5px">Число в пометке листов — ${per(x => x.h.mark.open)}. У обоих альбомов оно равно сумме открытых вопросов, конфликтов и записей реестра изменений без подписи:
      ${per(x => `${x.h.mark.open} = ${x.h.sum.open} + ${x.h.sum.conflicts} + ${x.h.sum.unsigned}`)}. Формула на листе не напечатана — это сверка, которую делает сборка страницы.
      Основа — исходные данные, не подтверждённые обмером; на листах они идут строкой «Основа листа: …», пункты в ней разделены точкой с запятой. В таблице — число пунктов в самой полной такой строке, а не итог по всем листам.</p>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Словарь</div>
      <h2>Допущение, предложение, конфликт</h2>
      <p class="sub">Три разных способа «не знать» — и на листах они названы по-разному.</p>
      <div class="cards g3">
        <div class="card"><div class="num">01</div><h3>Допущение</h3>
          <p>Значение принято, но не замерено и не подтверждено. Так знак «*» расшифрован в примечании к плану:</p>
          ${citeQ(Q.assumed)}
          <p style="margin-top:14px">Основа обоих альбомов — допущения: размеры сняты со скана плана заказчика, а не замерены. Поэтому в штампе стоит строка с адресом в реестре (листов со строкой: ${per(x => of(x.h.stampSheets, tot(x)))}, включая титул):</p>
          ${stampQuotes}</div>
        <div class="card"><div class="num">02</div><h3>Предложение</h3>
          <p>Решение, которое предлагает проектировщик, а заказчик ещё не подтвердил. На планах такие марки помечены двойным знаком «**» — он отличается от «*» допущения, потому что действие другое: не замерить, а согласовать. Легенда говорит об этом прямо:</p>
          ${citeQ(Q.legend)}
          ${proposalText ? `<p style="margin-top:14px">В реестре предложение отделено от принятого. Альбом ${alb(proposal.x)}, вопрос ${esc(proposal.q.id)}: «${esc(clip(proposalText[0], 200))}» (${ln(u, proposal.x.h, proposal.q.sheet)}).</p>` : ''}</div>
        <div class="card"><div class="num">03</div><h3>Конфликт между разделами</h3>
          <p>Расхождение между разделами проекта. Конфликтов в сводках реестра: ${per(x => x.h.stated.conflicts ? x.h.sum.conflicts : 'не названы, таблицы конфликтов нет')}.${conflictHead ? ` Где конфликты есть, их ведёт отдельная таблица с графами «Формулировка», «Разделы», «Статус», «Кто решает», «Если решения нет», «Лист, где это проявляется» (${ln(u, conflictHead.x.h, conflictHead.q.no)}).` : ''}</p>
          ${conflictEx ? `<p style="margin-top:14px">Альбом ${alb(conflictEx.x)}, ${esc(conflictEx.c.id)}: «${esc(clip(conflictEx.c.text, 230))}» (${[...new Set(conflictEx.c.refs.map(r => r.no))].map(no => ln(u, conflictEx.x.h, no)).join(', ')}).</p>` : ''}</div>
      </div>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Знаки «*» и «**»</div>
      <h2>Что значат знаки на листах</h2>
      <p class="sub">Размер со скана и размер с рулетки на чертеже выглядят одинаково. Знак «*» их различает: принято, не замерено — замерить на объекте. Знак «**» — предложение проектировщика, не утверждено — согласовать с заказчиком.</p>
      <div class="cards g2">
        <div class="card"><h3>Расшифровка — на самом листе</h3>
          <p>Листов, где знак стоит у значения в чертеже: ${per(x => of(x.h.stars.sheets, tot(x)))}. Из них с расшифровкой знака на этом же листе: ${per(x => of(x.h.stars.legend, x.h.stars.sheets))}. Формулировка зависит от листа — вот три из них:</p>
          ${citeQ(Q.assumed)}${citeQ(Q.proposalNote)}${citeQ(Q.heat, true)}</div>
        <div class="card"><h3>Знак ведёт в реестр</h3>
          <p>В штампе указаны листы реестра и номера записей (листов со строкой: ${per(x => of(x.h.stampSheets, tot(x)))}). Листов со знаком, где помимо штампа названа хотя бы одна запись реестра: ${per(x => of(x.h.stars.records, x.h.stars.sheets))}. Блоков «Допущения и предложения на листе» со строкой «См. лист открытых вопросов» и номерами записей: ${per(x => of(x.h.blockSeeRegistry, x.h.blockSheets))}. Например:</p>
          ${citeQ(Q.seeRegistry)}</div>
        <div class="card"><h3>Что от него зависит — записано в задании</h3>
          <p>Пунктов задания, у которых заполнены все графы таблицы (среди них «Что пересчитается в альбоме»): ${per(x => of(x.h.survey.full, x.h.survey.rows.length))}. ${liftEx ? 'Например, от высоты потолка, которая принята и не замерена:' : ''}</p>
          ${liftEx ? cite(u, liftEx.x, liftEx.q) : ''}</div>
        <div class="card"><h3>Как знак снимается</h3>
          <p>У величины — замером; так записано в задании на обмер. И вот что происходит после замера:</p>
          ${citeQ(Q.surveyNote)}${citeQ(Q.accept)}${citeQ(Q.mismatch)}
          <p style="margin-top:14px">Предложения проектировщика помечены тем же знаком, но с другой расшифровкой — «заказчиком не утверждено». Это решение, а не величина; на обмере проектных решений не принимают: «обмер даёт факт, решения — по реестру открытых вопросов».</p></div>
      </div>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Механика</div>
      <h2>От вопроса до задания на обмер</h2>
      <ol class="steps-list">
        <li><h3>Вопрос попадает в реестр</h3>
          <p>Листы реестра — ${per(x => reg(x))}. В таблице у вопроса графы «Формулировка», «Вид», «Кто решает», «Если решения нет» и «Лист, где это проявляется»; вопросов с заполненными графами: ${per(x => of(fieldsN(x), x.h.questions.length))}. Рядом ведётся таблица изменений проекта после выпуска листов: дата, лист, было, стало, кто решил, подпись (записей: ${per(x => x.h.sum.changes)}). Над таблицей напечатан абзац о статусе решений по пунктам таблицы:</p>
          ${citeQ(Q.preliminary)}
          <p style="margin-top:14px">Чего реестр не делает, сказано в его примечании:</p>
          ${cite(u, note2.x, note2.q)}</li>
        <li><h3>Вид вопроса и «если решения нет»</h3>
          <p>Вид — «Спорно», «Отсутствует» или «Непонятно». В графе «Если решения нет» каждый вопрос описан своими словами: что остаётся на листах, пока вопрос открыт. Самые короткие формулировки с листов:</p>
          <div class="scroll-x" style="margin-top:14px"><table class="tbl cmp"><thead><tr><th>Вид</th><th>В альбомах</th><th>Графа «Если решения нет»</th></tr></thead><tbody>
          ${kindRows}
          </tbody></table></div></li>
        <li><h3>Вопрос сам говорит, чего он ждёт</h3>
          <p>Во второй строке графы «Вид» стоит «Ждёт: …» (вопросов с такой строкой: ${per(x => of(awaitsN(x), x.h.questions.length))}). Сводка реестра называет вопросы, ответ на которые лежит на объекте или в документах: «ждут факта объекта» — ${per(x => x.h.sum.facts)}. Они собраны в задании на обмер; сводка задания перечисляет закрываемые вопросы: ${per(x => x.h.survey.closesN)}.</p>
          ${A.filter(x => x.h.decisionInSurvey.length).map(x => `<p style="margin-top:12px">Здесь два утверждения на листах стоят рядом. Реестр: «${esc(decRule.q.text)}». Но в альбоме ${alb(x)} сводка задания называет и ${x.h.decisionInSurvey.map(d => `${esc(d.id)} (пункт${d.rows.length > 1 ? 'ы' : ''} ${d.rows.map(esc).join(', ')})`).join(' и ')} — в реестре у них «Ждёт: решения». По условиям задания обмер даёт по таким пунктам факт, а решение остаётся за реестром (${ln(u, x.h, x.h.surveySheets[0], 'л. ' + x.h.surveyRange)}).</p>`).join('')}</li>
        <li><h3>Задание на контрольный обмер</h3>
          <p>Листы задания — ${per(x => surv(x))}. У пунктов на объекте графы «Где», «Способ», «Что сделать», «Кто выполняет», «Точность», «Что пересчитается в альбоме», «Чем подтверждается», «Закрывает вопросы реестра»; у документов и закупки вместо части граф — «У кого, откуда», «Что получить», «К какому сроку». Пунктов с заполненными графами: ${per(x => of(x.h.survey.full, x.h.survey.rows.length))}. Способы в этих альбомах: ${per(x => methods(x).join(', '))}. Пунктов в задании — ${per(x => `${x.h.survey.rows.length} (на объекте — ${x.h.survey.onsite}${x.h.survey.stages ? ` [${esc(x.h.survey.stages)}]` : ''}; документом и при закупке — ${x.h.survey.off})`)}. Исполнитель: ${per(x => execLine(x))}.</p></li>
        <li><h3>Кто что делает на обмере</h3>
          <p>Так распределено на листе задания (в обоих альбомах формулировки совпадают):</p>
          ${citeQ(Q.qArchitect)}${citeQ(Q.qForeman)}${citeQ(Q.qCustomer)}${citeQ(Q.qTech)}</li>
        <li><h3>Факт вносится, пункт исключается</h3>
          <p>О том, что происходит после обмера, на листах сказано дважды — в задании и в реестре:</p>
          ${citeQ(Q.surveyNote)}${citeQ(Q.note3)}
          <p style="margin-top:14px">Изменения проекта после выпуска листов записываются в таблицу реестра изменений; сейчас в ней: ${per(x => plural(x.h.sum.changes, 'запись', 'записи', 'записей'))}.</p></li>
      </ol>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">На выходе</div>
      <h2>Что получает заказчик</h2>
      <p class="sub">Не обещание «всё учтём», а четыре вещи, которые можно открыть на листах и пересчитать.</p>
      <div class="cards g2" style="margin-bottom:40px">
        <div class="card"><h3>Реестр открытых вопросов</h3><p>Вопросы с графой «Кто решает», конфликты и изменения проекта с графой «Кто решил, подпись». ${per(x => ln(u, x.h, x.h.issuesSheets[0], 'листы ' + esc(x.h.issuesRange)))}.</p></div>
        <div class="card"><h3>Задание на контрольный обмер</h3><p>Что замерить, вскрыть и получить до заказа материалов: у пунктов есть графы «Точность» и «Чем подтверждается». ${per(x => ln(u, x.h, x.h.surveySheets[0], 'листы ' + esc(x.h.surveyRange)))}.</p></div>
        <div class="card"><h3>Блок «Допущения и предложения на листе»</h3><p>Листов с блоком: ${per(x => of(x.h.blockSheets, tot(x)))}. Блока нет на листах: ${per(x => x.h.noBlockTitles.map(([t, n]) => `${esc(t.charAt(0).toLowerCase() + t.slice(1))}${n > 1 ? ` (${n})` : ''}`).join(', '))}.</p></div>
        <div class="card"><h3>Пометка о статусе комплекта</h3><p>Листов с пометкой: ${per(x => of(x.h.markSheets, tot(x)))}. Комплект с открытыми пунктами помечен как предварительный:</p>
          ${markQuotes}</div>
      </div>
      <div class="plates">
      ${plates}
      </div>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Границы</div>
      <h2>Чего этот механизм не обещает</h2>
      <ul class="checklist">
        <li>Не оценивает сроки и деньги по пунктам: «влияние на сроки и стоимость по пунктам не оценивалось» — так записано в примечании к реестру (${per(x => ln(u, x.h, x.h.issuesSheets[x.h.issuesSheets.length - 1], 'л. ' + x.h.issuesSheets[x.h.issuesSheets.length - 1]))}).</li>
        <li>Не заменяет замер: пока он не сделан, в штампе остаётся строка «размеры со скана, не замерены» (листов со строкой: ${per(x => of(x.h.stampSheets, tot(x)))}).</li>
        <li>Не принимает решения за заказчика: на обмере проектных решений не принимают, вопросы, ждущие решения человека, закрываются по реестру.</li>
        <li>Не доказывает полноту: страница считает напечатанное на листах и не проверяет, что знак «*» стоит у каждого неподтверждённого значения.</li>
        <li>Не делает комплект окончательным: страница пересказывает записи на листах и ничего не закрывает; пометка «не для производства работ» остаётся на листах (${per(x => of(x.h.markSheets, tot(x)))}).</li>
        ${[...new Set(noCheck.map(o => o.c.now))].map(now => `<li>Не выдаёт себя за проверенный: графы «Пров.» и «Н. контр.» основной надписи пусты (листов с пустыми графами: ${per(x => of(x.h.unsignedCells.empty, tot(x)))}), и это записано в реестре изменений (${noCheck.filter(o => o.c.now === now).map(o => `альбом ${alb(o.x)}, ${esc(o.c.id)}, ${ln(u, o.x.h, o.c.sheet)}`).join('; ')}): «${esc(now)}»</li>`).join('\n        ')}
        <li>Не обещает, что все решения утверждены автором проекта: в графе «Кто решил, подпись» записи реестра изменений разделены так (автор проекта / исполнитель): ${per(x => {
    const au = x.h.changes.filter(c => /решение автора проекта/.test(c.by)).length;
    const ex = x.h.changes.filter(c => /решение исполнителя/.test(c.by)).length;
    return au + ex + x.h.sum.unsigned === x.h.sum.changes ? `${au} / ${ex}${x.h.sum.unsigned ? `, без подписи — ${x.h.sum.unsigned}` : ''}` : 'см. реестр';
  })}.</li>
      </ul>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Реестр целиком</div>
      <h2>Все открытые вопросы этих альбомов</h2>
      <p class="sub">Начало формулировки, вид, кто решает и листы, где вопрос проявляется. Полный текст — на листах.</p>
    ${digest}
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Вопросы</div>
      <h2>Что обычно спрашивают</h2>
    ${faq.map(f => `<details><summary>${esc(f[0])}</summary><p>${esc(f[1])}</p>${f[2] ? `<p style="color:var(--dim);font-size:13.5px">${f[2]}</p>` : ''}</details>`).join('\n    ')}
      <div class="cta-row" style="margin-top:34px">
        ${A.map(x => `<a class="btn ghost" href="../../portfolio/${x.a.slug}/">Альбом: ${esc(x.a.name)}</a>`).join('\n        ')}
        <a class="btn ghost" href="../">Как устроен и проверяется комплект</a>
      </div>
    </div>
  </section>
`;

  const explainer = page({
    file: `gost/${SLUG}/index.html`,
    title: 'Знак «*» и открытые вопросы в альбоме — что не подтверждено | LINEA',
    desc: `Как альбом рабочей документации записывает то, чего ещё не знает: допущения и предложения со знаком «*», реестр из ${T.open} открытых вопросов и задание на контрольный обмер. Числа и цитаты — с листов двух реальных альбомов, у цифр есть ссылки на листы.`,
    h1: 'Что в альбоме ещё не проверено — и как это записано',
    lead: 'Любой проект стоит на исходных данных, и часть из них на момент выпуска — предположения. В двух наших альбомах это, например, размеры, снятые со скана плана, и высота потолка, принятая без замера. '
      + 'На листах такие места записаны, а не подразумеваются: в штампе — строка «размеры со скана, не замерены» с адресом в реестре, в верхнем углу листа — «не для производства работ», у принятых и предложенных значений — знак «*», '
      + 'а вопросы, на которые отвечают обмер, обследование или документ, собраны в задании на контрольный обмер. Сколько листов это касается — в таблице ниже, у цифр есть ссылки на листы.',
    crumb: [['Документация', '../'], ['Открытые вопросы и знак «*»', null]],
    body,
    u,
    jsonld: [
      crumbsLd([['LINEA', `${BASE}/`], ['Документация', `${BASE}/gost/`], ['Открытые вопросы и знак «*»', `${BASE}/gost/${SLUG}/`]]),
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } })) },
    ],
  });

  // ---------- врезка на хабе ----------
  const hubSection = `  <section class="blk">
    <div class="wrap">
      <div class="kicker">Честность выпуска</div>
      <h2>Что в альбоме ещё не проверено — записано на листах</h2>
      <p class="sub">В двух наших альбомах размеры сняты со скана, а высота потолка принята без замера. Эти и другие допущения вынесены в реестр открытых вопросов;
      у принятых и предложенных значений на листах стоит знак «*», а вопросы, на которые отвечают обмер, обследование или документ, собраны в задание на контрольный обмер.
      Комплекты предварительные. Листов с пометкой «не для производства работ»: ${per(x => of(x.h.markSheets, tot(x)))}.</p>
      <div class="stats" style="margin-top:0">
        <div><b>${T.open}</b><span>${word(T.open, 'открытый вопрос', 'открытых вопроса', 'открытых вопросов')} в двух альбомах</span></div>
        <div><b>${T.facts}</b><span>${T.facts % 10 === 1 && T.facts % 100 !== 11 ? 'из них ждёт' : 'из них ждут'} факта: обмера, обследования или документа</span></div>
        <div><b>${T.starSheets}</b><span>из ${T.sheets} листов со знаком «*» у значения</span></div>
        <div><b>${T.survey}</b><span>пунктов задания на обмер</span></div>
      </div>
      <div class="cta-row" style="margin-top:34px"><a class="btn" href="${SLUG}/">Как это устроено</a></div>
    </div>
  </section>
`;

  // ---------- врезка на странице альбома ----------
  const albumBlock = x => {
    const h = x.h, s = h.sum, n = tot(x);
    const extra = [s.conflicts ? plural(s.conflicts, 'конфликт', 'конфликта', 'конфликтов') : '', s.unsigned ? `${plural(s.unsigned, 'запись', 'записи', 'записей')} реестра изменений без подписи` : ''].filter(Boolean);
    return `  <section class="blk">
    <div class="wrap">
      <div class="kicker">Честность выпуска</div>
      <h2>Что в этом альбоме ещё не подтверждено</h2>
      <p class="sub">Комплект предварительный: пометка «не для производства работ» напечатана на ${of(h.markSheets, n)} листов, в ней — число открытых пунктов (${h.mark.open}).
      Это ${plural(s.open, 'открытый вопрос', 'открытых вопроса', 'открытых вопросов')}${extra.length ? ', ' + extra.join(' и ') : ''}.
      ${plural(s.facts, 'вопрос ждёт', 'вопроса ждут', 'вопросов ждут')} факта — обмера, обследования или документа; задание на контрольный обмер называет ${h.survey.closesN} закрываемых вопросов реестра.
      Знак «*» или «**» стоит у значения в чертеже на ${of(h.stars.sheets, n)} листов; расшифровка рядом со знаком есть на ${of(h.stars.legend, h.stars.sheets)} таких листов.</p>
      <div class="stats" style="margin-top:0">
        <div><b>${s.open}</b><span>${word(s.open, 'открытый вопрос', 'открытых вопроса', 'открытых вопросов')}</span></div>
        <div><b>${s.facts}</b><span>${s.facts % 10 === 1 && s.facts % 100 !== 11 ? 'ждёт' : 'ждут'} факта</span></div>
        <div><b>${h.stars.sheets}</b><span>из ${n} листов со знаком «*» у значения</span></div>
        <div><b>${h.survey.rows.length}</b><span>${word(h.survey.rows.length, 'пункт', 'пункта', 'пунктов')} задания на обмер</span></div>
      </div>
      <div class="cta-row" style="margin-top:30px">
        <a class="btn ghost" href="sheets/${encodeURIComponent(h.sheetFile(h.issuesSheets[0]))}" target="_blank" rel="noopener">Реестр вопросов · листы ${esc(h.issuesRange)}</a>
        <a class="btn ghost" href="sheets/${encodeURIComponent(h.sheetFile(h.surveySheets[0]))}" target="_blank" rel="noopener">Задание на обмер · листы ${esc(h.surveyRange)}</a>
        <a class="btn ghost" href="../../gost/${SLUG}/">Как это устроено</a>
      </div>
    </div>
  </section>
`;
  };

  return { explainer, hubSection, albumBlock: slug => albumBlock(A.find(x => x.a.slug === slug)), totals: T, slug: SLUG };
}

module.exports = { build, SLUG };
