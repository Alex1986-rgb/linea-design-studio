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
 * Подключение: config 'db_dsn' (+ 'db_user', 'db_pass') — например 'mysql:host=localhost;dbname=…;charset=utf8mb4';
 * пусто — прежняя linea-private/linea.sqlite (linea_db() в boot.php).
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

function db(): PDO
{
    static $pdo = null;
    if ($pdo) { return $pdo; }
    $dsn = (string)(linea_cfg()['db_dsn'] ?? '');
    if ($dsn === '') { return $pdo = linea_db(); }
    $pdo = new PDO($dsn, (string)(linea_cfg()['db_user'] ?? ''), (string)(linea_cfg()['db_pass'] ?? ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
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
    $types = db_driver() === 'mysql'
        ? ['{ID}' => 'BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY', '{KEY}' => 'VARCHAR(190)', '{TEXT}' => 'TEXT', '{INT}' => 'BIGINT', '{REAL}' => 'DOUBLE', '{BOOL}' => 'SMALLINT', '{ENGINE}' => ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4']
        : ['{ID}' => 'INTEGER PRIMARY KEY AUTOINCREMENT', '{KEY}' => 'VARCHAR(190)', '{TEXT}' => 'TEXT', '{INT}' => 'INTEGER', '{REAL}' => 'REAL', '{BOOL}' => 'SMALLINT', '{ENGINE}' => ''];
    db()->exec('CREATE TABLE IF NOT EXISTS schema_version (name ' . $types['{KEY}'] . ' NOT NULL PRIMARY KEY, version ' . $types['{INT}'] . ' NOT NULL, applied_at ' . $types['{KEY}'] . ' NOT NULL)' . $types['{ENGINE}']);
    $have = (int)(db_val("SELECT version FROM schema_version WHERE name = 'linea'") ?? 0);
    $steps = require __DIR__ . '/migrations.php';
    ksort($steps);
    foreach ($steps as $ver => $sqls) {
        if ($ver <= $have) { continue; }
        foreach ($sqls as $sql) { db()->exec(strtr($sql, $types)); }
        if ($have === 0) { db_insert('schema_version', ['name' => 'linea', 'version' => $ver, 'applied_at' => linea_now()]); }
        else { db_update('schema_version', ['version' => $ver, 'applied_at' => linea_now()], "name = 'linea'"); }
        $have = $ver;
    }
}
