# Контракты API

Канонические write DTO и runtime-валидация: `packages/contracts/src/requests.ts`. Схемы Zod strict отклоняют неизвестные поля, неверные типы, даты и значения enum. TypeScript-типы DTO выводятся из этих же схем. Read DTO: `read-models.ts`, `agenda.ts`.

Запросы с телом используют `Content-Type: application/json`. Денежные суммы и показания передаются JSON-числами, флаги — boolean, даты — `YYYY-MM-DD`, моменты времени — ISO 8601 с часовым поясом. Пустая строка не заменяет число или null. POST создаёт запись, PUT передаёт разрешённые изменяемые поля. ID, авторство и время создания назначает сервер.

```json
{
  "error": "Проверьте поля запроса",
  "code": "VALIDATION_ERROR",
  "fields": [{ "path": "totalArea", "message": "Ожидается число" }]
}
```

Статусы: 400 — контракт, 401 — сессия, 403 — область доступа, 404 — запись/маршрут, 409 — конфликт доменного правила или версии, 413 — размер, 415 — content type, 503 — недоступная интеграция. Данные проверяются до записи. Webhook провайдеров имеют отдельный формат Telegram/VK и обязательную проверку секрета.

## Сроки и работы

`GET /api/agenda?days=30&propertyId=ID` — даты действующих договоров без следующего подписанного договора, непогашенные счета, ППР, SLA открытых заявок и действующие гарантии. `days`: 7, 30, 60, 90; по умолчанию 30. `propertyId` необязателен, но права обязательны. Просроченные обязательства включаются; полностью оплаченные счета и завершённые заявки исключаются. Расчёт календарных дней использует UTC.

`GET /api/agenda/export.ics` с теми же параметрами — снимок всего выбранного периода для импорта в календарь. Требуется Bearer-токен; публичной ссылки с токеном нет. UID события стабилен, текст экранируется, строки учитывают лимит байтов UTF-8.

`PUT /api/leases/:id/renewal`:

```json
{ "status": "contacted", "note": "Обсудить новые условия", "version": 0 }
```

Статусы: pending, contacted, renewing, leaving. Ответ `{item: RenewalDto}` содержит новую версию, автора и время. Повторный запрос со старой версией возвращает 409 `VERSION_CONFLICT`. Решение не меняет срок договора и не отправляет сообщений арендатору.

## Учет, назначения, приемка, показания и документы

Контракты и примеры пакетов: [BUSINESS_WORKFLOWS.md](BUSINESS_WORKFLOWS.md).
Строгие DTO: `accounting.ts`, `access.ts`, `business-workflows.ts` в пакете contracts.

- `GET /api/accounting`; источники/ЛС/сопоставления и журнал `/api/accounting/...`.
- Внешний коннектор: `/api/integrations/accounting/:sourceId/messages`, `/outbox/claim`, `/outbox/:id/ack`.
- `GET/POST/PUT /api/access/assignments...`, `POST .../:id/revoke`; участники `/api/access/participants`.
- `GET /api/tickets/:id/workflow`; `POST .../terms`, `POST .../decision`.
- `GET /api/readings`; `POST /api/readings/periods`, `/submissions`, `/submissions/:id/review`.
- `GET /api/maintenance/progress`; `POST /api/maintenance/tickets/:id/change`.
- `GET/POST /api/documents`; защищенный файл `GET /api/documents/:id/file`.

Прямые POST `/api/meter-readings` и `/api/operations/meters/:id/readings` удалены:
сохранение измерения разрешено только после решения инженера. Смена общего статуса
заявки применяет те же ограничения согласования, фото и приемки, что и workflow API.
