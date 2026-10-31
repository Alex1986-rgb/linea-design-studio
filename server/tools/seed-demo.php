<?php
/**
 * Демо-бригады для каталога «Ремонт по проекту», пока настоящие бригады не подключены.
 *
 *   php server/tools/seed-demo.php --private=<папка linea-private>          # создать (повторный запуск ничего не задваивает)
 *   php server/tools/seed-demo.php --private=<папка linea-private> --purge  # удалить все демо-записи и их файлы
 *
 * Правила демо (ответственность агрегатора по ЗоЗПП, docs/reviews/2026-10-31-kritik-yurist.md):
 *   · названия явно условные «Бригада-пример: …»; флаг demo=1 на аккаунте, бригаде, объектах и файлах;
 *   · НЕТ ИНН, отметок «ИНН проверен / видеозвонок», рейтинга, отзывов, времени ответа, цены — их нельзя выдумывать;
 *   · фото — визуализации проекта prompt-kv54 (site/assets/brigady-demo/), подпись «иллюстрация из проекта LINEA», не «наш объект»;
 *   · каталог показывает демо только пока нет настоящих бригад, с плашкой «Пример карточки»; noindex, без schema.org, не в sitemap;
 *   · в подбор, рассылку и приглашения демо не попадает (фильтр demo = 0), войти в демо-аккаунт нельзя (status = disabled).
 * Работает и на SQLite, и на MySQL (config 'db'). На боевом запускает Александр/координатор после проверки.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$opt = getopt('', ['private:', 'purge']);
$priv = rtrim((string)($opt['private'] ?? ''), '/');
if ($priv === '' || !is_dir($priv)) { fwrite(STDERR, "--private=<папка linea-private> обязателен\n"); exit(2); }
putenv('LINEA_PRIVATE=' . $priv);
require __DIR__ . '/../api/lib/boot.php';
require __DIR__ . '/../api/lib/brig.php';
brig_db();
$ASSETS = dirname(__DIR__, 2) . '/site/assets/brigady-demo';
$CAP = 'иллюстрация из проекта LINEA';

if (isset($opt['purge'])) {
    $n = 0;
    foreach (db_all('SELECT stored_path FROM br_files WHERE demo = 1') as $f) { @unlink(brig_dir() . '/files/' . $f['stored_path']); $n++; }
    db_tx(function () {
        db_exec('DELETE FROM br_files WHERE demo = 1');
        db_exec('DELETE FROM br_portfolio WHERE demo = 1');
        db_exec('DELETE FROM br_brigades WHERE demo = 1');
        db_exec('DELETE FROM accounts WHERE demo = 1');
    });
    brig_audit('seed', 'demo-purge', 'demo', "удалено файлов: $n");
    echo "Демо удалено (файлов: $n)\n";
    exit(0);
}

$DEMO = [
    ['email' => 'demo-otdelka@linea.invalid', 'name' => 'Бригада-пример: отделка под ключ', 'legal' => 'ip', 'team' => 5, 'exp' => 9, 'warranty' => 12,
        'specs' => ['demontazh', 'chernovye', 'elektrika', 'santehnika', 'plitka', 'malyarka', 'poly', 'potolki'], 'districts' => ['yuzao', 'zao', 'nao'],
        'about' => 'Образец карточки: так бригада рассказывает о себе — состав, подход к работе по проекту, как сдаёт этапы.',
        'objects' => [
            ['Кухня-гостиная 22 м² · 6 недель', 'Демонтаж перегородки, выравнивание стен, инженерная доска 180 мм, покраска, свет по группам', ['living-m1', 'kids-m1']],
            ['Санузел 4,1 м² · 3 недели', 'Гидроизоляция, раскладка плитки по листу с подрезками, инсталляция, гигиенический душ, тёплый пол', ['bath-s1']],
            ['Прихожая и коридор · 2 недели', 'Шкаф-купе в нише, потолок ГКЛ со светом, двери скрытого монтажа', ['hall-s1', 'corridor-s1']],
        ]],
    ['email' => 'demo-inzheneriya@linea.invalid', 'name' => 'Бригада-пример: инженерия', 'legal' => 'ooo', 'team' => 3, 'exp' => 12, 'warranty' => 24,
        'specs' => ['elektrika', 'santehnika'], 'districts' => ['cao', 'sao', 'svao'],
        'about' => 'Образец карточки бригады инженерных систем: электрика по группам щита, водоснабжение и канализация, тёплый пол.',
        'objects' => [
            ['Электрика квартиры 64 м² · 2 недели', 'Разводка по группам щита, подрозетники по листу «Розетки», протокол замера изоляции', ['living-m1', 'bedroom-m1']],
            ['Санузел: разводка и инсталляция · 1 неделя', 'Выводы по листу «Выводы сантехники», опрессовка, инсталляция унитаза', ['bath-s1']],
        ]],
    ['email' => 'demo-malyary@linea.invalid', 'name' => 'Бригада-пример: малярно-плиточная', 'legal' => 'npd', 'team' => 2, 'exp' => 6, 'warranty' => 12,
        'specs' => ['plitka', 'malyarka'], 'districts' => ['vao', 'yuvao', 'mo-e'],
        'about' => 'Образец карточки небольшой бригады чистовой отделки: шпаклёвка под окраску, покраска, плитка.',
        'objects' => [
            ['Детская 12 м² · 10 дней', 'Шпаклёвка в два слоя, покраска по колерной карте проекта', ['kids-m1']],
            ['Спальня 14 м² · 2 недели', 'Подготовка стен, покраска, акцентная стена за изголовьем', ['bedroom-m1', 'corridor-s1']],
        ]],
];

$now = linea_now();
$made = 0;
foreach ($DEMO as $d) {
    if (db_one('SELECT id FROM accounts WHERE role = ? AND email = ?', ['brigade', $d['email']])) { echo "  есть: {$d['name']}\n"; continue; }
    db_tx(function () use ($d, $now, $ASSETS, $CAP) {
        $acc = db_insert('accounts', ['role' => 'brigade', 'email' => $d['email'], 'pass_hash' => password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT),
            'status' => 'disabled', 'fail_n' => 0, 'lock_until' => 0, 'created_at' => $now, 'test' => 0, 'demo' => 1]);
        $bid = db_insert('br_brigades', ['account_id' => $acc, 'status' => 'active', 'created_at' => $now, 'updated_at' => $now, 'admitted_at' => $now,
            'name' => $d['name'], 'contact_name' => 'Пример', 'phone' => '—', 'email' => $d['email'], 'legal' => $d['legal'], 'inn' => '',
            'specs' => json_encode($d['specs']), 'districts' => json_encode($d['districts']), 'team_size' => $d['team'], 'experience' => $d['exp'],
            'warranty_months' => $d['warranty'], 'about' => $d['about'], 'public_name' => 0, 'test' => 0, 'demo' => 1]);
        db_update('br_brigades', ['slug' => 'primer-' . brig_slugify(preg_replace('/^Бригада-пример:\s*/u', '', $d['name']), $bid)], 'id = ?', [$bid]);
        foreach ($d['objects'] as [$title, $works, $pics]) {
            $pid = db_insert('br_portfolio', ['brigade_id' => $bid, 'title' => $title, 'district' => $d['districts'][0], 'works' => $works, 'created_at' => $now, 'demo' => 1]);
            foreach ($pics as $p) {
                $src = "$ASSETS/kv54-$p-1200.jpg";
                if (!is_file($src)) { throw new RuntimeException("нет картинки $src — соберите site/assets/brigady-demo"); }
                $rel = date('Ym') . '/' . bin2hex(random_bytes(16)) . '.jpg';
                brig_dir('files/' . date('Ym'));
                $info = getimagesize($src);
                [$w, $h] = brig_reencode($src, $info, brig_dir() . '/files/' . $rel);
                chmod(brig_dir() . '/files/' . $rel, 0600);
                db_insert('br_files', ['brigade_id' => $bid, 'owner_kind' => 'portfolio', 'owner_id' => $pid, 'kind' => 'after', 'stored_path' => $rel, 'mime' => 'image/jpeg',
                    'bytes' => filesize(brig_dir() . '/files/' . $rel), 'w' => $w, 'h' => $h, 'title' => $CAP, 'created_at' => $now, 'created_by' => 'seed', 'demo' => 1]);
            }
        }
    });
    echo "  создана: {$d['name']}\n";
    $made++;
}
brig_audit('seed', 'demo-seed', 'demo', "создано бригад: $made");
echo "Готово: новых демо-бригад $made\n";
