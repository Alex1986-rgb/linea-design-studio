<?php
/** GET api/prices.php — публичные цены из того же config.php, что и счёт (один источник). Только суммы, без ключей. */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
$out = [];
foreach (LINEA_KINDS as $k => $title) {
    $p = linea_cfg()['prices'][$k] ?? null;
    if (is_int($p) && $p > 0) { $out[$k] = ['title' => $title, 'fixed' => $p / 100]; }
    elseif (is_array($p) && (int)($p['per_m2'] ?? 0) > 0) { $out[$k] = ['title' => $title, 'perM2' => (int)$p['per_m2'] / 100, 'min' => (int)($p['min'] ?? 0) / 100]; }
    else { $out[$k] = ['title' => $title, 'text' => 'уточняется — назовём по брифу']; }
}
linea_json(['ok' => true, 'mode' => linea_cfg()['mode'], 'prices' => $out]);
