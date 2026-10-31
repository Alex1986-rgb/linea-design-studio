<?php
/**
 * ОБРАЗЕЦ конфига приёма брифа и оплаты LINEA. Настоящий файл лежит на сервере ВНЕ веб-корня:
 *   ~/dizain-studiya-kvartir/linea-private/config.php      (Beget, аккаунт aleks2si; рядом с public_html)
 * Выкладка (tools/deploy-beget.sh) его не трогает. Править на сервере: ssh beget-en0 → nano dizain-studiya-kvartir/linea-private/config.php
 * В репозиторий ключи и пароли не попадают — здесь только пустые места.
 */
return [
    // 'manual' — счёт выставляет Александр, клиент видит «счёт пришлём, работа начнётся после оплаты»;
    // 'yookassa' — на странице заказа кнопка «Оплатить N ₽». Без yk_shop_id / yk_secret режим сам остаётся manual.
    'mode' => 'manual',

    // Магазин ЮKassa ИМЕННО LINEA (кабинет ЮKassa → Интеграция → Ключи API). Ключи SeoMarket сюда не ставить.
    // Для проверки — сначала ключи тестового магазина (test_…), потом боевые.
    'yk_shop_id' => '',
    'yk_secret'  => '',
    'yk_receipt' => false,   // true — передавать чек 54-ФЗ через «Чеки от ЮKassa»; самозанятый пробивает чек в «Мой налог» — оставить false
    'yk_vat_code' => 1,      // 1 = без НДС (только при yk_receipt = true)

    // Цены в КОПЕЙКАХ. null — «уточняется»: сумму Александр выставит в закрытой странице после разбора брифа.
    // Число — фиксированная цена (например 4500000 = 45 000 ₽). Массив — за м²: ['per_m2' => 150000, 'min' => 4500000].
    // Утверждено 31.10.2026 (та же ставка — на сайте, tools/site-shell.js → TERMS): цена одна — 2 000 ₽/м², визуализации
    // входят в цену; минимальный заказ — как за 40 м² (80 000 ₽). Дом (интерьер) — та же ставка.
    // Ключ = вид заказа. Новые брифы приходят как kvartira / dom; виды *_viz остались только для заказов до 31.10.2026
    // (по той же ставке — визуализации теперь входят в проект).
    // НА БОЕВОМ СЕРВЕРЕ при выкладке обновить ~/dizain-studiya-kvartir/linea-private/config.php этим блоком.
    'prices' => [
        'kvartira'     => ['per_m2' => 200000, 'min' => 8000000],
        'kvartira_viz' => ['per_m2' => 200000, 'min' => 8000000],
        'dom'          => ['per_m2' => 200000, 'min' => 8000000],
        'dom_viz'      => ['per_m2' => 200000, 'min' => 8000000],
        'rd'           => null,   // только рабочая документация — отдельный расчёт
        'planirovka'   => null,   // только планировка — отдельный расчёт
        'vizual'       => null,   // только визуализации — отдельный расчёт
    ],

    // Письмо о новом брифе / оплате / правках. Выключено по умолчанию; тестовые заказы писем не шлют никогда.
    'notify_enabled' => false,
    'notify_to' => '',        // куда слать, например почта Александра
    'mail_from' => '',        // ящик на домене после его подключения (с *.beget.tech письма уходят в спам)

    // Пароль закрытой страницы заказов (api/admin.php): хэш password_hash(), сам пароль — ~/.claude/secrets/linea-admin.env.
    // Новый хэш: php -r 'echo password_hash("новый-пароль", PASSWORD_DEFAULT), "\n";'
    'admin_hash' => '',

    'max_upload_mb' => 100,   // предел архива брифа
    'briefs_per_hour' => 5,   // брифов в час с одного адреса
    'reviews_per_hour' => 20,
    'surveys_per_hour' => 20, // обмеров в час с одного адреса (api/survey.php)

    // База. null — SQLite linea-private/linea.sqlite (локальные проверки). Боевой (Beget, MySQL 5.7, с 31.10.2026):
    // 'db' => ['dsn' => 'mysql:host=localhost;dbname=aleks2si_linea;charset=utf8mb4', 'user' => 'aleks2si_linea', 'pass' => '…'],
    // Таблицы создаются сами (server/api/lib/migrations.php); перенос старых заказов — php server/tools/migrate-sqlite-to-mysql.php.
    'db' => null,

    // «Ремонт по проекту» (бригады). Письма бригадам и клиентам — выключены, пока не включите; тестовые записи не пишут никогда.
    'brig_mail_enabled' => false,
    'brig_requisites' => '',         // реквизиты для оплаты счетов на комиссию (показываются бригаде в «Финансах»)
    'tg_enabled' => false, 'tg_token' => '', 'tg_chat' => '',   // Telegram-бот администратора — заготовка
    // Воркер «лист по запросу» (GOST-DRAFT на SmartApe): длинный случайный токен, тот же — у воркера. Пусто — API выключен.
    // Новый: php -r 'echo bin2hex(random_bytes(24)), "\n";'
    'sheet_worker_token' => '',
    'brig_reg_per_hour' => 5, 'brig_login_per_hour' => 20, 'brig_forgot_per_hour' => 5, 'brig_uploads_per_hour' => 120,

    // Адрес сайта без «/» на конце — для return_url оплаты и ссылок в письмах. Пусто — берётся из запроса.
    'base' => '',
];
