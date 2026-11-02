<?php
/**
 * Действия модерации ремонта (бригады, файлы портфолио, запросы и пакеты, рассылка с лимитом invite_max, допсоглашения на подтверждении,
 * счета, отзывы, разногласия) — одна функция для api/panel.php и api/admin-brigady.php (раньше жили только во второй).
 * Вызывающий отвечает за вход, https и CSRF. @return [сообщение, адрес возврата для admin-brigady.php]
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

/** Открытый API ФНС «Проверить статус налогоплательщика НПД» (без ключа; лимит ФНС — несколько запросов в минуту). */
function npd_check(string $inn): string
{
    if (!function_exists('curl_init')) { return 'нет curl на сервере — проверьте по ссылке'; }
    $ch = curl_init('https://statusnpd.nalog.ru/api/v1/tracker/taxpayer_status');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['inn' => $inn, 'requestDate' => date('Y-m-d')])]);
    $raw = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
    $j = is_string($raw) ? json_decode($raw, true) : null;
    if ($code === 200 && is_array($j) && array_key_exists('status', $j)) { return ($j['status'] ? 'ФНС: плательщик НПД на ' : 'ФНС: НЕ плательщик НПД на ') . date('d.m.Y') . ' — ' . linea_str($j['message'] ?? '', 200); }
    return 'ФНС не ответила (код ' . (int)$code . ') — проверьте по ссылке' . (is_array($j) && isset($j['message']) ? ': ' . linea_str($j['message'], 160) : '');
}

/** Автоподбор: допущенные бригады района с пересечением специализаций; рейтинг, опыт по LINEA. Тестовый запрос — только тестовым. */
function candidates(array $r): array
{
    $works = json_decode($r['works'], true) ?: [];
    $out = [];
    foreach (brig_all("SELECT * FROM br_brigades WHERE status = 'active' AND demo = 0 AND test = ?", [(int)$r['test']]) as $b) {
        $specs = json_decode($b['specs'], true) ?: []; $dist = json_decode($b['districts'], true) ?: [];
        $cover = $works ? count(array_intersect($works, $specs)) / count($works) : 0;
        if (!in_array($r['district'], $dist, true) || $cover <= 0) { continue; }
        $rt = brig_rating((int)$b['id']);
        $out[] = ['b' => $b, 'cover' => $cover, 'rating' => $rt, 'done' => brig_jobs_done((int)$b['id']),
            'score' => round($cover * 60 + ($rt['avg'] ?? 4) * 6 + min(10, brig_jobs_done((int)$b['id'])), 1)];
    }
    usort($out, fn($a, $b) => $b['score'] <=> $a['score']);
    return $out;
}


/** Действие модерации; неизвестное — пустое сообщение. */
function adm_brig_act(string $act, int $id, string $reason, string $WHO, string $self): array
{
    $now = linea_now();
    $back = $self;
    $msg = '';
    switch ($act) {
        case 'b_check':
            $b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [$id]);
            if (!$b) { break; }
            $set = ['updated_at' => $now, 'verified_by' => $WHO];
            if (!empty($_POST['inn_ok'])) { $set['inn_checked_at'] = $b['inn_checked_at'] ?: $now; $set['inn_check_note'] = linea_str($_POST['inn_note'] ?? '', 500); } else { $set['inn_checked_at'] = null; }
            if (!empty($_POST['call_ok'])) { $set['call_at'] = $b['call_at'] ?: $now; } else { $set['call_at'] = null; }
            db_update('br_brigades', $set, 'id = ?', [$id]);
            brig_audit($WHO, 'brigade-check', 'brigade#' . $id, 'ИНН ' . (!empty($_POST['inn_ok']) ? 'проверен' : 'не отмечен') . ', видеозвонок ' . (!empty($_POST['call_ok']) ? 'проведён' : 'не отмечен'));
            $msg = 'Отметки проверки сохранены.'; $back .= '?b=' . $id; break;
        case 'b_npd':
            $b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [$id]);
            if (!$b) { break; }
            $res = $b['test'] ? 'тестовая бригада — запрос в ФНС не отправляется' : npd_check((string)$b['inn']);
            db_update('br_brigades', ['inn_check_note' => $res], 'id = ?', [$id]);
            brig_audit($WHO, 'npd-check', 'brigade#' . $id, $res);
            $msg = $res; $back .= '?b=' . $id; break;
        case 'b_status':
            $b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [$id]);
            $to = (string)($_POST['to'] ?? '');
            if (!$b || !isset(BRIG_STATUS[$to])) { break; }
            if ($to === 'active' && (!$b['inn_checked_at'] || !$b['call_at'])) { $msg = 'Допуск — только после отметок «ИНН проверен» и «видеозвонок проведён».'; $back .= '?b=' . $id; break; }
            if (in_array($to, ['suspended', 'blocked'], true) && $reason === '') { $msg = 'Укажите причину — бригада её увидит.'; $back .= '?b=' . $id; break; }
            db_update('br_brigades', ['status' => $to, 'status_reason' => $reason, 'updated_at' => $now] + ($to === 'active' && !$b['admitted_at'] ? ['admitted_at' => $now] : []), 'id = ?', [$id]);
            if ($to === 'active') {
                brig_pilot_slot_assign($id);   // место в пилоте — один раз, при первом допуске (С-5)
                // портфолио и логотип просмотрены при допуске — в каталоге видны; новые файлы после допуска — через «Одобрить файл» (К-2)
                brig_exec("UPDATE br_files SET moderated_at = ? WHERE brigade_id = ? AND owner_kind IN ('portfolio','logo') AND moderated_at IS NULL", [$now, $id]);
            }
            brig_audit($WHO, 'brigade-status', 'brigade#' . $id, BRIG_STATUS[$b['status']] . ' → ' . BRIG_STATUS[$to] . ($reason ? '; причина: ' . $reason : ''));
            brig_mail((string)$b['email'], $to === 'active' ? 'brig_admitted' : 'brig_status', ['name' => $b['contact_name'], 'status' => BRIG_STATUS[$to], 'reason' => $reason ?: '—', 'link' => brig_link('brigada/')], (bool)$b['test']);
            $msg = 'Статус: ' . BRIG_STATUS[$to]; $back .= '?b=' . $id; break;
        case 'r_pack':
            $r = brig_one('SELECT * FROM br_requests WHERE id = ?', [$id]);
            if (!$r) { break; }
            $back .= '?r=' . $id;
            $pj = $_FILES['pack'] ?? null;
            if ($pj && ($pj['error'] ?? 4) === UPLOAD_ERR_OK) {
                $raw = (string)file_get_contents((string)$pj['tmp_name'], false, null, 0, 4194304);
                $p = json_decode($raw, true);
                if (!is_array($p) || empty($p['positions'])) { $msg = 'pack.json не читается или без позиций (собирается tools/brigady-pack.mjs).'; break; }
                $pack = brig_pack_clean($p);
                db_update('br_requests', ['pack' => json_encode($pack, JSON_UNESCAPED_UNICODE), 'works' => json_encode(brig_works_of($pack)), 'area' => $pack['area'] ?? $r['area'], 'updated_at' => $now], 'id = ?', [$id]);
                $msg = 'Пакет: ' . count($pack['positions']) . ' позиций. ';
            }
            foreach (['f1', 'f2', 'f3'] as $k) {
                if (($_FILES[$k]['error'] ?? 4) !== UPLOAD_ERR_OK) { continue; }
                brig_store_upload($_FILES[$k], ['pdf', 'xlsx'], ['brigade_id' => 0, 'kind' => 'pack', 'id' => $id, 'sub' => 'pack'], $WHO);
                $msg .= 'Файл добавлен. ';
            }
            brig_audit($WHO, 'pack', 'request#' . $id, $msg);
            break;
        case 'r_file_del':
            $f = brig_one("SELECT * FROM br_files WHERE id = ? AND owner_kind = 'pack'", [$id]);
            if ($f) { @unlink(brig_dir() . '/files/' . $f['stored_path']); brig_exec('DELETE FROM br_files WHERE id = ?', [$id]); $back .= '?r=' . (int)$f['owner_id']; brig_audit($WHO, 'pack-file-del', 'request#' . $f['owner_id']); }
            break;
        case 'r_send':
            $r = brig_one('SELECT * FROM br_requests WHERE id = ?', [$id]);
            if (!$r) { break; }
            $back .= '?r=' . $id;
            $pack = json_decode((string)$r['pack'], true);
            if (empty($pack['positions'])) { $msg = 'Сначала загрузите пакет проекта (позиции сметы).'; break; }
            if (!in_array($r['status'], ['new', 'sent'], true)) { $msg = 'Запрос уже ' . BRIG_REQ_STATUS[$r['status']]; break; }
            $dl = (string)($_POST['deadline'] ?? '');
            $dlTs = strtotime(str_replace('T', ' ', $dl));
            if (!$dlTs || $dlTs < time() + 3600) { $msg = 'Срок ответа — не раньше чем через час.'; break; }
            $deadline = date('Y-m-d H:i:s', $dlTs);
            $ids = array_map('intval', (array)($_POST['bid'] ?? []));
            $n = 0;
            foreach ($ids as $bid) {
                $b = brig_one("SELECT * FROM br_brigades WHERE id = ? AND status = 'active' AND demo = 0 AND test = ?", [$bid, (int)$r['test']]);
                if (!$b) { continue; }
                $inv = brig_one('SELECT * FROM br_invites WHERE request_id = ? AND brigade_id = ?', [$id, $bid]);
                if ($inv && $inv['sent_at']) { continue; }
                // лимит конкуренции (спецификация 2.9 invite_max): пакет одного запроса получают не больше N бригад
                if ((int)db_val('SELECT COUNT(*) FROM br_invites WHERE request_id = ? AND sent_at IS NOT NULL', [$id]) >= brig_terms()['invite_max']) { $capped = ($capped ?? 0) + 1; continue; }
                if ($inv) { db_update('br_invites', ['sent_at' => $now], 'id = ?', [(int)$inv['id']]); }
                else { db_insert('br_invites', ['request_id' => $id, 'brigade_id' => $bid, 'source' => in_array($_POST['src'][$bid] ?? '', ['auto', 'client'], true) ? (string)$_POST['src'][$bid] : 'admin', 'created_at' => $now, 'sent_at' => $now]); }
                brig_mail((string)$b['email'], 'brig_invite', ['name' => $b['contact_name'], 'object' => $r['object_title'], 'district' => BRIG_DISTRICTS[$r['district']] ?? '', 'deadline' => date('d.m.Y H:i', $dlTs), 'link' => brig_link('brigada/#/zakaz/' . $id)], (bool)$r['test'] || (bool)$b['test']);
                brig_notice($bid, null, 'zakazy', 'Новый заказ: ' . $r['object_title'] . ', ' . (BRIG_DISTRICTS[$r['district']] ?? '') . ' — ответ до ' . date('d.m.Y H:i', $dlTs), '#/zakaz/' . $id);
                $n++;
            }
            if (!$n && $r['status'] === 'new') { $msg = 'Не выбрано ни одной подходящей бригады.'; break; }
            db_update('br_requests', ['status' => 'sent', 'deadline_at' => $deadline, 'sent_at' => $r['sent_at'] ?: $now, 'updated_at' => $now], 'id = ?', [$id]);
            brig_audit($WHO, 'request-send', 'request#' . $id, 'Разослано бригадам: ' . $n . ', срок ' . $deadline);
            $msg = 'Разослано: ' . $n . '. Срок ответа — ' . date('d.m.Y H:i', $dlTs) . '.' . (!empty($capped) ? ' Не отправлено ' . $capped . ': лимит ' . brig_terms()['invite_max'] . ' бригад на запрос.' : ''); break;
        case 'r_cancel':
            db_update('br_requests', ['status' => 'cancelled', 'updated_at' => $now], 'id = ?', [$id]);
            brig_audit($WHO, 'request-cancel', 'request#' . $id, $reason);
            $back .= '?r=' . $id; $msg = 'Запрос отменён.'; break;
        case 'j_sign':   // с 01.11.2026 договор подписывают только стороны на сайте (ПЭП кодом) — «за сторону» администратор не подписывает
            $msg = 'Договор подписывают только стороны на сайте кодом подтверждения.'; $back .= '?j=' . $id; break;
        case 'j_invoice':   // общая точка с панелью (ledger_invoice): счёт — только при реквизитах LINEA (до ИП — «отложено»), вручную — с причиной
            $back .= '?view=money';
            $r = ledger_invoice($id, $WHO, $reason, !empty($_POST['manual']));
            $msg = str_starts_with((string)$r, 'LB-') ? 'Счёт ' . $r . ' выставлен.' : (string)$r;
            break;
        case 'f_ok':   // одобрить файл портфолио/логотип для каталога (К-2: на картинке может быть телефон)
            $f = brig_one("SELECT * FROM br_files WHERE id = ? AND owner_kind IN ('portfolio','logo')", [$id]);
            if ($f) { db_update('br_files', ['moderated_at' => $now], 'id = ?', [$id]); brig_audit($WHO, 'file-ok', 'brigade#' . $f['brigade_id'], 'файл #' . $id); $back .= '?b=' . (int)$f['brigade_id']; $msg = 'Файл одобрен для каталога.'; }
            break;
        case 'f_del':
            $f = brig_one("SELECT * FROM br_files WHERE id = ? AND owner_kind IN ('portfolio','logo')", [$id]);
            if ($f) {
                @unlink(brig_dir() . '/files/' . $f['stored_path']);
                brig_exec('DELETE FROM br_files WHERE id = ?', [$id]);
                if ($f['owner_kind'] === 'logo') { brig_exec('UPDATE br_brigades SET logo_file = NULL WHERE id = ? AND logo_file = ?', [(int)$f['brigade_id'], $id]); }
                brig_audit($WHO, 'file-del', 'brigade#' . $f['brigade_id'], 'файл #' . $id . ($reason ? ': ' . $reason : ''));
                $back .= '?b=' . (int)$f['brigade_id']; $msg = 'Файл удалён.';
            }
            break;
        case 'b_inn_release':   // спор за ИНН (кто-то занял чужой ИНН регистрацией): освободить ключ ИНН у недопущенной бригады
            $b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [$id]);
            $back .= '?b=' . $id;
            if (!$b || in_array($b['status'], ['active', 'blocked'], true)) { $msg = 'Освободить ИНН можно только у недопущенной и незаблокированной бригады.'; break; }
            if ($reason === '') { $msg = 'Укажите причину.'; break; }
            db_update('br_brigades', ['inn_key' => null, 'status' => 'suspended', 'status_reason' => 'ИНН освобождён: ' . $reason, 'updated_at' => $now], 'id = ?', [$id]);
            brig_audit($WHO, 'inn-release', 'brigade#' . $id, $reason);
            $msg = 'ИНН освобождён, анкета приостановлена.'; break;
        case 'j_advance':   // исправить отметку аванса (расхождение сторон, В-2) — с причиной в журнал
            $j = brig_one('SELECT * FROM br_jobs WHERE id = ?', [$id]);
            $back .= '?j=' . $id;
            if (!$j || $reason === '') { $msg = 'Укажите причину исправления.'; break; }
            $to = (string)($_POST['to'] ?? '');
            if ($to === 'confirmed') { brig_exec("UPDATE br_jobs SET advance_at = COALESCE(advance_at, ?), advance_by = COALESCE(advance_by, 'admin'), advance_state = 'confirmed', updated_at = ? WHERE id = ?", [$now, $now, $id]); }
            elseif ($to === 'clear') { brig_exec("UPDATE br_jobs SET advance_at = NULL, advance_by = NULL, advance_state = NULL, advance_note = NULL, updated_at = ? WHERE id = ?", [$now, $id]); }
            else { $msg = 'Неизвестное действие.'; break; }
            brig_audit($WHO, 'advance', 'job#' . $id, 'LINEA исправила отметку аванса (' . ($to === 'clear' ? 'снята' : 'подтверждена') . '): ' . $reason);
            if ($to === 'confirmed') { brig_commission_due_check($id, $WHO); }
            $msg = 'Отметка аванса исправлена.'; break;
        case 'c_approve': case 'c_reject':   // допсоглашение с сильным уменьшением цены (В-1); расторжение на ноль или ниже счёта (ревью 02.11, В1)
            $c = brig_one("SELECT * FROM br_contracts WHERE id = ? AND kind IN ('addendum','termination') AND status = 'draft' AND needs_admin = 1", [$id]);
            if (!$c) { $msg = 'Нет такого документа на подтверждении.'; break; }
            $back .= '?j=' . (int)$c['job_id'];
            $isT = $c['kind'] === 'termination'; $dn = ($isT ? 'соглашение о расторжении' : 'допсоглашение') . ' № ' . $c['num'];
            if ($act === 'c_approve') { db_update('br_contracts', ['admin_ok_at' => $now], 'id = ?', [$id]); brig_audit($WHO, $isT ? 'termination-ok' : 'addendum-ok', 'job#' . $c['job_id'], 'LINEA подтвердила ' . $dn . ($reason ? ': ' . $reason : '')); $msg = ($isT ? 'Соглашение о расторжении' : 'Допсоглашение') . ' подтверждено — стороны могут подписать.'; }
            else { db_update('br_contracts', ['status' => 'void'], 'id = ?', [$id]); brig_audit($WHO, $isT ? 'termination-cancel' : 'addendum-cancel', 'job#' . $c['job_id'], 'LINEA отклонила ' . $dn . ($reason ? ': ' . $reason : '')); $msg = ($isT ? 'Соглашение о расторжении' : 'Допсоглашение') . ' отклонено.'; }
            break;
        case 'i_paid':
            $i = brig_one('SELECT * FROM br_invoices WHERE id = ?', [$id]);
            if ($i && !$i['paid_at']) {
                db_update('br_invoices', ['paid_at' => $now, 'paid_note' => linea_str($_POST['note'] ?? '', 120) ?: 'вручную'], 'id = ?', [$id]);
                brig_audit($WHO, 'invoice-paid', $i['number'], brig_rub((int)$i['amount_kop']));
                $msg = 'Счёт ' . $i['number'] . ' оплачен.';
            }
            $back .= '?view=money'; break;
        case 'rv_hide':
            $k = (string)($_POST['why'] ?? '');
            if (!isset(BRIG_REVIEW_HIDE[$k])) { $msg = 'Скрыть можно только по причине из правил площадки.'; $back .= '?view=reviews'; break; }
            db_update('br_reviews', ['hidden' => 1, 'hidden_reason' => BRIG_REVIEW_HIDE[$k] . ($reason ? ': ' . $reason : ''), 'hidden_at' => $now], 'id = ?', [$id]);
            brig_audit($WHO, 'review-hide', 'review#' . $id, BRIG_REVIEW_HIDE[$k] . ($reason ? ': ' . $reason : ''));
            $back .= '?view=reviews'; break;
        case 'rv_show':
            db_update('br_reviews', ['hidden' => 0, 'hidden_reason' => null, 'hidden_at' => null], 'id = ?', [$id]);
            brig_audit($WHO, 'review-show', 'review#' . $id, $reason);
            $back .= '?view=reviews'; break;
        case 'd_msg':
            $t = linea_str($_POST['text'] ?? '', 3000);
            if ($t !== '') { db_insert('br_dispute_msgs', ['dispute_id' => $id, 'who' => 'admin', 'text' => $t, 'at' => $now]); brig_audit($WHO, 'dispute-msg', 'dispute#' . $id); $msg = 'Сообщение LINEA добавлено — его видят обе стороны.'; }
            $back .= '?view=disputes'; break;
        case 'd_resolve':
            if ($reason === '') { $msg = 'Опишите решение.'; $back .= '?view=disputes'; break; }
            db_update('br_disputes', ['status' => 'resolved', 'resolution' => $reason, 'resolved_at' => $now], 'id = ?', [$id]);
            if ($dj = brig_one('SELECT job_id FROM br_disputes WHERE id = ?', [$id])) { db_insert('br_messages', ['job_id' => (int)$dj['job_id'], 'who' => 'system', 'text' => 'LINEA: рекомендация по разногласию — ' . $reason . ' (право на суд у сторон сохраняется).', 'masked' => 0, 'at' => $now]); }
            brig_audit($WHO, 'dispute-resolve', 'dispute#' . $id, $reason);
            $back .= '?view=disputes'; break;
    }
    return [$msg, $back];
}
