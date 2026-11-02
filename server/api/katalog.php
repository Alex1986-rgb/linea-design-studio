<?php
/**
 * Публичный каталог бригад: /brigady/ и /brigady/<slug>/ (rewrite в .htaccess — tools/site-rebase.js), карта /brigady/sitemap.xml.
 * Рендер из базы на каждый запрос (не пересборка статики: выкладка rsync не затрёт, данные всегда свежие).
 * Только допущенные бригады (status = active). Телефон и почту бригады не публикуем — связь через сайт; имя бригадира — только
 * с его согласия (public_name). Рейтинг и отзывы — только от клиентов завершённых объектов; AggregateRating в schema.org —
 * только при реальных отзывах. Каркас страницы (шапка, подвал, стили) — brigade/tpl/shell.html из tools/gen-brigady-pages.js.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/brig.php';

brig_db();
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$base = linea_base();
$API = '/api/';

function k_out(string $title, string $desc, string $canon, string $body, array $ld = [], bool $noindex = false, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: public, max-age=300');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    $tpl = is_file(__DIR__ . '/brigade/tpl/shell.html') ? (string)file_get_contents(__DIR__ . '/brigade/tpl/shell.html') : '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>%%TITLE%%</title>%%EXTRA%%</head><body>%%BODY%%</body></html>';
    $e = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $extra = ($noindex ? '<meta name="robots" content="noindex, follow">' : '') . implode('', array_map(fn($x) => '<script type="application/ld+json">' . json_encode($x, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) . '</script>', $ld));
    echo strtr($tpl, ['%%TITLE%%' => $e($title), '%%DESC%%' => $e(mb_substr($desc, 0, 158)), '%%CANON%%' => $e($canon), '%%EXTRA%%' => $extra, '%%BODY%%' => $body]);
    exit;
}

// ── карта сайта каталога
if (isset($_GET['sitemap'])) {
    header('Content-Type: application/xml; charset=utf-8');
    echo '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' . $h($base . '/brigady/') . '</loc></url>';
    foreach (brig_all("SELECT slug, updated_at FROM br_brigades WHERE status = 'active' AND (card_consent_ed IS NULL OR card_consent_ed <> 'revoked') AND test = 0 AND demo = 0 ORDER BY id") as $b) {
        echo '<url><loc>' . $h($base . '/brigady/' . $b['slug'] . '/') . '</loc><lastmod>' . $h(substr((string)$b['updated_at'], 0, 10)) . '</lastmod></url>';
    }
    echo '</urlset>';
    exit;
}

$img = fn(int $id, string $alt, string $cls = '') => '<img src="' . $API . 'brigade/file.php?f=' . $id . '" alt="' . $h($alt) . '" loading="lazy" decoding="async"' . ($cls ? ' class="' . $cls . '"' : '') . '>';
$stars = fn(?float $v) => $v === null ? '' : '<span class="k-stars" aria-label="Рейтинг ' . $v . ' из 5">' . str_repeat('★', (int)round($v)) . str_repeat('☆', 5 - (int)round($v)) . '</span>';
$plural = fn(int $n, string $a, string $b, string $c) => $n . ' ' . ($n % 10 === 1 && $n % 100 !== 11 ? $a : (in_array($n % 10, [2, 3, 4], true) && !in_array($n % 100, [12, 13, 14], true) ? $b : $c));
$ava = fn(array $c, string $cls) => $c['logo'] ? $img($c['logo'], 'Логотип: ' . $c['name'], $cls) : '<span class="' . $cls . '" aria-hidden="true">'
    . $h(mb_strtoupper(implode('', array_map(fn($w) => mb_substr(trim($w), 0, 1), array_slice(str_contains($c['name'], ':') ? explode(':', $c['name'], 2) : preg_split('/[\s—-]+/u', $c['name'], -1, PREG_SPLIT_NO_EMPTY), 0, 2))))) . '</span>';
$CAP = 'иллюстрация из проекта LINEA';
$dz = fn(array $d) => implode(', ', array_map(fn($x) => str_replace(['Москва · ', 'МО · '], ['', 'МО, '], $x), $d));
$DEMO_NOTE = 'Пример карточки — бригады подключаются, это образец. Фото — иллюстрации из проекта LINEA, а не снимки выполненных объектов.';
$NONE = '<span class="k-no">у примера нет</span>';
$invite = fn(array $c, string $cls = 'btn') => $c['demo']
    ? '<a class="' . $cls . '" href="/remont/" title="Как пригласить бригаду в свой проект">Пригласить</a>'
    : '<span class="k-invite" data-slug="' . $h($c['slug']) . '"><a class="' . $cls . '" href="/remont/" data-inv>Пригласить</a><span class="hint" role="status"></span></span>';
$allPhotos = fn(array $c) => array_merge(...array_map(fn($p) => array_merge($p['after'], $p['before']), $c['portfolio'] ?: [['after' => [], 'before' => []]]));
$HOW = '<ol class="k-how"><li><b>Проект</b>Альбом с ведомостями и сметой</li><li><b>Предложения</b>2–5 бригад считают по позициям</li><li><b>Выбор</b>Сравнение в одной таблице, договор</li><li><b>Этапы</b>Листы по запросу, фото, приёмка</li></ol>';
$JOIN = '<div class="k-join"><div><h2>Вы бригада?</h2><p>Заказы с готовым альбомом и сметой по позициям, листы по запросу голосом — без доплаты внутри сделки. Вознаграждение ' . $h(brig_rate_text()) . ' — только когда договор подтвердили обе стороны.</p></div><a class="btn" href="/brigadam/">Подключиться</a></div>';

$slug = (string)($_GET['slug'] ?? '');
if ($slug !== '') {
    $b = preg_match('/^[a-z0-9-]{3,70}$/', $slug) ? brig_one("SELECT * FROM br_brigades WHERE slug = ? AND status = 'active' AND (card_consent_ed IS NULL OR card_consent_ed <> 'revoked')", [$slug]) : null;
    if (!$b) {
        k_out('Бригада не найдена — LINEA', 'Бригада не найдена или сейчас не принимает заказы.', $base . '/brigady/', '<section class="blk hero-page"><div class="wrap"><h1>Бригада не найдена</h1><p>Бригада не найдена или сейчас не принимает заказы. <a href="/brigady/">Все бригады</a></p></div></section>', [], true, 404);
    }
    $c = brig_public_card($b, $API);
    $demo = $c['demo'];
    $rev = $demo ? [] : brig_reviews_public((int)$b['id']);
    $canon = $base . '/brigady/' . $b['slug'] . '/';
    $photos = $allPhotos($c);
    $port = '';
    foreach ($c['portfolio'] as $p) {
        $fig = fn(array $ids, string $lbl) => implode('', array_map(fn($i) => '<figure>' . $img($i, $p['title'] . ($lbl ? ' — ' . $lbl : '')) . '<figcaption>' . $h($demo ? $CAP : $lbl) . '</figcaption></figure>', $ids));
        $port .= '<article class="k-obj"><h3>' . $h($p['title']) . '</h3><p>' . $h(implode(' · ', array_filter([$p['district'], $p['area'] ? $p['area'] . ' м²' : '', $p['year'] ? (string)$p['year'] : '']))) . ($p['works'] ? ($p['district'] || $p['area'] || $p['year'] ? '<br>' : '') . nl2br($h($p['works'])) : '') . '</p>'
            . '<div class="k-gal">' . $fig($p['before'], 'до') . $fig($p['after'], $demo ? '' : 'после') . '</div></article>';
    }
    $resp = $c['responseHours'];
    $stats = [[(string)($c['teamSize'] ?? '—'), 'мастеров в бригаде'], [$c['experience'] !== null ? $plural($c['experience'], 'год', 'года', 'лет') : '—', 'опыт'],
        [$c['warrantyMonths'] ? $c['warrantyMonths'] . ' мес.' : '—', 'гарантия на работы'],
        [$resp === null ? '—' : ($resp < 1 ? '< 1 ч' : ($resp < 36 ? round($resp) . ' ч' : $plural((int)round($resp / 24), 'день', 'дня', 'дней'))), 'ответ на запрос' . ($resp === null ? ($demo ? ' — у примера нет' : ' — данных пока нет') : '')]];
    $official = [
        ['Статус', $h($c['legal']) . ' · работает по договору подряда с клиентом' . ($demo ? '' : '; реквизиты исполнителя клиент видит до выбора')],
        ['ИНН проверен', $demo ? '<span class="k-no">у примера нет — у настоящей бригады: «статус подтверждён ФНС, дата»</span>' : ($c['innChecked'] ? 'да, ' . $h(date('d.m.Y', strtotime($c['innChecked']))) : '<span class="k-no">нет</span>')],
        ['Видеозвонок с LINEA', $demo ? '<span class="k-no">у примера нет — у настоящей: дата проверки</span>' : ($c['callPassed'] ? 'пройден' : '<span class="k-no">нет</span>')],
        ['По проектам LINEA', $demo ? $NONE : $plural($c['jobsDone'], 'объект сдан', 'объекта сдано', 'объектов сдано')],
        ['Как работает', 'Смета по позициям альбома LINEA, этапы с фотоотчётом, приёмка заказчиком по чек-листу'],
        ['Что проверяет LINEA', 'Документы на дату проверки: ИНН и статус по базе ФНС, видеозвонок. Квалификацию и качество работ не проверяем: бригада — самостоятельный подрядчик и отвечает за работы по договору'],
        ['Отзывы', $demo ? '<span class="k-no">только от клиентов LINEA после приёмки работ</span>' : ($c['rating']['n'] ? $stars($c['rating']['avg']) . ' ' . $c['rating']['avg'] . ' · ' . $plural($c['rating']['n'], 'отзыв', 'отзыва', 'отзывов') : '<span class="k-no">пока нет — только от клиентов LINEA после приёмки работ</span>')],
    ];
    if ($c['contactName']) { array_unshift($official, ['Бригадир', $h($c['contactName'])]); }
    $revs = $rev ? '<h2>Отзывы клиентов LINEA</h2>' . implode('', array_map(fn($r) => '<blockquote class="k-rev">' . $stars((float)$r['rating']) . '<p>' . nl2br($h($r['text'] ?: 'Без текста')) . '</p><footer class="mut">Клиент LINEA · ' . $h($r['object']) . ' · ' . $h(date('d.m.Y', strtotime($r['at']))) . '</footer></blockquote>', $rev)) : '';
    $body = '<nav class="crumbs" aria-label="Хлебные крошки"><div class="wrap"><a href="/">Главная</a><a href="/remont/">Ремонт по проекту</a><a href="/brigady/">Бригады</a><span>' . $h($c['name']) . '</span></div></nav>'
        . '<section class="blk k-page"><div class="wrap k-narrow">' . ($demo ? '<p class="k-demo">' . $h($DEMO_NOTE) . '</p>' : '')
        . '<article class="k-card">'
        . ($photos ? '<div class="k-hero">' . $img($photos[0], 'Объект: ' . $c['name']) . ($demo ? '<span class="k-cap">' . $h($CAP) . '</span>' : '') . '</div>' : '')
        . '<div class="k-head">' . $ava($c, 'k-ava') . '<div><h1>' . $h($c['name']) . '</h1><p class="k-sub">' . $h($dz($c['districts'])) . ' · работает по проектам LINEA</p></div></div>'
        . '<ul class="k-chips">' . implode('', array_map(fn($x) => '<li>' . $h($x) . '</li>', $c['specs'])) . '</ul>'
        . '<dl class="k-stats">' . implode('', array_map(fn($x) => '<div><dt>' . $h($x[0]) . '</dt><dd>' . $h($x[1]) . '</dd></div>', $stats)) . '</dl>'
        . ($c['about'] ? '<p class="k-about">' . nl2br($h($c['about'])) . '</p>' : '')
        . '<h2>Портфолио</h2>' . ($port ?: '<p class="k-about">Портфолио пока пусто.</p>')
        . '<h2>Официальные данные</h2><table class="k-off">' . implode('', array_map(fn($x) => '<tr><td>' . $h($x[0]) . '</td><td>' . $x[1] . '</td></tr>', $official)) . '</table>'
        . $revs
        . '<p class="k-note">Телефон бригады не публикуем: связь — через страницу вашего заказа. Есть проект LINEA — пригласите бригаду в запрос; проекта нет — <a href="/brief.html">начните с брифа</a>.</p>'
        . '<div class="k-btns">' . $invite($c) . '<a class="btn ghost" href="/brigady/">Все бригады</a></div>'
        . '</article></div></section><script src="/js/katalog.js?v=2" defer></script>';
    $ld = [];
    if (!$demo) {   // у примера — без schema.org (тестовые бригады всё равно noindex)
        $l = ['@context' => 'https://schema.org', '@type' => 'HomeAndConstructionBusiness', 'name' => $c['name'], 'url' => $canon,
            'description' => mb_substr($c['about'] ?: ('Ремонтная бригада: ' . implode(', ', $c['specs'])), 0, 300), 'areaServed' => [['@type' => 'City', 'name' => 'Москва'], ['@type' => 'AdministrativeArea', 'name' => 'Московская область']],
            'knowsAbout' => $c['specs']];
        if ($c['logo']) { $l['image'] = $base . $API . 'brigade/file.php?f=' . $c['logo']; }
        if ($c['rating']['n'] > 0) {   // AggregateRating — только при реальных отзывах
            $l['aggregateRating'] = ['@type' => 'AggregateRating', 'ratingValue' => $c['rating']['avg'], 'reviewCount' => $c['rating']['n'], 'bestRating' => 5, 'worstRating' => 1];
            $l['review'] = array_map(fn($r) => ['@type' => 'Review', 'reviewRating' => ['@type' => 'Rating', 'ratingValue' => $r['rating'], 'bestRating' => 5], 'author' => ['@type' => 'Person', 'name' => 'Клиент LINEA'], 'datePublished' => $r['at'], 'reviewBody' => $r['text']], array_slice($rev, 0, 10));
        }
        $ld = [$l, ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => 'LINEA', 'item' => $base . '/'], ['@type' => 'ListItem', 'position' => 2, 'name' => 'Бригады', 'item' => $base . '/brigady/'],
            ['@type' => 'ListItem', 'position' => 3, 'name' => $c['name'], 'item' => $canon]]]];
    }
    k_out($c['name'] . ($demo ? ' — пример карточки' : ' — бригада по ремонту квартир, Москва и МО') . ' | LINEA', ($demo ? 'Пример карточки бригады «Ремонт по проекту». ' : 'Бригада ' . $c['name'] . ': ') . implode(', ', $c['specs']) . '. Работа по договору подряда, этапы с фото, приёмка по чек-листу.', $canon, $body, $ld, $demo || (bool)$b['test']);
}

// ── список с фильтрами (GET-форма: работает без JS; адреса с фильтрами — noindex)
$fs = isset(BRIG_SPECS[$_GET['spec'] ?? '']) ? (string)$_GET['spec'] : '';
$fd = isset(BRIG_DISTRICTS[$_GET['district'] ?? '']) ? (string)$_GET['district'] : '';
$fr = in_array((string)($_GET['rating'] ?? ''), ['3', '4', '4.5'], true) ? (float)$_GET['rating'] : 0.0;
$fb = max(0, (int)($_GET['budget'] ?? 0));
$test = isset($_GET['test']) && linea_local() ? 1 : 0;
$rows = brig_all("SELECT * FROM br_brigades WHERE status = 'active' AND (card_consent_ed IS NULL OR card_consent_ed <> 'revoked') AND demo = 0 AND test = ? ORDER BY admitted_at", [$test]);
$demoMode = !$rows;            // настоящих бригад нет — показываем образцы с плашкой
if ($demoMode) { $rows = brig_all("SELECT * FROM br_brigades WHERE status = 'active' AND (card_consent_ed IS NULL OR card_consent_ed <> 'revoked') AND demo = 1 ORDER BY id"); }
$cards = [];
foreach ($rows as $b) {
    $specs = json_decode($b['specs'], true) ?: []; $dist = json_decode($b['districts'], true) ?: [];
    if ($fs && !in_array($fs, $specs, true)) { continue; }
    if ($fd && !in_array($fd, $dist, true)) { continue; }
    if ($fb && (!$b['price_from'] || (int)$b['price_from'] > $fb)) { continue; }
    $c = brig_public_card($b, $API);
    if ($fr && ($c['rating']['avg'] === null || $c['rating']['avg'] < $fr)) { continue; }
    $cards[] = $c;
}
if (!$demoMode) { usort($cards, fn($a, $b) => [($b['rating']['avg'] ?? 0), $b['jobsDone']] <=> [($a['rating']['avg'] ?? 0), $a['jobsDone']]); }
$opt = fn(array $m, string $cur, string $all) => '<option value="">' . $all . '</option>' . implode('', array_map(fn($k, $t) => '<option value="' . $h($k) . '"' . ($k === $cur ? ' selected' : '') . '>' . $h($t) . '</option>', array_keys($m), $m));
$filters = '<form class="k-filter" method="get" action="/brigady/"><label>Работы<select name="spec">' . $opt(BRIG_SPECS, $fs, 'Все работы') . '</select></label>'
    . '<label>Район<select name="district">' . $opt(BRIG_DISTRICTS, $fd, 'Москва и МО') . '</select></label>'
    . '<label>Рейтинг<select name="rating">' . $opt(['3' => 'от 3', '4' => 'от 4', '4.5' => 'от 4,5'], $fr ? (string)$fr : '', 'Любой') . '</select></label>'
    . '<label>Бюджет работ, ₽/м²<select name="budget">' . $opt(['5000' => 'до 5 000', '8000' => 'до 8 000', '12000' => 'до 12 000', '20000' => 'до 20 000'], $fb ? (string)$fb : '', 'Любой') . '</select></label>'
    . '<button class="btn sm" type="submit">Показать</button></form>';
$list = '';
foreach ($cards as $c) {
    $ph = array_slice($allPhotos($c), 0, 3);
    $url = '/brigady/' . $h($c['slug']) . '/';
    $nObj = count($c['portfolio']);
    $meta = $h($c['legal']) . ' · портфолио: ' . $plural($nObj, 'объект', 'объекта', 'объектов')
        . ($c['demo'] ? ' · отзывы и отметки проверки — только у настоящих бригад'
            : ($c['innChecked'] ? ' · ИНН проверен' : '') . ($c['callPassed'] ? ' · видеозвонок' : '') . ' · по проектам LINEA: ' . $c['jobsDone']
            . ($c['responseHours'] !== null ? ' · ответ: ' . ($c['responseHours'] < 1 ? '< 1 ч' : round($c['responseHours']) . ' ч') : '')
            . ($c['priceFrom'] ? ' · от ' . number_format($c['priceFrom'], 0, ',', ' ') . ' ₽/м²' : ''));
    $list .= '<article class="k-item">'
        . '<a class="k-ph" href="' . $url . '" tabindex="-1" aria-hidden="true">' . ($ph ? implode('', array_map(fn($i) => $img($i, ''), $ph)) : '<span class="k-mono">' . $h(mb_substr($c['name'], 0, 1)) . '</span>')
        . ($c['demo'] ? '<span class="k-cap">иллюстрации LINEA</span><em class="k-tag">образец</em>' : '') . '</a>'
        . '<div class="k-body"><div class="k-hd">' . $ava($c, 'k-ava sm') . '<div><h3><a href="' . $url . '">' . $h($c['name']) . '</a></h3><div class="k-z">' . $h($dz($c['districts'])) . '</div></div></div>'
        . ($c['rating']['n'] ? '<p class="k-r">' . $stars($c['rating']['avg']) . ' ' . $c['rating']['avg'] . ' · ' . $plural($c['rating']['n'], 'отзыв', 'отзыва', 'отзывов') . '</p>' : '')
        . '<ul class="k-chips sm">' . implode('', array_map(fn($x) => '<li>' . $h($x) . '</li>', array_slice($c['specs'], 0, 6))) . '</ul>'
        . '<dl class="k-kv"><div><dt>' . $h((string)($c['teamSize'] ?? '—')) . '</dt><dd>мастеров</dd></div><div><dt>' . ($c['experience'] !== null ? $h($plural($c['experience'], 'год', 'года', 'лет')) : '—') . '</dt><dd>опыт</dd></div><div><dt>' . ($c['warrantyMonths'] ? $c['warrantyMonths'] . ' мес.' : '—') . '</dt><dd>гарантия</dd></div></dl>'
        . '<p class="k-meta">' . $meta . '</p>'
        . '<div class="k-btns"><a class="btn ghost sm" href="' . $url . '">Карточка</a>' . $invite($c, 'btn sm') . '</div></div></article>';
}
$filtered = $fs || $fd || $fr || $fb;
$body = '<nav class="crumbs" aria-label="Хлебные крошки"><div class="wrap"><a href="/">Главная</a><a href="/remont/">Ремонт по проекту</a><span>Бригады</span></div></nav>'
    . '<section class="blk k-page"><div class="wrap">' . ($demoMode ? '<p class="k-demo">Пример страницы — бригады подключаются. Карточки ниже — образцы; фото — иллюстрации из проекта LINEA, не снимки выполненных объектов.</p>' : '')
    . '<div class="kicker">Ремонт по проекту</div><h1 class="k-h1">Бригады для ремонта по вашему проекту</h1>'
    . '<p class="lead-page">Выбор необязателен: проект ваш, ремонтировать можно с кем угодно. Если удобнее с нами — бригады отвечают сметой по позициям вашего альбома, а на каждом этапе получают нужные листы. Каждая настоящая бригада проходит проверку документов (ИНН и статус по базе ФНС на дату проверки) и видеозвонок; квалификацию и качество работ мы не проверяем — бригада самостоятельный подрядчик. Отзывы — только от клиентов, чьи объекты она сдала.</p>'
    . $HOW . $filters . '<div class="k-grid">' . ($list ?: '<p class="mut">По этим условиям бригад нет — ослабьте фильтр.</p>') . '</div>'
    . $JOIN . '</div></section><script src="/js/katalog.js?v=2" defer></script>';
// пока настоящих бригад нет, сниппет говорит «пример» прямо (критик продукта 01.11.2026): карточки — образцы
k_out(($demoMode ? 'Пример каталога бригад' : 'Бригады для ремонта по дизайн-проекту') . ' — Москва и МО | LINEA',
    $demoMode ? 'Пример каталога бригад LINEA: карточки — образцы, бригады подключаются. Настоящие бригады проходят проверку ИНН и видеозвонок; отзывы — только от клиентов.'
        : 'Каталог ремонтных бригад LINEA: проверка ИНН и видеозвонок, договор подряда напрямую, портфолио, отзывы только реальных клиентов. Москва и МО.', $base . '/brigady/', $body,
    $demoMode || $test ? [] : [['@context' => 'https://schema.org', '@type' => 'ItemList', 'itemListElement' => array_map(fn($c, $i) => ['@type' => 'ListItem', 'position' => $i + 1, 'url' => $base . '/brigady/' . $c['slug'] . '/', 'name' => $c['name']], $cards, array_keys($cards))]],
    $filtered || $demoMode || (bool)$test);
