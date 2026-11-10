'use strict';
/**
 * Общий каркас страниц сайта: автор, навигация, подвал, липкая панель.
 *
 * Раньше эти куски были скопированы в четырёх генераторах, и при добавлении
 * раздела приходилось править меню в четырёх местах — в один заход это уже
 * дало задвоенный пункт «Журнал» на половине страниц. Теперь источник один.
 *
 * u — префикс до корня сайта: '../' для страниц в подпапке, './' для корня.
 */

const AUTHOR = {
  name: 'Кырлан Александр',
  role: 'дизайнер-архитектор',
  phone: '+7 925 733-86-40',
  tel: '+79257338640',
  email: 'optteem@mail.ru',
};

// ── Адрес сайта: ЕДИНСТВЕННЫЙ источник ─────────────────────────────────────────
// Все генераторы, sitemap, canonical, og:url и schema.org берут BASE отсюда.
// Где живёт сайт:
//   pages   — GitHub Pages (подпапка /linea-design-studio/), пока домен не подтверждён — основной;
//   preview — технический адрес на Beget (без SSL, закрыт от индекса);
//   domain  — дизайн-студия-квартир.рф. В машинных адресах (canonical, og:url, sitemap, robots,
//             schema.org) — Punycode: так требует Яндекс для robots.txt и протокол Sitemap (RFC 3986).
// Выбор при сборке: LINEA_SITE=pages|preview|domain или LINEA_BASE=<полный адрес без «/» в конце>.
// Переключение на домен навсегда — поменять SITE_DEFAULT на 'domain' (см. docs/reports/2026-10-27-pereezd-beget.md).
const SITE_BASES = {
  pages: 'https://alex1986-rgb.github.io/linea-design-studio',
  preview: 'http://linea.aleks2si.beget.tech',
  domain: 'https://xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai',
};
const SITE_DOMAIN_RU = 'дизайн-студия-квартир.рф';   // для текста, который читает человек
const SITE_DEFAULT = 'domain';
const SITE = process.env.LINEA_SITE || SITE_DEFAULT;
if (!process.env.LINEA_BASE && !SITE_BASES[SITE]) throw new Error(`LINEA_SITE=${SITE}: нет такого адреса (${Object.keys(SITE_BASES).join('|')})`);
const BASE = String(process.env.LINEA_BASE || SITE_BASES[SITE]).replace(/\/+$/, '');
const CSSV = 'v=38';

// Разделы сайта. Добавили раздел — правится только здесь (подвал и крошки берут список отсюда).
// menu: false — раздел не выводится в шапку (с 09.11.2026 в шапке только HEADER ниже, остальное — в подвале по группам).
const SECTIONS = [
  { key: 'portfolio', title: 'Портфолио', href: 'portfolio-hub/', menu: false },
  { key: 'catalog', title: 'Каталог', href: 'catalog/', menu: false },
  { key: 'gost', title: 'Документация', href: 'gost/', menu: false },
  { key: 'cases', title: 'Кейсы', href: 'cases/', menu: false },
  { key: 'compare', title: 'Сравнение', href: 'compare/', menu: false },
  { key: 'style', title: 'Стили', href: 'style/', menu: false },
  { key: 'journal', title: 'Журнал', href: 'journal/', menu: false },
  { key: 'stories', title: 'Истории', href: 'stories/', menu: false },
  { key: 'reviews', title: 'Отзывы', href: 'reviews/', menu: false },
  // «Ремонт по проекту» (31.10.2026): клиентам — подбор бригады (проверка документов) к готовому проекту; бригадам — условия и регистрация
  { key: 'remont', title: 'Ремонт по проекту', href: 'remont/', menu: false },
  { key: 'brigadam', title: 'Бригадам', href: 'brigadam/', menu: false },
];
const MENU = SECTIONS.filter(s => s.menu !== false);

// ── Шапка (решение 09.11.2026, критик сайта): четыре понятных пункта человеку без опыта ремонта + «Войти» и кнопка брифа.
// Каталог, документация, кейсы, сравнение, стили, журнал, бригадам — в подвале, сгруппированно (страницы и адреса целы).
// on — ключи разделов (аргумент active у header), при которых пункт подсвечен.
const HEADER = [
  { title: 'Примеры', href: 'portfolio-hub/', on: ['portfolio', 'cases', 'stories', 'style'] },
  { title: 'Цена', href: 'price/', on: ['price'] },
  { title: 'Как работаем', href: 'process/', on: ['process'] },
  { title: 'Вопросы', href: 'faq/', on: ['faq'] },
];

// Описание для сниппета: длиннее ~160 знаков поисковик всё равно обрежет,
// причём в произвольном месте. Режем сами — по границе слова.
function clamp(str, n) {
  n = n || 158;
  str = String(str).replace(/\s+/g, ' ').trim();
  if (str.length <= n) return str;
  const cut = str.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 24)).replace(/[\s,;:.—-]+$/, '') + '…';
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// active — key раздела: подсвечивает пункт шапки (HEADER.on)
function header(u, active) {
  const cur = HEADER.find(h => h.on.includes(active));
  const links = HEADER.map(h =>
    `      <a href="${u + h.href}"${h === cur ? ' aria-current="page"' : ''}>${h.title}</a>`
  ).join('\n');
  return `<header class="site">
  <div class="nav">
    <a class="logo" href="${u || './'}">LINE<i>A</i></a>
    <nav class="links" aria-label="Главное меню">
${links}
    </nav>
    <a class="nav-in" href="${u}vhod/">Войти</a>
    <a class="btn sm nav-cta" href="${u}brief.html"><span class="t-long">Заполнить бриф</span><span class="t-short">Бриф</span></a>
    <button class="burger" type="button" aria-label="Меню" aria-expanded="false"><i></i><i></i><i></i></button>
  </div>
</header>
<div class="mnav" hidden>
  <nav>
${HEADER.map(x => `    <a href="${u + x.href}">${x.title}</a>`).join('\n')}
  </nav>
  <div class="mnav-cta">
    <a class="btn" href="${u}brief.html">Заполнить бриф</a>
    <a class="btn ghost" href="${u}vhod/">Войти в кабинет</a>
    <a class="btn ghost" href="tel:${AUTHOR.tel}">${AUTHOR.phone}</a>
  </div>
</div>`;
}

// ── Условия работы: ЕДИНСТВЕННЫЙ источник для текстов сайта ───────────────────────────────────────────
// Решение 27.10.2026: «открытый бесплатный тест» закончен — проект начинается после оплаты (ЮKassa или счёт).
// Цены утвердил Александр 28.10.2026, упростил 31.10.2026: «цена одна — 2000 ₽ с визуализацией» — один пакет,
// визуализации входят в цену; минимальный заказ «как за 40 м²».
// Модель ниже — единственный источник: тексты, расчёт, schema.org Offer, калькулятор (price/), квиз (catalog/).
// Те же ставки (в копейках) — в linea-private/config.php на сервере (server/config.example.php → prices): менять оба.
// ROUNDS — сколько кругов правок входит в цену; null — «число кругов — в договоре до оплаты» (решение Александра).
// Реквизиты исполнителя — задаёт Александр (статус: ИП или плательщик НПД, ИНН). null — на сайте честная пометка «будут указаны».
const REQUISITES = null;   // пример: { status: 'плательщик налога на профессиональный доход (самозанятый)', inn: '000000000000' }
const ROUNDS = 3;   // решение Александра 03.11.2026
const rub = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0₽';
// Пакет один: ставка ₽/м², минимальный заказ считается как за MIN_AREA м²
const MIN_AREA = 40;
const PACKS = [
  { key: 'proekt', name: 'Проект с визуализациями', rate: 2000 },
].map(p => ({ ...p, min: p.rate * MIN_AREA }));
const PACK = Object.fromEntries(PACKS.map(p => [p.key, p]));
// Выборка рынка — docs/research/2026-10-28-ceny-rynka.md (открытые прайсы студий, снято 28.10.2026)
const MARKET = { date: '28.10.2026', city: 'Москва', full: '4\u00a0500–5\u00a0000', fullN: 11, techMed: '1\u00a0575', techSheets: '6–25' };
// Решение Александра 06.11.2026: на сайте ТОЛЬКО дизайн-проекты квартир. Дома, коттеджи и ландшафт не предлагаем.
// houses: false — генераторы не выпускают страницы домов, не упоминают их в условиях; старые адреса домов → MOVED (заглушки tools/gen-moved-pages.js).
const HOUSES = false;
// старые адреса страниц про дома → куда вести (пути от корня site/, без ведущего «/»)
const MOVED = {
  'catalog/dizayn-proekt-doma.html': 'catalog/dizayn-proekt-kvartiry.html',
  'cases/dom-331.html': 'cases/',
  'cases/dom-120.html': 'cases/',
  'portfolio/gost-dom331/index.html': 'portfolio-hub/',
  'portfolio/gost-dom120/index.html': 'portfolio-hub/',
  'portfolio/dom-120/index.html': 'portfolio-hub/',
  'portfolio/dom-120/presentation.html': 'portfolio-hub/',
};
const TERMS = {
  houses: HOUSES, moved: MOVED,
  packs: PACKS, pack: PACK, minArea: MIN_AREA, market: MARKET,
  rounds: ROUNDS,
  requisites: REQUISITES,
  reqLine: REQUISITES ? `${REQUISITES.status}, ИНН ${REQUISITES.inn}` : 'статус (ИП или самозанятый) и ИНН будут указаны до приёма первой оплаты',
  rub,
  // сумма заказа: ставка × площадь, но не меньше минимума (рубли)
  sum: (key, area) => Math.max(PACK[key].min, Math.round(PACK[key].rate * area)),
  rate: key => rub(PACK[key].rate) + '/м²',            // «2 000 ₽/м²»
  minSum: key => rub(PACK[key].min),                    // «80 000 ₽»
  hasPrices: true,
  // цена одной строкой для услуги → «от 2 000 ₽/м², минимальный заказ 80 000 ₽»
  price(kind) {
    const p = PACKS[0];
    return `от ${rub(p.rate)}/м², минимальный заказ ${rub(p.min)}`;
  },
  // цена одной фразой
  line: `${rub(PACKS[0].rate)}/м² — проект с визуализациями, визуализации входят в цену; минимальный заказ — как за ${MIN_AREA} м²: ${rub(PACKS[0].min)}`,
  // schema.org Offer: цена «от» = минимальный заказ, ставка — в UnitPriceSpecification (unitText м²)
  offers(name, url) {
    return PACKS.map(p => ({
      '@type': 'Offer', name: `${name} с визуализациями`, url,
      price: String(p.min), priceCurrency: 'RUB',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: String(p.rate), priceCurrency: 'RUB', unitCode: 'MTK', unitText: 'м²',
        referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MTK', unitText: 'м²' } },
      eligibleQuantity: { '@type': 'QuantitativeValue', minValue: MIN_AREA, unitCode: 'MTK', unitText: 'м²' },
      description: `Ставка ${rub(p.rate)} за м²; минимальный заказ — как за ${MIN_AREA} м², ${rub(p.min)}`,
    }));
  },
  start: 'Проект начинается после оплаты',
  // площадь в брифе обязательна (01.11.2026): сумма видна сразу на странице заказа; что будет, если план покажет другую площадь
  areaRecalc: 'Сумма посчитана по площади из брифа. Если по плану площадь окажется другой, пересчитаем по той же ставке и согласуем разницу с вами до начала работы.',
  how: 'Вы присылаете бриф — сумма уже посчитана по вашей площади, мы подтверждаем её в заказе, вы оплачиваете, после оплаты начинаем работу',
  // срок (решение владельца 09.11.2026): проект — 1–3 суток от оплаты и плана с размерами; с вопросами/обмером выходит «ПРЕДВАРИТЕЛЬНО», перевыпуск — тоже 1–3 суток.
  // Единственный источник срока: days / daysFrom / daysShort / term / timeFirst (ниже, после объекта). Числа руками в генераторы не вписывать.
  days: '1–3 суток',
  daysFrom: '1–3 суток от оплаты и плана с размерами',
  daysShort: '1–3 суток от оплаты и плана',
  term: 'проект — за 1–3 суток от оплаты и получения плана с размерами (срок зависит от площади и полноты данных). Если остались вопросы к вам или нужен обмер, альбом выходит с пометкой «ПРЕДВАРИТЕЛЬНО»; после ваших ответов и обмера перевыпускаем — тоже за 1–3 суток',
  roundsText: ROUNDS ? `${ROUNDS} ${ROUNDS === 1 ? 'круг' : ROUNDS < 5 ? 'круга' : 'кругов'} правок входят в цену` : 'число кругов правок называем до оплаты — оно будет в договоре',
  // что такое пометка «ПРЕДВАРИТЕЛЬНО» — одной фразой (снимается сама, когда закрыт реестр вопросов: gost-draft engine/paper.js → releaseState)
  prelim: 'Комплект выпускается с пометкой «ПРЕДВАРИТЕЛЬНО», пока по объекту открыты вопросы к вам (лист «Открытые вопросы» в начале альбома) и не сделан контрольный обмер. По такому комплекту не строят: после ваших ответов и обмера перевыпускаем его без пометки.',
  // что не входит в услугу — один список для цены, оферты и каталога
  notIncluded: ['выезд и обмер на объекте (работаем удалённо; задание на контрольный обмер — в альбоме)',
    'проект перепланировки для жилинспекции и расчёт несущих конструкций — это работа организаций с допуском',
    'авторский надзор и строительные работы на объекте',
    'комплектация: закупка материалов, мебели и техники'],
  // дома и ландшафт с 06.11.2026 не предлагаем — строка пустая
  onRequest: '',
};

// ── Единые формулировки цены и суммы (09.11.2026, критик сайта: «цена без минимума», «сумму знаете» против «назовём в течение дня») ──
// Цена везде одним видом — TERMS.fromLine; про сумму — TERMS.sumLine / sumShort. Руками в генераторы не вписывать.
// Приём устроен так: площадь в брифе обязательна, сумма = ставка × площадь (не меньше минимума) считается сразу
// (калькулятор на сайте, страница заказа); подтверждаем её в заказе. Если на сервере цена не задана (null), заказ покажет «уточняется» —
// формулировки ниже честны в обоих режимах: ставка публичная, подтверждение — до оплаты.
TERMS.fromLine = `от ${rub(PACKS[0].min)} (${rub(PACKS[0].rate)}/м²)`;
TERMS.fromLineLong = `от ${rub(PACKS[0].min)} (${rub(PACKS[0].rate)}/м², минимальный заказ — как за ${MIN_AREA} м²)`;
TERMS.sumLine = `Сумма считается сразу по площади из брифа: ${rub(PACKS[0].rate)}/м² × площадь, не меньше ${rub(PACKS[0].min)}. Подтверждаем её в заказе до оплаты`;
TERMS.sumShort = 'сумма считается сразу по площади и подтверждается в заказе до оплаты';
TERMS.timeFirst = TERMS.term[0].toUpperCase() + TERMS.term.slice(1);
// Гарантии (блок на главной): только то, что уже закреплено в условиях
TERMS.refundLine = 'До начала работы возвращаем всю сумму; после — за вычетом того, что к этому моменту фактически сделано';
TERMS.docsLine = 'Электронный чек после оплаты; условия и реквизиты исполнителя — на странице заказа до оплаты';
// Картинки визуализаций (плашка, 09.11.2026): что именно они подтверждают
TERMS.renderNote = 'Визуализации — картинки, сверенные с чертежом (мебель, двери, сантехника и свет как на плане), а не фотографии готового ремонта';

// ── «Ремонт по проекту»: условия бригад — ЕДИНСТВЕННЫЙ источник для страниц сайта ─────────────────────────────────────
// Источник — server/api/lib/brig-terms.json (его же читает сервер); BRIG_TERMS_DEFAULT в boot.php — только запасные значения.
// Решение Александра 01.11.2026: платы за отклик, лид и допуск нет. Удержание сделки на платформе — сервис «Сделка через LINEA» и листы по запросу
// под каждую бригаду, доступные только внутри сделки. Решения 01.11.2026: ставка 10 % («10 % с бригады»), пилот — первым 5 бригадам
// первые 3 сделки по 5 %; листы в сделке бесплатно до 15 на объект; вне сделки 2 500 ₽ за лист, но продажа выключена до ИП.
// Безопасная сделка ЮKassa и неустойки — не включены. Цифры на страницах — ТОЛЬКО отсюда, руками не вписывать.
// С 01.11.2026 значения берутся из server/api/lib/brig-terms.json — того же файла, что читает сервер (brig_terms()): один источник.
// Админка показывает плашку, если на сервере значение изменили, а страницы собраны со старым.
const BT = (() => { const j = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'server', 'api', 'lib', 'brig-terms.json'), 'utf8')); return j; })();
const pc = x => Math.round(x * 1000) / 10;   // доля → проценты (0.1 → 10)
const BRIG_TERMS = {
  rate: pc(BT.rate),               // % от сметы выбранного предложения (агентское вознаграждение)
  pilot: { enabled: !!BT.pilot.enabled, rate: pc(BT.pilot.rate), brigades: BT.pilot.brigades, deals: BT.pilot.deals },   // пилот: первым N допущенным бригадам первые M сделок
  contactsAfter: BT.contacts_after, // 'signed' — контакты сторон открываются, когда договор подписали на сайте обе стороны; 'chosen' — при выборе
  sheetsFreeLimit: BT.sheets_free_limit,   // листов по запросу на объект без доплаты внутри сделки; null — без лимита
  sheetPrice: BT.sheet_price_kop / 100,    // ₽ за лист вне сделки — продаётся, только когда sheetsOutsidePaid = true
  sheetsOutsidePaid: !!BT.sheets_outside_paid,   // выключено до ИП и кассы
  invoiceDays: BT.invoice_days,
  inviteMax: BT.invite_max, offersShowMax: BT.offers_show_max, protectMonths: BT.protect_months,
  stageSilenceDays: BT.stage_silence_days, disputeReplyDays: BT.dispute_reply_days, advanceConfirmDays: BT.advance_confirm_days,
};
const pct = n => `${String(n).replace('.', ',')} %`;
BRIG_TERMS.rateText = pct(BRIG_TERMS.rate);
BRIG_TERMS.pilotLine = BRIG_TERMS.pilot.enabled
  ? `Пилот: первым ${BRIG_TERMS.pilot.brigades} допущенным бригадам первые ${BRIG_TERMS.pilot.deals} сделки — ${pct(BRIG_TERMS.pilot.rate)}`
  : '';
// пример в рублях: вознаграждение со сметы sum (₽) по основной ставке
BRIG_TERMS.fee = sum => rub(Math.round(sum * BRIG_TERMS.rate / 100));
BRIG_TERMS.example = sum => `смета ${rub(sum)} → вознаграждение ${BRIG_TERMS.fee(sum)}`;
// когда открываются контакты и фиксируется вознаграждение — одной фразой
BRIG_TERMS.contactsLine = BRIG_TERMS.contactsAfter === 'chosen'
  ? 'контакты сторон открываются после выбора бригады'
  : 'телефоны, почта и адрес объекта открываются обеим сторонам, когда условия договора подряда подтвердили на сайте и клиент, и бригада; до этого — переписка в карточке сделки';
// когда вознаграждение становится к оплате (Александр 01.11.2026: «оплата после первого этапа работ или аванса»):
// 'first_money' — после первых денег бригаде (клиент отметил аванс или принял первый этап); 'signed' — сразу при подтверждении договора
BRIG_TERMS.commissionDue = BT.commission_due;
BRIG_TERMS.dueLine = BRIG_TERMS.commissionDue === 'first_money' ? 'только когда вы получили первые деньги: аванс или оплату первого этапа' : 'после подтверждения договора обеими сторонами';
BRIG_TERMS.feeLine = BRIG_TERMS.commissionDue === 'first_money'
  ? `${BRIG_TERMS.rateText} от суммы сметы по выбранному предложению — только когда вы получили первые деньги: аванс или оплату первого этапа`
  : `${BRIG_TERMS.rateText} от суммы сметы по выбранному предложению — после подтверждения договора обеими сторонами`;
BRIG_TERMS.sheetsLine = 'листы по запросу под вашу бригаду — без доплаты, пока сделка идёт через LINEA' + (BRIG_TERMS.sheetsFreeLimit ? ` (до ${BRIG_TERMS.sheetsFreeLimit} листов на объект)` : '')
  + (BRIG_TERMS.sheetsOutsidePaid ? `; вне сделки — ${rub(BRIG_TERMS.sheetPrice)} за лист` : '; вне сделки листы не выпускаем');
// «Сделка через LINEA» — сопровождение, а не гарантия (разбор юриста 01.11.2026, раздел 6): никаких «гарантия сайта», «арбитраж», «безопасно»
BRIG_TERMS.guaranteeLine = 'сервис «Сделка через LINEA» — чек-листы для вашей приёмки этапов, рассмотрение разногласий (рекомендация, право на суд сохраняется) и ответственность студии за свои чертежи — действует, пока сделка идёт через сайт';
TERMS.brigady = BRIG_TERMS;

// ── Как уходит бриф: ЕДИНСТВЕННЫЙ источник фразы (второй круг критиков 27.10.2026) ────────────────────
// Приёмник (server/api на Beget) принимает бриф с персональными данными только по https. Пока сайт живёт на GitHub Pages
// (PHP нет) и на техническом адресе Beget (только http), кнопка брифа собирает архив, и клиент сам отправляет его в
// WhatsApp или на почту, — сайт обязан говорить именно это. «Одной кнопкой … страница заказа с номером» — только на адресе
// с https и приёмником (домен после SSL). Пары [без приёмника, с приёмником]; в строках нет кавычек, &, < > вне тегов —
// они одинаково выглядят в разметке и в JSON-LD, поэтому site-rebase.js меняет вариант при выкладке простой заменой
// (swapIntake). Новая фраза про отправку брифа или правок — только сюда, руками в генераторы не вписывать.
const INTAKE = {
  brief: ['Бриф собирается в архив прямо в браузере — отправьте его нам в WhatsApp или на почту, номер заказа пришлём в ответ',
    'Бриф уходит в студию одной кнопкой — сразу открывается страница заказа с номером'],
  briefShort: ['архив брифа отправляете нам в WhatsApp или на почту',
    'уходит в студию одной кнопкой'],
  sendItem: ['<b>Отправка архивом.</b> Рассказ, план, фото и отметки собираются в один архив — его вы отправляете нам в WhatsApp или на почту, номер заказа приходит в ответ.',
    '<b>Отправка одной кнопкой.</b> Рассказ, план, фото и отметки уходят в студию одним архивом, сразу открывается страница заказа с номером. Связь подвела — тот же архив можно отправить в WhatsApp или на почту.'],
  reviewSend: ['все метки собираются в одно сообщение — WhatsApp, почта или файл.',
    'все метки уходят в студию одной кнопкой и привязываются к вашему заказу.'],
  reviewStep: ['<b>Отправьте правки</b><p>Все метки собираются в одно сообщение: WhatsApp, почта или файл. Альбом перевыпускается с правками.</p>',
    '<b>Отправьте одной кнопкой</b><p>Все метки уходят разом и привязываются к вашему заказу. Альбом перевыпускается с правками.</p>'],
  orderNo: ['Номер заказа, цену и счёт пришлём в ответ на бриф — в WhatsApp или на почту.',
    'После отправки брифа открывается страница заказа с номером — сохраните ссылку.'],
  contactsDesc: ['Бриф заполняется на сайте и отправляется архивом в WhatsApp или на почту.',
    'Бриф заполняется на сайте и уходит в студию одной кнопкой.'],
  contactsRow: ['собранный архив вы отправляете в WhatsApp или на почту',
    'уходит к нам одной кнопкой (запасной путь — архивом в WhatsApp или на почту)'],
  sumWhere: ['Сумму пришлём в WhatsApp или на почту.',
    'Сумма появляется на странице заказа.'],
  policy: ['Сейчас бриф и правки к листам на наш сервер не уходят: кнопка собирает архив в вашем браузере, и вы сами отправляете его в WhatsApp или на почту. Приём на сервер (Beget) включим только на адресе с защищённым соединением (https) — тогда эта строка изменится',
    'Бриф и правки к листам уходят на наш сервер (Beget) по защищённому соединению (https). Связь подвела — тот же архив можно отправить в WhatsApp или на почту'],
};
const intakeOnline = (site, base) => site !== 'pages' && /^https:\/\//.test(String(base));
const INTAKE_ONLINE = intakeOnline(SITE, BASE);
// текст → вариант для адреса (online = есть приёмник по https); возвращает [текст, число замен]
function swapIntake(text, online) {
  let n = 0;
  for (const pair of Object.values(INTAKE)) {
    const from = pair[online ? 0 : 1], to = pair[online ? 1 : 0];
    const parts = text.split(from);
    n += parts.length - 1;
    text = parts.join(to);
  }
  return [text, n];
}
TERMS.intake = Object.fromEntries(Object.entries(INTAKE).map(([k, v]) => [k, v[INTAKE_ONLINE ? 1 : 0]]));
TERMS.intakeOnline = INTAKE_ONLINE;

// ── Бриф: ЕДИНСТВЕННЫЙ источник описания брифа (решение Александра 31.10.2026: «план, референсы, словами — и всё»).
// Три шага + отправка. Генераторы и главная берут отсюда время и шаги; brief.html получает «что дальше» и ставки
// через tools/sync-static-nav.js (метки <!-- terms:brief -->). Фразу «как уходит бриф» по-прежнему даёт только TERMS.intake.
TERMS.brief = {
  time: 'около 5 минут',
  // честная длина (09.11.2026): основное короткое, дальше необязательные блоки вопросов — brief.html, шаги «Жизнь в квартире», «Двери, свет и электрика», «Дом»
  honest: 'основное — около 5 минут, дополнительные вопросы — по желанию',
  steps: ['План квартиры', 'Что нравится', 'Расскажите словами'],
  // одна фраза: что нужно от клиента
  what: 'план, картинки, которые нравятся, и рассказ своими словами',
  line: 'Бриф: план, картинки, которые нравятся, и рассказ своими словами (можно голосом) — основное около 5 минут, дополнительные вопросы по желанию',
  short: 'бриф — основное за 5 минут, остальное по желанию',
  // «что будет дальше» — три пункта на последнем шаге брифа (и где нужно — на страницах)
  next: [
    'Сумма уже посчитана по вашей площади — подтверждаем её в заказе до оплаты',
    'Вы оплачиваете — после оплаты начинаем работу',
    TERMS.term[0].toUpperCase() + TERMS.term.slice(1),
  ],
};

// ── Живой контакт до оплаты (разведка 03.11.2026, docs/research/2026-11-03-biznes-modeli.md, вывод 9): чисто онлайн-оплаты
// без разговора почти не случаются — до оплаты предлагаем короткий звонок или переписку. ЕДИНСТВЕННЫЙ источник фразы.
// channel — канал записи на разговор ({ title, href }, например запись в календарь или отдельный номер); null — канала нет,
// тогда связываемся сами по почте или телефону, которые клиент оставил в брифе. Сроков ответа здесь не обещаем.
const CALL_CHANNEL = null;
TERMS.call = {
  channel: CALL_CHANNEL,
  title: 'Поговорим до оплаты',
  line: 'Короткий звонок или переписка: обсудим ваш план за 15 минут. '
    + (CALL_CHANNEL ? `Выберите удобный канал: ${CALL_CHANNEL.title}.` : 'Свяжемся по почте или телефону из брифа.'),
};

const beta = u => `<div class="beta">Дизайн-проект квартиры ${TERMS.fromLine}<span class="b-x"> · работа начинается после оплаты</span> · <a href="${u}price/">цена и условия</a><span class="b-x"> · <a href="${u}brief.html">заполнить бриф</a></span></div>`;

const sticky = u => `<div class="sticky-cta">
  <a class="btn" href="${u}brief.html">Заполнить бриф</a>
  <a class="btn ghost" href="tel:${AUTHOR.tel}">Позвонить</a>
</div>`;

// в подвале к разделам добавляются служебные страницы
// Договор-оферта — черновик (решение 01.11.2026): пока OFERTA_DRAFT = true, ссылки на него нет в подвале, навигации и карте сайта;
// страница oferta/ остаётся (noindex, вне sitemap.xml). Снять флаг — ссылки вернутся сами (gen-more-pages.js берёт флаг отсюда).
const OFERTA_DRAFT = true;
const FOOTER_EXTRA_ALL = [
  { title: 'Условия', href: 'price/' },
  { title: 'Процесс', href: 'process/' }, { title: 'FAQ', href: 'faq/' },
  { title: 'О студии', href: 'about/' }, { title: 'Контакты', href: 'contacts/' },
  { title: 'Чек-лист приёмки', href: 'checklist/' }, { title: 'Карта сайта', href: 'sitemap/' },
  { title: 'Оплата', href: 'oplata/' }, { title: 'Договор-оферта', href: 'oferta/' },
  { title: 'Обработка данных', href: 'policy/' }, { title: 'Согласие на обработку данных', href: 'soglasie/' },
];
const FOOTER_EXTRA = FOOTER_EXTRA_ALL.filter(x => !(OFERTA_DRAFT && x.href === 'oferta/'));
/**
 * Упоминание договора-оферты в тексте страниц (QA 01.11.2026, B1) — единственный способ ссылаться на oferta/ из генераторов.
 * Пока OFERTA_DRAFT = true, ссылки на черновик нет: выводится нейтральная фраза draft (по умолчанию — «условия — на странице
 * заказа до оплаты»). Снять флаг — вернётся ссылка: before + <a href="{up}oferta/">{text}</a> + after.
 *   up — путь к корню сайта от страницы ('../', '../../'); text — «договору-оферте», «в договоре-оферте» и т. п.
 */
function ofertaRef(up, text, { before = '', after = '', draft = 'условия — на странице заказа до оплаты' } = {}) {
  return OFERTA_DRAFT ? draft : `${before}<a href="${up}oferta/">${text}</a>${after}`;
}
// Воронка сайта: три состояния посетителя. Полоса стоит перед подвалом на
// каждой странице и всегда показывает, где человек сейчас и что дальше.
const FUNNEL = [
  { key: 'look', title: 'Посмотреть', text: 'альбомы целиком, лист за листом', href: 'portfolio-hub/', on: ['portfolio', 'cases', 'stories', 'reviews', 'style'] },
  { key: 'check', title: 'Сравнить', text: 'состав, сроки и условия с рынком', href: 'compare/', on: ['compare', 'catalog', 'journal'] },
  { key: 'start', title: 'Начать', text: `${TERMS.brief.short}; ${TERMS.fromLine}, сумма — до оплаты`, href: 'brief.html', on: [] },
];
function funnel(u, active) {
  const cur = FUNNEL.findIndex(f => f.on.includes(active));
  const i0 = cur < 0 ? 0 : cur;
  return `<section class="funnel" aria-label="Что дальше">
  <div class="wrap">
${FUNNEL.map((f, i) => `    <a class="fstep${i === i0 ? ' on' : ''}${i < i0 ? ' done' : ''}" href="${u + f.href}">
      <span class="fnum">${String(i + 1).padStart(2, '0')}</span>
      <span class="ftitle">${f.title}</span>
      <span class="ftext">${f.text}</span>
    </a>`).join('\n')}
  </div>
</section>`;
}

// CTA перед воронкой: текст и второе действие зависят от того, на каком шаге
// пути человек находится. «Посмотреть» зовёт сравнить, «Сравнить» — вернуться
// к альбомам или начать; финал везде один — бриф.
// Срок везде один (решение студии): проект квартиры — TERMS.daysFrom (1–3 суток от оплаты и получения плана с размерами).
function ctaBlock(u, active, opts = {}) {
  const step = FUNNEL.find(f => f.on.includes(active));
  const term = TERMS.timeFirst;
  let kicker = 'Дальше', h = 'Свой проект — с того же места',
    sub = `${TERMS.brief.line}. Цена ${TERMS.fromLine}; ${TERMS.sumShort}. Работа начинается после оплаты. ${term}.`,
    second = `<a class="btn ghost" href="${u}portfolio-hub/">Посмотреть альбомы</a>`;
  if (step && step.key === 'look') {
    kicker = 'Понравилось?';
    h = 'Теперь сравните — потом решайте';
    sub = 'Не верьте на слово даже нам: рядом таблица, где то же самое разложено против планировщиков, студий и бюро. А бриф — ' + TERMS.brief.honest + ', когда решите.';
    second = `<a class="btn ghost" href="${u}compare/">Сравнить с рынком</a>`;
  } else if (step && step.key === 'check') {
    kicker = 'Всё сходится?';
    h = 'Тогда дальше — бриф: основное за ' + TERMS.brief.time.replace('около ', '');
    sub = 'План, картинки, которые нравятся, и пара слов о том, как вы живёте. ' + TERMS.sumLine + '; проект начинается после оплаты.';
    second = `<a class="btn ghost" href="${u}portfolio-hub/">Ещё раз взглянуть на альбомы</a>`;
  }
  return `<section class="blk cta-blk">
  <div class="wrap">
    <div class="kicker">${kicker}</div>
    <h2>${h}</h2>
    <p class="sub">${sub}</p>
    <div class="cta-row">
      <a class="btn" href="${u}brief.html">Заполнить бриф</a>
      ${second}
      <a class="btn ghost" href="tel:${AUTHOR.tel}">${AUTHOR.phone}</a>
    </div>
    <p class="hint" style="margin-top:18px">Автор проекта — ${AUTHOR.role} ${AUTHOR.name}. ${active === 'gost'
      ? `В основной надписи листов этих альбомов указана его фамилия; телефона и почты на листах нет — они <a href="${u}contacts/">на странице контактов</a>.`
      : `Фамилия автора стоит в основной надписи каждого листа, телефон — <a href="${u}contacts/">на странице контактов</a>.`}</p>
  </div>
</section>`;
}

// Подвал: все разделы сайта сгруппированы (решение 09.11.2026 — из шапки убрано всё, кроме четырёх пунктов).
// Группы — единственный список; sync-static-nav.js переносит тот же блок в index.html и brief.html (метки <!-- fnav -->).
const FOOT_GROUPS = [
  ['Примеры', [['Портфолио', 'portfolio-hub/', 'portfolio'], ['Кейсы', 'cases/', 'cases'], ['Истории', 'stories/', 'stories'], ['Стили интерьера', 'style/', 'style'], ['Отзывы', 'reviews/', 'reviews']]],
  ['Цена и условия', [['Цена и что входит', 'price/'], ['Как работаем', 'process/'], ['Вопросы и ответы', 'faq/'], ['Каталог услуг', 'catalog/', 'catalog'], ['Сравнение с рынком', 'compare/', 'compare'], ['Оплата', 'oplata/']]],
  ['Документация', [['Что такое альбом чертежей', 'gost/', 'gost'], ['Чек-лист приёмки', 'checklist/'], ['Журнал', 'journal/', 'journal']]],
  ['Студия', [['О студии', 'about/'], ['Контакты', 'contacts/'], ['Бриф', 'brief.html'], ['Ремонт по проекту', 'remont/', 'remont'], ['Бригадам', 'brigadam/', 'brigadam']]],
  ['Документы', [['Обработка данных', 'policy/'], ['Согласие на обработку данных', 'soglasie/'], ['Договор-оферта', 'oferta/'], ['Карта сайта', 'sitemap/']]],
];
function footerNav(u, active) {
  const groups = FOOT_GROUPS.map(([h, items]) => {
    const list = items.filter(it => !(OFERTA_DRAFT && it[1] === 'oferta/'))
      .map(([t, href, key]) => `<a href="${key && key === active ? './' : u + href}">${t}</a>`).join('');
    return `<div><h4>${h}</h4>${list}</div>`;
  }).join('');
  return `<nav class="fnav" aria-label="Все разделы сайта">${groups}</nav>`;
}

function footer(u, active) {
  return `${funnel(u, active)}

<a class="to-top" href="#" aria-label="Наверх">↑</a>

<footer class="site">
  <div class="wrap cols">
    <div>
      <div class="logo">LINE<i>A</i></div>
      <p>Дизайн-проект квартиры по вашему плану:<br>чертежи, визуализации и смета в двух альбомах.<br>Программа чертит, автор проверяет решения.</p>
      <p>${AUTHOR.role} <b>${AUTHOR.name}</b><br><a href="tel:${AUTHOR.tel}">${AUTHOR.phone}</a> · <a href="mailto:${AUTHOR.email}">${AUTHOR.email}</a></p>
    </div>
    <div class="f-links">
      <!-- fnav -->${footerNav(u, active)}<!-- /fnav -->
      <p>© LINEA studio, 2026</p>
    </div>
  </div>
</footer>
<script>
(function () {
  var b = document.querySelector('.burger'), m = document.querySelector('.mnav');
  if (!b || !m) return;
  b.addEventListener('click', function () {
    var open = m.hidden;
    m.hidden = !open;
    b.classList.toggle('on', open);
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    b.setAttribute('aria-label', open ? 'Закрыть меню' : 'Меню');
    document.documentElement.style.overflow = open ? 'hidden' : '';
    document.documentElement.classList.toggle('menu-open', open);   // шапка с кнопкой — над меню, иначе меню не закрыть
  });
  m.addEventListener('click', function (e) { if (e.target.tagName === 'A' || e.target === m) b.click(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !m.hidden) b.click(); });
})();
</script>`;
}

// Видимые хлебные крошки: и навигация, и сигнал структуры для поиска
function crumbsBar(u, items) {
  return `<nav class="crumbs" aria-label="Хлебные крошки"><div class="wrap">`
    + `<a href="${u}">Главная</a>` + items.map(it => it[1] ? `<a href="${it[1]}">${esc(it[0])}</a>` : `<span>${esc(it[0])}</span>`).join('')
    + `</div></nav>`;
}

// <picture> c WebP-источником и JPG-фолбэком: одна замена расширения,
// файлы .webp кладёт tools/make-webp (cwebp), верстка не знает о форматах
function pic(src, alt, w, h, cls) {
  const webp = src.replace(/\.jpe?g$/i, '.webp');
  return `<picture><source srcset="${webp}" type="image/webp"><img src="${src}" alt="${esc(alt)}" width="${w || 1200}" height="${h || 800}" loading="lazy" decoding="async"${cls ? ` class="${cls}"` : ''}></picture>`;
}

// Крошки для типовых страниц: раздел из SECTIONS + необязательное имя страницы
function crumbsAuto(u, section, pageTitle) {
  const sec = SECTIONS.find(x => x.key === section);
  if (!sec) return pageTitle ? crumbsBar(u, [[pageTitle, null]]) : '';
  return crumbsBar(u, pageTitle ? [[sec.title, u + sec.href], [pageTitle, null]] : [[sec.title, null]]);
}

const crumbsLd = items => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], item: it[1] })),
});

// Картинка для превью ссылки: по умолчанию кадр hero; страница может передать
// свою — { src (абсолютный адрес), w, h }. Размеры пишем, только когда известны.
const OG_DEFAULT = { src: `${BASE}/assets/hero.jpg`, w: 1600, h: 1066 };
const ogImageTags = img => `<meta property="og:image" content="${img.src}">`
  + (img.w && img.h ? `\n<meta property="og:image:width" content="${img.w}">\n<meta property="og:image:height" content="${img.h}">` : '');

const head = (u, { title, desc, canonical, ogTitle, ogDesc, ogType, ogImage, extra }) => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(clamp(desc))}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${ogType || 'website'}">
<meta property="og:site_name" content="LINEA">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(ogTitle || title)}">
<meta property="og:description" content="${esc(ogDesc || desc)}">
${ogImageTags(ogImage || OG_DEFAULT)}
<meta property="og:locale" content="ru_RU">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23EBDCA8'/><stop offset='.5' stop-color='%23C9A45F'/><stop offset='1' stop-color='%238F6B33'/></linearGradient></defs><rect width='100' height='100' fill='%230F0E0C'/><text x='50' y='70' font-size='56' text-anchor='middle' fill='url(%23g)' font-family='Georgia'>L</text><rect x='66' y='62' width='10' height='10' transform='rotate(45 71 67)' fill='%231E6E57' stroke='%23C9A45F' stroke-width='2'/></svg>">
<link rel="apple-touch-icon" href="${BASE}/apple-touch-icon.png">
${/^https?:/.test(u) ? '' : `<link rel="preload" href="${u}assets/fonts/inter-n-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${u}assets/fonts/playfair-display-n-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
`}<link rel="stylesheet" href="${u}css/main.css?${CSSV}">${extra || ''}`;

// страница-переход со старого адреса (дома убраны с сайта 06.11.2026): noindex, canonical и мгновенный переход
function movedPage(u, toRel, title) {
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | LINEA</title><meta name="robots" content="noindex,follow">
<meta http-equiv="refresh" content="0; url=${u}${toRel}">
<script>location.replace('${u}${toRel}'+location.hash)</script>
<style>body{background:#100F0C;color:#E9E2D2;font:16px/1.6 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center}a{color:#C9A45F}</style>
</head><body><p>LINEA делает дизайн-проекты квартир. Страница переехала: <a href="${u}${toRel}">${title}</a>.</p></body></html>
`;
}

module.exports = {
  movedPage, OFERTA_DRAFT, ofertaRef, FOOT_GROUPS, footerNav, HEADER, TERMS, BRIG_TERMS, INTAKE, intakeOnline, swapIntake, AUTHOR, BASE, SITE, SITE_BASES, SITE_DOMAIN_RU, CSSV, SECTIONS, FOOTER_EXTRA, FUNNEL, funnel, ctaBlock, crumbsBar, crumbsAuto, pic, esc, clamp, header, footer, beta, sticky, crumbsLd, head };
