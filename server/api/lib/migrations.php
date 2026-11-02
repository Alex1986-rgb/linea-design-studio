<?php
/**
 * Схема базы сервиса «Ремонт по проекту» и общих аккаунтов — ЕДИНСТВЕННОЕ место, где описаны таблицы.
 * Версия → список SQL. Метки типов ({ID} {KEY} {TEXT} {INT} {REAL} {BOOL} {ENGINE}) переводит db_migrate() под SQLite или MySQL.
 * Правила (MySQL 5.7 Beget, utf8mb4): колонки под индекс/UNIQUE — {KEY} VARCHAR(190) (760 байт < 767 без large_prefix), в составных
 * индексах — {SHORT} VARCHAR(32) / {EMAIL} VARCHAR(150); без JSON-функций, CHECK и DEFAULT у TEXT; даты — {KEY} строкой ISO;
 * деньги — {INT} в копейках; без значений по умолчанию, кроме чисел и коротких строк-статусов.
 * Таблица orders (заказы проектов) пока создаётся старым linea_db() в boot.php — её перенос делает переезд на MySQL.
 * Новая правка схемы — НОВАЯ версия в конце (старые не трогать: на сервере они уже применены).
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

return [
    1 => [
        // заказы проектов (на SQLite таблицы уже созданы linea_db() — здесь IF NOT EXISTS; на MySQL — создаются здесь, данные переносит
        // server/tools/migrate-sqlite-to-mysql.php)
        "CREATE TABLE IF NOT EXISTS orders (
            id {ID}, number {KEY} NOT NULL UNIQUE, token {KEY} NOT NULL UNIQUE, status {KEY} NOT NULL DEFAULT 'new', kind {KEY} NOT NULL DEFAULT 'kvartira',
            created_at {KEY} NOT NULL, updated_at {KEY} NOT NULL, ip {KEY}, consent_at {KEY}, consent_text {TEXT},
            name {KEY}, phone {KEY}, email {KEY}, contact {KEY}, object_type {KEY}, area {REAL},
            files_bytes {INT} DEFAULT 0, files_count {INT} DEFAULT 0, amount_kop {INT}, invoice_at {KEY},
            payment_id {KEY}, payment_url {TEXT}, payment_created_at {KEY}, payment_tries {INT} DEFAULT 0,
            paid_at {KEY}, paid_by {KEY}, delivered_at {KEY}, delivered_url {TEXT}, test {BOOL} NOT NULL DEFAULT 0)
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS events (
            id {ID}, order_id {INT} NOT NULL, at {KEY} NOT NULL, who {KEY} NOT NULL, text {TEXT} NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE)
            {ENGINE}",
        // общие аккаунты: роль brigade сейчас; client и admin примет переезд
        "CREATE TABLE IF NOT EXISTS accounts (
            id {ID}, role {SHORT} NOT NULL, email {EMAIL} NOT NULL, pass_hash {KEY} NOT NULL,
            status {KEY} NOT NULL DEFAULT 'active', fail_n {INT} NOT NULL DEFAULT 0, lock_until {INT} NOT NULL DEFAULT 0,
            created_at {KEY} NOT NULL, last_login_at {KEY}, test {BOOL} NOT NULL DEFAULT 0, demo {BOOL} NOT NULL DEFAULT 0,
            UNIQUE (role, email))
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS account_tokens (
            id {ID}, account_id {INT} NOT NULL, hash {KEY} NOT NULL UNIQUE, purpose {SHORT} NOT NULL,
            expires_at {INT} NOT NULL, used_at {KEY},
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS br_brigades (
            id {ID}, account_id {INT} NOT NULL UNIQUE, slug {KEY} UNIQUE,
            status {KEY} NOT NULL DEFAULT 'draft', status_reason {TEXT},
            created_at {KEY} NOT NULL, updated_at {KEY} NOT NULL, submitted_at {KEY}, admitted_at {KEY},
            name {KEY} NOT NULL, contact_name {KEY} NOT NULL, phone {KEY} NOT NULL, email {KEY} NOT NULL,
            legal {KEY} NOT NULL, inn {KEY} NOT NULL, company {KEY},
            specs {TEXT} NOT NULL, districts {TEXT} NOT NULL,
            team_size {INT}, experience {INT}, referees {TEXT}, about {TEXT},
            warranty_months {INT}, price_from {INT}, public_name {BOOL} NOT NULL DEFAULT 0, logo_file {INT},
            consent_pd_ed {KEY}, rules_ed {KEY}, agency_ed {KEY}, accepted_at {KEY}, ip_reg {KEY},
            inn_checked_at {KEY}, inn_check_note {TEXT}, call_at {KEY}, verified_by {KEY},
            test {BOOL} NOT NULL DEFAULT 0, demo {BOOL} NOT NULL DEFAULT 0,
            FOREIGN KEY (account_id) REFERENCES accounts(id))
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS br_portfolio (
            id {ID}, brigade_id {INT} NOT NULL, title {KEY} NOT NULL, district {KEY}, area {REAL}, year {INT}, works {TEXT},
            created_at {KEY} NOT NULL, demo {BOOL} NOT NULL DEFAULT 0,
            FOREIGN KEY (brigade_id) REFERENCES br_brigades(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS br_files (
            id {ID}, brigade_id {INT} NOT NULL DEFAULT 0, owner_kind {SHORT} NOT NULL, owner_id {INT} NOT NULL, kind {SHORT} NOT NULL,
            stored_path {KEY} NOT NULL, mime {KEY} NOT NULL, bytes {INT} NOT NULL, w {INT}, h {INT}, title {KEY},
            created_at {KEY} NOT NULL, created_by {KEY} NOT NULL, demo {BOOL} NOT NULL DEFAULT 0)
            {ENGINE}",
        "CREATE INDEX br_files_owner ON br_files(owner_kind, owner_id)",
        "CREATE TABLE IF NOT EXISTS br_requests (
            id {ID}, order_id {INT} NOT NULL UNIQUE, status {KEY} NOT NULL DEFAULT 'new',
            consent_at {KEY} NOT NULL, consent_text {TEXT} NOT NULL,
            district {KEY} NOT NULL, area {REAL}, start_wish {KEY}, note {TEXT},
            works {TEXT} NOT NULL, object_title {KEY}, pack {TEXT}, deadline_at {KEY}, sent_at {KEY},
            chosen_offer_id {INT}, created_at {KEY} NOT NULL, updated_at {KEY} NOT NULL, test {BOOL} NOT NULL DEFAULT 0)
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS br_invites (
            id {ID}, request_id {INT} NOT NULL, brigade_id {INT} NOT NULL, source {KEY} NOT NULL,
            created_at {KEY} NOT NULL, sent_at {KEY}, seen_at {KEY}, declined_at {KEY},
            UNIQUE (request_id, brigade_id),
            FOREIGN KEY (request_id) REFERENCES br_requests(id) ON DELETE CASCADE,
            FOREIGN KEY (brigade_id) REFERENCES br_brigades(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS br_offers (
            id {ID}, request_id {INT} NOT NULL, brigade_id {INT} NOT NULL, status {KEY} NOT NULL DEFAULT 'submitted',
            items {TEXT} NOT NULL, total_kop {INT} NOT NULL, materials {KEY} NOT NULL, materials_note {TEXT},
            stages {TEXT} NOT NULL, start_date {KEY}, days {INT} NOT NULL, warranty_months {INT} NOT NULL, comment {TEXT},
            created_at {KEY} NOT NULL, updated_at {KEY} NOT NULL, response_hours {REAL},
            UNIQUE (request_id, brigade_id),
            FOREIGN KEY (request_id) REFERENCES br_requests(id) ON DELETE CASCADE,
            FOREIGN KEY (brigade_id) REFERENCES br_brigades(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS br_jobs (
            id {ID}, request_id {INT} NOT NULL UNIQUE, offer_id {INT} NOT NULL, brigade_id {INT} NOT NULL,
            status {KEY} NOT NULL DEFAULT 'contract', contacts_consent_at {KEY} NOT NULL,
            client_signed_at {KEY}, brigade_signed_at {KEY}, commission_kop {INT}, commission_at {KEY},
            done_at {KEY}, created_at {KEY} NOT NULL, updated_at {KEY} NOT NULL,
            FOREIGN KEY (request_id) REFERENCES br_requests(id) ON DELETE CASCADE,
            FOREIGN KEY (brigade_id) REFERENCES br_brigades(id))
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS br_stages (
            id {ID}, job_id {INT} NOT NULL, idx {INT} NOT NULL, name {KEY} NOT NULL, checklist {KEY} NOT NULL,
            plan_start {KEY}, plan_end {KEY}, status {KEY} NOT NULL DEFAULT 'plan', ready_at {KEY}, accepted_at {KEY}, checks {TEXT},
            FOREIGN KEY (job_id) REFERENCES br_jobs(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS br_remarks (
            id {ID}, stage_id {INT} NOT NULL, text {TEXT} NOT NULL, created_at {KEY} NOT NULL, closed_at {KEY}, close_note {TEXT},
            FOREIGN KEY (stage_id) REFERENCES br_stages(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS br_reviews (
            id {ID}, job_id {INT} NOT NULL UNIQUE, brigade_id {INT} NOT NULL, rating {INT} NOT NULL, text {TEXT},
            created_at {KEY} NOT NULL, hidden {BOOL} NOT NULL DEFAULT 0, hidden_reason {KEY}, hidden_at {KEY},
            FOREIGN KEY (job_id) REFERENCES br_jobs(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS br_invoices (
            id {ID}, number {KEY} NOT NULL UNIQUE, brigade_id {INT} NOT NULL, job_id {INT} NOT NULL UNIQUE,
            amount_kop {INT} NOT NULL, issued_at {KEY} NOT NULL, due_at {KEY}, paid_at {KEY}, paid_note {KEY})
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS br_disputes (
            id {ID}, job_id {INT} NOT NULL, opened_by {KEY} NOT NULL, subject {KEY} NOT NULL, status {KEY} NOT NULL DEFAULT 'open',
            resolution {TEXT}, created_at {KEY} NOT NULL, resolved_at {KEY},
            FOREIGN KEY (job_id) REFERENCES br_jobs(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS br_dispute_msgs (
            id {ID}, dispute_id {INT} NOT NULL, who {KEY} NOT NULL, text {TEXT} NOT NULL, at {KEY} NOT NULL,
            FOREIGN KEY (dispute_id) REFERENCES br_disputes(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS br_sheet_reqs (
            id {ID}, job_id {INT} NOT NULL, brigade_id {INT} NOT NULL, status {SHORT} NOT NULL DEFAULT 'new',
            text {TEXT} NOT NULL, room {KEY}, wall {KEY}, lang {KEY} NOT NULL DEFAULT 'ru',
            audio_file {INT}, result_file {INT}, question {TEXT}, answer {TEXT}, worker_note {TEXT}, worker_meta {TEXT},
            created_at {KEY} NOT NULL, updated_at {KEY} NOT NULL, claimed_at {KEY}, ready_at {KEY},
            FOREIGN KEY (job_id) REFERENCES br_jobs(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE INDEX br_sheet_status ON br_sheet_reqs(status)",
        "CREATE TABLE IF NOT EXISTS br_audit (
            id {ID}, at {KEY} NOT NULL, who {KEY} NOT NULL, action {KEY} NOT NULL, target {KEY}, detail {TEXT})
            {ENGINE}",
    ],
    // 01.11.2026 — защита от обхода (критики монетизации и техники): уникальный ИНН, контакты по условию, лента сообщений,
    // сигналы обхода, платные листы вне сделки (флаг), отмена после выбора.
    2 => [
        // один ИНН — одна бригада. Ключ отдельной колонкой: у демо-бригад ИНН пустой (NULL в UNIQUE допускается многократно),
        // тестовые регистрации — с пометкой «:test». Существующие дубли (если есть) получают ключ только у первой записи.
        "ALTER TABLE br_brigades ADD COLUMN inn_key {KEY}",
        "UPDATE br_brigades SET inn_key = inn WHERE id IN (SELECT id FROM (SELECT MIN(id) id FROM br_brigades WHERE demo = 0 AND test = 0 AND inn <> '' GROUP BY inn) t)",
        "UPDATE br_brigades SET inn_key = {INN_TEST} WHERE id IN (SELECT id FROM (SELECT MIN(id) id FROM br_brigades WHERE demo = 0 AND test = 1 AND inn <> '' GROUP BY inn) t)",
        "CREATE UNIQUE INDEX br_brigades_inn ON br_brigades(inn_key)",
        // контакты сторон открываются по условию brig_terms()['contacts_after']; у объектов до 01.11.2026 они уже были открыты при выборе
        "ALTER TABLE br_jobs ADD COLUMN contacts_open_at {KEY}",
        "ALTER TABLE br_jobs ADD COLUMN commission_rate {REAL}",   // ставка сделки (основная или пилотная) — на момент открытия контактов
        "UPDATE br_jobs SET commission_rate = 0.07 WHERE commission_kop IS NOT NULL",   // объекты до 01.11.2026 — по ставке 7 %
        // к оплате: после первых денег бригаде (аванс или принятый первый этап); у объектов до 01.11.2026 — с даты начисления
        "ALTER TABLE br_jobs ADD COLUMN advance_at {KEY}",
        "ALTER TABLE br_jobs ADD COLUMN commission_due_at {KEY}",
        "UPDATE br_jobs SET commission_due_at = commission_at WHERE commission_kop IS NOT NULL",
        "UPDATE br_jobs SET contacts_open_at = contacts_consent_at",
        "ALTER TABLE br_jobs ADD COLUMN cancelled_at {KEY}",
        "ALTER TABLE br_jobs ADD COLUMN cancel_by {KEY}",
        "ALTER TABLE br_jobs ADD COLUMN cancel_reason {TEXT}",
        "ALTER TABLE br_sheet_reqs ADD COLUMN source {SHORT}",
        "ALTER TABLE br_sheet_reqs ADD COLUMN billable_kop {INT}",
        "CREATE TABLE IF NOT EXISTS br_messages (
            id {ID}, job_id {INT} NOT NULL, who {SHORT} NOT NULL, text {TEXT} NOT NULL, masked {BOOL} NOT NULL DEFAULT 0, at {KEY} NOT NULL,
            FOREIGN KEY (job_id) REFERENCES br_jobs(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE INDEX br_messages_job ON br_messages(job_id)",
        // сигналы обхода: срабатывания фильтра контактов, отмена после выбора (без самих контактов — только тип и место)
        "CREATE TABLE IF NOT EXISTS br_signals (
            id {ID}, at {KEY} NOT NULL, kind {SHORT} NOT NULL, who {KEY} NOT NULL, brigade_id {INT}, job_id {INT}, request_id {INT},
            field {KEY}, detail {TEXT})
            {ENGINE}",
        "CREATE INDEX br_signals_kind ON br_signals(kind)",
        // договор подряда и допсоглашения — только через сайт (Александр 01.11.2026: «все договора через наш сайт — прозрачность»):
        // версия текста замораживается (sha256), обе стороны подписывают простой электронной подписью — кодом на почту
        "CREATE TABLE IF NOT EXISTS br_contracts (
            id {ID}, job_id {INT} NOT NULL, kind {SHORT} NOT NULL, num {INT} NOT NULL, status {SHORT} NOT NULL DEFAULT 'draft',
            body {TEXT} NOT NULL, hash {KEY} NOT NULL, total_kop {INT} NOT NULL, delta_kop {INT} NOT NULL DEFAULT 0, days_add {INT} NOT NULL DEFAULT 0, note {TEXT},
            created_at {KEY} NOT NULL, created_by {KEY} NOT NULL,
            client_signed_at {KEY}, client_ip {KEY}, client_pep_ed {KEY}, brigade_signed_at {KEY}, brigade_ip {KEY}, brigade_pep_ed {KEY},
            FOREIGN KEY (job_id) REFERENCES br_jobs(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE INDEX br_contracts_job ON br_contracts(job_id)",
        "CREATE TABLE IF NOT EXISTS br_sign_codes (
            id {ID}, contract_id {INT} NOT NULL, side {SHORT} NOT NULL, code_hash {KEY} NOT NULL, expires_at {INT} NOT NULL, tries {INT} NOT NULL DEFAULT 0,
            created_at {KEY} NOT NULL, used_at {KEY},
            FOREIGN KEY (contract_id) REFERENCES br_contracts(id) ON DELETE CASCADE)
            {ENGINE}",
        // сумма сделки по подписанным документам (договор + допсоглашения) — база вознаграждения
        "ALTER TABLE br_jobs ADD COLUMN deal_total_kop {INT}",
    ],
    // 01.11.2026 — ревью кода сделки (docs/reviews/2026-11-01-kod-sdelka.md): мягкая отмена сделки (С-3: br_jobs.request_id больше не UNIQUE —
    // отменённая сделка с перепиской и договором остаётся, новая создаётся рядом), аванс с подтверждением бригады (В-2), «Начать работу» (К-1),
    // допсоглашение с подтверждением LINEA (В-1), договор MEDIUMTEXT на MySQL (С-2), один основной договор на сделку, пилот — слот и счётчик (С-5),
    // модерация файлов портфолио (К-2), подтверждение суммы заказа и тревога по оплате (В-3, В-4).
    3 => array_merge(
        db_driver() === 'mysql' ? [
            // UNIQUE(request_id) → обычный индекс (внешнему ключу нужен индекс — сначала создаём его, потом снимаем уникальный)
            "CREATE INDEX br_jobs_request ON br_jobs(request_id)",
            "ALTER TABLE br_jobs DROP INDEX request_id",
            "ALTER TABLE br_contracts MODIFY body MEDIUMTEXT NOT NULL",
        ] : [
            // SQLite: UNIQUE в определении таблицы не снимается — пересборка таблицы по регламенту SQLite (внешние ключи на время выключены)
            "PRAGMA foreign_keys=OFF",
            "CREATE TABLE br_jobs_v3 (
                id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL, offer_id INTEGER NOT NULL, brigade_id INTEGER NOT NULL,
                status VARCHAR(190) NOT NULL DEFAULT 'contract', contacts_consent_at VARCHAR(190) NOT NULL,
                client_signed_at VARCHAR(190), brigade_signed_at VARCHAR(190), commission_kop INTEGER, commission_at VARCHAR(190),
                done_at VARCHAR(190), created_at VARCHAR(190) NOT NULL, updated_at VARCHAR(190) NOT NULL,
                contacts_open_at VARCHAR(190), commission_rate REAL, advance_at VARCHAR(190), commission_due_at VARCHAR(190),
                cancelled_at VARCHAR(190), cancel_by VARCHAR(190), cancel_reason TEXT, deal_total_kop INTEGER,
                FOREIGN KEY (request_id) REFERENCES br_requests(id) ON DELETE CASCADE,
                FOREIGN KEY (brigade_id) REFERENCES br_brigades(id))",
            "INSERT INTO br_jobs_v3 (id, request_id, offer_id, brigade_id, status, contacts_consent_at, client_signed_at, brigade_signed_at, commission_kop, commission_at,
                done_at, created_at, updated_at, contacts_open_at, commission_rate, advance_at, commission_due_at, cancelled_at, cancel_by, cancel_reason, deal_total_kop)
                SELECT id, request_id, offer_id, brigade_id, status, contacts_consent_at, client_signed_at, brigade_signed_at, commission_kop, commission_at,
                done_at, created_at, updated_at, contacts_open_at, commission_rate, advance_at, commission_due_at, cancelled_at, cancel_by, cancel_reason, deal_total_kop FROM br_jobs",
            "DROP TABLE br_jobs",
            "ALTER TABLE br_jobs_v3 RENAME TO br_jobs",
            "CREATE INDEX br_jobs_request ON br_jobs(request_id)",
            "PRAGMA foreign_keys=ON",
        ],
        [
            // аванс: кто отметил, состояние (declared — заказчик отметил; confirmed — бригада подтвердила/отметила; disputed — бригада оспорила)
            "ALTER TABLE br_jobs ADD COLUMN advance_by {SHORT}",
            "ALTER TABLE br_jobs ADD COLUMN advance_state {SHORT}",
            "ALTER TABLE br_jobs ADD COLUMN advance_note {TEXT}",
            "ALTER TABLE br_jobs ADD COLUMN commission_due_why {KEY}",
            "UPDATE br_jobs SET advance_by = 'client', advance_state = 'confirmed' WHERE advance_at IS NOT NULL",
            "ALTER TABLE br_stages ADD COLUMN started_at {KEY}",
            // допсоглашение, уменьшающее цену сильнее порога, ждёт подтверждения LINEA
            "ALTER TABLE br_contracts ADD COLUMN needs_admin {BOOL} NOT NULL DEFAULT 0",
            "ALTER TABLE br_contracts ADD COLUMN admin_ok_at {KEY}",
            // один основной договор на сделку и уникальные номера допсоглашений: дубли неподписанных черновиков (гонка ленивого создания) убираем
            "DELETE FROM br_contracts WHERE status = 'draft' AND client_signed_at IS NULL AND brigade_signed_at IS NULL AND id NOT IN (SELECT id FROM (SELECT MIN(id) id FROM br_contracts GROUP BY job_id, kind, num) t)",
            "CREATE UNIQUE INDEX br_contracts_num ON br_contracts(job_id, kind, num)",
            // пилот: место в очереди пилота фиксируется при допуске, число пилотных сделок — атомарным счётчиком
            "ALTER TABLE br_brigades ADD COLUMN pilot_slot {INT}",
            "ALTER TABLE br_brigades ADD COLUMN pilot_used {INT} NOT NULL DEFAULT 0",
            "UPDATE br_brigades SET pilot_slot = (SELECT COUNT(*) FROM (SELECT DISTINCT id, test, demo, admitted_at FROM br_brigades) b2 WHERE b2.demo = 0 AND b2.test = br_brigades.test
                AND b2.admitted_at IS NOT NULL AND (b2.admitted_at < br_brigades.admitted_at OR (b2.admitted_at = br_brigades.admitted_at AND b2.id <= br_brigades.id)))
                WHERE admitted_at IS NOT NULL AND demo = 0",
            "UPDATE br_brigades SET pilot_used = (SELECT COUNT(*) FROM br_jobs j WHERE j.brigade_id = br_brigades.id AND j.contacts_open_at IS NOT NULL)",
            // модерация файлов портфолио: уже допущенные бригады — их файлы считаются просмотренными при допуске
            "ALTER TABLE br_files ADD COLUMN moderated_at {KEY}",
            "UPDATE br_files SET moderated_at = created_at WHERE owner_kind IN ('portfolio','logo') AND (demo = 1 OR brigade_id IN (SELECT id FROM br_brigades WHERE status = 'active'))",
            // заказ проекта: сумма подтверждена администратором (по плану), площадь расходится с помещениями брифа, тревога по оплате, прежние платежи
            "ALTER TABLE orders ADD COLUMN amount_confirmed_at {KEY}",
            "ALTER TABLE orders ADD COLUMN area_mismatch {BOOL} NOT NULL DEFAULT 0",
            "ALTER TABLE orders ADD COLUMN pay_alert_at {KEY}",
            "ALTER TABLE orders ADD COLUMN payment_ids_old {TEXT}",
            "UPDATE orders SET amount_confirmed_at = updated_at WHERE status IN ('paid','delivered')",
        ]
    ),
    // 01.11.2026 — кабинеты и админка (спецификация docs/brigady/spec-kabinety-adminka.md, блок 0 и блок I): единый вход кодом на почту,
    // заказы привязаны к аккаунту клиента, устройства, общая таблица подписей, согласия и заявки по ПДн, уведомления в кабинете,
    // настройки из админки, производственный календарь, проводки вознаграждения, заморозка сделки, лестница предупреждений бригад.
    4 => [
        "ALTER TABLE orders ADD COLUMN account_id {INT}",
        "CREATE INDEX orders_account ON orders(account_id)",
        "ALTER TABLE accounts ADD COLUMN name {KEY}",
        "ALTER TABLE accounts ADD COLUMN phone {KEY}",
        "ALTER TABLE accounts ADD COLUMN prefs {TEXT}",
        // коды входа: только sha256 (HMAC) кода, 10 минут, 5 попыток — счётчик атомарный
        "CREATE TABLE IF NOT EXISTS auth_codes (
            id {ID}, email {EMAIL} NOT NULL, purpose {SHORT} NOT NULL, code_hash {KEY} NOT NULL, expires_at {INT} NOT NULL,
            tries {INT} NOT NULL DEFAULT 0, created_at {KEY} NOT NULL, used_at {KEY}, ip {KEY})
            {ENGINE}",
        "CREATE INDEX auth_codes_email ON auth_codes(email)",
        "CREATE TABLE IF NOT EXISTS acc_devices (
            id {ID}, account_id {INT} NOT NULL, dev {KEY} NOT NULL UNIQUE, ua {KEY}, ip {KEY}, created_at {KEY} NOT NULL, last_at {KEY} NOT NULL, ended_at {KEY})
            {ENGINE}",
        "CREATE INDEX acc_devices_acc ON acc_devices(account_id)",
        // единый реестр подписей кабинетов: согласование решений проекта, принятие альбома (session_code); ПЭП ремонта — в br_contracts
        // (админка показывает оба источника одним реестром)
        "CREATE TABLE IF NOT EXISTS signatures (
            id {ID}, who_role {SHORT} NOT NULL, who_id {INT} NOT NULL, doc_kind {SHORT} NOT NULL, doc_id {KEY} NOT NULL, version {KEY},
            sha256 {KEY} NOT NULL, method {SHORT} NOT NULL, decision {SHORT}, note {TEXT}, order_id {INT}, job_id {INT}, at {KEY} NOT NULL, ip {KEY}, ua {KEY})
            {ENGINE}",
        "CREATE INDEX signatures_order ON signatures(order_id)",
        // согласия (152-ФЗ): обработка ПДн, показ в портфолио, передача обезличенного проекта бригадам, передача данных выбранной бригаде,
        // распространение (отзыв в публичной карточке бригады, ст. 10.1) — с редакцией, временем и отзывом
        "CREATE TABLE IF NOT EXISTS consents (
            id {ID}, account_id {INT} NOT NULL, order_id {INT}, job_id {INT}, kind {SHORT} NOT NULL, edition {KEY} NOT NULL,
            given_at {KEY} NOT NULL, revoked_at {KEY}, ip {KEY}, text {TEXT})
            {ENGINE}",
        "CREATE INDEX consents_acc ON consents(account_id)",
        "CREATE TABLE IF NOT EXISTS pd_requests (
            id {ID}, account_id {INT} NOT NULL, kind {SHORT} NOT NULL, status {SHORT} NOT NULL DEFAULT 'new', note {TEXT}, blockers {TEXT}, reply {TEXT},
            file {KEY}, created_at {KEY} NOT NULL, due_at {KEY} NOT NULL, done_at {KEY}, done_by {KEY})
            {ENGINE}",
        "CREATE TABLE IF NOT EXISTS notices (
            id {ID}, account_id {INT} NOT NULL, order_id {INT}, grp {SHORT} NOT NULL, text {TEXT} NOT NULL, link {KEY}, at {KEY} NOT NULL, read_at {KEY}, ukey {KEY} UNIQUE)
            {ENGINE}",
        "CREATE INDEX notices_acc ON notices(account_id)",
        "CREATE TABLE IF NOT EXISTS settings (k {KEY} NOT NULL PRIMARY KEY, v {TEXT} NOT NULL, updated_at {KEY} NOT NULL, updated_by {KEY}) {ENGINE}",
        "CREATE TABLE IF NOT EXISTS holidays (d {KEY} NOT NULL PRIMARY KEY, note {KEY}) {ENGINE}",
        // проводки вознаграждения: accrual / adjust / payment / writeoff; статус начисления — accrued | deferred (нет ИП LINEA) | due | invoiced | paid | waived
        "CREATE TABLE IF NOT EXISTS br_ledger (
            id {ID}, brigade_id {INT} NOT NULL, job_id {INT} NOT NULL, kind {SHORT} NOT NULL, amount_kop {INT} NOT NULL, status {SHORT} NOT NULL,
            note {TEXT}, invoice_id {INT}, at {KEY} NOT NULL, by_who {KEY})
            {ENGINE}",
        "CREATE INDEX br_ledger_job ON br_ledger(job_id)",
        "ALTER TABLE br_jobs ADD COLUMN frozen_at {KEY}",
        "ALTER TABLE br_jobs ADD COLUMN frozen_reason {TEXT}",
        "ALTER TABLE br_disputes ADD COLUMN reply_due_at {KEY}",
        "ALTER TABLE br_disputes ADD COLUMN proposal {TEXT}",
        "ALTER TABLE br_disputes ADD COLUMN proposal_due_at {KEY}",
        "CREATE TABLE IF NOT EXISTS br_warnings (
            id {ID}, brigade_id {INT} NOT NULL, rule {KEY} NOT NULL, quote {TEXT}, step {INT} NOT NULL, at {KEY} NOT NULL, by_who {KEY}, until_at {KEY})
            {ENGINE}",
        "CREATE INDEX br_warnings_b ON br_warnings(brigade_id)",
        "ALTER TABLE br_audit ADD COLUMN ip {KEY}",
    ],
    // 01.11.2026 — кабинет бригады (блок II): люди бригады (бригадир, сотрудник — свой аккаунт, вход кодом; владелец — br_brigades.account_id),
    // реестр оплат по сделке (отметка одной стороны → подтверждение второй; поля provider_* — под Безопасную сделку ЮKassa), предложение
    // «по разделам», аванс и план оплат, подписант ООО, согласие на публичную карточку, ответ бригады на отзыв, кто запросил лист.
    5 => [
        "CREATE TABLE IF NOT EXISTS br_members (
            id {ID}, brigade_id {INT} NOT NULL, account_id {INT} NOT NULL UNIQUE, role {SHORT} NOT NULL, name {KEY}, objects {TEXT},
            invited_at {KEY} NOT NULL, invited_by {KEY}, removed_at {KEY},
            FOREIGN KEY (brigade_id) REFERENCES br_brigades(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE INDEX br_members_b ON br_members(brigade_id)",
        "CREATE TABLE IF NOT EXISTS br_payments (
            id {ID}, job_id {INT} NOT NULL, stage_id {INT}, kind {SHORT} NOT NULL, amount_kop {INT} NOT NULL, due_at {KEY},
            method {SHORT} NOT NULL DEFAULT 'offsite', status {SHORT} NOT NULL DEFAULT 'planned',
            declared_by {SHORT}, declared_at {KEY}, confirmed_by {SHORT}, confirmed_at {KEY}, contest_note {TEXT},
            provider_deal_id {KEY}, provider_payment_id {KEY}, provider_payout_id {KEY}, note {TEXT}, created_at {KEY} NOT NULL,
            FOREIGN KEY (job_id) REFERENCES br_jobs(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE INDEX br_payments_job ON br_payments(job_id)",
        "ALTER TABLE br_offers ADD COLUMN mode {SHORT}",
        "ALTER TABLE br_offers ADD COLUMN sections {TEXT}",
        "ALTER TABLE br_offers ADD COLUMN advance_pct {INT}",
        "ALTER TABLE br_offers ADD COLUMN drafted_by {KEY}",
        "ALTER TABLE br_brigades ADD COLUMN signer {TEXT}",
        "ALTER TABLE br_brigades ADD COLUMN worker_msg {BOOL} NOT NULL DEFAULT 0",
        "ALTER TABLE br_brigades ADD COLUMN card_consent_at {KEY}",
        "ALTER TABLE br_brigades ADD COLUMN card_consent_ed {KEY}",
        "ALTER TABLE br_brigades ADD COLUMN notify_prefs {TEXT}",
        "ALTER TABLE br_reviews ADD COLUMN reply {TEXT}",
        "ALTER TABLE br_reviews ADD COLUMN reply_at {KEY}",
        "ALTER TABLE br_sheet_reqs ADD COLUMN by_who {KEY}",
        // аванс, отмеченный до реестра (колонки br_jobs.advance_*), переносится строкой реестра
        "INSERT INTO br_payments (job_id, kind, amount_kop, method, status, declared_by, declared_at, confirmed_by, confirmed_at, contest_note, note, created_at)
            SELECT id, 'advance', 0, 'offsite', CASE advance_state WHEN 'confirmed' THEN 'confirmed' WHEN 'disputed' THEN 'contested' ELSE 'declared' END,
            advance_by, advance_at, CASE advance_state WHEN 'confirmed' THEN 'brigade' ELSE NULL END, CASE advance_state WHEN 'confirmed' THEN advance_at ELSE NULL END,
            advance_note, 'перенесено из отметки аванса (сумма не указывалась)', advance_at FROM br_jobs WHERE advance_at IS NOT NULL",
    ],
    // 01.11.2026 — ревью кода кабинетов (docs/reviews/2026-11-01-kod-kabinety.md): журнал «уже отправлено» для таймеров cron отдельно от
    // уведомлений (В-2: у заказа без аккаунта письмо уходило каждые 15 минут), привязка старых заказов к аккаунтам клиентов по почте,
    // подтверждение почты аккаунта и поколение сессий (С-3: вход кодом в бригадный аккаунт, заведённый на чужую почту, гасит чужой пароль и сессии).
    6 => [
        "CREATE TABLE IF NOT EXISTS sent_marks (k {KEY} NOT NULL PRIMARY KEY, at {KEY} NOT NULL) {ENGINE}",
        "INSERT INTO sent_marks (k, at) SELECT ukey, MIN(at) FROM notices WHERE ukey IS NOT NULL GROUP BY ukey",
        "UPDATE orders SET account_id = (SELECT a.id FROM accounts a WHERE a.role = 'client' AND a.email = LOWER(orders.email)) WHERE account_id IS NULL AND email IS NOT NULL AND email <> ''",
        "ALTER TABLE accounts ADD COLUMN verified_at {KEY}",
        "ALTER TABLE accounts ADD COLUMN sess_epoch {INT} NOT NULL DEFAULT 0",
        "UPDATE accounts SET verified_at = last_login_at WHERE role = 'client' AND last_login_at IS NOT NULL",
    ],
    // 02.11.2026 — деньги и сделка (docs/reports/2026-11-02-dengi-sdelka.md): второй чек «полный расчёт» и возвраты через API ЮKassa
    // (журнал операций pay_ops), суммы этапов договора подряда и расторжение с актом о принятом объёме, автоудаление ПДн по срокам
    // (отметка pd_purged_at), второй фактор входа в админку (доверенные устройства adm_devices; коды — в auth_codes с purpose admin2fa).
    7 => [
        "ALTER TABLE orders ADD COLUMN receipt2_id {KEY}",
        "ALTER TABLE orders ADD COLUMN receipt2_at {KEY}",
        "ALTER TABLE orders ADD COLUMN receipt2_status {SHORT}",
        "ALTER TABLE orders ADD COLUMN refunded_kop {INT} NOT NULL DEFAULT 0",
        "ALTER TABLE orders ADD COLUMN pd_purged_at {KEY}",
        "CREATE TABLE IF NOT EXISTS pay_ops (
            id {ID}, order_id {INT} NOT NULL, kind {SHORT} NOT NULL, provider_id {KEY}, idem {KEY} NOT NULL UNIQUE, amount_kop {INT} NOT NULL,
            status {SHORT} NOT NULL, reason {TEXT}, by_who {KEY}, created_at {KEY} NOT NULL, updated_at {KEY} NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE)
            {ENGINE}",
        "CREATE INDEX pay_ops_provider ON pay_ops(provider_id)",
        "CREATE INDEX pay_ops_order ON pay_ops(order_id)",
        "ALTER TABLE br_stages ADD COLUMN amount_kop {INT}",
        "ALTER TABLE br_jobs ADD COLUMN terminated_at {KEY}",
        "ALTER TABLE br_jobs ADD COLUMN accepted_kop {INT}",
        "ALTER TABLE br_jobs ADD COLUMN pd_purged_at {KEY}",
        "CREATE TABLE IF NOT EXISTS adm_devices (
            id {ID}, token_hash {KEY} NOT NULL UNIQUE, created_at {KEY} NOT NULL, expires_at {INT} NOT NULL, ip {KEY}, ua {KEY}, ended_at {KEY})
            {ENGINE}",
    ],
    // 02.11.2026 — исправления ревью «деньги и ops» (docs/reviews/2026-11-02-kod-dengi-ops.md): признак «платёж прошёл с чеком 54-ФЗ»
    // (В2: второй чек и возврат через API — только для таких заказов), метка пароля у доверенных устройств админки (С6: смена пароля их гасит).
    8 => [
        "ALTER TABLE orders ADD COLUMN payment_receipt {BOOL} NOT NULL DEFAULT 0",
        "ALTER TABLE orders ADD COLUMN paid_receipt {BOOL} NOT NULL DEFAULT 0",
        "ALTER TABLE adm_devices ADD COLUMN pw_tag {SHORT}",
    ],
];
