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
    ],
];
