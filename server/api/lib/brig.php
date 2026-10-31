<?php
/**
 * LINEA · «Ремонт по проекту»: ядро сервиса бригад (подключается после boot.php).
 *
 * 🔴 Правила:
 *   · Данные — в той же linea.sqlite (таблицы br_*), файлы — linea-private/brigady/files (вне веб-корня), отдача только через PHP
 *     с проверкой прав (brig_file_allowed).
 *   · ПДн клиента бригаде — только после выбора клиентом и его согласия (br_jobs.contacts_consent_at). До выбора бригада видит
 *     обезличенный пакет: район, площадь, позиции сметы, ведомости.
 *   · Сканы паспортов не храним (152-ФЗ): проверка бригады — ИНН + видеозвонок, отметки в анкете.
 *   · Тестовые записи (test=1) писем и сообщений не рассылают никогда (brig-notify.php).
 *   · Журналы — без паролей, токенов и ПДн.
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/accounts.php';
require_once __DIR__ . '/brig-notify.php';

const BRIG_COMMISSION = 0.07;          // решение 31.10.2026: 7 % со сметы бригады, после выбора и подписания договора подряда
const BRIG_DOCS = [                    // редакции документов, которые принимает бригада (как редакция согласия у брифа)
    'pd' => ['title' => 'Согласие на обработку персональных данных', 'href' => 'soglasie/', 'ed' => '31.10.2026'],
    'rules' => ['title' => 'Правила площадки «Ремонт по проекту»', 'href' => 'brigadam/pravila/', 'ed' => '31.10.2026'],
    'agency' => ['title' => 'Агентский договор (оферта для бригад)', 'href' => 'brigadam/dogovor/', 'ed' => '31.10.2026'],
];
const BRIG_CLIENT_TERMS = ['title' => 'Условия сервиса «Ремонт по проекту» для клиентов', 'href' => 'remont/usloviya/', 'ed' => '31.10.2026'];

const BRIG_SPECS = [
    'demontazh' => 'Демонтаж',
    'chernovye' => 'Черновые работы',
    'elektrika' => 'Электрика',
    'santehnika' => 'Сантехника',
    'plitka' => 'Плитка',
    'malyarka' => 'Малярные работы',
    'poly' => 'Полы',
    'potolki' => 'Потолки и ГКЛ',
    'mebel' => 'Мебель и двери',
];
const BRIG_DISTRICTS = [
    'cao' => 'Москва · ЦАО', 'sao' => 'Москва · САО', 'svao' => 'Москва · СВАО', 'vao' => 'Москва · ВАО',
    'yuvao' => 'Москва · ЮВАО', 'yuao' => 'Москва · ЮАО', 'yuzao' => 'Москва · ЮЗАО', 'zao' => 'Москва · ЗАО',
    'szao' => 'Москва · СЗАО', 'zelao' => 'Москва · Зеленоград', 'nao' => 'Москва · Новомосковский', 'tao' => 'Москва · Троицкий',
    'mo-n' => 'МО · север', 'mo-e' => 'МО · восток', 'mo-s' => 'МО · юг', 'mo-w' => 'МО · запад',
];
const BRIG_LEGAL = ['npd' => 'Самозанятый (НПД)', 'ip' => 'ИП', 'ooo' => 'ООО'];
const BRIG_STATUS = [
    'draft' => 'Анкета не отправлена', 'review' => 'На проверке', 'active' => 'Допущена',
    'suspended' => 'Приостановлена', 'blocked' => 'Заблокирована',
];
const BRIG_REQ_STATUS = [
    'new' => 'Ждёт рассылки', 'sent' => 'Бригады готовят предложения', 'chosen' => 'Бригада выбрана',
    'cancelled' => 'Отменён',
];
const BRIG_JOB_STATUS = [
    'contract' => 'Подписание договора', 'work' => 'Ремонт идёт', 'done' => 'Завершён', 'cancelled' => 'Отменён',
];
const BRIG_STAGE_STATUS = [
    'plan' => 'По плану', 'work' => 'В работе', 'ready' => 'Готов к приёмке', 'returned' => 'Возвращён с замечаниями', 'accepted' => 'Принят',
];
const BRIG_MATERIALS = ['client' => 'Материалы заказчика', 'brigade' => 'Материалы бригады', 'mixed' => 'Черновые — бригады, чистовые — заказчика'];
/** Причины скрытия отзыва — только по правилам площадки (раздел 7). Другой причины нет. */
const BRIG_REVIEW_HIDE = [
    'pd' => 'Персональные данные третьих лиц (телефон, адрес, ФИО)',
    'abuse' => 'Оскорбления, нецензурная лексика',
    'offtopic' => 'Не относится к работам по объекту',
    'ad' => 'Реклама или ссылки на сторонние ресурсы',
    'court' => 'Решение суда или предписание госоргана',
];
const BRIG_SHEET_STATUS = [
    'new' => 'Принят', 'work' => 'В работе', 'ready' => 'Готов', 'question' => 'Нужен уточняющий вопрос', 'rejected' => 'Отклонён',
];

function brig_cfg(string $k, $def = null)
{
    $c = linea_cfg();
    return array_key_exists($k, $c) ? $c[$k] : $def;
}

function brig_dir(string $sub = ''): string
{
    $d = linea_private() . '/brigady' . ($sub !== '' ? '/' . $sub : '');
    linea_mkdir($d);
    return $d;
}

/** Секрет для HMAC (CSRF клиента): config 'brig_secret' или файл linea-private/brigady/secret.key (создаётся сам, 0600). */
function brig_secret(): string
{
    $s = (string)brig_cfg('brig_secret', '');
    if ($s !== '') { return $s; }
    $f = brig_dir() . '/secret.key';
    if (!is_file($f)) { file_put_contents($f, bin2hex(random_bytes(32)), LOCK_EX); chmod($f, 0600); }
    return trim((string)file_get_contents($f));
}

/** База сервиса: тонкий слой db.php + миграции migrations.php (схема — только там). */
function brig_db(): PDO
{
    db_migrate();
    return db();
}

/** Журнал действий (админ, бригада, клиент, система). Без паролей, токенов и контактов. */
function brig_audit(string $who, string $action, string $target = '', string $detail = ''): void
{
    brig_db();
    db_insert('br_audit', ['at' => linea_now(), 'who' => mb_substr($who, 0, 60), 'action' => $action, 'target' => mb_substr($target, 0, 80), 'detail' => mb_substr($detail, 0, 500)]);
}

function brig_one(string $sql, array $args = []): ?array { brig_db(); return db_one($sql, $args); }
function brig_all(string $sql, array $args = []): array { brig_db(); return db_all($sql, $args); }
function brig_exec(string $sql, array $args = []): int { brig_db(); return db_exec($sql, $args); }

function brig_json_list($v, array $allowed): array
{
    $a = is_array($v) ? $v : (json_decode((string)$v, true) ?: []);
    return array_values(array_unique(array_filter(array_map('strval', $a), fn($k) => isset($allowed[$k]))));
}

/** ИНН: 10 цифр (организация) или 12 (ИП, самозанятый) с контрольными числами. */
function brig_inn_ok(string $inn): bool
{
    if (!preg_match('/^\d{10}(\d{2})?$/', $inn)) { return false; }
    $d = array_map('intval', str_split($inn));
    $sum = fn(array $w) => array_sum(array_map(fn($k, $i) => $k * $d[$i], $w, array_keys($w))) % 11 % 10;
    if (strlen($inn) === 10) { return $sum([2, 4, 10, 3, 5, 9, 4, 6, 8]) === $d[9]; }
    return $sum([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === $d[10] && $sum([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === $d[11];
}

function brig_slugify(string $s, int $id): string
{
    $map = ['а'=>'a','б'=>'b','в'=>'v','г'=>'g','д'=>'d','е'=>'e','ё'=>'e','ж'=>'zh','з'=>'z','и'=>'i','й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o','п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'h','ц'=>'c','ч'=>'ch','ш'=>'sh','щ'=>'sch','ъ'=>'','ы'=>'y','ь'=>'','э'=>'e','ю'=>'yu','я'=>'ya'];
    $s = strtr(mb_strtolower($s, 'UTF-8'), $map);
    $s = trim(preg_replace('/[^a-z0-9]+/', '-', $s) ?? '', '-');
    return ($s !== '' ? mb_substr($s, 0, 40) . '-' : 'brigada-') . $id;
}

function brig_rub(?int $kop): string { return $kop === null ? '—' : number_format($kop / 100, 0, ',', ' ') . ' ₽'; }

// ───────────────────────────── сессия бригады, CSRF, https

function brig_session(): void { brig_db(); acc_session(); }

/** ПДн бригад — только по https (как бриф); исключения — test=1 и php -S на маке. */
function brig_https(): void
{
    $test = (string)($_GET['test'] ?? $_POST['test'] ?? '') === '1';
    linea_require_https($test);
}

function brig_method(string $m): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $m) { header('Allow: ' . $m); linea_fail('Метод не поддерживается', 405); }
}

function brig_csrf(): void { acc_csrf_check(); }

/** CSRF клиента (доступ по токену заказа, без куки): HMAC от токена; выдаётся в GET remont.php. */
function brig_client_csrf(string $orderToken): string { return hash_hmac('sha256', 'remont|' . $orderToken, brig_secret()); }

function brig_client_csrf_check(string $orderToken): void
{
    $t = (string)($_SERVER['HTTP_X_CSRF'] ?? $_POST['csrf'] ?? '');
    if ($t === '' || !hash_equals(brig_client_csrf($orderToken), $t)) { linea_fail('Форма устарела — обновите страницу', 403); }
}

/** Тело JSON-запроса. */
function brig_input(): array
{
    static $in = null;
    if ($in !== null) { return $in; }
    $ct = (string)($_SERVER['CONTENT_TYPE'] ?? '');
    if (str_starts_with($ct, 'application/json')) {
        $raw = (string)file_get_contents('php://input', false, null, 0, 1048576);
        $in = json_decode($raw, true);
        if (!is_array($in)) { $in = []; }
    } else { $in = $_POST; }
    return $in;
}

/** Текущая бригада по сессии или 401. */
function brig_me(bool $required = true): ?array
{
    brig_session();
    $a = acc_current('brigade');
    $b = $a ? brig_one('SELECT * FROM br_brigades WHERE account_id = ?', [(int)$a['id']]) : null;
    if (!$b && $required) { linea_fail('Войдите в кабинет', 401); }
    if ($b && $b['status'] === 'blocked') { acc_logout(); linea_fail('Аккаунт заблокирован: ' . ($b['status_reason'] ?: 'по правилам площадки'), 403); }
    return $b;
}

function brig_require_active(array $b): void
{
    if ($b['status'] !== 'active') { linea_fail('Заказы видны только допущенным бригадам. Статус: ' . (BRIG_STATUS[$b['status']] ?? $b['status']), 403); }
}

/** Профиль для кабинета — без хэша пароля и служебного. */
function brig_public_self(array $b): array
{
    return [
        'id' => (int)$b['id'], 'slug' => $b['slug'], 'status' => $b['status'], 'statusText' => BRIG_STATUS[$b['status']] ?? $b['status'],
        'statusReason' => (string)$b['status_reason'], 'name' => $b['name'], 'contactName' => $b['contact_name'], 'phone' => $b['phone'],
        'email' => $b['email'], 'legal' => $b['legal'], 'inn' => $b['inn'], 'company' => (string)$b['company'],
        'specs' => json_decode($b['specs'], true) ?: [], 'districts' => json_decode($b['districts'], true) ?: [],
        'teamSize' => $b['team_size'] !== null ? (int)$b['team_size'] : null, 'experience' => $b['experience'] !== null ? (int)$b['experience'] : null,
        'referees' => (string)$b['referees'], 'about' => (string)$b['about'], 'warrantyMonths' => $b['warranty_months'] !== null ? (int)$b['warranty_months'] : null,
        'priceFrom' => $b['price_from'] !== null ? (int)$b['price_from'] : null, 'publicName' => (bool)$b['public_name'],
        'logo' => $b['logo_file'] ? (int)$b['logo_file'] : null,
        'innChecked' => $b['inn_checked_at'], 'callAt' => $b['call_at'], 'test' => (bool)$b['test'],
    ];
}

// ───────────────────────────── загрузки

/**
 * Загрузка файла: только JPEG/PNG/WebP (пережимаются в JPEG ≤ 1600 px, без EXIF и геометок), PDF (проверка сигнатуры),
 * аудио (webm/ogg/mp4/mpeg — для надиктовки «Нужен лист»). Тип — по содержимому (finfo + сигнатура), не по имени и не по
 * заголовку браузера. Имя на диске — случайное, расширение наше. @return id строки br_files
 */
function brig_store_upload(array $f, array $allow, array $owner, string $by): int
{
    if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file_or_test((string)$f['tmp_name'])) {
        linea_fail('Файл не дошёл — загрузите ещё раз');
    }
    $tmp = (string)$f['tmp_name'];
    $size = (int)filesize($tmp);
    $name = mb_strtolower((string)($f['name'] ?? ''), 'UTF-8');
    if (preg_match('/\.(php\d?|phtml|phar|pht|html?|svg|js|exe|sh|cgi|pl|py|htaccess)$/i', $name)) { linea_fail('Такой тип файла не принимаем: можно фото (JPEG, PNG, WebP) или PDF', 415); }
    $head = (string)file_get_contents($tmp, false, null, 0, 64);
    if (stripos($head, '<?php') !== false || stripos($head, '<?=') !== false || stripos($head, '<script') !== false) { linea_fail('Такой тип файла не принимаем: можно фото (JPEG, PNG, WebP) или PDF', 415); }
    $mime = (string)(new finfo(FILEINFO_MIME_TYPE))->file($tmp);
    $dir = brig_dir('files/' . date('Ym'));
    $rel = date('Ym') . '/' . bin2hex(random_bytes(16));
    $w = $h = null;
    if (in_array('img', $allow, true) && in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        if ($size > 15 * 1048576) { linea_fail('Фото больше 15 МБ — уменьшите', 413); }
        $info = @getimagesize($tmp);
        if (!$info || $info[0] < 200 || $info[1] < 200 || $info[0] > 12000 || $info[1] > 12000) { linea_fail('Фото не читается или слишком маленькое (нужно от 200 px)', 415); }
        [$w, $h] = brig_reencode($tmp, $info, brig_dir() . '/files/' . $rel . '.jpg');
        $rel .= '.jpg'; $mime = 'image/jpeg';
        $size = (int)filesize(brig_dir() . '/files/' . $rel);
    } elseif (in_array('pdf', $allow, true) && $mime === 'application/pdf' && str_starts_with($head, '%PDF-')) {
        if ($size > 30 * 1048576) { linea_fail('PDF больше 30 МБ', 413); }
        $rel .= '.pdf';
        if (!@move_uploaded_file($tmp, brig_dir() . '/files/' . $rel) && !@copy($tmp, brig_dir() . '/files/' . $rel)) { linea_fail('Файл не сохранился', 500); }
    } elseif (in_array('xlsx', $allow, true) && in_array($mime, ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream'], true)
        && str_starts_with($head, "PK\x03\x04") && preg_match('/\.xlsx$/', $name)) {
        if ($size > 20 * 1048576) { linea_fail('Файл больше 20 МБ', 413); }
        $rel .= '.xlsx'; $mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (!@move_uploaded_file($tmp, brig_dir() . '/files/' . $rel) && !@copy($tmp, brig_dir() . '/files/' . $rel)) { linea_fail('Файл не сохранился', 500); }
    } elseif (in_array('audio', $allow, true) && in_array($mime, ['audio/webm', 'video/webm', 'audio/ogg', 'audio/mp4', 'video/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/wav', 'audio/x-wav'], true)) {
        if ($size > 10 * 1048576) { linea_fail('Запись больше 10 МБ — сократите', 413); }
        $ext = ['audio/webm' => 'webm', 'video/webm' => 'webm', 'audio/ogg' => 'ogg', 'audio/mp4' => 'm4a', 'video/mp4' => 'm4a', 'audio/x-m4a' => 'm4a', 'audio/mpeg' => 'mp3', 'audio/wav' => 'wav', 'audio/x-wav' => 'wav'][$mime];
        $rel .= '.' . $ext; $mime = $ext === 'webm' ? 'audio/webm' : ($ext === 'm4a' ? 'audio/mp4' : $mime);
        if (!@move_uploaded_file($tmp, brig_dir() . '/files/' . $rel) && !@copy($tmp, brig_dir() . '/files/' . $rel)) { linea_fail('Файл не сохранился', 500); }
    } else {
        linea_fail(in_array($mime, ['image/heic', 'image/heif'], true) ? 'Фото HEIC не принимаем — в настройках камеры выберите «Наиболее совместимый» или пришлите JPEG' : 'Такой тип файла не принимаем: можно фото (JPEG, PNG, WebP)' . (in_array('pdf', $allow, true) ? ' или PDF' : ''), 415);
    }
    chmod(brig_dir() . '/files/' . $rel, 0600);
    brig_db();
    return db_insert('br_files', ['brigade_id' => (int)$owner['brigade_id'], 'owner_kind' => $owner['kind'], 'owner_id' => (int)$owner['id'],
        'kind' => $owner['sub'] ?? 'file', 'stored' => $rel, 'mime' => $mime, 'bytes' => $size, 'w' => $w, 'h' => $h,
        'title' => linea_str(pathinfo((string)($f['name'] ?? ''), PATHINFO_FILENAME), 80), 'created_at' => linea_now(), 'created_by' => $by]);
}

/** Загрузка через HTTP (is_uploaded_file) или локальная проверка (CLI-тест кладёт файл сам). */
function is_uploaded_file_or_test(string $p): bool { return $p !== '' && (is_uploaded_file($p) || (PHP_SAPI === 'cli' && is_file($p))); }

/** Пережатие фото: JPEG 82 %, длинная сторона ≤ 1600 px. EXIF (в том числе геометки) не переносится. Без GD — отказ. */
function brig_reencode(string $src, array $info, string $dst): array
{
    if (!function_exists('imagecreatetruecolor')) { linea_fail('На сервере нет обработки фото (GD) — напишите нам', 500); }
    $img = match ($info[2]) {
        IMAGETYPE_JPEG => @imagecreatefromjpeg($src), IMAGETYPE_PNG => @imagecreatefrompng($src), IMAGETYPE_WEBP => @imagecreatefromwebp($src), default => false,
    };
    if (!$img) { linea_fail('Фото не читается', 415); }
    if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {     // поворот по EXIF до того, как EXIF исчезнет
        $o = (int)(@exif_read_data($src)['Orientation'] ?? 1);
        if ($o === 3) { $img = imagerotate($img, 180, 0); } elseif ($o === 6) { $img = imagerotate($img, -90, 0); } elseif ($o === 8) { $img = imagerotate($img, 90, 0); }
    }
    $w = imagesx($img); $h = imagesy($img);
    $k = min(1, 1600 / max($w, $h));
    $nw = max(1, (int)round($w * $k)); $nh = max(1, (int)round($h * $k));
    $out = imagecreatetruecolor($nw, $nh);
    imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
    imagecopyresampled($out, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
    if (!imagejpeg($out, $dst, 82)) { linea_fail('Фото не сохранилось', 500); }
    return [$nw, $nh];
}

/**
 * Можно ли отдать файл. $ctx: ['brigade' => row] | ['order' => row] | ['admin' => true].
 * Портфолио и логотип допущенной бригады — публичные (каталог). Пакет проекта — бригадам, которым он разослан, и клиенту.
 * Фото этапов — бригаде объекта и клиенту объекта. Лист по запросу — бригаде объекта. Аудио — только бригаде-автору.
 */
function brig_file_allowed(array $f, array $ctx): bool
{
    if (!empty($ctx['admin'])) { return true; }
    $bid = isset($ctx['brigade']) ? (int)$ctx['brigade']['id'] : 0;
    $oid = isset($ctx['order']) ? (int)$ctx['order']['id'] : 0;
    switch ($f['owner_kind']) {
        case 'portfolio': case 'logo':
            if ($bid && (int)$f['brigade_id'] === $bid) { return true; }
            $b = brig_one('SELECT status FROM br_brigades WHERE id = ?', [(int)$f['brigade_id']]);
            return $b && $b['status'] === 'active';
        case 'pack':
            if ($oid) { return (bool)brig_one('SELECT 1 FROM br_requests WHERE id = ? AND order_id = ?', [(int)$f['owner_id'], $oid]); }
            if ($bid && $ctx['brigade']['status'] === 'active') {
                return (bool)brig_one('SELECT 1 FROM br_invites i JOIN br_requests r ON r.id = i.request_id WHERE i.request_id = ? AND i.brigade_id = ? AND i.sent_at IS NOT NULL', [(int)$f['owner_id'], $bid]);
            }
            return false;
        case 'stage':
            $j = brig_one('SELECT j.brigade_id, r.order_id FROM br_stages s JOIN br_jobs j ON j.id = s.job_id JOIN br_requests r ON r.id = j.request_id WHERE s.id = ?', [(int)$f['owner_id']]);
            return $j && (($bid && (int)$j['brigade_id'] === $bid) || ($oid && (int)$j['order_id'] === $oid));
        case 'sheet':
            $j = brig_one('SELECT j.brigade_id, r.order_id FROM br_sheet_reqs s JOIN br_jobs j ON j.id = s.job_id JOIN br_requests r ON r.id = j.request_id WHERE s.id = ?', [(int)$f['owner_id']]);
            return $j && (($bid && (int)$j['brigade_id'] === $bid) || ($oid && (int)$j['order_id'] === $oid && $f['kind'] === 'result'));
        case 'sheet-audio':
            return $bid && (int)$f['brigade_id'] === $bid;
    }
    return false;
}

/** Отдать файл (после проверки прав). */
function brig_send_file(array $f): never
{
    $p = brig_dir() . '/files/' . $f['stored'];
    if (!preg_match('#^\d{6}/[0-9a-f]{32}\.(jpg|pdf|xlsx|webm|ogg|m4a|mp3|wav)$#', (string)$f['stored']) || !is_file($p)) { http_response_code(404); exit; }
    header('Content-Type: ' . $f['mime']);
    header('Content-Length: ' . filesize($p));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=3600');
    header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    $ext = pathinfo($p, PATHINFO_EXTENSION);
    $fn = 'linea-' . (int)$f['id'] . '.' . $ext;
    header('Content-Disposition: ' . ($ext === 'xlsx' ? 'attachment' : 'inline') . '; filename="' . $fn . '"');
    readfile($p);
    exit;
}

function brig_file_url(int $id, string $api = ''): string { return $api . 'brigade/file.php?f=' . $id; }

// ───────────────────────────── пакет проекта, предложения, комиссия

/** Пакет проекта (pack.json из tools/brigady-pack.mjs) — только обезличенные поля (белый список). */
function brig_pack_clean(array $p): array
{
    $pos = [];
    foreach (array_slice((array)($p['positions'] ?? []), 0, 600) as $i => $x) {
        if (!is_array($x)) { continue; }
        $spec = isset(BRIG_SPECS[$x['spec'] ?? '']) ? $x['spec'] : 'chernovye';
        $qty = is_numeric($x['qty'] ?? null) ? round((float)$x['qty'], 2) : null;
        $pos[] = ['id' => 'p' . ($i + 1), 'spec' => $spec, 'name' => linea_str($x['name'] ?? '', 300), 'unit' => linea_str($x['unit'] ?? '', 12), 'qty' => $qty];
    }
    $rooms = [];
    foreach (array_slice((array)($p['rooms'] ?? []), 0, 40) as $r) {
        if (is_array($r)) { $rooms[] = ['name' => linea_str($r['name'] ?? '', 60), 'area' => is_numeric($r['area'] ?? null) ? round((float)$r['area'], 1) : null]; }
    }
    return [
        'slug' => preg_replace('/[^a-z0-9-]/', '', (string)($p['slug'] ?? '')),
        'object' => linea_str($p['object'] ?? '', 80),           // «Квартира 64 м²» — без адреса
        'area' => is_numeric($p['area'] ?? null) ? round((float)$p['area'], 1) : null,
        'rooms' => $rooms, 'positions' => $pos,
        'date' => linea_str($p['date'] ?? '', 20), 'source' => linea_str($p['source'] ?? '', 120),
    ];
}

function brig_works_of(array $pack): array
{
    return array_values(array_unique(array_map(fn($p) => $p['spec'], $pack['positions'] ?? [])));
}

/**
 * Предложение бригады → нормализованные позиции и сумма. Цена — за единицу (₽), позиции без количества — цена за весь объём.
 * Сумма считается здесь, а не берётся из браузера. «Не делаем» — skip.
 */
function brig_offer_calc(array $pack, array $items): array
{
    $out = []; $total = 0;
    foreach ($pack['positions'] as $p) {
        $it = $items[$p['id']] ?? null;
        $skip = !is_array($it) || !empty($it['skip']);
        $price = $skip ? null : (is_numeric($it['price'] ?? null) ? max(0, (float)$it['price']) : null);
        if ($price === null) { $skip = true; }
        $sumKop = $skip ? 0 : (int)round($price * ($p['qty'] ?? 1) * 100);
        $total += $sumKop;
        $out[$p['id']] = ['skip' => $skip, 'price' => $skip ? null : round($price, 2), 'sum' => $sumKop];
    }
    return [$out, $total];
}

function brig_commission(int $totalKop): int { return (int)round($totalKop * BRIG_COMMISSION); }

/** Чек-лист приёмки этапа по названию этапа. */
function brig_checklist_key(string $name): string
{
    $n = mb_strtolower($name, 'UTF-8');
    foreach ([
        'gidro' => 'гидроиз', 'elektrika' => 'электр', 'santehnika' => 'сантех|водопр|канализ|радиат', 'styazhka' => 'стяжк',
        'plitka' => 'плитк|керамогр|облицов', 'shtukaturka' => 'штукатур|черновые стен', 'potolki' => 'потол|гкл|гипсокарт',
        'malyarka' => 'маляр|шпакл|окраск|покраск', 'poly' => 'пол|ламинат|паркет|доск', 'demontazh' => 'демонт', 'mebel' => 'мебел|двер|кухн',
    ] as $k => $re) {
        if (preg_match('/' . $re . '/u', $n)) { return $k; }
    }
    return 'final';
}

/** Стандартные этапы по составу работ (бригада правит в предложении). */
function brig_default_stages(array $works): array
{
    $order = [
        'demontazh' => ['Демонтаж', 5], 'elektrika' => ['Черновая электрика', 7], 'santehnika' => ['Черновая сантехника', 5],
        'chernovye' => ['Штукатурка и стяжка', 14], 'potolki' => ['Потолки и ГКЛ', 7], 'plitka' => ['Гидроизоляция и плитка', 14],
        'malyarka' => ['Шпаклёвка и окраска', 14], 'poly' => ['Чистовые полы', 5], 'mebel' => ['Двери и мебель', 5],
    ];
    $st = [];
    foreach ($order as $k => [$n, $d]) { if (in_array($k, $works, true)) { $st[] = ['name' => $n, 'days' => $d]; } }
    $st[] = ['name' => 'Финальная приёмка', 'days' => 2];
    return $st;
}

function brig_stages_clean($v): array
{
    $st = [];
    foreach (array_slice(is_array($v) ? $v : [], 0, 20) as $x) {
        $n = linea_str(is_array($x) ? ($x['name'] ?? '') : '', 80);
        $d = (int)(is_array($x) ? ($x['days'] ?? 0) : 0);
        if ($n !== '' && $d > 0 && $d <= 365) { $st[] = ['name' => $n, 'days' => $d]; }
    }
    return $st;
}

/** Рейтинг бригады — только по видимым отзывам реальных клиентов завершённых объектов. */
function brig_rating(int $bid): array
{
    $r = brig_one('SELECT COUNT(*) n, AVG(rating) avg FROM br_reviews WHERE brigade_id = ? AND hidden = 0', [$bid]);
    return ['n' => (int)$r['n'], 'avg' => $r['n'] ? round((float)$r['avg'], 1) : null];
}

/** Среднее время ответа (часы) — от рассылки запроса до предложения. */
function brig_response_hours(int $bid): ?float
{
    $r = brig_one('SELECT AVG(response_hours) h, COUNT(response_hours) n FROM br_offers WHERE brigade_id = ?', [$bid]);
    return $r && (int)$r['n'] ? round((float)$r['h'], 1) : null;
}

/** Часы между двумя датами ISO (арифметика дат — в PHP, не в SQL). */
function brig_hours_between(?string $a, ?string $b): ?float
{
    $x = $a ? strtotime($a) : false; $y = $b ? strtotime($b) : false;
    return $x && $y ? round(max(0, $y - $x) / 3600, 1) : null;
}

function brig_jobs_done(int $bid): int
{
    return (int)(brig_one("SELECT COUNT(*) n FROM br_jobs WHERE brigade_id = ? AND status = 'done'", [$bid])['n'] ?? 0);
}

/** Карточка бригады для клиента и каталога — без телефона и почты; имя бригадира — только с его согласия. */
function brig_public_card(array $b, string $api = ''): array
{
    $port = [];
    foreach (brig_all('SELECT * FROM br_portfolio WHERE brigade_id = ? ORDER BY id', [(int)$b['id']]) as $p) {
        $files = brig_all("SELECT id, kind FROM br_files WHERE owner_kind = 'portfolio' AND owner_id = ? ORDER BY id", [(int)$p['id']]);
        $port[] = ['title' => $p['title'], 'district' => BRIG_DISTRICTS[$p['district']] ?? '', 'area' => $p['area'] !== null ? (float)$p['area'] : null,
            'year' => $p['year'] !== null ? (int)$p['year'] : null, 'works' => (string)$p['works'],
            'before' => array_values(array_map(fn($f) => (int)$f['id'], array_filter($files, fn($f) => $f['kind'] === 'before'))),
            'after' => array_values(array_map(fn($f) => (int)$f['id'], array_filter($files, fn($f) => $f['kind'] === 'after')))];
    }
    return [
        'id' => (int)$b['id'], 'slug' => $b['slug'], 'name' => $b['name'], 'contactName' => $b['public_name'] ? $b['contact_name'] : null,
        'legal' => BRIG_LEGAL[$b['legal']] ?? $b['legal'], 'innChecked' => $b['inn_checked_at'] ? substr((string)$b['inn_checked_at'], 0, 10) : null,
        'callPassed' => (bool)$b['call_at'], 'specs' => array_map(fn($k) => BRIG_SPECS[$k] ?? $k, json_decode($b['specs'], true) ?: []),
        'districts' => array_map(fn($k) => BRIG_DISTRICTS[$k] ?? $k, json_decode($b['districts'], true) ?: []),
        'teamSize' => $b['team_size'] !== null ? (int)$b['team_size'] : null, 'experience' => $b['experience'] !== null ? (int)$b['experience'] : null,
        'about' => (string)$b['about'], 'warrantyMonths' => $b['warranty_months'] !== null ? (int)$b['warranty_months'] : null,
        'priceFrom' => $b['price_from'] !== null ? (int)$b['price_from'] : null, 'logo' => $b['logo_file'] ? (int)$b['logo_file'] : null,
        'rating' => brig_rating((int)$b['id']), 'jobsDone' => brig_jobs_done((int)$b['id']), 'responseHours' => brig_response_hours((int)$b['id']),
        'portfolio' => $port,
    ];
}

function brig_reviews_public(int $bid, int $limit = 50): array
{
    return array_map(fn($r) => ['rating' => (int)$r['rating'], 'text' => (string)$r['text'], 'at' => substr((string)$r['created_at'], 0, 10), 'object' => (string)($r['object'] ?: 'Объект')],
        brig_all('SELECT v.rating, v.text, v.created_at, r.object_title object FROM br_reviews v JOIN br_jobs j ON j.id = v.job_id JOIN br_requests r ON r.id = j.request_id WHERE v.brigade_id = ? AND v.hidden = 0 ORDER BY v.id DESC LIMIT ' . (int)$limit, [$bid]));
}

/** Состояние этапов объекта. */
function brig_job_stages(int $jobId): array
{
    $out = [];
    foreach (brig_all('SELECT * FROM br_stages WHERE job_id = ? ORDER BY idx', [$jobId]) as $s) {
        $out[] = [
            'id' => (int)$s['id'], 'idx' => (int)$s['idx'], 'name' => $s['name'], 'status' => $s['status'], 'statusText' => BRIG_STAGE_STATUS[$s['status']] ?? $s['status'],
            'planStart' => $s['plan_start'], 'planEnd' => $s['plan_end'], 'readyAt' => $s['ready_at'], 'acceptedAt' => $s['accepted_at'],
            'checklist' => brig_checklist($s['checklist']), 'checks' => json_decode((string)$s['checks'], true) ?: [],
            'photos' => array_map(fn($f) => (int)$f['id'], brig_all("SELECT id FROM br_files WHERE owner_kind = 'stage' AND owner_id = ? ORDER BY id", [(int)$s['id']])),
            'remarks' => array_map(fn($r) => ['id' => (int)$r['id'], 'text' => $r['text'], 'at' => $r['created_at'], 'closedAt' => $r['closed_at'], 'closeNote' => (string)$r['close_note']],
                brig_all('SELECT * FROM br_remarks WHERE stage_id = ? ORDER BY id', [(int)$s['id']])),
        ];
    }
    return $out;
}

/** Договор подписан обеими сторонами → объект в работе, начисляется комиссия 7 % от суммы предложения. */
function brig_maybe_start(int $jobId, string $who): void
{
    $j = brig_one('SELECT * FROM br_jobs WHERE id = ?', [$jobId]);
    if (!$j || $j['status'] !== 'contract' || !$j['client_signed_at'] || !$j['brigade_signed_at']) { return; }
    $o = brig_one('SELECT total_kop FROM br_offers WHERE id = ?', [(int)$j['offer_id']]);
    $kop = brig_commission((int)$o['total_kop']);
    brig_exec("UPDATE br_jobs SET status = 'work', commission_kop = ?, commission_at = ?, updated_at = ? WHERE id = ?", [$kop, linea_now(), linea_now(), $jobId]);
    brig_exec("UPDATE br_stages SET status = 'work' WHERE job_id = ? AND idx = 1 AND status = 'plan'", [$jobId]);
    brig_audit($who, 'commission', 'job#' . $jobId, 'Начислена комиссия ' . brig_rub($kop) . ' (7 % от ' . brig_rub((int)$o['total_kop']) . ')');
}

/** Даты этапов по графику предложения. */
function brig_plan_dates(string $start, array $stages): array
{
    $t = strtotime($start) ?: time();
    $out = [];
    foreach ($stages as $i => $s) {
        $a = date('Y-m-d', $t); $t = strtotime('+' . (int)$s['days'] . ' days', $t); $b = date('Y-m-d', $t - 86400);
        $out[] = ['name' => $s['name'], 'days' => (int)$s['days'], 'start' => $a, 'end' => $b];
    }
    return $out;
}

// ───────────────────────────── чек-листы приёмки (из правил технадзора GOST-DRAFT: specialists/quality-inspector/rules.json)

function brig_checklist(string $key): array
{
    $C = [
        'demontazh' => ['Демонтаж', [
            ['Вынесен весь мусор, проходы свободны, общие коридоры убраны', 'договор подряда'],
            ['Несущие стены и перекрытия не повреждены, новых проёмов и штроб в несущих нет', 'ЖК РФ ст. 25–29; проект перепланировки'],
            ['Стояки и запорная арматура целы, вода перекрыта только на время работ', 'практика'],
        ]],
        'elektrika' => ['Черновая электрика (скрытые работы)', [
            ['Трассы и коробки совпадают с листами «Розетки», «Освещение», «Выключатели»; отступления — в исполнительной схеме', 'приказ Минстроя № 344/пр — исполнительная документация'],
            ['Акт освидетельствования скрытых работ подписан до штукатурки и закрытия трасс', 'СП 71.13330.2017, п. 4.6'],
            ['Сопротивление изоляции каждой группы не менее 0,5 МОм (мегаомметр на 1000 В) — протокол', 'ПУЭ, гл. 1.8'],
            ['УЗО и дифавтоматы проверены прибором: время отключения при IΔn не более 0,3 с', 'ГОСТ IEC 61008-1 / ГОСТ Р 51326.1'],
            ['Фото стен с трассами до закрытия — с рулеткой от угла', 'практика технадзора'],
        ]],
        'santehnika' => ['Черновая сантехника (скрытые работы)', [
            ['Выводы по высотам и осям — по листу «Выводы сантехники»', 'проект, раздел ВК'],
            ['Опрессовка В1/Т3: давление не меньше 1,5 рабочего, 10 мин, падение не более 0,05 МПа — протокол', 'СП 73.13330.2016'],
            ['Скрываемая канализация пролита водой до закрытия, есть акт', 'СП 73.13330.2016, пп. 7.5.1–7.5.2'],
            ['Акт скрытых работ подписан до закрытия коробов и стяжки', 'СП 71.13330.2017, п. 4.6'],
        ]],
        'gidro' => ['Гидроизоляция', [
            ['Пол и стены на 200 мм, зоны замачивания — по листу раскладки', 'проект'],
            ['Акт освидетельствования на каждый слой', 'СП 71.13330.2017, п. 4.6'],
            ['Тест проливом: 10–30 мм воды на 24 ч (минимум 12 ч) — без протечек', 'практика технадзора (срок нормой не подтверждён)'],
        ]],
        'shtukaturka' => ['Штукатурка', [
            ['Вертикаль стен (улучшенная штукатурка): не более 2 мм на 1 м, не более 10 мм на высоту', 'СП 71.13330.2017, табл. 7.4'],
            ['Горизонталь — не более 3 мм на 1 м', 'СП 71.13330.2017, табл. 7.4'],
            ['Откосы: отклонение не более 4 мм на 1 м', 'СП 71.13330.2017, табл. 7.4'],
        ]],
        'styazhka' => ['Стяжка', [
            ['Просвет под 2-м рейкой: под доску, ламинат, линолеум не более 2 мм; под плитку — не более 4 мм', 'СП 71.13330.2017, табл. 8.5'],
            ['Отклонение от горизонтали — не более 0,2 % размера помещения и не более 20 мм', 'СП 71.13330.2017, табл. 8.5'],
            ['Перед доской и ламинатом — замер влажности CM: цементная стяжка не более 2,0 % (с тёплым полом 1,8 %)', 'практика производителей'],
        ]],
        'plitka' => ['Плитка', [
            ['Вертикаль облицовки — не более 1,5 мм на 1 м', 'СП 71.13330.2017, табл. 7.6'],
            ['Неровность под 2-м рейкой — не более 2 мм; несовпадение профиля — не более 3 мм', 'СП 71.13330.2017, табл. 7.6'],
            ['Ширина шва ±0,5 мм, раскладка и подрезки — по листу раскладки', 'СП 71.13330.2017, табл. 7.6; проект'],
            ['Уступы между плитками пола — не более 1 мм', 'СП 71.13330.2017, табл. 8.15'],
        ]],
        'potolki' => ['Потолки и ГКЛ', [
            ['Каркас и отметки — по листам потолков; закладные под люстры и карнизы установлены до обшивки', 'проект; СП 163.1325800'],
            ['Ревизионные люки — у кранов, распаечных коробок и блоков питания LED', 'проект'],
            ['Акт скрытых работ на каркас до обшивки', 'СП 71.13330.2017, п. 4.6'],
        ]],
        'malyarka' => ['Шпаклёвка и окраска', [
            ['Поверхность под окраску — уровень по проекту (Q3/Q4), без полос и теней при боковом свете', 'проект; практика'],
            ['Цвет и блеск — по колерной карте проекта (код NCS/RAL)', 'проект'],
            ['Стыки и углы ровные, примыкания к потолку и откосам чистые', 'практика'],
        ]],
        'poly' => ['Чистовые полы', [
            ['Плоскость под 2-м рейкой: доска, паркет, линолеум — не более 2 мм; керамика — не более 4 мм', 'СП 71.13330.2017, табл. 8.15'],
            ['Уступы: доска, ламинат, линолеум — не допускаются; керамика — не более 1 мм', 'СП 71.13330.2017, табл. 8.15'],
            ['Зазоры между досками — не более 1 мм; пороги и стыки — по листу полов', 'СП 71.13330.2017, табл. 8.15; проект'],
        ]],
        'mebel' => ['Двери и мебель', [
            ['Двери: зазоры равномерные, полотно не открывается и не закрывается само, фурнитура работает', 'практика'],
            ['Мебель по чертежам: габариты, фасады, фурнитура, увязка с розетками и выводами', 'проект'],
        ]],
        'final' => ['Финальная приёмка', [
            ['Все этапы приняты, замечания закрыты', 'договор подряда'],
            ['Передан пакет исполнительной документации: схемы электрики и сантехники, протоколы, акты скрытых работ', 'приказ Минстроя № 344/пр'],
            ['Гарантийный срок записан в договоре (не менее 24 мес. рекомендуется)', 'Закон РФ № 2300-1, ст. 29'],
            ['Уборка, вывоз мусора, ключи и паспорта оборудования переданы', 'договор подряда'],
        ]],
    ];
    [$title, $items] = $C[$key] ?? $C['final'];
    return ['key' => $key, 'title' => $title, 'items' => array_map(fn($i) => ['text' => $i[0], 'src' => $i[1]], $items)];
}
