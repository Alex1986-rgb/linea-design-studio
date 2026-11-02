<?php
/**
 * api/brigada.php?m=<раздел>&a=<действие> — API кабинета бригады (site/brigada/, js/brigada.js). Разделы — модули lib/brigada/*.php:
 *   kab (каркас: кто вошёл, главная, команда, документы, уведомления, рейтинг) · profile (анкета, портфолио) · feed (лента заказов) ·
 *   offer (предложение) · jobs (объекты, договор, этапы, оплаты, разногласия) · finance (деньги) · sheets (листы по запросу) ·
 *   auth (регистрация и запасной вход паролем — выключатель acc_password_login)
 * Вход — единый, кодом на почту (api/vhod.php); сессия общая (кука linea_acc). Старые адреса api/brigade/*.php отвечают 307 сюда.
 */
declare(strict_types=1);
const LINEA_BRIGADA = true;
$m = (string)($_GET['m'] ?? 'kab');
if (!in_array($m, ['kab', 'profile', 'feed', 'offer', 'jobs', 'finance', 'sheets', 'auth'], true)) {
    http_response_code(404); header('Content-Type: application/json; charset=utf-8'); echo '{"ok":false,"error":"Нет такого раздела"}'; exit;
}
require __DIR__ . '/lib/brigada/' . $m . '.php';
