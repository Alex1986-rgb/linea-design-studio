<?php
/**
 * LINEA · таймеры кабинетов и сделки (cron раз в 15 минут на Beget):
 *   php ~/dizain-studiya-kvartir/public_html/../server-tools/cron.php --private=<путь к linea-private>   (или env LINEA_PRIVATE)
 * Что делает (все действия идемпотентны: уведомления с ukey, сигналы — один раз):
 *   1. Вознаграждение: «к оплате» по самой ранней дате (brig_commission_sweep) + проводки br_ledger (отложено до ИП / к оплате).
 *   2. Приёмка этапа: напоминания заказчику на stage_remind_days р.дн; на stage_silence_days р.дн — сигнал в админку и предложение
 *      рассмотреть разногласия. Этап НЕ принимается молчанием (юрист 01.11.2026: ст. 720, 753 ГК, ЗоЗПП). Пауза — сделка приостановлена
 *      или по ней идёт разногласие.
 *   3. Долг бригады по счёту: предупреждение и закрытие ленты (brig_debt) — письмо один раз на ступень.
 *   4. Заявки по ПДн: за 3 дня до срока и просрочка — письмо Александру.
 *   5. 1 декабря и позже: нет праздников следующего года — напоминание заполнить календарь.
 *   6. Сессии старше 31 дня.
 *   7. Автоудаление ПДн по срокам (kab_pd_retention: сделки после срока хранения договоров, заказы и брифы, аккаунты, заявки «удалить после
 *      завершения»); --pd-dry — только посчитать. Журнал — аудит админки (pd-retention) и linea-private/pd.log.
 *   8. Второй чек «полный расчёт» по выданным заказам, если при выдаче онлайн-касса не ответила (только при yk_receipt и только для
 *      заказов, оплаченных с чеком онлайн-кассы — orders.paid_receipt; пауза час, после суток — «выбить вручную»).
 *   9. Сверка возвратов с ЮKassa: висящие «в пути» и созданные без ответа API (yk_refund_reconcile).
 *  10. Сводка раз в день (с 9 утра) клиентам, выбравшим «сводкой раз в день»: одно письмо со всем накопленным (kab_digest_send).
 *  11. Напоминание о вопросах К-N: срок ответа прошёл, вопросы без ответа — одно письмо на версию альбома (kab_once).
 *   Отметка последнего прогона — linea-private/cron.last (её видит ping.php с токеном мониторинга).
 * Время для проверок можно сдвинуть: env LINEA_NOW="ГГГГ-ММ-ДД ЧЧ:ММ:СС". Вывод — сводка строкой (для журнала cron).
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
foreach ($argv as $a) { if (str_starts_with($a, '--private=')) { putenv('LINEA_PRIVATE=' . substr($a, 10)); } }
$api = is_dir(__DIR__ . '/../api/lib') ? __DIR__ . '/../api' : dirname(__DIR__) . '/api';
require $api . '/lib/boot.php';
require $api . '/lib/kabinet.php';

brig_db();
$now = kab_time();
$t = brig_terms();
$sum = ['ledger' => 0, 'remind' => 0, 'silence' => 0, 'debt' => 0, 'pd' => 0];

// 1. вознаграждение
ledger_sync_all();
$sum['ledger'] = (int)db_val("SELECT COUNT(*) FROM br_ledger WHERE kind = 'accrual'");

// 2. приёмка этапов: напоминания и молчание заказчика
foreach (brig_all("SELECT s.*, j.frozen_at, j.request_id, j.brigade_id, j.id jid FROM br_stages s JOIN br_jobs j ON j.id = s.job_id WHERE s.status = 'ready' AND j.status = 'work' AND s.ready_at IS NOT NULL") as $s) {
    if ($s['frozen_at'] || brig_one("SELECT 1 FROM br_disputes WHERE job_id = ? AND status <> 'resolved'", [(int)$s['jid']])) { continue; }
    $o = db_one('SELECT o.* FROM orders o JOIN br_requests r ON r.order_id = o.id WHERE r.id = ?', [(int)$s['request_id']]);
    if (!$o) { continue; }
    $wd = kab_wd_between((string)$s['ready_at'], $now);
    $link = '#/o/' . $o['number'] . '/remont';
    foreach ($t['stage_remind_days'] as $day) {
        if ($wd >= $day) {
            // журнал «уже отправлено» — отдельно от уведомлений: у заказа без аккаунта уведомление не пишется, а письмо уходило каждые 15 минут (ревью В-2)
            $before = !kab_once('stage-' . $s['id'] . '-r' . $day);
            if (!$before) { kab_notice_order($o, 'remont', 'Бригада ждёт приёмки этапа «' . $s['name'] . '» уже ' . $wd . ' рабочих дней Проверьте по чек-листу и примите — или верните с замечаниями.', $link, 'stage-' . $s['id'] . '-r' . $day); }
            if (!$before) {
                $sum['remind']++;
                if (kab_email_ok((string)$o['email'])) { brig_mail((string)$o['email'], 'kab_notice', ['subject' => 'этап «' . $s['name'] . '» ждёт приёмки', 'text' => 'Бригада сдала этап «' . $s['name'] . '». Проверьте работы по чек-листу в кабинете и примите этап или верните с замечаниями.', 'link' => brig_link('kabinet/' . $link)], (bool)$o['test']); }
            }
        }
    }
    if ($wd >= $t['stage_silence_days'] && kab_once('stage-' . $s['id'] . '-silence')) {
        kab_notice_order($o, 'remont', 'Этап «' . $s['name'] . '» ждёт вашей приёмки ' . $wd . ' рабочих дней Если с работой что-то не так — опишите замечания или попросите LINEA рассмотреть разногласие. Этап не считается принятым без вас.', $link, 'stage-' . $s['id'] . '-silence');
        brig_signal('stage_silence', 'system', ['job_id' => (int)$s['jid'], 'brigade_id' => (int)$s['brigade_id']], 'Этап #' . $s['id'] . ' без приёмки ' . $wd . ' рабочих дней');
        brig_admin_notify('Этап без приёмки ' . $wd . ' рабочих дней', 'Сделка #' . $s['jid'] . ', этап «' . $s['name'] . '». Связаться с заказчиком; предложить рассмотрение разногласий.', brig_link('api/panel.php?s=deals'), (bool)$o['test']);
        $sum['silence']++;
    }
}

// 3. долг бригады — письмо один раз на ступень
foreach (brig_all("SELECT DISTINCT brigade_id FROM br_invoices WHERE paid_at IS NULL") as $x) {
    $d = brig_debt((int)$x['brigade_id']);
    if ($d['level'] === 'none') { continue; }
    $b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [(int)$x['brigade_id']]);
    $key = 'debt-' . $b['id'] . '-' . $d['level'] . '-' . date('Ym', $now);
    if (!kab_once($key)) { continue; }
    kab_notice((int)$b['account_id'], null, 'dengi', $d['text'], 'brigada/', $key);
    brig_mail((string)$b['email'], 'brig_status', ['name' => $b['contact_name'], 'status' => $d['level'] === 'feed_closed' ? 'лента новых заказов закрыта до оплаты' : 'просрочен счёт на вознаграждение', 'reason' => $d['text'], 'link' => brig_link('brigada/')], (bool)$b['test']);
    $sum['debt']++;
}

// 4. заявки по ПДн — срок
foreach (brig_all("SELECT * FROM pd_requests WHERE status = 'new'") as $p) {
    $left = strtotime((string)$p['due_at']) - $now;
    $key = 'pd-' . $p['id'] . ($left < 0 ? '-late' : '-soon');
    if ($left > 3 * 86400 || !kab_once($key)) { continue; }
    kab_notice((int)$p['account_id'], null, 'proekt', 'Ваша заявка «' . (KAB_PD_KINDS[$p['kind']] ?? $p['kind']) . '» в работе — выполним до ' . date('d.m.Y', strtotime((string)$p['due_at'])) . '.', '#/profil', $key);
    brig_admin_notify('Персональные данные: ' . ($left < 0 ? 'срок заявки прошёл' : 'срок заявки через ' . max(0, (int)ceil($left / 86400)) . ' дн.'), 'Заявка #' . $p['id'] . ' (' . $p['kind'] . ')', brig_link('api/panel.php?s=pd'), false);
    $sum['pd']++;
}

// 5. календарь на следующий год
if ((int)date('n', $now) === 12 && !db_val('SELECT 1 FROM holidays WHERE d LIKE ?', [(date('Y', $now) + 1) . '-%'])) {
    if (kab_once('holidays-' . (date('Y', $now) + 1))) {   // маркер — в журнале отправленного, не уведомлением в чужой аккаунт
        brig_admin_notify('Заполните праздники ' . (date('Y', $now) + 1), 'Сроки в рабочих днях считаются по таблице праздников: «Настройки» → «Производственный календарь».', brig_link('api/panel.php?s=settings'), false);
    }
}

// 6. сессии старше 31 дня (запомненные устройства живут 30 дней; где сборщик PHP выключен — каталог чистим сами)
foreach (glob(linea_private() . '/sessions/sess_*') ?: [] as $f) { if (@filemtime($f) < $now - 31 * 86400) { @unlink($f); } }

// 7. автоудаление персональных данных по срокам
$sum['pd_purge'] = kab_pd_retention($now, in_array('--pd-dry', $argv, true));

// 8. второй чек «полный расчёт», не ушедший при выдаче альбома
require_once $api . '/lib/yookassa.php';
$sum['receipt2'] = 0;
if (yk_receipts_on()) {
    // В2: только заказы, у которых первый платёж прошёл с чеком онлайн-кассы; старые получают пометку «выбить вручную» при выдаче
    // С5: обезличенные не трогаем (нет почты покупателя); паузы и предел попыток — в yk_full_receipt
    foreach (brig_all("SELECT * FROM orders WHERE status = 'delivered' AND receipt2_id IS NULL AND paid_by LIKE 'yookassa %' AND paid_receipt = 1 AND pd_purged_at IS NULL") as $o) {
        if (yk_full_receipt($o, 'cron')['done']) { $sum['receipt2']++; }
    }
}

// 9. сверка возвратов «в пути» и созданных без ответа API (С2): GET /refunds/{id} и /refunds?payment_id=…
$sum['refunds'] = 0;
if (yk_ready()) {
    foreach (brig_all("SELECT DISTINCT o.* FROM orders o JOIN pay_ops p ON p.order_id = o.id WHERE p.kind = 'refund' AND (p.status IN ('pending','sent') OR (p.status = 'failed' AND p.provider_id IS NULL AND p.created_at > ?))", [date('Y-m-d H:i:s', $now - 48 * 3600)]) as $o) {
        $sum['refunds'] += yk_refund_reconcile($o);
    }
}

// 10. сводка раз в день
$sum['digest'] = kab_digest_send($now, in_array('--digest-now', $argv, true));

// 11. напоминание: срок ответа на вопросы прошёл
$sum['qremind'] = 0;
require_once $api . '/lib/brig-notify.php';
foreach (brig_all("SELECT * FROM orders WHERE status = 'paid' AND pd_purged_at IS NULL") as $o) {
    $reg = kab_registry($o);
    if (!$reg) { continue; }
    $ans = kab_answers($o)['items'];
    $open = array_filter($reg['items'], fn($i) => !$i['closed'] && $i['kind'] === 'question' && empty($ans[$i['id']]));
    if (!$open) { continue; }
    $rel = array_values(array_filter(kab_releases($o), fn($r) => $r['ver'] === $reg['ver']))[0] ?? null;
    $by = substr(kab_wd_add((string)($rel['published_at'] ?? $rel['date'] ?? linea_now()), (int)(linea_cfg()['answer_days'] ?? 2)), 0, 10);
    if ($by >= date('Y-m-d', $now) || !kab_once('qrem-' . $o['number'] . '-' . $reg['ver'])) { continue; }
    kab_notify_order($o, kab_ev('questions', $o, ['count' => count($open), 'deadline' => $by]), 'qrem-' . $o['number'] . '-' . $reg['ver']);
    $sum['qremind']++;
}

@file_put_contents(linea_private() . '/cron.last', date('Y-m-d H:i:s') . ' ' . json_encode($sum));
echo date('Y-m-d H:i:s', $now) . ' cron: ' . json_encode($sum) . "\n";
