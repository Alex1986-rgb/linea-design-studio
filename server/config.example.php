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
    'yk_tax_system' => null, // чек 54-ФЗ: система налогообложения (1 ОСН, 2 УСН «доходы», 3 УСН «доходы − расходы», 6 ПСН); null — не передавать.
                             // Обязательна, если у магазина ЮKassa несколько систем. Телефон в чеке приводится к 7XXXXXXXXXX сам.

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
    // Условия «Ремонта по проекту» поверх значений по умолчанию (server/api/lib/boot.php → BRIG_TERMS_DEFAULT). Страницы сайта берут те же
    // значения из tools/site-shell.js → BRIG_TERMS — меняя здесь, поменяйте и там. Пусто — текущие условия (10 %, пилот 5 % первым 5 бригадам на 3 сделки, контакты после подписания договора).
    // 'brig_terms' => ['rate' => 0.10, 'contacts_after' => 'signed', 'sheets_free_limit' => null, 'sheets_outside_paid' => false, 'sheet_price_kop' => null],
    'brig_terms' => [],

    // Адрес сайта без «/» на конце — для return_url оплаты и ссылок в письмах. Пусто — адрес домена (LINEA_BASE_DEFAULT в boot.php);
    // заголовок Host запроса для ссылок не используется (подставной Host увёл бы ссылку сброса пароля на чужой домен).
    'base' => 'https://xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai',

    // Адрес клиента для лимитов: REMOTE_ADDR; X-Real-IP — только если запрос пришёл от этих адресов (nginx Beget перед Apache).
    // Проверка после выкладки: если в журнале все лимиты считаются на один адрес 127.0.0.1 — прокси не передаёт X-Real-IP, написать в поддержку Beget.
    'trusted_proxies' => ['127.0.0.1', '::1'],
    'admin_fail_global' => 30,   // неудачных входов в admin.php за 15 минут со всех адресов вместе — дальше ответы замедляются (вход не закрывается)
    'admin_ip_allow' => [],      // адреса владельца: их вход в admin не блокируется счётчиками неудач (ревью кода С-6)

    // Ревью кода сделки 01.11.2026:
    'allow_test' => false,       // ?test=1 на боевом (тестовые заказы без писем); регистрация тестовых бригад — только на маке, при любом значении
    'pay_area_min' => ['kvartira' => 80, 'dom' => 150],   // онлайн-оплата без «Сумма подтверждена» — только при площади ≥ порога вида; [] — всегда подтверждать
    'yk_notify_per_hour' => 120, // уведомлений ЮKassa с одного адреса в час
    'yk_ip_check' => false,      // включить после выкладки: принимать вебхук только с подсетей ЮKassa (список — yk_ips в boot.php)
    // brig_terms (сверх строки выше): 'commission_due_after_sign_days' => 14, 'advance_confirm_days' => 5, 'debt_warn_days' => 1, 'debt_feed_close_days' => 14,
    // 'addendum_cut_admin_pct' => 20, 'files_premoderation' => true, 'termination_fee_base' => 'accepted', 'bypass_penalty' => ['enabled' => false]
];
