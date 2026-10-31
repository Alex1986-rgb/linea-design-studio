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
    foreach (brig_all("SELECT slug, updated_at FROM br_brigades WHERE status = 'active' AND test = 0 ORDER BY id") as $b) {
        echo '<url><loc>' . $h($base . '/brigady/' . $b['slug'] . '/') . '</loc><lastmod>' . $h(substr((string)$b['updated_at'], 0, 10)) . '</lastmod></url>';
    }
    echo '</urlset>';
    exit;
}

$img = fn(int $id, string $alt, string $cls = '') => '<img src="' . $API . 'brigade/file.php?f=' . $id . '" alt="' . $h($alt) . '" loading="lazy" decoding="async"' . ($cls ? ' class="' . $cls . '"' : '') . '>';
$stars = fn(?float $v) => $v === null ? '' : '<span class="k-stars" aria-label="Рейтинг ' . $v . ' из 5">' . str_repeat('★', (int)round($v)) . str_repeat('☆', 5 - (int)round($v)) . '</span>';
$badges = function (array $c) use ($h) {
    $out = [];
    if ($c['innChecked']) { $out[] = 'ИНН проверен ' . date('d.m.Y', strtotime($c['innChecked'])); }
    $out[] = $c['legal'];
    if ($c['callPassed']) { $out[] = 'Видеозвонок пройден'; }
    $out[] = 'Работает по договору подряда';
    $out[] = 'По проектам LINEA: ' . $c['jobsDone'] . ' ' . ($c['jobsDone'] % 10 === 1 && $c['jobsDone'] % 100 !== 11 ? 'объект' : (in_array($c['jobsDone'] % 10, [2, 3, 4], true) && !in_array($c['jobsDone'] % 100, [12, 13, 14], true) ? 'объекта' : 'объектов'));
    return '<ul class="k-badges">' . implode('', array_map(fn($b) => '<li>' . $h($b) . '</li>', $out)) . '</ul>';
};
$invite = fn(array $c) => '<div class="k-invite" data-slug="' . $h($c['slug']) . '" hidden><button class="btn" type="button">Пригласить в мой запрос</button><span class="hint" role="status"></span></div>';

$slug = (string)($_GET['slug'] ?? '');
if ($slug !== '') {
    $b = preg_match('/^[a-z0-9-]{3,60}$/', $slug) ? brig_one("SELECT * FROM br_brigades WHERE slug = ? AND status = 'active'", [$slug]) : null;
    if (!$b) {
        k_out('Бригада не найдена — LINEA', 'Бригада не найдена или сейчас не принимает заказы.', $base . '/brigady/', '<section class="blk hero-page"><div class="wrap"><h1>Бригада не найдена</h1><p>Бригада не найдена или сейчас не принимает заказы. <a href="/brigady/">Все бригады</a></p></div></section>', [], true, 404);
    }
    $c = brig_public_card($b, $API);
    $rev = brig_reviews_public((int)$b['id']);
    $canon = $base . '/brigady/' . $b['slug'] . '/';
    $port = '';
    foreach ($c['portfolio'] as $p) {
        $port .= '<article class="k-obj"><h3>' . $h($p['title']) . '</h3><p class="mut">' . $h(implode(' · ', array_filter([$p['district'], $p['area'] ? $p['area'] . ' м²' : '', $p['year'] ? (string)$p['year'] : '']))) . '</p>'
            . ($p['works'] ? '<p>' . nl2br($h($p['works'])) . '</p>' : '')
            . '<div class="k-ba"><div><div class="k-lbl">До</div><div class="k-ph">' . implode('', array_map(fn($i) => $img($i, 'До ремонта: ' . $p['title']), $p['before'])) . '</div></div>'
            . '<div><div class="k-lbl">После</div><div class="k-ph">' . implode('', array_map(fn($i) => $img($i, 'После ремонта: ' . $p['title']), $p['after'])) . '</div></div></div></article>';
    }
    $revs = $rev ? implode('', array_map(fn($r) => '<blockquote class="k-rev">' . $stars((float)$r['rating']) . '<p>' . nl2br($h($r['text'] ?: 'Без текста')) . '</p><footer class="mut">Клиент LINEA · ' . $h($r['object']) . ' · ' . $h(date('d.m.Y', strtotime($r['at']))) . '</footer></blockquote>', $rev))
        : '<p class="mut">Отзывов пока нет. Отзыв здесь может оставить только клиент LINEA после приёмки объекта этой бригадой.</p>';
    $facts = [
        ['Специализации', implode(', ', $c['specs'])], ['Районы', implode(', ', $c['districts'])],
        ['Опыт', $c['experience'] !== null ? $c['experience'] . ' лет' : '—'], ['Размер бригады', $c['teamSize'] !== null ? $c['teamSize'] . ' чел.' : '—'],
        ['Гарантия на работы', $c['warrantyMonths'] ? $c['warrantyMonths'] . ' мес.' : '—'], ['Ориентир цены', $c['priceFrom'] ? 'от ' . number_format($c['priceFrom'], 0, ',', ' ') . ' ₽/м² (работы)' : '—'],
        ['Среднее время ответа на запрос', $c['responseHours'] !== null ? ($c['responseHours'] < 1 ? 'меньше часа' : round($c['responseHours']) . ' ч') : 'данных пока нет'],
    ];
    if ($c['contactName']) { array_unshift($facts, ['Бригадир', $c['contactName']]); }
    $body = '<nav class="crumbs" aria-label="Хлебные крошки"><div class="wrap"><a href="/">Главная</a><a href="/remont/">Ремонт по проекту</a><a href="/brigady/">Бригады</a><span>' . $h($c['name']) . '</span></div></nav>'
        . '<section class="blk hero-page"><div class="wrap k-card">'
        . '<div class="k-head">' . ($c['logo'] ? $img($c['logo'], 'Логотип: ' . $c['name'], 'k-logo') : '<div class="k-logo k-mono">' . $h(mb_strtoupper(mb_substr($c['name'], 0, 1))) . '</div>')
        . '<div><div class="kicker">Бригада · Москва и МО</div><h1>' . $h($c['name']) . '</h1><p>' . ($c['rating']['n'] ? $stars($c['rating']['avg']) . ' ' . $c['rating']['avg'] . ' · ' . $c['rating']['n'] . ' ' . ($c['rating']['n'] === 1 ? 'отзыв' : 'отзыва(ов)') : '<span class="mut">Отзывов пока нет</span>') . '</p></div></div>'
        . $badges($c)
        . ($c['about'] ? '<p class="k-about">' . nl2br($h($c['about'])) . '</p>' : '')
        . '<dl class="k-facts">' . implode('', array_map(fn($f) => '<dt>' . $h($f[0]) . '</dt><dd>' . $h($f[1]) . '</dd>', $facts)) . '</dl>'
        . '<div class="k-cta"><p><b>Связь — через сайт.</b> Телефон бригады открывается, когда вы выбираете её предложение по своему проекту. Есть проект LINEA — пригласите бригаду в запрос на странице заказа; проекта нет — <a href="/brief.html">начните с брифа</a>.</p>' . $invite($c) . '</div>'
        . '</div></section>'
        . '<section class="blk"><div class="wrap"><h2>Объекты бригады</h2>' . ($port ?: '<p class="mut">Портфолио пока пусто.</p>') . '</div></section>'
        . '<section class="blk"><div class="wrap"><h2>Отзывы клиентов LINEA</h2>' . $revs . '</div></section>'
        . '<script src="/js/katalog.js?v=1" defer></script>';
    $ld = ['@context' => 'https://schema.org', '@type' => 'HomeAndConstructionBusiness', 'name' => $c['name'], 'url' => $canon,
        'description' => mb_substr($c['about'] ?: ('Ремонтная бригада: ' . implode(', ', $c['specs'])), 0, 300), 'areaServed' => [['@type' => 'City', 'name' => 'Москва'], ['@type' => 'AdministrativeArea', 'name' => 'Московская область']],
        'knowsAbout' => $c['specs']];
    if ($c['logo']) { $ld['image'] = $base . $API . 'brigade/file.php?f=' . $c['logo']; }
    if ($c['rating']['n'] > 0) {
        $ld['aggregateRating'] = ['@type' => 'AggregateRating', 'ratingValue' => $c['rating']['avg'], 'reviewCount' => $c['rating']['n'], 'bestRating' => 5, 'worstRating' => 1];
        $ld['review'] = array_map(fn($r) => ['@type' => 'Review', 'reviewRating' => ['@type' => 'Rating', 'ratingValue' => $r['rating'], 'bestRating' => 5], 'author' => ['@type' => 'Person', 'name' => 'Клиент LINEA'], 'datePublished' => $r['at'], 'reviewBody' => $r['text']], array_slice($rev, 0, 10));
    }
    $crumbs = ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => [
        ['@type' => 'ListItem', 'position' => 1, 'name' => 'LINEA', 'item' => $base . '/'], ['@type' => 'ListItem', 'position' => 2, 'name' => 'Бригады', 'item' => $base . '/brigady/'],
        ['@type' => 'ListItem', 'position' => 3, 'name' => $c['name'], 'item' => $canon]]];
    k_out($c['name'] . ' — бригада по ремонту квартир, Москва и МО | LINEA', 'Бригада ' . $c['name'] . ': ' . implode(', ', $c['specs']) . '. Проверена LINEA: ИНН, видеозвонок, работа по договору подряда. Портфолио «до/после» и отзывы клиентов.', $canon, $body, [$ld, $crumbs], (bool)$b['test']);
}

// ── список с фильтрами (GET-форма: работает без JS, адреса фильтров не индексируются)
$fs = isset(BRIG_SPECS[$_GET['spec'] ?? '']) ? (string)$_GET['spec'] : '';
$fd = isset(BRIG_DISTRICTS[$_GET['district'] ?? '']) ? (string)$_GET['district'] : '';
$fr = in_array((string)($_GET['rating'] ?? ''), ['3', '4', '4.5'], true) ? (float)$_GET['rating'] : 0.0;
$fb = max(0, (int)($_GET['budget'] ?? 0));
$cards = [];
foreach (brig_all("SELECT * FROM br_brigades WHERE status = 'active' AND test = ? ORDER BY admitted_at", [isset($_GET['test']) && linea_local() ? 1 : 0]) as $b) {
    $specs = json_decode($b['specs'], true) ?: []; $dist = json_decode($b['districts'], true) ?: [];
    if ($fs && !in_array($fs, $specs, true)) { continue; }
    if ($fd && !in_array($fd, $dist, true)) { continue; }
    if ($fb && (!$b['price_from'] || (int)$b['price_from'] > $fb)) { continue; }
    $c = brig_public_card($b, $API);
    if ($fr && ($c['rating']['avg'] === null || $c['rating']['avg'] < $fr)) { continue; }
    $cards[] = $c;
}
usort($cards, fn($a, $b) => [($b['rating']['avg'] ?? 0), $b['jobsDone']] <=> [($a['rating']['avg'] ?? 0), $a['jobsDone']]);
$opt = fn(array $m, string $cur, string $all) => '<option value="">' . $all . '</option>' . implode('', array_map(fn($k, $t) => '<option value="' . $h($k) . '"' . ($k === $cur ? ' selected' : '') . '>' . $h($t) . '</option>', array_keys($m), $m));
$filters = '<form class="k-filter" method="get" action="/brigady/"><label>Работы<select name="spec">' . $opt(BRIG_SPECS, $fs, 'Любые') . '</select></label>'
    . '<label>Район<select name="district">' . $opt(BRIG_DISTRICTS, $fd, 'Москва и МО') . '</select></label>'
    . '<label>Рейтинг<select name="rating">' . $opt(['3' => 'от 3', '4' => 'от 4', '4.5' => 'от 4,5'], $fr ? (string)$fr : '', 'Любой') . '</select></label>'
    . '<label>Бюджет работ, ₽/м²<select name="budget">' . $opt(['5000' => 'до 5 000', '8000' => 'до 8 000', '12000' => 'до 12 000', '20000' => 'до 20 000'], $fb ? (string)$fb : '', 'Любой') . '</select></label>'
    . '<button class="btn sm" type="submit">Показать</button></form>';
$list = '';
foreach ($cards as $c) {
    $cover = null;
    foreach ($c['portfolio'] as $p) { if ($p['after']) { $cover = $p['after'][0]; break; } }
    $list .= '<a class="k-item" href="/brigady/' . $h($c['slug']) . '/">' . ($cover ? $img($cover, 'Объект бригады ' . $c['name'], 'k-cover') : '<div class="k-cover k-mono">' . $h(mb_substr($c['name'], 0, 1)) . '</div>')
        . '<div class="k-body"><h3>' . $h($c['name']) . '</h3><p>' . ($c['rating']['n'] ? $stars($c['rating']['avg']) . ' ' . $c['rating']['avg'] . ' (' . $c['rating']['n'] . ')' : '<span class="mut">Отзывов пока нет</span>') . '</p>'
        . '<p class="mut">' . $h(implode(', ', array_slice($c['specs'], 0, 5))) . '</p><p class="mut">' . $h($c['legal']) . ($c['innChecked'] ? ' · ИНН проверен' : '') . ' · гарантия ' . (int)$c['warrantyMonths'] . ' мес.'
        . ($c['priceFrom'] ? ' · от ' . number_format($c['priceFrom'], 0, ',', ' ') . ' ₽/м²' : '') . ' · по проектам LINEA: ' . $c['jobsDone'] . '</p></div></a>';
}
$filtered = $fs || $fd || $fr || $fb;
$body = '<nav class="crumbs" aria-label="Хлебные крошки"><div class="wrap"><a href="/">Главная</a><a href="/remont/">Ремонт по проекту</a><span>Бригады</span></div></nav>'
    . '<section class="blk hero-page"><div class="wrap"><div class="kicker">Ремонт по проекту</div><h1>Бригады, проверенные LINEA</h1>'
    . '<p class="lead-page">Каждая бригада прошла проверку: ИНН по базе ФНС и видеозвонок с бригадиром; работает по договору подряда напрямую с вами. Рейтинг и отзывы — только от клиентов, чьи объекты бригада сдала по проекту LINEA.</p>'
    . $filters . '<div class="k-grid">' . ($list ?: '<p class="mut">' . ($filtered ? 'По этим условиям бригад нет — ослабьте фильтр.' : 'Каталог наполняется: бригады проходят проверку. Есть проект LINEA — подбор бригады доступен на странице заказа.') . '</p>') . '</div>'
    . '<p class="hint">Вы бригада? <a href="/brigadam/">Условия и регистрация</a></p></div></section><script src="/js/katalog.js?v=1" defer></script>';
k_out('Бригады для ремонта по дизайн-проекту — Москва и МО | LINEA', 'Каталог ремонтных бригад, проверенных LINEA: ИНН, видеозвонок, договор подряда, портфолио «до/после», отзывы только реальных клиентов.', $base . '/brigady/', $body,
    [['@context' => 'https://schema.org', '@type' => 'ItemList', 'itemListElement' => array_map(fn($c, $i) => ['@type' => 'ListItem', 'position' => $i + 1, 'url' => $base . '/brigady/' . $c['slug'] . '/', 'name' => $c['name']], $cards, array_keys($cards))]], $filtered);
