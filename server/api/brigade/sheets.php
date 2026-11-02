<?php
// Перенесено в api/brigada.php?m=sheets (кабинет бригады, 01.11.2026). Старый адрес отвечает 307 — тот же метод и тело запроса.
$q = (string)($_SERVER['QUERY_STRING'] ?? '');
header('Location: ../brigada.php?m=sheets' . ($q !== '' ? '&' . $q : ''), true, 307);
