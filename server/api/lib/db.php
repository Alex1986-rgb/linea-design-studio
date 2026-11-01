<?php
/**
 * LINEA · тонкий слой доступа к базе (PDO). Весь новый код ходит в базу ТОЛЬКО через эти функции.
 *
 * Зачем: база переезжает с SQLite на MySQL Beget (решение 31.10.2026). Поэтому здесь и в migrations.php:
 *   · никакой SQLite-специфики в запросах: без PRAGMA, `INSERT OR …`, julianday(), json_extract(), типов по умолчанию;
 *   · даты — строки ISO «ГГГГ-ММ-ДД ЧЧ:ММ:СС» (linea_now()), сравниваются как строки, арифметика дат — в PHP;
 *   · id новой строки — db_insert() (lastInsertId работает в обоих драйверах);
 *   · схема — только в migrations.php с номером версии; типы пишутся метками {ID} {KEY} {TEXT} {INT} {REAL} {BOOL},
 *     которые db_migrate() переводит под драйвер.
 * Подключение: config 'db' => ['dsn' => 'mysql:host=localhost;dbname=…;charset=utf8mb4', 'user' => …, 'pass' => …] (MySQL 5.7 Beget);
 * нет 'db' — прежняя linea-private/linea.sqlite (локальные проверки). linea_db() в boot.php отдаёт то же соединение.
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

function db(): PDO
{
    static $pdo = null;
    if ($pdo) { return $pdo; }
    $c = db_config();
    if (!$c) { return $pdo = linea_db(); }
    $pdo = new PDO($c['dsn'], (string)($c['user'] ?? ''), (string)($c['pass'] ?? ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    if (str_starts_with($c['dsn'], 'mysql:')) {
        // MySQL 5.7 Beget: сервер по умолчанию utf8 (3 байта) — соединение и таблицы явно utf8mb4; даты пишем строками МСК (linea_now)
        $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    }
    return $pdo;
}

/** Внешняя база из конфига: 'db' => ['dsn' => 'mysql:host=localhost;dbname=…;charset=utf8mb4', 'user' => …, 'pass' => …] (или старое 'db_dsn'). null — SQLite. */
function db_config(): ?array
{
    $cfg = linea_cfg();
    if (is_array($cfg['db'] ?? null) && (string)($cfg['db']['dsn'] ?? '') !== '') { return $cfg['db']; }
    if ((string)($cfg['db_dsn'] ?? '') !== '') { return ['dsn' => $cfg['db_dsn'], 'user' => $cfg['db_user'] ?? '', 'pass' => $cfg['db_pass'] ?? '']; }
    return null;
}

function db_driver(): string { return (string)db()->getAttribute(PDO::ATTR_DRIVER_NAME); }

function db_one(string $sql, array $args = []): ?array
{
    $q = db()->prepare($sql);
    $q->execute($args);
    $r = $q->fetch();
    return $r ?: null;
}

function db_all(string $sql, array $args = []): array
{
    $q = db()->prepare($sql);
    $q->execute($args);
    return $q->fetchAll();
}

function db_val(string $sql, array $args = [])
{
    $q = db()->prepare($sql);
    $q->execute($args);
    $v = $q->fetchColumn();
    return $v === false ? null : $v;
}

function db_exec(string $sql, array $args = []): int
{
    $q = db()->prepare($sql);
    $q->execute($args);
    return $q->rowCount();
}

/** Имя таблицы/колонки — только из кода, не из запроса; на всякий случай проверяем. */
function db_ident(string $s): string
{
    if (!preg_match('/^[a-z_][a-z0-9_]*$/', $s)) { throw new InvalidArgumentException('bad identifier'); }
    return $s;
}

function db_insert(string $table, array $row): int
{
    $cols = array_map('db_ident', array_keys($row));
    db_exec('INSERT INTO ' . db_ident($table) . ' (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')', array_values($row));
    return (int)db()->lastInsertId();
}

function db_update(string $table, array $set, string $where, array $args = []): int
{
    $parts = array_map(fn($c) => db_ident($c) . ' = ?', array_keys($set));
    return db_exec('UPDATE ' . db_ident($table) . ' SET ' . implode(', ', $parts) . ' WHERE ' . $where, array_merge(array_values($set), $args));
}

/** Транзакция: BEGIN … COMMIT, при исключении — откат и исключение дальше. */
function db_tx(callable $fn)
{
    $pdo = db();
    $own = !$pdo->inTransaction();
    if ($own) { $pdo->beginTransaction(); }
    try { $r = $fn(); if ($own) { $pdo->commit(); } return $r; }
    catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
}

/** Миграции схемы: таблица schema_version, шаги из migrations.php по возрастанию версии. */
function db_migrate(): void
{
    static $done = false;
    if ($done) { return; }
    $done = true;
    // {KEY} ≤ 190 знаков (utf8mb4 × 4 = 760 байт < 767 — индекс строится и без innodb_large_prefix); {SHORT} — для составных индексов
    $common = ['{KEY}' => 'VARCHAR(190)', '{SHORT}' => 'VARCHAR(32)', '{EMAIL}' => 'VARCHAR(150)', '{TEXT}' => 'TEXT', '{BOOL}' => 'SMALLINT'];
    $types = db_driver() === 'mysql'
        ? $common + ['{ID}' => 'BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY', '{INT}' => 'BIGINT', '{REAL}' => 'DOUBLE', '{INN_TEST}' => "CONCAT(inn, ':test')", '{ENGINE}' => ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci']
        : $common + ['{ID}' => 'INTEGER PRIMARY KEY AUTOINCREMENT', '{INT}' => 'INTEGER', '{REAL}' => 'REAL', '{INN_TEST}' => "inn || ':test'", '{ENGINE}' => ''];
    db()->exec('CREATE TABLE IF NOT EXISTS schema_version (name ' . $types['{KEY}'] . ' NOT NULL PRIMARY KEY, version ' . $types['{INT}'] . ' NOT NULL, applied_at ' . $types['{KEY}'] . ' NOT NULL)' . $types['{ENGINE}']);
    $have = (int)(db_val("SELECT version FROM schema_version WHERE name = 'linea'") ?? 0);
    $steps = require __DIR__ . '/migrations.php';
    ksort($steps);
    foreach ($steps as $ver => $sqls) {
        if ($ver <= $have) { continue; }
        foreach ($sqls as $sql) { db()->exec(strtr($sql, $types)); }
        if ($have === 0) {
            try { db_insert('schema_version', ['name' => 'linea', 'version' => $ver, 'applied_at' => linea_now()]); }
            catch (PDOException $e) { db_update('schema_version', ['version' => $ver, 'applied_at' => linea_now()], "name = 'linea'"); }   // параллельный первый запрос
        } else { db_update('schema_version', ['version' => $ver, 'applied_at' => linea_now()], "name = 'linea'"); }
        $have = $ver;
    }
}
