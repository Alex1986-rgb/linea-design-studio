<?php
/**
 * Договор подряда и допсоглашения — ТОЛЬКО через сайт (Александр 01.11.2026: «все договора через наш сайт — прозрачность как для
 * клиента, так и для бригады»). Шаблон текста — здесь, в одном месте (brig_contract_body).
 *
 *   · Текст версии собирается из данных сделки (позиции сметы, этапы, сроки, гарантия, приёмка, споры) и замораживается: sha256 текста
 *     хранится рядом, обе стороны видят и подписывают одну и ту же версию.
 *   · Подпись — простая электронная подпись (63-ФЗ, ст. 5 ч. 2, ст. 6 ч. 2 — по соглашению сторон): одноразовый код на почту стороны
 *     (SMS — флаг brig_sms_enabled, выключен), фиксируются время, IP, редакция соглашения о ПЭП. ⚠ Текст соглашения — проверить юристом.
 *   · В тексте нет телефонов, почты и адреса: стороны названы по заказу и названию бригады; реквизиты открываются после подписания.
 *   · Изменения (допработы, сумма, сроки) — только допсоглашением с той же подписью; сумма сделки и база вознаграждения пересчитываются.
 *   · Вознаграждение LINEA платит бригада; в цену для заказчика оно отдельной строкой не входит.
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

const BRIG_CONTRACT_ED = '01.11.2026';     // редакция шаблона договора подряда
const BRIG_PEP = [                          // соглашение об использовании простой электронной подписи (⚠ проверить юристом)
    'ed' => '01.11.2026',
    'text' => 'Соглашаюсь подписывать договор подряда и дополнительные соглашения по этой сделке простой электронной подписью на сайте LINEA: '
        . 'одноразовый код, отправленный на мою почту, — мой ключ ПЭП; документ, подписанный кодом, равнозначен документу на бумаге с собственноручной '
        . 'подписью (63-ФЗ «Об электронной подписи», ст. 6 ч. 2). Код никому не передаю.',
];

function brig_contract_hash(string $body): string { return hash('sha256', $body); }

/**
 * Протокол подписания (разбор юриста 01.11.2026, п. 3): по каждой стороне — время (МСК), IP, SHA-256 подписанной версии, способ
 * подтверждения (одноразовый код на почту), редакция соглашения о ПЭП. Протокол не входит в хешируемый текст версии — он о ней.
 * @return [['side'=>'Заказчик','at'=>…,'ip'=>…,'pep'=>…,'method'=>…], …]
 */
function brig_contract_protocol_rows(array $c): array
{
    $rows = [];
    foreach (['client' => 'Заказчик', 'brigade' => 'Подрядчик'] as $side => $title) {
        $rows[] = ['side' => $title, 'signed' => (bool)$c[$side . '_signed_at'],
            'at' => $c[$side . '_signed_at'] ? date('d.m.Y H:i:s', strtotime((string)$c[$side . '_signed_at'])) . ' МСК' : '',
            'ip' => (string)($c[$side . '_ip'] ?? ''), 'pep' => (string)($c[$side . '_pep_ed'] ?? ''),
            'method' => 'простая электронная подпись: одноразовый код, отправленный на почту стороны, введён на сайте LINEA'];
    }
    return $rows;
}

function brig_contract_protocol_html(array $c): string
{
    $h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $tr = '';
    foreach (brig_contract_protocol_rows($c) as $r) {
        $tr .= '<tr><td>' . $h($r['side']) . '</td>' . ($r['signed']
            ? '<td>' . $h($r['at']) . '</td><td>' . $h($r['ip'] ?: '—') . '</td><td>' . $h($r['method']) . '</td><td>' . $h($r['pep'] ?: '—') . '</td>'
            : '<td colspan="4">не подписано</td>') . '</tr>';
    }
    return '<div class="protocol"><h3>Протокол подписания</h3><p>Документ: ' . $h($c['kind'] === 'main' ? 'договор подряда' : 'дополнительное соглашение № ' . (int)$c['num'])
        . '. Версия: SHA-256 <code>' . $h($c['hash']) . '</code> (хеш текста документа выше, без протокола).</p>'
        . '<table><tr><th>Сторона</th><th>Время подписи</th><th>IP-адрес</th><th>Способ подтверждения</th><th>Редакция соглашения о ПЭП</th></tr>' . $tr . '</table></div>';
}

/** Документ с протоколом подписания — для показа сторонам, печати в PDF и копии письмом. */
function brig_contract_html(array $c): string { return (string)$c['body'] . brig_contract_protocol_html($c); }

/** Текст документа и протокола для письма (text/plain). */
function brig_contract_text(array $c): string
{
    $t = preg_replace(['#<(br|/p|/h[1-4]|/tr|/li|/table)[^>]*>#i', '#</t[dh]>#i'], ["\n", ' | '], (string)$c['body']);
    $t = html_entity_decode(strip_tags((string)$t), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = trim(preg_replace("/\n{3,}/", "\n\n", preg_replace('/[ \t]+/', ' ', $t)));
    $p = "ПРОТОКОЛ ПОДПИСАНИЯ\nВерсия документа: SHA-256 " . $c['hash'] . "\n";
    foreach (brig_contract_protocol_rows($c) as $r) {
        $p .= $r['side'] . ': ' . ($r['signed'] ? $r['at'] . '; IP ' . ($r['ip'] ?: '—') . '; ' . $r['method'] . '; соглашение о ПЭП ред. ' . ($r['pep'] ?: '—') : 'не подписано') . "\n";
    }
    return $t . "\n\n" . $p;
}

/** Копия подписанного обеими сторонами документа с протоколом — письмом обеим сторонам. */
function brig_contract_send_copies(array $c): void
{
    $j = brig_one('SELECT j.*, r.order_id, r.test rtest FROM br_jobs j JOIN br_requests r ON r.id = j.request_id WHERE j.id = ?', [(int)$c['job_id']]);
    if (!$j) { return; }
    $o = db_one('SELECT number, email, test FROM orders WHERE id = ?', [(int)$j['order_id']]);
    $b = brig_one('SELECT email, test FROM br_brigades WHERE id = ?', [(int)$j['brigade_id']]);
    $doc = $c['kind'] === 'main' ? 'договор подряда' : 'допсоглашение № ' . (int)$c['num'];
    $vars = ['doc' => $doc, 'number' => (string)($o['number'] ?? ''), 'hash' => (string)$c['hash'], 'text_ml' => brig_contract_text($c)];
    $test = (bool)$j['rtest'];
    if ($o) { brig_mail((string)$o['email'], 'contract_copy', $vars, $test || (bool)$o['test']); }
    if ($b) { brig_mail((string)$b['email'], 'contract_copy', $vars, $test || (bool)$b['test']); }
}

/** Текст версии договора (HTML без внешних ресурсов). Детерминирован: собирается один раз и хранится в br_contracts.body. */
function brig_contract_body(array $j, string $kind, int $num, array $add = []): string
{
    $h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $rub = fn(int $kop) => number_format($kop / 100, 2, ',', ' ') . ' ₽';
    $r = brig_one('SELECT * FROM br_requests WHERE id = ?', [(int)$j['request_id']]);
    $o = db_one('SELECT number FROM orders WHERE id = ?', [(int)$r['order_id']]);
    $b = brig_one('SELECT name, legal FROM br_brigades WHERE id = ?', [(int)$j['brigade_id']]);
    $of = brig_one('SELECT * FROM br_offers WHERE id = ?', [(int)$j['offer_id']]);
    $no = $h($o['number']) . '-Р';
    $parties = '<p><b>Заказчик</b> — клиент студии LINEA по заказу ' . $h($o['number']) . '. <b>Подрядчик</b> — «' . $h($b['name']) . '» (' . $h(BRIG_LEGAL[$b['legal']] ?? '') . '). '
        . 'Реквизиты и контакты сторон указаны в карточке сделки на сайте LINEA и открываются сторонам после подписания договора; они — часть договора.</p>';
    if ($kind === 'addendum') {
        $rows = ''; $i = 0;
        foreach ($add['items'] as $x) {
            $rows .= '<tr><td>' . (++$i) . '</td><td>' . $h($x['name']) . '</td><td>' . $h($x['unit']) . '</td><td class="r">' . $h($x['qty']) . '</td><td class="r">' . $rub((int)$x['price_kop']) . '</td><td class="r">' . $rub((int)$x['sum_kop']) . '</td></tr>';
        }
        return '<h1>Дополнительное соглашение № ' . $num . ' к договору подряда № ' . $no . '</h1>' . $parties
            . '<p>1. Стороны изменяют объём работ по договору: позиции ниже добавляются (сумма со знаком «минус» — исключаются).</p>'
            . '<table><tr><th>№</th><th>Работа</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr>' . $rows . '</table>'
            . '<p>2. Изменение цены: <b>' . ($add['delta_kop'] >= 0 ? '+' : '−') . $rub(abs((int)$add['delta_kop'])) . '</b>. Цена договора с учётом соглашения — <b>' . $rub((int)$add['total_kop']) . '</b>.</p>'
            . ((int)$add['days_add'] !== 0 ? '<p>3. Срок работ изменяется на ' . (int)$add['days_add'] . ' календарных дней.</p>' : '')
            . ($add['note'] !== '' ? '<p>Пояснение: ' . $h($add['note']) . '</p>' : '')
            . '<p>Остальные условия договора не меняются. Соглашение подписывается сторонами на сайте LINEA простой электронной подписью.</p>';
    }
    $pack = json_decode((string)$r['pack'], true) ?: ['positions' => []];
    $items = json_decode((string)$of['items'], true) ?: [];
    $rows = ''; $n = 0;
    foreach ($pack['positions'] as $p) {
        $it = $items[$p['id']] ?? null;
        if (!$it || $it['skip']) { continue; }
        $rows .= '<tr><td>' . (++$n) . '</td><td>' . $h($p['name']) . '</td><td>' . $h($p['unit']) . '</td><td class="r">' . ($p['qty'] !== null ? $h($p['qty']) : 'объём работ') . '</td><td class="r">'
            . $rub((int)round($it['price'] * 100)) . '</td><td class="r">' . $rub((int)$it['sum']) . '</td></tr>';
    }
    $skipped = array_filter($pack['positions'], fn($p) => !isset($items[$p['id']]) || $items[$p['id']]['skip']);
    $st = ''; $acc = '';
    foreach (brig_all('SELECT * FROM br_stages WHERE job_id = ? ORDER BY idx', [(int)$j['id']]) as $s) {
        $st .= '<tr><td>' . (int)$s['idx'] . '</td><td>' . $h($s['name']) . '</td><td>' . ($s['plan_start'] ? $h(date('d.m.Y', strtotime((string)$s['plan_start']))) : '—') . '</td><td>' . ($s['plan_end'] ? $h(date('d.m.Y', strtotime((string)$s['plan_end']))) : '—') . '</td></tr>';
        $c = brig_checklist((string)$s['checklist']);
        $acc .= '<h4>' . (int)$s['idx'] . '. ' . $h($s['name']) . '</h4><ul>' . implode('', array_map(fn($i) => '<li>' . $h($i['text']) . ' <span class="src">(' . $h($i['src']) . ')</span></li>', $c['items'])) . '</ul>';
    }
    return '<h1>Договор подряда на ремонт № ' . $no . '</h1><p class="src">Шаблон договора между Заказчиком и Подрядчиком, предложенный сервисом LINEA, редакция ' . BRIG_CONTRACT_ED . '. LINEA стороной договора не является и за исполнение договора Подрядчиком не отвечает.</p>' . $parties
        . '<h2>1. Предмет</h2><p>1.1. Подрядчик выполняет ремонтные работы на объекте «' . $h($r['object_title']) . '» (адрес — в карточке сделки) по дизайн-проекту LINEA (Приложение 1) в объёме Приложения 2, в сроки Приложения 3, и сдаёт результат по Приложению 4.</p>'
        . '<p>1.2. Позиции, которые Подрядчик не выполняет (' . count($skipped) . '), перечислены в Приложении 2.</p>'
        . '<h2>2. Цена и оплата</h2><p>2.1. Цена работ — <b>' . $rub((int)$of['total_kop']) . '</b> по позициям Приложения 2; цена твёрдая. Изменение объёма, цены или сроков — только дополнительным соглашением, подписанным сторонами на сайте LINEA.</p>'
        . '<p>2.2. Материалы: ' . $h(BRIG_MATERIALS[$of['materials']] ?? '') . ($of['materials_note'] ? ' — ' . $h($of['materials_note']) : '') . '.</p>'
        . '<p>2.3. Оплата — напрямую Подрядчику: аванс (если стороны договорились) и далее поэтапно после приёмки каждого этапа на сайте. Внесение аванса Заказчик отмечает в карточке сделки.</p>'
        . '<p>2.4. Вознаграждение студии LINEA платит Подрядчик по агентскому договору; в цену для Заказчика отдельной строкой оно не входит.</p>'
        . '<h2>3. Сроки</h2><p>3.1. Начало работ — ' . $h(date('d.m.Y', strtotime((string)$of['start_date']))) . ', продолжительность — ' . (int)$of['days'] . ' календарных дней (Приложение 3).</p>'
        . '<h2>4. Приёмка</h2><p>4.1. Заказчик принимает этап в карточке сделки на сайте, отметив все пункты чек-листа для приёмки (Приложение 4), или возвращает этап с замечаниями. Чек-лист — подсказка для Заказчика; LINEA работы не принимает и строительный контроль не ведёт. Скрытые работы закрываются только после акта освидетельствования (СП 71.13330.2017, п. 4.6).</p>'
        . '<h2>5. Гарантия</h2><p>5.1. Гарантийный срок на работы — ' . (int)$of['warranty_months'] . ' мес. со дня финальной приёмки (ст. 29 Закона РФ «О защите прав потребителей», ст. 724, 756 ГК РФ).</p>'
        . '<p>5.2. Гарантию на работы даёт Подрядчик. Сервис «Сделка через LINEA» (переписка, версии документов, чек-листы для приёмки, листы по запросу, рассмотрение разногласий) действует, пока сделка, приёмка и изменения идут через сайт; за качество, сроки и цену работ Подрядчика LINEA не отвечает. Студия LINEA отвечает за свои чертежи по договору с Заказчиком на дизайн-проект.</p>'
        . '<h2>6. Разногласия</h2><p>6.1. Разногласия стороны сначала обсуждают в карточке сделки. Любая сторона может попросить LINEA о рассмотрении разногласий: LINEA сверяет проект, фото этапов и переписку и даёт рекомендацию; рекомендация для сторон необязательна. Право каждой стороны обратиться в суд сохраняется в любой момент; для Заказчика-потребителя — суд по его выбору (ст. 17 Закона РФ «О защите прав потребителей»).</p>'
        . '<h2>7. Персональные данные и подпись</h2><p>7.1. Стороны обрабатывают персональные данные друг друга только для исполнения договора (152-ФЗ, ст. 6 ч. 1 п. 5).</p>'
        . '<p>7.2. Договор и дополнительные соглашения подписываются простой электронной подписью на сайте LINEA (одноразовый код на почту стороны) и равнозначны бумажным (63-ФЗ, ст. 6 ч. 2). Подлинность версии подтверждает её хеш SHA-256.</p>'
        . ((string)$of['comment'] !== '' ? '<h2>8. Особые условия Подрядчика</h2><p>' . nl2br($h($of['comment'])) . '</p>' : '')
        . '<h3>Приложение 1. Проект</h3><p>Дизайн-проект LINEA по заказу ' . $h($o['number']) . '. При расхождении сметы и чертежей — по чертежам, с письменным уточнением в карточке сделки.</p>'
        . '<h3>Приложение 2. Смета по позициям Подрядчика</h3><table><tr><th>№</th><th>Работа</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr>' . $rows
        . '<tr><td colspan="5" class="r"><b>Итого</b></td><td class="r"><b>' . $rub((int)$of['total_kop']) . '</b></td></tr></table>'
        . ($skipped ? '<p><b>Не выполняет Подрядчик:</b> ' . $h(implode('; ', array_map(fn($p) => $p['name'], $skipped))) . '.</p>' : '')
        . '<h3>Приложение 3. График этапов</h3><table><tr><th>№</th><th>Этап</th><th>Начало</th><th>Окончание</th></tr>' . $st . '</table>'
        . '<h3>Приложение 4. Порядок приёмки</h3>' . $acc;
}

/** Новая версия документа (замороженный текст + хеш). */
function brig_contract_create(array $j, string $kind, string $by, array $add = []): int
{
    $num = $kind === 'main' ? 0 : 1 + (int)db_val("SELECT MAX(num) FROM br_contracts WHERE job_id = ? AND kind = 'addendum'", [(int)$j['id']]);
    $body = brig_contract_body($j, $kind, $num, $add);
    // MySQL: MEDIUMTEXT (миграция 3); тело сверх 2 МБ не пишем ни в одной базе — иначе обрезка и хеш от текста, которого нет (ревью кода С-2)
    if (strlen($body) > 2000000) { linea_fail('Договор слишком большой — напишите в LINEA', 413); }
    $of = brig_one('SELECT total_kop FROM br_offers WHERE id = ?', [(int)$j['offer_id']]);
    // UNIQUE (job_id, kind, num): параллельное создание второй копии упадёт на индексе — вызывающий берёт уже созданную
    return db_insert('br_contracts', ['job_id' => (int)$j['id'], 'kind' => $kind, 'num' => $num, 'status' => 'draft', 'body' => $body, 'hash' => brig_contract_hash($body),
        'total_kop' => $kind === 'main' ? (int)$of['total_kop'] : (int)$add['total_kop'], 'delta_kop' => (int)($add['delta_kop'] ?? 0), 'days_add' => (int)($add['days_add'] ?? 0),
        'note' => (string)($add['note'] ?? ''), 'created_at' => linea_now(), 'created_by' => $by, 'needs_admin' => !empty($add['needs_admin']) ? 1 : 0]);
}

/** Основной договор сделки (создаётся при выборе бригады; у объектов до 01.11.2026 — при первом обращении). */
function brig_contract_main(array $j): array
{
    $c = brig_one("SELECT * FROM br_contracts WHERE job_id = ? AND kind = 'main'", [(int)$j['id']]);
    if (!$c) {
        try { brig_contract_create($j, 'main', 'system'); } catch (PDOException $e) { /* создан параллельным запросом — берём его */ }
        $c = brig_one("SELECT * FROM br_contracts WHERE job_id = ? AND kind = 'main'", [(int)$j['id']]);
    }
    return $c;
}

/** Документы сделки для сторон: версии, хеши, подписи (без IP). */
function brig_contracts_public(int $jobId): array
{
    return array_map(fn($c) => ['id' => (int)$c['id'], 'kind' => $c['kind'], 'num' => (int)$c['num'], 'title' => $c['kind'] === 'main' ? 'Договор подряда' : 'Допсоглашение № ' . (int)$c['num'],
        'status' => $c['status'], 'hash' => $c['hash'], 'total' => (int)$c['total_kop'] / 100, 'delta' => (int)$c['delta_kop'] / 100, 'daysAdd' => (int)$c['days_add'], 'note' => (string)$c['note'],
        'clientSigned' => $c['client_signed_at'], 'brigadeSigned' => $c['brigade_signed_at'], 'created' => $c['created_at'],
        'waitAdmin' => !empty($c['needs_admin']) && empty($c['admin_ok_at'])],
        brig_all('SELECT * FROM br_contracts WHERE job_id = ? ORDER BY id', [$jobId]));
}

/** HMAC кода подписи: привязан к документу, стороне и хешу версии текста (ревью кода С-1). */
function brig_sign_hmac(string $code, array $c, string $side): string
{
    return hash_hmac('sha256', $code . '|' . $c['id'] . '|' . $side . '|' . $c['hash'], brig_secret());
}

/** Код подписи: отправить стороне на почту. @return devCode (только тест на маке) или '' */
function brig_sign_send(array $c, string $side, string $email, bool $test): string
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        linea_fail(!empty(linea_cfg()['brig_sms_enabled']) ? 'SMS-коды пока не отправляем — напишите в LINEA' : 'Для подписи нужна почта: код подтверждения приходит на неё. Напишите в LINEA, мы добавим почту к заказу');
    }
    if ((int)db_val('SELECT COUNT(*) FROM br_sign_codes WHERE contract_id = ? AND side = ? AND created_at > ?', [(int)$c['id'], $side, date('Y-m-d H:i:s', time() - 3600)]) >= 5) { linea_fail('Слишком много кодов за час — подождите', 429); }
    $code = (string)random_int(100000, 999999);
    db_insert('br_sign_codes', ['contract_id' => (int)$c['id'], 'side' => $side, 'code_hash' => brig_sign_hmac($code, $c, $side),
        'expires_at' => time() + 900, 'tries' => 0, 'created_at' => linea_now()]);
    $title = $c['kind'] === 'main' ? 'договор подряда' : 'допсоглашение № ' . (int)$c['num'];
    brig_mail($email, 'sign_code', ['doc' => $title, 'code' => $code, 'hash' => substr((string)$c['hash'], 0, 16)], $test);
    return $test && linea_local() ? $code : '';
}

/**
 * Подпись кодом: сверка последнего неиспользованного кода стороны (5 попыток, 15 минут), согласие на ПЭП с редакцией.
 * Обе подписи → документ подписан → brig_contract_signed().
 */
function brig_sign_confirm(array $c, string $side, string $code, bool $pep, string $who): void
{
    if (!$pep) { linea_fail('Отметьте согласие на подписание простой электронной подписью (редакция ' . BRIG_PEP['ed'] . ')'); }
    if ($c['status'] !== 'draft') { linea_fail('Документ уже подписан или отменён'); }
    if ($c[$side . '_signed_at']) { linea_fail('Вы уже подписали этот документ — ждём вторую сторону'); }
    $k = brig_one('SELECT * FROM br_sign_codes WHERE contract_id = ? AND side = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1', [(int)$c['id'], $side]);
    if (!$k || (int)$k['expires_at'] < time()) { linea_fail('Код устарел — запросите новый'); }
    if ($c['kind'] === 'addendum') {
        $jj = brig_one('SELECT status FROM br_jobs WHERE id = ?', [(int)$c['job_id']]);
        if (!$jj || $jj['status'] !== 'work') { linea_fail('Допсоглашение подписывается, пока объект в работе'); }
        if (!empty($c['needs_admin']) && empty($c['admin_ok_at'])) { linea_fail('Допсоглашение заметно уменьшает цену договора — подписать можно после подтверждения LINEA (обычно в течение рабочего дня)', 409); }
    }
    // попытка засчитывается ДО сверки и одним UPDATE с условием: параллельные запросы не дают больше 5 попыток (ревью кода С-1)
    if (db_exec('UPDATE br_sign_codes SET tries = tries + 1 WHERE id = ? AND tries < 5 AND used_at IS NULL', [(int)$k['id']]) !== 1) { linea_fail('Слишком много неверных попыток — запросите новый код', 429); }
    if (!hash_equals((string)$k['code_hash'], brig_sign_hmac(preg_replace('/\D/', '', $code) ?? '', $c, $side))) { linea_fail('Неверный код'); }
    $now = linea_now();
    $okSign = db_tx(function () use ($c, $k, $side, $now) {
        // код одноразовый: второй параллельный запрос с тем же кодом не пройдёт
        if (db_exec('UPDATE br_sign_codes SET used_at = ? WHERE id = ? AND used_at IS NULL', [$now, (int)$k['id']]) !== 1) { return false; }
        return db_exec('UPDATE br_contracts SET ' . $side . '_signed_at = ?, ' . $side . '_ip = ?, ' . $side . '_pep_ed = ? WHERE id = ? AND status = ? AND ' . $side . '_signed_at IS NULL',
            [$now, linea_ip(), BRIG_PEP['ed'], (int)$c['id'], 'draft']) === 1;
    });
    if (!$okSign) { linea_fail('Код уже использован — обновите страницу', 409); }
    brig_audit($who, 'sign', 'job#' . $c['job_id'], ($side === 'client' ? 'Заказчик' : 'Подрядчик') . ' подписал(а) ' . ($c['kind'] === 'main' ? 'договор' : 'допсоглашение № ' . $c['num']) . ' кодом; sha256 ' . substr((string)$c['hash'], 0, 16));
    $c = brig_one('SELECT * FROM br_contracts WHERE id = ?', [(int)$c['id']]);
    if ($c['client_signed_at'] && $c['brigade_signed_at']) { brig_contract_signed($c, $who); }
    elseif ($c['kind'] === 'main') { db_update('br_jobs', [$side . '_signed_at' => $now, 'updated_at' => $now], 'id = ?', [(int)$c['job_id']]); }
}

/** Документ подписан обеими сторонами: договор → объект в работе (контакты, вознаграждение); допсоглашение → новая сумма сделки. */
function brig_contract_signed(array $c, string $who): void
{
    $now = linea_now();
    db_update('br_contracts', ['status' => 'signed'], 'id = ?', [(int)$c['id']]);
    $jid = (int)$c['job_id'];
    try { brig_contract_send_copies($c); } catch (Throwable $e) { linea_log('error.log', 'contract copy: ' . $e->getMessage()); }   // копия с протоколом обеим сторонам
    if ($c['kind'] === 'main') {
        db_update('br_jobs', ['client_signed_at' => $c['client_signed_at'], 'brigade_signed_at' => $c['brigade_signed_at'], 'deal_total_kop' => (int)$c['total_kop'], 'updated_at' => $now], 'id = ?', [$jid]);
        brig_maybe_start($jid, $who);
        return;
    }
    $j = brig_one('SELECT * FROM br_jobs WHERE id = ?', [$jid]);
    $set = ['deal_total_kop' => (int)$c['total_kop'], 'updated_at' => $now];
    if ($j['commission_kop'] !== null) {
        $set['commission_kop'] = brig_commission((int)$c['total_kop'], $j['commission_rate'] !== null ? (float)$j['commission_rate'] : null);
        $inv = brig_one('SELECT amount_kop FROM br_invoices WHERE job_id = ?', [$jid]);
        if ($inv) {
            $set['commission_kop'] = max($set['commission_kop'], (int)$inv['amount_kop']);   // ниже выставленного счёта не уменьшается (ревью кода В-1)
            brig_admin_notify('допсоглашение после счёта', 'Объект #' . $jid . ': сумма сделки изменена допсоглашением после выставленного счёта — выставить разницу', brig_link('api/admin-brigady.php?j=' . $jid), false);
        }
    }
    db_update('br_jobs', $set, 'id = ?', [$jid]);
    // журнал сделки видят обе стороны — вознаграждение LINEA туда не пишем (отдельная запись для админки)
    brig_audit($who, 'addendum', 'job#' . $jid, 'Допсоглашение № ' . $c['num'] . ' подписано: цена договора ' . brig_rub((int)$c['total_kop']));
    if (isset($set['commission_kop'])) { brig_audit($who, 'commission', 'job#' . $jid, 'Вознаграждение пересчитано по допсоглашению № ' . $c['num'] . ': ' . brig_rub($set['commission_kop'])); }
}

/** Допсоглашение (предлагает любая сторона; объект в работе; одно неподписанное за раз). */
function brig_addendum_propose(array $j, array $in, string $by, array $gctx): int
{
    if ($j['status'] !== 'work') { linea_fail('Допсоглашение — когда договор подписан и объект в работе'); }
    if (brig_one("SELECT 1 FROM br_contracts WHERE job_id = ? AND kind = 'addendum' AND status = 'draft'", [(int)$j['id']])) { linea_fail('Уже есть неподписанное допсоглашение — подпишите или отмените его'); }
    $t = brig_terms();
    $items = []; $delta = 0;
    foreach (array_slice(is_array($in['items'] ?? null) ? $in['items'] : [], 0, 50) as $x) {
        $name = brig_guard(linea_str($x['name'] ?? '', 200), brig_contacts_open($j), $gctx + ['field' => 'допсоглашение']);
        if ($name === '') { continue; }
        // позиции не отрицательные и в границах (ревью кода В-1); исключение работы — отдельной отметкой «исключить», а не минусом
        if (!is_numeric($x['qty'] ?? null) || !is_numeric($x['price'] ?? null)) { linea_fail('Позиция «' . mb_substr($name, 0, 40) . '»: укажите количество и цену числом'); }
        $qty = round((float)$x['qty'], 2);
        $price = (int)round((float)$x['price'] * 100);
        if ($qty <= 0 || $qty > $t['addendum_max_qty'] || $price < 0 || $price > $t['addendum_max_price_kop']) {
            linea_fail('Позиция «' . mb_substr($name, 0, 40) . '»: количество — больше нуля и не больше ' . $t['addendum_max_qty'] . ', цена — от 0 до ' . brig_rub($t['addendum_max_price_kop']) . '. Чтобы убрать работу, отметьте «исключить»');
        }
        $sum = (int)round($qty * $price) * (!empty($x['remove']) ? -1 : 1);
        $items[] = ['name' => (!empty($x['remove']) ? 'Исключить: ' : '') . $name, 'unit' => linea_str($x['unit'] ?? 'шт', 12), 'qty' => $qty, 'price_kop' => $price, 'sum_kop' => $sum];
        $delta += $sum;
    }
    $days = max(-365, min(365, (int)($in['daysAdd'] ?? 0)));
    if (!$items && !$days) { linea_fail('Добавьте позиции (название, количество, цена) или изменение срока'); }
    $base = (int)($j['deal_total_kop'] ?? 0) ?: (int)db_val('SELECT total_kop FROM br_offers WHERE id = ?', [(int)$j['offer_id']]);
    if ($base + $delta <= 0) { linea_fail('Цена договора после изменения должна быть больше нуля'); }
    // итог не ниже уже принятого: доля цены по принятым этапам (у этапов нет своих сумм — пропорционально числу этапов)
    $st = brig_one("SELECT COUNT(*) n, SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) acc FROM br_stages WHERE job_id = ?", [(int)$j['id']]);
    $floor = (int)$st['n'] > 0 ? (int)ceil($base * (int)$st['acc'] / (int)$st['n']) : 0;
    if ($base + $delta < $floor) { linea_fail('Цена договора не может стать меньше стоимости уже принятых этапов (' . brig_rub($floor) . ')'); }
    // сильное уменьшение цены — только после подтверждения LINEA (иначе база вознаграждения уходит в ноль одним допсоглашением)
    $needsAdmin = $delta < 0 && -$delta * 100 > $base * $t['addendum_cut_admin_pct'];
    $id = brig_contract_create($j, 'addendum', $by, ['items' => $items, 'delta_kop' => $delta, 'total_kop' => $base + $delta, 'days_add' => $days, 'needs_admin' => $needsAdmin,
        'note' => brig_guard(linea_str($in['note'] ?? '', 500), brig_contacts_open($j), $gctx + ['field' => 'допсоглашение'])]);
    if ($needsAdmin) {
        brig_signal('addendum_cut', $by, ['job_id' => (int)$j['id'], 'brigade_id' => (int)$j['brigade_id']], 'Допсоглашение уменьшает цену на ' . brig_rub(-$delta) . ' (' . round(-$delta * 100 / max(1, $base)) . ' %) — ждёт подтверждения');
        brig_admin_notify('допсоглашение уменьшает цену', 'Объект #' . $j['id'] . ': допсоглашение уменьшает цену на ' . brig_rub(-$delta) . ' — подтвердите или отклоните', brig_link('api/admin-brigady.php?j=' . $j['id']), false);
    }
    return $id;
}

/** Журнал сделки — одинаковый для заказчика, бригады и админки. */
function brig_deal_log(int $jobId): array
{
    $log = array_map(fn($a) => ['at' => $a['at'], 'who' => str_starts_with((string)$a['who'], 'client') ? 'Заказчик' : (str_starts_with((string)$a['who'], 'brigade') ? 'Подрядчик' : 'LINEA'),
        'text' => (string)$a['detail']],
        brig_all("SELECT at, who, detail FROM br_audit WHERE target = ? AND action IN ('choose','sign','contacts-open','advance','addendum','addendum-cancel') ORDER BY id", ['job#' . $jobId]));
    foreach (brig_all("SELECT idx, name, ready_at, accepted_at FROM br_stages WHERE job_id = ? AND (ready_at IS NOT NULL OR accepted_at IS NOT NULL)", [$jobId]) as $s) {
        if ($s['ready_at']) { $log[] = ['at' => $s['ready_at'], 'who' => 'Подрядчик', 'text' => 'Этап ' . (int)$s['idx'] . ' «' . $s['name'] . '» сдан на приёмку']; }
        if ($s['accepted_at']) { $log[] = ['at' => $s['accepted_at'], 'who' => 'Заказчик', 'text' => 'Этап ' . (int)$s['idx'] . ' «' . $s['name'] . '» принят по чек-листу']; }
    }
    usort($log, fn($a, $b) => strcmp((string)$a['at'], (string)$b['at']));
    return $log;
}

/** Документ к подписи: указанный (свой, неподписанный) или текущий — договор, пока объект ждёт подписания, иначе открытое допсоглашение. */
function brig_sign_doc(array $j, int $docId): array
{
    if ($docId) {
        $c = brig_one("SELECT * FROM br_contracts WHERE id = ? AND job_id = ? AND status = 'draft'", [$docId, (int)$j['id']]);
    } elseif ($j['status'] === 'contract') {
        $c = brig_contract_main($j);
        if ($c['status'] !== 'draft') { $c = null; }
    } else {
        $c = brig_one("SELECT * FROM br_contracts WHERE job_id = ? AND kind = 'addendum' AND status = 'draft' ORDER BY id DESC LIMIT 1", [(int)$j['id']]);
    }
    if (!$c) { linea_fail('Подписывать нечего'); }
    return $c;
}

/** Отозвать неподписанное допсоглашение (любая сторона). */
function brig_addendum_cancel(array $j, int $docId, string $who): void
{
    if (db_exec("UPDATE br_contracts SET status = 'void' WHERE id = ? AND job_id = ? AND kind = 'addendum' AND status = 'draft'", [$docId, (int)$j['id']]) !== 1) { linea_fail('Нет такого неподписанного допсоглашения'); }
    brig_audit($who, 'addendum-cancel', 'job#' . $j['id'], 'Допсоглашение отозвано до подписания');
}

/** Всё о документах сделки для страницы заказчика и кабинета бригады. */
function brig_deal_docs(array $j): array
{
    if ($j['status'] !== 'cancelled') { brig_contract_main($j); }
    return ['contracts' => brig_contracts_public((int)$j['id']), 'log' => brig_deal_log((int)$j['id']), 'pep' => BRIG_PEP,
        'dealTotal' => $j['deal_total_kop'] !== null ? (int)$j['deal_total_kop'] / 100 : null,
        'transparency' => 'Договор, допсоглашения, приёмка этапов и журнал сделки — только на сайте, одинаково видны обеим сторонам. Пока договор не подписан на сайте, '
            . 'контакты закрыты, этапы и приёмка недоступны, листы по запросу не выпускаются и сервис «Сделка через LINEA» не действует.'];
}
