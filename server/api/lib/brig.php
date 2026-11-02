<?php
/**
 * LINEA · «Ремонт по проекту»: ядро сервиса бригад (подключается после boot.php).
 *
 * 🔴 Правила:
 *   · Данные — в той же linea.sqlite (таблицы br_*), файлы — linea-private/brigady/files (вне веб-корня), отдача только через PHP
 *     с проверкой прав (brig_file_allowed).
 *   · ПДн клиента бригаде (и телефон/почта/ИНН бригады клиенту) — только после выбора, согласия клиента и условия
 *     brig_terms()['contacts_after'] (по умолчанию — договор подряда подтверждён обеими сторонами на сайте; br_jobs.contacts_open_at).
 *     До этого стороны общаются в ленте сделки (br_messages), а свободные тексты проходят фильтр контактов (brig_guard).
 *     До выбора бригада видит обезличенный пакет: район, площадь, позиции сметы, ведомости.
 *   · Условия (ставка, когда открываются контакты, листы по запросу) — только brig_terms() в boot.php.
 *   · Сканы паспортов не храним (152-ФЗ): проверка бригады — ИНН + видеозвонок, отметки в анкете.
 *   · Тестовые записи (test=1) писем и сообщений не рассылают никогда (brig-notify.php).
 *   · Журналы — без паролей, токенов и ПДн.
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/accounts.php';
require_once __DIR__ . '/brig-notify.php';
require_once __DIR__ . '/contract.php';

// Сбой базы или кода — JSON-ответ без подробностей (подробности — в журнал linea-private/error.log, без ПДн из запроса)
set_exception_handler(function (Throwable $e) {
    linea_log('error.log', 'brig: ' . get_class($e) . ' ' . $e->getMessage() . ' @' . basename($e->getFile()) . ':' . $e->getLine());
    if (!headers_sent()) { http_response_code(500); header('Content-Type: application/json; charset=utf-8'); }
    echo json_encode(['ok' => false, 'error' => 'Сбой на сервере — попробуйте ещё раз через минуту'], JSON_UNESCAPED_UNICODE);
});

const BRIG_DOCS = [                    // редакции документов, которые принимает бригада (как редакция согласия у брифа)
    'pd' => ['title' => 'Согласие на обработку персональных данных', 'href' => 'soglasie/', 'ed' => '31.10.2026'],
    'rules' => ['title' => 'Правила площадки «Ремонт по проекту»', 'href' => 'brigadam/pravila/', 'ed' => '02.11.2026'],
    'agency' => ['title' => 'Договор-оферта студии с бригадой', 'href' => 'brigadam/dogovor/', 'ed' => '02.11.2026'],
];
const BRIG_CLIENT_TERMS = ['title' => 'Условия сервиса «Ремонт по проекту» для клиентов', 'href' => 'remont/usloviya/', 'ed' => '02.11.2026'];

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
    'new' => 'Принят', 'work' => 'В работе', 'ready' => 'Готов', 'question' => 'Нужен уточняющий вопрос', 'rejected' => 'Отклонён', 'failed' => 'Не собрался — разбираемся',
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
    db_insert('br_audit', ['at' => linea_now(), 'who' => mb_substr($who, 0, 60), 'action' => $action, 'target' => mb_substr($target, 0, 80), 'detail' => mb_substr($detail, 0, 500),
        'ip' => PHP_SAPI === 'cli' ? 'cli' : linea_ip()]);
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
    linea_require_https(linea_test_req((string)($_GET['test'] ?? $_POST['test'] ?? '') === '1'));   // test — только на маке или при allow_test (С-4)
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

/** Бригада текущего запроса (с ролью человека в бригаде) — для проверок прав внутри функций модулей. */
function brig_ctx(?array $b = null): ?array { static $c = null; if ($b !== null) { $c = $b; } return $c; }

/** Текущая бригада по сессии или 401. */
function brig_me(bool $required = true): ?array
{
    brig_session();
    $a = acc_current('brigade');
    $b = null;
    if ($a) {
        // владелец — br_brigades.account_id; бригадир и сотрудник — br_members (свой аккаунт, вход кодом; удалённый теряет доступ сразу)
        $b = brig_one('SELECT * FROM br_brigades WHERE account_id = ?', [(int)$a['id']]);
        if ($b) { $b += ['_role' => 'owner', '_acc' => (int)$a['id'], '_objects' => null, '_name' => (string)$b['contact_name']]; }
        elseif ($m = brig_one('SELECT * FROM br_members WHERE account_id = ? AND removed_at IS NULL', [(int)$a['id']])) {
            $b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [(int)$m['brigade_id']]);
            if ($b) { $b += ['_role' => (string)$m['role'], '_acc' => (int)$a['id'], '_objects' => $m['objects'] !== null ? array_map('intval', json_decode((string)$m['objects'], true) ?: []) : null, '_name' => (string)$m['name']]; }
        }
    }
    if (!$b && $required) { linea_fail('Войдите в кабинет', 401); }
    if ($b) { brig_ctx($b); }
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
        'kind' => $owner['sub'] ?? 'file', 'stored_path' => $rel, 'mime' => $mime, 'bytes' => $size, 'w' => $w, 'h' => $h,
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
            // картинка/PDF может нести телефон, которого фильтр текста не видит (К-2): публично — только после модерации LINEA
            return $b && $b['status'] === 'active' && (!brig_terms()['files_premoderation'] || !empty($f['moderated_at']) || !empty($f['demo']));
        case 'pack':
            if ($oid) { return (bool)brig_one('SELECT 1 FROM br_requests WHERE id = ? AND order_id = ?', [(int)$f['owner_id'], $oid]); }
            if ($bid && $ctx['brigade']['status'] === 'active') {
                return (bool)brig_one('SELECT 1 FROM br_invites i JOIN br_requests r ON r.id = i.request_id WHERE i.request_id = ? AND i.brigade_id = ? AND i.sent_at IS NOT NULL', [(int)$f['owner_id'], $bid]);
            }
            return false;
        case 'stage': case 'stage_before':   // фото этапа и фото «до» старта — сторонам сделки (сотруднику бригады — только по своим объектам)
            $j = brig_one('SELECT j.id, j.brigade_id, r.order_id FROM br_stages s JOIN br_jobs j ON j.id = s.job_id JOIN br_requests r ON r.id = j.request_id WHERE s.id = ?', [(int)$f['owner_id']]);
            $objs = $ctx['brigade']['_objects'] ?? null;
            return $j && (($bid && (int)$j['brigade_id'] === $bid && ($objs === null || in_array((int)$j['id'], $objs, true))) || ($oid && (int)$j['order_id'] === $oid));
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
    $p = brig_dir() . '/files/' . $f['stored_path'];
    if (!preg_match('#^\d{6}/[0-9a-f]{32}\.(jpg|pdf|xlsx|webm|ogg|m4a|mp3|wav)$#', (string)$f['stored_path']) || !is_file($p)) { http_response_code(404); exit; }
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

function brig_commission(int $totalKop, ?float $rate = null): int { return (int)round($totalKop * ($rate ?? brig_terms()['rate'])); }

/**
 * Ставка для следующей сделки бригады (для показа): пилотная, если у бригады есть место в пилоте (br_brigades.pilot_slot — фиксируется
 * при допуске, ревью кода С-5) не дальше N и использовано меньше M пилотных сделок; иначе основная. Само списание пилотной сделки —
 * атомарно в brig_open_contacts (brig_pilot_take).
 */
function brig_rate_for(int $brigadeId): float
{
    $t = brig_terms(); $p = $t['pilot'];
    if (!$p['enabled']) { return $t['rate']; }
    $b = brig_one('SELECT pilot_slot, pilot_used, demo FROM br_brigades WHERE id = ?', [$brigadeId]);
    if (!$b || $b['demo'] || $b['pilot_slot'] === null) { return $t['rate']; }
    return (int)$b['pilot_slot'] <= $p['brigades'] && (int)$b['pilot_used'] < $p['deals'] ? $p['rate'] : $t['rate'];
}

/** Списать пилотную сделку: один UPDATE с условием (две одновременные сделки не получат пилот сверх лимита). @return ставка сделки */
function brig_pilot_take(int $brigadeId): float
{
    $t = brig_terms(); $p = $t['pilot'];
    if (!$p['enabled']) { return $t['rate']; }
    $n = brig_exec('UPDATE br_brigades SET pilot_used = pilot_used + 1 WHERE id = ? AND demo = 0 AND pilot_slot IS NOT NULL AND pilot_slot <= ? AND pilot_used < ?', [$brigadeId, $p['brigades'], $p['deals']]);
    return $n === 1 ? $p['rate'] : $t['rate'];
}

/** Место в пилоте при первом допуске: следующее по порядку среди бригад того же вида (тестовые — отдельно). */
function brig_pilot_slot_assign(int $brigadeId): void
{
    $b = brig_one('SELECT test, demo, pilot_slot FROM br_brigades WHERE id = ?', [$brigadeId]);
    if (!$b || $b['demo'] || $b['pilot_slot'] !== null) { return; }
    $max = (int)(db_val('SELECT MAX(pilot_slot) FROM br_brigades WHERE test = ? AND demo = 0', [(int)$b['test']]) ?? 0);
    brig_exec('UPDATE br_brigades SET pilot_slot = ? WHERE id = ? AND pilot_slot IS NULL', [$max + 1, $brigadeId]);
}

/** Пилот одной фразой (для кабинета и страниц); null — пилот выключен. */
function brig_pilot_text(): ?string
{
    $p = brig_terms()['pilot'];
    return $p['enabled'] ? 'Пилот: первым ' . $p['brigades'] . ' допущенным бригадам первые ' . $p['deals'] . ' сделки — ' . brig_rate_text($p['rate']) . '.' : null;
}

/** Условия для кабинета и страницы заказа (тексты — из тех же параметров). */
function brig_terms_public(): array
{
    $t = brig_terms();
    return [
        'rate' => brig_rate_text(), 'pilot' => brig_pilot_text(), 'contactsAfter' => $t['contacts_after'], 'commissionDue' => $t['commission_due'],
        'dueText' => $t['commission_due'] === 'first_money'
            ? 'Вознаграждение LINEA ' . brig_rate_text() . ' от цены договора начисляется при подписании договора на сайте, а к оплате — по самой ранней из дат: '
                . 'бригада отметила аванс (или не оспорила отметку заказчика за ' . $t['advance_confirm_days'] . ' дн.), наступила дата начала работ по договору, '
                . 'бригада нажала «Начать работу» по первому этапу, принят первый этап'
                . ($t['commission_due_after_sign_days'] ? ' или прошло ' . $t['commission_due_after_sign_days'] . ' дн. после подписания' : '') . '.'
            : 'Вознаграждение LINEA ' . brig_rate_text() . ' от сметы — после подтверждения договора обеими сторонами.',
        'contactsText' => $t['contacts_after'] === 'chosen'
            ? 'Контакты сторон открываются сразу после выбора бригады.'
            : 'Телефоны, почта, адрес объекта и реквизиты откроются обеим сторонам, когда условия договора подряда подтвердят на сайте и заказчик, и бригада. До этого — переписка в карточке сделки.',
        'sheetsText' => 'Листы по запросу под вашу бригаду — без доплаты, пока сделка идёт через LINEA (договор подтверждён обеими сторонами на сайте, объект в работе)'
            . ($t['sheets_free_limit'] !== null ? ', до ' . (int)$t['sheets_free_limit'] . ' листов на объект' : '') . '.',
        'sheetPrice' => $t['sheets_outside_paid'] ? $t['sheet_price_kop'] / 100 : null,   // вне сделки лист продаётся, только когда платный режим включён
        'safeDeal' => (bool)$t['safe_deal'], 'sheetsFreeLimit' => $t['sheets_free_limit'], 'offersShowMax' => $t['offers_show_max'],
    ];
}

// ───────────────────────────── защита от обхода: фильтр контактов, сигналы, лента сделки

const BRIG_MASK = '[скрыто до подтверждения договора]';

/** Буквы-двойники: латиница → кириллица (для «тeлегрaм» с латинскими e/a и «telegrаm» с кириллической а). */
const BRIG_HOMO = ['a' => 'а', 'e' => 'е', 'o' => 'о', 'p' => 'р', 'c' => 'с', 'x' => 'х', 'y' => 'у', 'k' => 'к', 'm' => 'м', 't' => 'т', 'h' => 'н', 'b' => 'в'];

/** Слово → регэксп с классами двойников и необязательным разделителем между буквами («т е л е г р а м», «wh@tsapp»). */
function brig_fuzzy(string $word): string
{
    $lat = array_flip(BRIG_HOMO);
    $out = [];
    foreach (mb_str_split(mb_strtolower($word)) as $ch) {
        $alts = [$ch];
        if (isset(BRIG_HOMO[$ch])) { $alts[] = BRIG_HOMO[$ch]; }
        if (isset($lat[$ch])) { $alts[] = $lat[$ch]; }
        if ($ch === 'a' || $ch === 'а') { $alts[] = '@'; }
        $out[] = '[' . preg_quote(implode('', array_unique($alts)), '/') . ']';
    }
    return '(?<!\p{L})' . implode('[\s.\-_*·]?', $out);
}

/** Цифры прописью → цифры: «восемь девятьсот двадцать шесть» → «8 926». Новая группа — при повторе разряда. */
function brig_words_to_digits(string $t): string
{
    static $ones = ['ноль' => 0, 'нуль' => 0, 'один' => 1, 'одна' => 1, 'два' => 2, 'две' => 2, 'три' => 3, 'четыре' => 4, 'пять' => 5, 'шесть' => 6, 'семь' => 7, 'восемь' => 8, 'девять' => 9];
    static $teens = ['десять' => 10, 'одиннадцать' => 11, 'двенадцать' => 12, 'тринадцать' => 13, 'четырнадцать' => 14, 'пятнадцать' => 15, 'шестнадцать' => 16, 'семнадцать' => 17, 'восемнадцать' => 18, 'девятнадцать' => 19];
    static $tens = ['двадцать' => 20, 'тридцать' => 30, 'сорок' => 40, 'пятьдесят' => 50, 'шестьдесят' => 60, 'семьдесят' => 70, 'восемьдесят' => 80, 'девяносто' => 90];
    static $hund = ['сто' => 100, 'двести' => 200, 'триста' => 300, 'четыреста' => 400, 'пятьсот' => 500, 'шестьсот' => 600, 'семьсот' => 700, 'восемьсот' => 800, 'девятьсот' => 900];
    $all = $hund + $teens + $tens + $ones;
    uksort($all, fn($a, $b) => mb_strlen($b) <=> mb_strlen($a));
    $words = '(?:' . implode('|', array_keys($all)) . ')';
    return preg_replace_callback('/(?<!\p{L})' . $words . '(?:[\s,\-]+' . $words . ')*(?!\p{L})/u', function ($m) use ($ones, $teens, $tens, $hund) {
        $out = []; $g = null; $has = ['t' => false, 'o' => false];
        $flush = function () use (&$out, &$g, &$has) { if ($g !== null) { $out[] = (string)$g; } $g = null; $has = ['t' => false, 'o' => false]; };
        foreach (preg_split('/[\s,\-]+/u', $m[0]) ?: [] as $w) {
            if (isset($hund[$w])) { $flush(); $g = $hund[$w]; }
            elseif (isset($tens[$w])) { if ($g !== null && ($has['t'] || $has['o'])) { $flush(); } $g = ($g ?? 0) + $tens[$w]; $has['t'] = true; }
            elseif (isset($teens[$w])) { if ($g !== null && ($has['t'] || $has['o'])) { $flush(); } $g = ($g ?? 0) + $teens[$w]; $has['t'] = $has['o'] = true; }
            elseif (isset($ones[$w])) {
                if ($ones[$w] === 0) { $flush(); $out[] = '0'; continue; }
                if ($g !== null && $has['o']) { $flush(); }
                $g = ($g ?? 0) + $ones[$w]; $has['o'] = true;
            }
        }
        $flush();
        return implode(' ', $out);
    }, $t) ?? $t;
}

/**
 * Нормализация текста перед проверкой (ревью кода К-2): NFKC (полноширинные цифры и буквы), арабские цифры, разнесённые по одной
 * буквы склеены, цифры прописью → цифры, O/О/l между цифрами → 0/1, номера норм (СП, ГОСТ, п.) убраны.
 * @return array{cyr:string, lat:string, digits:string}  cyr/lat — две «проекции» текста по двойникам; digits — цифры без разделителей
 */
function brig_scan_norm(string $text): array
{
    $t = class_exists('Normalizer') ? (Normalizer::normalize($text, Normalizer::FORM_KC) ?: $text) : $text;
    $t = strtr($t, ['٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        '０' => '0', '１' => '1', '２' => '2', '３' => '3', '４' => '4', '５' => '5', '６' => '6', '７' => '7', '８' => '8', '９' => '9']);
    $t = mb_strtolower($t);
    $t = preg_replace('/(?<!\p{L})(?:сп|гост|снип|ту|sp|iso|din|п\.|пп\.|№|ст\.)\s*[\d.\-–]+/u', ' ', $t) ?? $t;   // номера норм — не телефоны
    // «т е л е г р а м», «t.e.l.e.g.r.a.m» → «телеграм»
    $t = preg_replace_callback('/(?<![\p{L}\p{N}])(?:[\p{L}@][\s.\-_*·]+){3,}[\p{L}@](?![\p{L}\p{N}])/u', fn($m) => preg_replace('/[\s.\-_*·]+/u', '', $m[0]) ?? $m[0], $t) ?? $t;
    $t = brig_words_to_digits($t);
    // О/o/l/I в окружении цифр → 0/1 («8 9OO 123…»)
    $t = preg_replace_callback('/[\dOoОоlI|]+(?:[\s.\-()]+[\dOoОоlI|]+)*/u', fn($m) => preg_match_all('/\d/', $m[0]) >= 3 ? strtr($m[0], ['O' => '0', 'o' => '0', 'О' => '0', 'о' => '0', 'l' => '1', 'I' => '1', '|' => '1']) : $m[0], $t) ?? $t;
    $cyr = strtr($t, BRIG_HOMO);
    $latT = strtr($t, array_flip(BRIG_HOMO) + ['@' => 'a']);
    $digits = preg_replace('/(?<=\d)[\s.\-_\/()·–—+]+(?=\d)/u', '', $t) ?? $t;
    return ['cyr' => $cyr, 'lat' => $latT, 'digits' => $digits];
}

/** Похоже на номер телефона РФ: 10 цифр с 3/4/8/9 или 11 с 7/8 впереди. */
function brig_is_phone(string $d): bool
{
    return (strlen($d) === 10 && strpos('3489', $d[0]) !== false) || (strlen($d) === 11 && ($d[0] === '7' || $d[0] === '8')) || (strlen($d) === 12 && ($d[0] === '8' || $d[0] === '7') && $d[1] === '9');
}

/**
 * Найти и замаскировать контакты в свободном тексте (два прохода, ревью кода К-2):
 *  1) точная маска в исходном тексте: телефоны с любыми разделителями (точки, слэши, тире, скобки, пробелы — и точка в конце фразы),
 *     почта с (at)/[at]/«собака»/пробелами вокруг @ и точки, ссылки и домены (t.me, wa.me, vk.com — и с пробелами), @ники, ник без @
 *     рядом с tg/телега/вацап/вайбер/макс, мессенджеры с буквами-двойниками и разрядкой, просьбы «позвоните / в личку / без комиссии»;
 *  2) проверка нормализованного текста (brig_scan_norm): если контакт виден только после нормализации (цифры прописью, двойники,
 *     полноширинные цифры) — текст скрывается целиком.
 * Фильтр — сдерживание, а не гарантия: главный рычаг — вознаграждение не зависит от отметок сторон (К-1). @return [текст, [что найдено]]
 */
function brig_contact_scan(string $text): array
{
    $found = [];
    $msg = '(?:tg|тг|телег\p{L}*|telegram|телеграм\p{L}*|вацап\p{L}*|ватсап\p{L}*|вотсап\p{L}*|whatsapp|вайбер\p{L}*|viber|макс|max|вк|vk|инст\p{L}*|insta\p{L}*)';
    $dot = '(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\s(?:dot|точка|дот|тчк)\s)';
    $rx = [
        // ник без @ рядом со словом-мессенджером: «тг ivan_painter», «вайбер: remont77»
        'ник' => '/(?<!\p{L})' . $msg . '(?!\p{L})\s*[:\-—]?\s*(?:это\s+|мой\s+|ник\s+)?@?[A-Za-z][A-Za-z0-9_.]{2,31}/iu',
        'почта' => '/[\p{L}0-9._%+\-]+\s*(?:@|\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\}|\s(?:at|собака|собачка|гав|эт)\s)\s*[\p{L}0-9\-]+(?:\s*' . $dot . '\s*[\p{L}0-9\-]+)*?\s*' . $dot . '\s*(?:ru|com|net|org|рф|su|me|io|pro|ком|ру|нет|орг|info|biz|by|kz|ua|ру|ком)(?!\p{L})/iu',
        'почта2' => '/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[\p{L}]{2,}/iu',
        'ссылка' => '/(?:\bhttps?:\/\/|\bwww\.)\S+|(?<![\p{L}\d])(?:t|wa)\s*[.,]?\s*me\s*\/\s*[\w@+]+|(?<![\p{L}\d])tme\/[\w@]+|(?<![\p{L}\d])vk\s*[.,]?\s*(?:com|me)(?:\s*\/\s*[\w.]+)?|(?<![\p{L}\d])(?:vk|вк)\s*id\s*\d+'
            . '|\b(?:ok\.ru|max\.ru|instagram\.com|avito\.ru|profi\.ru|youdo\.com)(?:\/\S*)?'
            . '|\b[a-z0-9][a-z0-9\-]{1,62}\s?\.\s?(?:ru|su|com|net|org|pro|online|site|store|shop|info|biz|me|io|tech|moscow|club|by|kz)\b(?:\/\S*)?|[\p{L}0-9\-]{2,63}\.рф(?!\p{L})(?:\/\S*)?/iu',
        'ник2' => '/(?<![\p{L}\p{N}._%+\-])@[A-Za-z0-9_]{3,32}/u',
        'мессенджер' => '/(?:' . implode('|', array_map('brig_fuzzy', ['whatsapp', 'вацап', 'ватсап', 'вотсап', 'telegram', 'телеграм', 'viber', 'вайбер', 'skype', 'скайп', 'instagram', 'инстаграм', 'вконтакте'])) . ')\p{L}*'
            . '|whats\s*app|в[ао]тс?\s*ап+\p{L}*|(?<!\p{L})телег[аеиуо]й?(?!\p{L})|(?<!\p{L})(?:тг|tg)(?!\p{L})'
            . '|(?:в|через)\s+max(?!\p{L})|в\s+личк[уеи]|(?<!\p{L})в\s+лс(?!\p{L})|в\s+личн\p{L}*\s+сообщени\p{L}*/iu',
        'просьба связаться' => '/(?:мой|наш)\s+(?:номер|телефон|тел\.?|контакт\p{L}*)|(?<!\p{L})(?:по|пере)?звони(?:те)?(?!\p{L})|(?<!\p{L})набери(?:те)?(?!\p{L})'
            . '|свяж(?:итесь|емся)\s+(?:со?\s+мной|с\s+нами|напрямую)|напрямую\s+без\s+(?:сайта|площадки|комиссии|посредник\p{L}*)|(?:без|мимо)\s+(?:сайта|площадки|комиссии)/iu',
    ];
    foreach ($rx as $kind => $re) {
        $kind = rtrim($kind, '2');
        $text = preg_replace_callback($re, function () use ($kind, &$found) { $found[$kind] = true; return BRIG_MASK; }, $text) ?? $text;
    }
    // телефоны: 10–11 цифр с любыми разделителями до 3 знаков между цифрами; номера норм (СП 71.13330.2017) не задеваются
    $src = $text;
    $sep = '[\s.\-_\/()·–—]';
    $text = preg_replace_callback('/(?<!\d)\+?\d(?:' . $sep . '{0,3}\d){9,10}(?!\d)/u', function ($m) use (&$found, $src, $sep) {
        $before = substr($src, max(0, $m[0][1] - 16), min(16, $m[0][1]));
        $after = substr($src, $m[0][1] + strlen($m[0][0]), 8);
        if (preg_match('/(?:СП|ГОСТ|СНиП|ТУ|SP|ISO|п\.|№|ст\.)\s*$/u', $before)) { return $m[0][0]; }
        // часть более длинного числа («850 000 – 900 000») — не телефон: число продолжается до или после совпадения
        if (preg_match('/\d' . $sep . '{0,3}$/u', $before) || preg_match('/^' . $sep . '{0,3}\d/u', $after)) { return $m[0][0]; }
        if (brig_is_phone(preg_replace('/\D/', '', $m[0][0]) ?? '')) { $found['телефон'] = true; return BRIG_MASK; }
        return $m[0][0];
    }, $text, -1, $cnt, PREG_OFFSET_CAPTURE) ?? $text;
    // второй проход: нормализованный текст — контакт виден только после нормализации → текст скрывается целиком
    $n = brig_scan_norm(str_replace(BRIG_MASK, ' ', $text));
    $late = [];
    if (preg_match_all('/(?<!\d)\d{10,12}(?!\d)/', $n['digits'], $mm)) { foreach ($mm[0] as $d) { if (brig_is_phone($d)) { $late['телефон'] = true; } } }
    if (preg_match('/(?:telegram|whatsapp|viber|skype|instagram|t\.?me\/|wa\.?me\/|vk\.?com)/u', $n['lat'])) { $late['мессенджер'] = true; }
    if (preg_match('/(?:телеграм|(?<!\p{L})телег[аеиуо]й?(?!\p{L})|вацап|ватсап|вотсап|вайбер|скайп|инстаграм|вконтакте)/u', $n['cyr'])) { $late['мессенджер'] = true; }
    if (preg_match('/[a-z0-9._%+\-]+(?:@|\(at\)|\[at\]|собака|гав)[a-z0-9\-]+(?:\.|\(dot\)|\[dot\]|точка|дот)(?:ru|com|net|org|рф|ру)/u', preg_replace('/\s+/u', '', $n['lat']) ?? '')) { $late['почта'] = true; }
    if ($late) { $found += $late; $text = BRIG_MASK; }
    return [$text, array_keys($found)];
}

/** Сигнал обхода (без самих контактов): тип, кто, где. */
function brig_signal(string $kind, string $who, array $ctx = [], string $detail = ''): void
{
    brig_db();
    db_insert('br_signals', ['at' => linea_now(), 'kind' => $kind, 'who' => mb_substr($who, 0, 60), 'brigade_id' => isset($ctx['brigade_id']) ? (int)$ctx['brigade_id'] : null,
        'job_id' => isset($ctx['job_id']) ? (int)$ctx['job_id'] : null, 'request_id' => isset($ctx['request_id']) ? (int)$ctx['request_id'] : null,
        'field' => mb_substr((string)($ctx['field'] ?? ''), 0, 60), 'detail' => mb_substr($detail, 0, 500)]);
}

/**
 * Свободный текст до открытия контактов: контакты маскируются, срабатывание пишется в сигналы обхода.
 * $open = true — контакты сторон уже открыты (текст не трогаем). Публичные поля (анкета, портфолио, отзыв) — всегда $open = false.
 */
function brig_guard(string $text, bool $open, array $ctx): string
{
    if ($open || $text === '') { return $text; }
    [$clean, $kinds] = brig_contact_scan($text);
    if ($kinds) { brig_signal('contact', (string)($ctx['who'] ?? ''), $ctx, 'найдено: ' . implode(', ', $kinds)); }
    return $clean;
}

/** Контакты сторон по объекту открыты? */
function brig_contacts_open(array $j): bool { return !empty($j['contacts_open_at']); }

/**
 * Открыть контакты сторон и зафиксировать вознаграждение — один раз и только здесь.
 * Когда — brig_terms()['contacts_after']: 'signed' (обе стороны подтвердили договор на сайте) или 'chosen' (при выборе).
 */
function brig_open_contacts(int $jobId, string $who): void
{
    $j = brig_one('SELECT * FROM br_jobs WHERE id = ?', [$jobId]);
    if (!$j || $j['contacts_open_at'] || $j['status'] === 'cancelled') { return; }
    $o = brig_one('SELECT total_kop FROM br_offers WHERE id = ?', [(int)$j['offer_id']]);
    $base = (int)($j['deal_total_kop'] ?? 0) ?: (int)$o['total_kop'];
    $now = linea_now();
    $due = brig_terms()['commission_due'] === 'signed' ? $now : null;   // 'first_money' — к оплате по самой ранней из дат (brig_commission_due_check)
    // открытие контактов и списание пилотной сделки — в одной транзакции: повторный вызов ничего не меняет, пилот не уходит сверх лимита
    $res = db_tx(function () use ($j, $jobId, $base, $now, $due) {
        if (brig_exec('UPDATE br_jobs SET contacts_open_at = ?, updated_at = ? WHERE id = ? AND contacts_open_at IS NULL', [$now, $now, $jobId]) !== 1) { return null; }
        $rate = brig_pilot_take((int)$j['brigade_id']);
        $kop = brig_commission($base, $rate);
        brig_exec('UPDATE br_jobs SET commission_kop = ?, commission_rate = ?, commission_at = ?, commission_due_at = ?, commission_due_why = ? WHERE id = ?', [$kop, $rate, $now, $due, $due ? 'договор подписан' : null, $jobId]);
        return [$rate, $kop];
    });
    if (!$res) { return; }
    [$rate, $kop] = $res;
    brig_audit($who, 'contacts-open', 'job#' . $jobId, 'Контакты сторон открыты (условие: ' . brig_terms()['contacts_after'] . ')');
    brig_audit($who, 'commission', 'job#' . $jobId, 'Начислено вознаграждение ' . brig_rub($kop) . ' (' . brig_rate_text($rate) . ($rate !== brig_terms()['rate'] ? ', пилот' : '') . ' от ' . brig_rub($base) . ')');
}

/**
 * Вознаграждение К ОПЛАТЕ (ревью кода К-1, разбор юриста п. 1): по самой ранней из наступивших дат —
 *   · аванс отмечен бригадой (или отметка заказчика подтверждена бригадой / не оспорена за advance_confirm_days);
 *   · дата начала работ по договору (Приложение 3, начало этапа 1);
 *   · «Начать работу» по этапу 1 или первый принятый этап;
 *   · N дней после подписания договора (commission_due_after_sign_days, 0 — выкл.).
 * Не зависит только от добровольных кликов заказчика. Ставится один раз; дата — самая ранняя из наступивших. @return дата или null
 */
function brig_commission_due_check(int $jobId, string $who = 'system'): ?string
{
    $j = brig_one('SELECT * FROM br_jobs WHERE id = ?', [$jobId]);
    if (!$j || $j['commission_kop'] === null || $j['commission_due_at'] || $j['status'] === 'cancelled') { return $j['commission_due_at'] ?? null; }
    $t = brig_terms();
    $now = linea_now();
    $c = [];
    if ($j['advance_at'] && $j['advance_state'] === 'confirmed') { $c['аванс отмечен' . ($j['advance_by'] === 'brigade' ? ' бригадой' : ' и подтверждён')] = (string)$j['advance_at']; }
    if ($j['advance_at'] && $j['advance_state'] === 'declared' && strtotime((string)$j['advance_at']) + $t['advance_confirm_days'] * 86400 <= time()) {
        $c['аванс отмечен заказчиком, бригада не оспорила за ' . $t['advance_confirm_days'] . ' дн.'] = (string)$j['advance_at'];
    }
    $s1 = brig_one('SELECT plan_start, started_at FROM br_stages WHERE job_id = ? ORDER BY idx LIMIT 1', [$jobId]);
    if ($j['contacts_open_at'] && $s1 && $s1['plan_start'] && $s1['plan_start'] . ' 00:00:00' <= $now) { $c['дата начала работ по договору'] = $s1['plan_start'] . ' 00:00:00'; }
    if ($s1 && $s1['started_at']) { $c['бригада начала работу по этапу 1'] = (string)$s1['started_at']; }
    // реестр оплат: оплата, подтверждённая второй стороной, или отметка «получено» самой бригадой
    $pm = db_val("SELECT MIN(declared_at) FROM br_payments WHERE job_id = ? AND amount_kop > 0 AND kind <> 'refund' AND (status = 'confirmed' OR (status = 'declared' AND declared_by = 'brigade'))", [$jobId]);
    if ($pm) { $c['оплата бригаде отмечена в реестре сделки'] = (string)$pm; }
    $acc = db_val("SELECT MIN(accepted_at) FROM br_stages WHERE job_id = ? AND accepted_at IS NOT NULL", [$jobId]);
    if ($acc) { $c['принят первый этап'] = (string)$acc; }
    $n = $t['commission_due_after_sign_days'];
    if ($n > 0 && $j['contacts_open_at'] && strtotime((string)$j['contacts_open_at']) + $n * 86400 <= time()) { $c[$n . ' дн. после подписания договора'] = date('Y-m-d H:i:s', strtotime((string)$j['contacts_open_at']) + $n * 86400); }
    if (!$c) { return null; }
    asort($c);
    $why = (string)array_key_first($c); $at = (string)reset($c);
    if (brig_exec('UPDATE br_jobs SET commission_due_at = ?, commission_due_why = ?, updated_at = ? WHERE id = ? AND commission_due_at IS NULL', [$at, $why, $now, $jobId]) === 1) {
        brig_audit($who, 'commission-due', 'job#' . $jobId, 'Вознаграждение к оплате: ' . $why . ' (' . $at . ')');
    }
    return $at;
}

/** Совместимость: событие «первые деньги» — пересчитать «к оплате». */
function brig_commission_due(int $jobId, string $who, string $why): void { brig_commission_due_check($jobId, $who); }

/** Пройти все сделки с начисленным, но ещё не «к оплате» вознаграждением (кабинет бригады, админка, cron). */
function brig_commission_sweep(?int $brigadeId = null): void
{
    foreach (brig_all("SELECT id FROM br_jobs WHERE commission_kop IS NOT NULL AND commission_due_at IS NULL AND status <> 'cancelled'" . ($brigadeId ? ' AND brigade_id = ' . (int)$brigadeId : '')) as $x) {
        brig_commission_due_check((int)$x['id']);
    }
}

/**
 * Долг бригады по счетам на вознаграждение (лестница: просрочка ≥ debt_warn_days — предупреждение; ≥ debt_feed_close_days — закрыта
 * лента новых заказов и новые предложения, начатые сделки доводятся). @return ['kop', 'days', 'level' => none|warn|feed_closed, 'text']
 */
function brig_debt(int $brigadeId): array
{
    $t = brig_terms();
    $r = brig_one("SELECT SUM(amount_kop) kop, MIN(due_at) due FROM br_invoices WHERE brigade_id = ? AND paid_at IS NULL AND due_at IS NOT NULL AND due_at < ?", [$brigadeId, date('Y-m-d')]);
    $kop = (int)($r['kop'] ?? 0);
    $days = $kop > 0 && $r['due'] ? (int)floor((time() - strtotime((string)$r['due'] . ' 23:59:59')) / 86400) + 1 : 0;
    $level = $kop <= 0 ? 'none' : ($days >= $t['debt_feed_close_days'] ? 'feed_closed' : ($days >= $t['debt_warn_days'] ? 'warn' : 'none'));
    $text = $level === 'feed_closed' ? 'Счёт на вознаграждение просрочен на ' . $days . ' дн. (' . brig_rub($kop) . '): новые заказы и предложения закрыты до оплаты. Начатые объекты ведите как обычно.'
        : ($level === 'warn' ? 'Счёт на вознаграждение просрочен (' . brig_rub($kop) . '). Через ' . ($t['debt_feed_close_days'] - $days) . ' дн. лента новых заказов закроется до оплаты.' : '');
    return ['kop' => $kop, 'days' => $days, 'level' => $level, 'text' => $text];
}

/** Новые заказы и предложения — только без долга сверх срока. */
function brig_require_no_debt(array $b): void
{
    $d = brig_debt((int)$b['id']);
    if ($d['level'] === 'feed_closed') { linea_fail($d['text'], 402); }
    // лестница предупреждений: 3-е за 90 дней — лента новых заказов закрыта на 14 дней (начатые объекты — как обычно)
    $w = brig_one('SELECT * FROM br_warnings WHERE brigade_id = ? AND step >= 3 AND until_at > ? ORDER BY id DESC LIMIT 1', [(int)$b['id'], linea_now()]);
    if ($w) { linea_fail('Лента новых заказов закрыта до ' . date('d.m.Y', strtotime((string)$w['until_at'])) . ' (третье предупреждение за 90 дней: ' . $w['rule'] . '). Начатые объекты ведите как обычно.', 403); }
}

/** Действующая (не отменённая) сделка запроса: после мягкой отмены (С-3) по запросу может быть несколько строк br_jobs. */
function brig_job_for_request(int $requestId): ?array
{
    // действующая сделка; расторгнутая соглашением на сайте остаётся видна сторонам (документы, акт, лента); отменённые до договора — нет
    return brig_one("SELECT * FROM br_jobs WHERE request_id = ? AND (status <> 'cancelled' OR terminated_at IS NOT NULL) ORDER BY id DESC LIMIT 1", [$requestId]);
}

/** Лента сообщений сделки (клиент ↔ бригада; LINEA видит всё). */
function brig_messages(int $jobId): array
{
    return array_map(fn($m) => ['who' => $m['who'], 'text' => $m['text'], 'at' => $m['at'], 'masked' => (bool)$m['masked']],
        brig_all('SELECT * FROM br_messages WHERE job_id = ? ORDER BY id LIMIT 300', [$jobId]));
}

function brig_message_add(array $j, string $who, string $text, array $ctx): void
{
    $text = linea_str($text, 2000);
    if ($text === '') { linea_fail('Пустое сообщение'); }
    if ((int)db_val('SELECT COUNT(*) FROM br_messages WHERE job_id = ? AND at > ?', [(int)$j['id'], date('Y-m-d H:i:s', time() - 3600)]) >= 60) { linea_fail('Слишком много сообщений за час — подождите', 429); }
    $gctx = $ctx + ['field' => 'сообщение', 'job_id' => (int)$j['id'], 'brigade_id' => (int)$j['brigade_id']];
    $clean = brig_guard($text, brig_contacts_open($j), $gctx);
    // номер по частям в нескольких сообщениях («8900» + «123» + «4567»): цифры коротких сообщений того же автора за 30 минут склеиваются
    if (!brig_contacts_open($j) && $clean === $text && preg_match('/\d/', $text)) {
        $prev = array_reverse(brig_all('SELECT text FROM br_messages WHERE job_id = ? AND who = ? AND at > ? ORDER BY id DESC LIMIT 3', [(int)$j['id'], $who, date('Y-m-d H:i:s', time() - 1800)]));
        $pd = implode('', array_map(fn($m) => mb_strlen((string)$m['text']) <= 60 ? (preg_replace('/\D/', '', brig_scan_norm((string)$m['text'])['digits']) ?? '') : '', $prev));
        $nd = preg_replace('/\D/', '', brig_scan_norm($text)['digits']) ?? '';
        $all = $pd . $nd; $hit = false;
        for ($i = 0; $i < strlen($pd) && !$hit; $i++) {
            foreach ([10, 11] as $L) { if ($i + $L > strlen($pd) && $i + $L <= strlen($all) && brig_is_phone(substr($all, $i, $L))) { $hit = true; break; } }
        }
        if ($hit) {
            $clean = preg_replace('/\d[\d\s.\-()]*/u', BRIG_MASK . ' ', $text) ?? BRIG_MASK;
            brig_signal('contact', (string)($ctx['who'] ?? ''), $gctx, 'найдено: телефон по частям в нескольких сообщениях');
        }
    }
    db_insert('br_messages', ['job_id' => (int)$j['id'], 'who' => $who, 'text' => $clean, 'masked' => $clean !== $text ? 1 : 0, 'at' => linea_now()]);
}

/**
 * Отказ от выбранной бригады до открытия контактов (заказчик или бригада). Сделка помечается отменённой (переписка и договор
 * сохраняются, подбор можно начать заново),
 * в сигналы обхода пишется «отмена после выбора» — повторы у одной бригады видны в админке.
 */
function brig_job_cancel(array $j, string $by, string $who, string $reason): void
{
    if ($j['status'] !== 'contract' || brig_contacts_open($j)) { linea_fail('Отказаться можно только до подтверждения договора обеими сторонами. Дальше — расторжение по договору; LINEA по просьбе сторон рассмотрит разногласия (рекомендация, право на суд сохраняется)'); }
    $reason = brig_contact_scan(linea_str($reason, 500))[0];
    brig_signal('cancel', $who, ['brigade_id' => (int)$j['brigade_id'], 'request_id' => (int)$j['request_id'], 'job_id' => (int)$j['id'], 'field' => $by],
        'Отказ после выбора (' . ($by === 'client' ? 'заказчик' : 'бригада') . ')' . ($reason !== '' ? ': ' . $reason : ''));
    require_once __DIR__ . '/kabinet.php';
    // мягкая отмена (ревью кода С-3): сделка, переписка и версии договора остаются — доказательства для админки; статус — через deal_transition
    deal_transition((int)$j['id'], 'cancelled', $who, ($by === 'client' ? 'заказчик' : 'бригада') . ' отказался до подписания договора' . ($reason !== '' ? ': ' . $reason : ''), false, ['cancel_by' => $by, 'cancel_reason' => $reason]);
    db_tx(function () use ($j, $by, $reason) {
        $now = linea_now();
        db_exec("UPDATE br_contracts SET status = 'void' WHERE job_id = ? AND status = 'draft'", [(int)$j['id']]);
        db_update('br_offers', ['status' => 'withdrawn', 'updated_at' => $now], 'id = ?', [(int)$j['offer_id']]);
        db_update('br_requests', ['status' => 'cancelled', 'chosen_offer_id' => null, 'updated_at' => $now], 'id = ?', [(int)$j['request_id']]);
    });
    brig_audit($who, 'job-cancel', 'request#' . $j['request_id'], 'Отказ после выбора: ' . ($by === 'client' ? 'заказчик' : 'бригада') . ' #' . $j['brigade_id']);
}

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
        // стоимость работ этапа (₽) — необязательна; задана у всех этапов — идёт в договор как есть (сумма = цене предложения)
        $a = is_array($x) && is_numeric($x['amount'] ?? null) && (float)$x['amount'] > 0 ? (int)round((float)$x['amount'] * 100) : null;
        if ($n !== '' && $d > 0 && $d <= 365) { $st[] = ['name' => $n, 'days' => $d] + ($a !== null ? ['amount' => $a] : []); }
    }
    return $st;
}

/** Разделы сметы → чек-листы этапов, куда относится их стоимость (договор: суммы по этапам из предложения по разделам/позициям). */
const BRIG_SPEC_STAGE = [
    'demontazh' => ['demontazh'], 'elektrika' => ['elektrika'], 'santehnika' => ['santehnika'], 'chernovye' => ['shtukaturka', 'styazhka'],
    'potolki' => ['potolki'], 'plitka' => ['plitka', 'gidro'], 'malyarka' => ['malyarka'], 'poly' => ['poly'], 'mebel' => ['mebel'],
];

/**
 * Стоимость работ по этапам (копейки, сумма = цене предложения), по порядку этапов:
 *   1) бригада указала стоимость каждого этапа и сумма сошлась с ценой — как указано;
 *   2) иначе — по разделам сметы: цена раздела (или сумма его позиций) относится к этапу с тем же видом работ; что не легло ни в один этап —
 *      к последнему (финальная приёмка: деньги в конце защищают заказчика);
 *   3) не сопоставилось ничего — равными долями.
 * $stages — [{name, checklist?, amount?}], $totalKop — цена предложения (или договора с допсоглашениями).
 */
function brig_stage_amounts(array $offer, array $pack, array $stages, ?int $totalKop = null): array
{
    $n = count($stages);
    if (!$n) { return []; }
    $total = $totalKop ?? (int)$offer['total_kop'];
    $given = array_map(fn($s) => isset($s['amount']) ? (int)$s['amount'] : null, array_values($stages));
    if (!in_array(null, $given, true) && array_sum($given) === $total) { return $given; }
    $keys = array_map(fn($s) => (string)($s['checklist'] ?? brig_checklist_key((string)$s['name'])), array_values($stages));
    $bySpec = [];
    if (($offer['mode'] ?? '') === 'sections') {
        foreach (json_decode((string)($offer['sections'] ?? ''), true) ?: [] as $spec => $kop) { $bySpec[$spec] = ($bySpec[$spec] ?? 0) + (int)$kop; }
    } else {
        $items = json_decode((string)($offer['items'] ?? ''), true) ?: [];
        foreach ($pack['positions'] ?? [] as $p) {
            $it = $items[$p['id']] ?? null;
            if ($it && empty($it['skip'])) { $bySpec[(string)$p['spec']] = ($bySpec[(string)$p['spec']] ?? 0) + (int)$it['sum']; }
        }
    }
    $out = array_fill(0, $n, 0); $mapped = 0;
    foreach ($bySpec as $spec => $kop) {
        foreach (BRIG_SPEC_STAGE[$spec] ?? [] as $ck) {
            $i = array_search($ck, $keys, true);
            if ($i !== false) { $out[$i] += $kop; $mapped += $kop; continue 2; }
        }
    }
    if ($mapped <= 0) {
        $per = intdiv($total, $n);
        return array_map(fn($i) => $i === $n - 1 ? $total - $per * ($n - 1) : $per, range(0, $n - 1));
    }
    $sumSpec = array_sum($bySpec);
    $out[$n - 1] += $sumSpec - $mapped;   // разделы без своего этапа — к последнему
    if ($sumSpec !== $total && $sumSpec > 0) {   // допсоглашения или округление: масштаб к цене, остаток копеек — последнему этапу
        $k = $total / $sumSpec;
        $out = array_map(fn($v) => (int)floor($v * $k), $out);
    }
    $out[$n - 1] += $total - array_sum($out);
    return $out;
}

/** Суммы этапов сделки: записанные при договоре (br_stages.amount_kop) или пересчёт для сделок до 02.11.2026. @return [stage_id => kop] */
function brig_job_stage_amounts(int $jobId): array
{
    $st = brig_all('SELECT id, name, checklist, amount_kop FROM br_stages WHERE job_id = ? ORDER BY idx', [$jobId]);
    if (!$st) { return []; }
    if (!in_array(null, array_column($st, 'amount_kop'), true)) { return array_combine(array_map('intval', array_column($st, 'id')), array_map('intval', array_column($st, 'amount_kop'))); }
    $j = brig_one('SELECT j.deal_total_kop, j.request_id, o.* FROM br_jobs j JOIN br_offers o ON o.id = j.offer_id WHERE j.id = ?', [$jobId]);
    $pack = json_decode((string)db_val('SELECT pack FROM br_requests WHERE id = ?', [(int)$j['request_id']]), true) ?: [];
    $am = brig_stage_amounts($j, $pack, $st, (int)($j['deal_total_kop'] ?: $j['total_kop']));
    return array_combine(array_map('intval', array_column($st, 'id')), $am);
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
        // публично — только файлы, прошедшие модерацию LINEA (К-2: телефон на фото фильтр текста не видит)
        $files = brig_all("SELECT id, kind FROM br_files WHERE owner_kind = 'portfolio' AND owner_id = ?" . (brig_terms()['files_premoderation'] ? ' AND (moderated_at IS NOT NULL OR demo = 1)' : '') . " ORDER BY id", [(int)$p['id']]);
        $port[] = ['title' => brig_contact_scan((string)$p['title'])[0], 'district' => BRIG_DISTRICTS[$p['district']] ?? '', 'area' => $p['area'] !== null ? (float)$p['area'] : null,
            'year' => $p['year'] !== null ? (int)$p['year'] : null, 'works' => brig_contact_scan((string)$p['works'])[0], 'demo' => !empty($p['demo']),
            'before' => array_values(array_map(fn($f) => (int)$f['id'], array_filter($files, fn($f) => $f['kind'] === 'before'))),
            'after' => array_values(array_map(fn($f) => (int)$f['id'], array_filter($files, fn($f) => $f['kind'] === 'after')))];
    }
    return [
        'id' => (int)$b['id'], 'slug' => $b['slug'], 'demo' => !empty($b['demo']), 'name' => $b['name'], 'contactName' => $b['public_name'] ? $b['contact_name'] : null,
        'legal' => BRIG_LEGAL[$b['legal']] ?? $b['legal'], 'innChecked' => $b['inn_checked_at'] ? substr((string)$b['inn_checked_at'], 0, 10) : null,
        'callPassed' => (bool)$b['call_at'], 'specs' => array_map(fn($k) => BRIG_SPECS[$k] ?? $k, json_decode($b['specs'], true) ?: []),
        'districts' => array_map(fn($k) => BRIG_DISTRICTS[$k] ?? $k, json_decode($b['districts'], true) ?: []),
        'teamSize' => $b['team_size'] !== null ? (int)$b['team_size'] : null, 'experience' => $b['experience'] !== null ? (int)$b['experience'] : null,
        'about' => brig_contact_scan((string)$b['about'])[0], 'warrantyMonths' => $b['warranty_months'] !== null ? (int)$b['warranty_months'] : null,
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
            'amount' => isset($s['amount_kop']) && $s['amount_kop'] !== null ? (int)$s['amount_kop'] / 100 : null,
            'planStart' => $s['plan_start'], 'planEnd' => $s['plan_end'], 'readyAt' => $s['ready_at'], 'acceptedAt' => $s['accepted_at'], 'startedAt' => $s['started_at'] ?? null,
            'checklist' => brig_checklist($s['checklist']), 'checks' => json_decode((string)$s['checks'], true) ?: [],
            'photos' => array_map(fn($f) => (int)$f['id'], brig_all("SELECT id FROM br_files WHERE owner_kind = 'stage' AND owner_id = ? ORDER BY id", [(int)$s['id']])),
            'remarks' => array_map(fn($r) => ['id' => (int)$r['id'], 'text' => $r['text'], 'at' => $r['created_at'], 'closedAt' => $r['closed_at'], 'closeNote' => (string)$r['close_note']],
                brig_all('SELECT * FROM br_remarks WHERE stage_id = ? ORDER BY id', [(int)$s['id']])),
        ];
    }
    return $out;
}

/**
 * Договор подтверждён обеими сторонами на сайте → объект в работе; при contacts_after = 'signed' здесь открываются контакты
 * и фиксируется вознаграждение (brig_open_contacts). При 'chosen' оно зафиксировано уже при выборе.
 */
function brig_maybe_start(int $jobId, string $who): void
{
    $j = brig_one('SELECT * FROM br_jobs WHERE id = ?', [$jobId]);
    if (!$j || $j['status'] !== 'contract' || !$j['client_signed_at'] || !$j['brigade_signed_at']) { return; }
    require_once __DIR__ . '/brigada.php';
    brig_open_contacts($jobId, $who);
    deal_transition($jobId, 'work', $who, 'договор подписан обеими сторонами на сайте, контакты открыты');   // единая точка смены статуса
    brig_exec("UPDATE br_stages SET status = 'work' WHERE job_id = ? AND idx = 1 AND status = 'plan'", [$jobId]);
    brig_pay_plan($jobId);   // план оплат из договора: аванс и оплата этапов — в реестр br_payments
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

// ───────────────────────────── чек-листы приёмки (из правил приёмки GOST-DRAFT: specialists/quality-inspector/rules.json)

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
            ['Фото стен с трассами до закрытия — с рулеткой от угла', 'практика приёмки скрытых работ'],
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
            ['Тест проливом: 10–30 мм воды на 24 ч (минимум 12 ч) — без протечек', 'практика приёмки скрытых работ (срок нормой не подтверждён)'],
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

/**
 * Уведомление в кабинет бригады (колокольчик): владельцу и людям бригады, которым видна сделка (сотруднику — только по своим объектам).
 * $grp — zakazy | obekty | dengi | listy; «dengi» — только владельцу. $ukey — защита от повторов таймеров.
 */
function brig_notice(int $brigadeId, ?int $jobId, string $grp, string $text, string $link = '', string $ukey = ''): void
{
    $b = brig_one('SELECT account_id FROM br_brigades WHERE id = ?', [$brigadeId]);
    if (!$b) { return; }
    $to = [(int)$b['account_id']];
    if ($grp !== 'dengi') {
        foreach (brig_all('SELECT account_id, role, objects FROM br_members WHERE brigade_id = ? AND removed_at IS NULL', [$brigadeId]) as $m) {
            $o = $m['objects'] !== null ? array_map('intval', json_decode((string)$m['objects'], true) ?: []) : null;
            if ($grp === 'zakazy' && $m['role'] !== 'foreman') { continue; }
            if ($jobId && $o !== null && !in_array($jobId, $o, true)) { continue; }
            $to[] = (int)$m['account_id'];
        }
    }
    foreach (array_unique($to) as $acc) {
        try {
            db_insert('notices', ['account_id' => $acc, 'order_id' => null, 'grp' => in_array($grp, ['zakazy', 'obekty', 'dengi', 'listy'], true) ? $grp : 'obekty',
                'text' => mb_substr($text, 0, 1000), 'link' => mb_substr($link, 0, 180) ?: null, 'at' => linea_now(), 'ukey' => $ukey !== '' ? mb_substr($ukey . '|' . $acc, 0, 180) : null]);
        } catch (PDOException $e) { /* уже есть с этим ukey */ }
    }
}
