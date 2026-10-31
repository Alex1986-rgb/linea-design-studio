# «Лист по запросу»: очередь сайта LINEA (Beget) ↔ воркер GOST-DRAFT (SmartApe)

Формат — общий с движком: `~/projects/gost-draft-sheetreq/docs/kb/sheet-request-api.md` (воркер `tools/sheet-worker.mjs`).
Сайт реализует его в `server/api/brigade/sheet-request.php` (31.10.2026). Ниже — сторона сайта и чем она дополняет протокол.

## Сторона бригады
Кабинет `/brigada/` → Объекты → «Нужен лист»: **текст обязателен** (вручную или кнопкой «Надиктовать» — Web Speech API превращает речь
в текст сразу, на телефоне в Chrome/Safari); помещение (из пакета проекта) и стена A–D — необязательно; запись голоса можно приложить
**только вместе с текстом** — на SmartApe нет whisper/ffmpeg, голос без текста получил бы «пришлите текстом», поэтому сайт сразу говорит
это в форме и в ответе API. Лимиты: 10 запросов на объект в сутки, 30 на бригаду, не больше 5 открытых на объект, запись ≤ 10 МБ;
только объекты «подписание договора» / «ремонт идёт». Ответ на вопрос (`question`) — в кабинете, задание возвращается в очередь.

## Очередь
- Истина — таблица `br_sheet_reqs` (`server/api/lib/migrations.php`); зеркало — `linea-private/sheet-requests/<id>.json` (обновляется на каждой смене).
- Статусы в кабинете: `new` принят → `work` в работе → `ready` готов · `question` нужен уточняющий вопрос · `failed` не собрался (LINEA разбирается,
  администратору — уведомление) · `rejected` (вручную). Бригаде — письмо на каждую смену (если письма включены; тестовые — никогда).
- Задание выдаётся одному воркеру и блокируется на **15 минут**; нет ответа — снова `new`.

## Доступ
`https://<домен>/api/brigade/sheet-request.php`, только https. `Authorization: Bearer <sheet_worker_token>` — токен в
`linea-private/config.php` (пусто — очередь выключена, 503), у воркера — `SHEETREQ_TOKEN`. На Beget (CGI) заголовок Authorization сам до PHP
не доходит: его пробрасывает правило в `api/brigade/.htaccess` (mod_rewrite/SetEnvIf); запасной заголовок — `X-Worker-Token`. Проверить на
боевом после выкладки: `curl -H "Authorization: Bearer <токен>" "https://<домен>/api/brigade/sheet-request.php?action=next&worker=probe"` → 204.

## Запросы (как в протоколе движка)
| Запрос | Ответ |
|---|---|
| `GET ?action=next&worker=<имя>` | `204` пусто или `200` задание |
| `GET ?action=audio&id=<id>` | запись (тот же сайт, по тому же токену) |
| `POST ?action=result` multipart: `id`, `status` = `done`/`question`/`failed`, `note`, `meta` (JSON), `question` (JSON К-N, при `question`), `pdf` (при `done` и `question`) | `200 {"ok":true}` |

Задание:
```json
{ "id": "17", "project_slug": "prompt-kv54", "text": "развёртка стены B кухни с выводами под технику",
  "room": "Кухня-гостиная", "wall": "B", "lang": "ru", "brigade_id": "Б-1", "issue": null,
  "audio_url": "https://<домен>/api/brigade/sheet-request.php?action=audio&id=17",
  "order": "LN-2611-0001", "object": "Квартира 64 м²", "status": "work", "created_at": "2026-11-01 00:28:05",
  "history": [ { "id": "12", "text": "…", "status": "ready" } ] }
```
**В задании нет ПДн клиента.** `project_slug` — слаг из пакета проекта (`tools/brigady-pack.mjs` → `pack.json`).

## Расхождения с протоколом движка (на согласование)
1. **Дополнительные поля** `order`, `object`, `status`, `created_at`, `history` — воркер их может не читать; `history` даёт контекст «как в прошлый раз».
   Если бригада ответила на вопрос, ответ дописан в `text` строкой «Ответ бригады на вопрос: …».
2. **`issue` = null**: номер выпуска альбома сайт пока не знает (нужно поле в пакете проекта или в заказе — предложение: `pack.json → issue`).
3. **`room`** — название помещения из пакета (не `r6`): движок принимает и название.
4. **Голос без текста** сайт не принимает (вместо задания, которое вернётся `question`) — меньше пустых кругов.
5. **`failed`** показывается бригаде как «Не собрался — разбираемся» + уведомление администратору; `meta` хранится в `br_sheet_reqs.worker_meta`.
6. Прежний API сайта `api/sheets-worker.php` (`X-Worker-Token`, `a=next|result|question|reject`) **удалён** — один формат.

## Проверка
`node tools/test-brigady.mjs` (шаг 11б): отказ «голос без текста», `next` с неверным/верным Bearer, формат задания, 204 на пустой очереди,
зеркало, `audio` по X-Worker-Token, `result status=done` с PDF, статус «Готов» и скачивание PDF бригадой.
