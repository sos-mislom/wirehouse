# Инвентаризация требований ТЗ и остатка реализации

Дата: 4 ноября 2026. Проект: «Склад Контур», репозиторий `whirehouse/repo`. Срез исходников: `85f8e146869ae71f129d67b5dbf31a7eb512f9ef`.

## Как читать этот документ

Это статическая сверка оригинального ТЗ с актуальными исходниками, контрактами и **исходниками существующих тестов**. Новые тесты, production, рабочая 1С, устройства и резервные копии в этом проходе не запускались и не проверялись. Старые отчёты используются как датированные свидетельства с обозначенными ограничениями. Наличие теста — свидетельство предусмотренного контракта, не новая успешная приёмка.

Оригинал: `../materials/specification-original.docx`, версия 1.0, сентябрь 2026; SHA-256 `efbb3352de407c93668f242d4716b29ac9ae9eea39a1618fad36196bceeb4a01`. В XML — 315 абзацев, включая таблицы и пустые строки, и три встроенных рисунка. Все **155 ранее размеченных формулировок** повторно сопоставлены с точным текстом оригинала; старые статусы и примечания не перенесены. `TZ-P009` означает индекс 9 в массиве XML-абзацев DOCX **с нуля**, а не номер страницы/пункта. Пиксельная трактовка трёх рисунков не объявляется новой проверкой; соответствующие строки явно помечены.

Полные структурированные данные: [requirements-matrix.json](requirements-matrix.json). Внизу — все 155 формулировок с источником и группой доказательств. Повторения требований из ролей, состава MVP и приёмки сохранены для трассировки; **их нельзя складывать в процент готовности**.

Статусы: **реализовано** — механизм обнаружен в актуальном web/API/адаптере, доказательства приведены; это не промышленная приёмка. **Частично** — есть существенная часть, но указан конкретный остаток. **Нет** — целевого механизма в исследованной модели/маршрутах нет. **Нужен внешний доступ** — программный механизм есть, обязательное подтверждение требует реального канала/файла/оборудования. **Не проверено** — текущего доказательства внедрения или результата нет. В JSON для каждой строки отдельно зафиксировано `runtimeAcceptance: not-run-in-this-audit`.

## Главный вывод

Основные эксплуатационные функции уже существуют: заявки, сметы/согласования, исполнение с фото, независимая приёмка, службы/маршруты, отказ исполнителя, архивный поиск, ППР/импорт/план-факт, показания, источники 1С/ЛС/выписки, документы и права. Во многих случаях проблема — доступность и композиция интерфейса, а не отсутствие backend. `IMPLEMENTATION_STATUS.md` от 18 октября устарел: его пометки «нет служб/отказа/обмена/двух продуктов» не следует использовать как текущий backlog.

При этом объявить всё ТЗ завершённым нельзя. Найдены реальные программные пробелы регистрации обращений, полного контура уведомлений и административной настройки; мобильная/промышленная приёмка остаётся отдельной работой. ТЗ явно отделяет MVP от следующего этапа. Новое поручение «все функции» требует включить и следующий этап в дорожную карту; считать его уже согласованным по деталям нельзя.

## Что действительно нужно дорабатывать

| Приоритет | Пробел | Доказательство в текущем коде | Минимальный проверяемый результат |
| --- | --- | --- | --- |
| P0 | Автор ввода смешан с заявителем телефонного обращения | `ManagerTicketCreate.tsx` не содержит отдельного заявителя/контактов/канала; `database/tickets.js` хранит `created_by`, а архив фильтрует `createdBy` | Диспетчер фиксирует от чьего имени обращение, канал и контакт; в истории остаётся отдельный автор регистрации; поиск работает по настоящему заявителю |
| P0 | Неоднозначный договор в форме создания заявки | `state/actions/tickets.ts`: первый незавершённый договор найденного помещения выбирает арендатора; нет явного выбора нескольких допустимых договоров | При нескольких договорах/ЛС пользователь выбирает разрешённый контекст явно; без выбора нет ошибочной привязки заявки, согласования или документа |
| P0 | Уведомления не покрывают весь workflow | `routes/business-workflows.js` выполняет решения/показания/переносы без полного вызова контура уведомлений; `notifyTicketEvent` вызывается обычными маршрутами `tickets.js` | Матрица событий/получателей по ролям; уведомление о согласовании, назначении, результате/возврате/приёмке, решении показания и переносе ППР с идемпотентностью и проверкой области |
| P0 | Нет мобильного push | В `services/notifications.js` — in-app/email; в коде мобильных продуктов/API не обнаружены APNs/FCM, регистрация токена устройства и транспорт push | Код регистрации/отзыва устройств, доставка с повтором/дедупликацией; реальные проверки разрешений, foreground/background/closed app и перехода в разрешённую сущность |
| P1 | Настройка статусов/SLA/эскалаций не доведена до роли администратора | Статусы и SLA в `database/constants.js`/`projectData.ts`, категории маршрута в контракте; нет административного редактора | Согласованная конфигурация названий/сроков/маршрутов и эскалации с аудитом; сохранены стабильные серверные этапы и защита workflow. Произвольные несовместимые статусы не добавлять |
| P1 | Связь документа с самим регламентом ППР требует решения | `documentEntity` допускает tickets/equipment и другие сущности, но не сам `maintenance_plan`; файл ППР можно связать с заданием/оборудованием | Если заказчику нужны документы именно версии регламента, добавить явную связь/права и перенос контекста в созданное задание; не выдавать обычное вложение за версионированный регламент |
| P1 | Завершение двух мобильных продуктов | Скрипты двух продуктов есть; подготовка iOS не создаёт подписанный IPA, Android debug не является store/release | Четыре целевые сборки/подписи, отдельные данные/доступы, камера/файлы, сессия, потеря сети, возврат из фона и реальные устройства |

Новые сохранённые фильтры, быстрый поиск, рабочий стол роли, боковая карточка и мобильные быстрые действия — предложения UX для существующих функций. Их следует отдельно пометить в плане; они не являются дословными обязательствами исходного ТЗ.

## Что уже есть, но теряется в интерфейсе

| Существующая возможность | Исходники | Что важно в новой структуре |
| --- | --- | --- |
| Службы, состав службы, маршрут категории и принимающий | `domain/dispatch.js`, `DispatchWorkspace.tsx`, миграция 015 | Сама настройка редкая; ежедневное назначение/переназначение должно быть в очереди диспетчера |
| Отказ до начала работы, пауза, возврат результата | `ticket-workflow.js`, миграция 014, `TicketWorkflowPanel.tsx` | На карточке исполнителя показывать одно актуальное действие, причину и следующий этап, а не все технические статусы |
| Смета, текущие условия, согласие и акт | `estimates.js`, `TicketWorkTerms.tsx`, `Estimates.tsx` | Единый путь из заявки: условия → согласование → выполнение → приёмка → акт; сохранять версию и полномочия |
| Полный архивный поиск | `ticket-search.ts`, `ManagerTickets.tsx` | Поиск и компактные прикладные фильтры доступны сразу; после исправления заявителя поиск должен использовать его, не автора ввода |
| Импорт ППР, регламенты, конкретные задания, план/факт | `MaintenanceImport.tsx`, `maintenance.js`, `MaintenanceProgress.tsx` | Не смешивать настройку регулярного плана и ежедневное выполнение выданных задач |
| Подача показания, проверка инженера и отдельная доставка в 1С | `ReadingsWorkspace.tsx`, `readings.js`, `ExchangeJournal.tsx` | Разделять «проверено инженером» и «доставлено в учёт»; ежедневная проверка показаний — прямой вход инженера |
| ЛС/выписки и источники/очереди обмена | `AccountingWorkspace.tsx`, `ExchangeJournal.tsx` | Витрина расчётов нужна бизнес-роли; источник/токены/повторы — административной. Не показывать эти задачи как равночастые |
| Контекстные документы и история оборудования | `DocumentRegistry.tsx`, `OperationCard.tsx` | Документ открывается из работы/объекта/договора; общий реестр остаётся дополнительным способом поиска |
| Права, сроки, отзыв и аудит | `AccessWorkspace.tsx`, `context-access.js`, `AuditLog.tsx` | Редкие административные действия отделены от рабочей очереди, но доступ к каждой операции продолжает проверять сервер |

## Риски и внешние подтверждения

1. **Ложная полнота мобильной приёмки:** два appId/Chromium/API не доказывают iOS, физическую камеру и push. Android через ADB доступен по новому сообщению пользователя; Apple/iOS/push-ключи этим автоматически не появились.
2. **Уведомления:** наличие WSS/колокольчика не означает, что участник узнает о действии в закрытом приложении. Сначала матрица событий и код доставки, затем реальные проверки.
3. **Несколько договоров/ЛС:** действующая связь помещения не даёт права произвольно выбрать первый договор. Это риск данных и полномочий, а не только UI.
4. **Правила заказчика:** §15 оставляет открытыми виды договоров, мастер-источники, полномочия, тарифные/платные категории и SLA. Утверждать их по общим представлениям о недвижимости нельзя.
5. **1С:** реализованные File/Srvr параметры и тесты не доказывают все типовые конфигурации, кластер, минимальную служебную роль или круглосуточный регламент. Ранее возникал лицензионный конфликт: дополнительные исследовательские COM-сеансы не открывались в этом аудите.
6. **Бухгалтерское проведение:** `Acts.bsl` создаёт документ через `Doc.Write()`; помеченный demo ledger отделён от обычного проведения реализации/НДС. Полное проведение не является безусловным пунктом MVP, но требуется отдельное решение, если процесс заказчика его предполагает.
7. **ППР:** поддержка явного шаблона CSV/XLSX не гарантирует импорт существующей календарной матрицы заказчика. Нужен его фактический файл и проверка однозначных связей.
8. **Пилот/история:** отчёты октября и снимки тестовой БП не доказывают актуальное состояние 4 ноября. Новый интерфейс проверяется на выбранной ревизии и реальных сценариях по ролям.
9. **Следующий этап ТЗ:** акты работ, каталог материалов, work logs и DXF — только смежные основы. Они не закрывают передачу помещения/дефектную ведомость, склад ТМЦ, зарплату, телеметрию, историю геометрии, расширенный платёжный контур или BI/P&L.

## Основа приёмочных сценариев по ролям

Приоритеты каждой роли различаются — прямое уточнение пользователя 4 ноября. Сценарии ниже задают результат и проверки области; это не обещание уже проведённой новой приёмки.

| Роль/контекст | Частый сценарий | Критерий выхода и отрицательная проверка |
| --- | --- | --- |
| Арендатор | Выбрать разрешённый ЛС → посмотреть начисления/актуальность → передать показание | Видит свои суммы/документы; чужой ЛС и повторное показание отклоняются; принятие инженером не путается с доставкой в 1С |
| Арендатор | Создать обращение → согласовать актуальные условия → принять или вернуть результат | Нужное помещение/договор выбраны явно; изменённая смета требует нового решения; причина возврата и фото сохраняются |
| Собственник | Открыть своё помещение → увидеть разрешённые работы/документы → подать обращение | Право собственника само по себе **не открывает** финансовые данные арендатора; показания/согласование — только при отдельном разрешении |
| Совмещённая персона | Переключить собственное помещение и арендованный ЛС | Контекст/роль/следующие действия меняются явно; данные двух финансовых областей не смешиваются |
| Диспетчер | Зарегистрировать звонок → классифицировать → назначить службу/исполнителя → контролировать срок | У звонящего отдельный заявитель/контакт и канал; исполнитель принадлежит службе; архив находит обращение по заявителю и периоду |
| Исполнитель | Открыть назначенные → отказаться с причиной или начать → фото/чек-лист → передать результат | Чужие задачи не открываются; обязательные доказательства нельзя обойти; исполнитель не принимает сам свой результат |
| Инженер | Проверить показания с аномалиями → мотивированно принять/отклонить → проверить доставку | Причина обязательна в нужных случаях; недоступный прибор/ЛС и конфликт версии отклоняются; outbox не дублируется |
| Инженер ППР | Открыть задания периода → перенести с причиной → изучить замечания/историю оборудования | Сохраняется исходный план, выданный чек-лист и история; повтор генерации/импорта не создаёт дубли |
| Руководитель | Увидеть просрочки/ожидающие решения → открыть конкретное исключение → поручить действие | Сводка ведёт к нужной очереди/карточке; метрика вычислена по разрешённой области, без маркетингового процента «готовности» |
| Администратор | Выдать ограниченное назначение → проверить доступ → отозвать → открыть аудит | Отзыв действует в прежней сессии; автор/причина/before-after записаны, история раскрывается только по согласованной политике |
| Ответственный за обмен | Открыть ошибку источника → исправить причину → повторить тот же пакет | Среда и sourceId не смешиваются; повтор идемпотентен; «в очереди» не объявляется доставленным; секреты не видны другим ролям |

## Порядок закрытия до масштабного редизайна

1. Зафиксировать эту трассировку как исходный backlog; не переписывать рабочие серверные процессы ради смены меню.
2. Принять бизнес-решения §15 и границу следующего этапа. У каждого решения указать владельца и критерий проверки.
3. Исправить заявителя/канал и неоднозначный контекст договора, составить полную матрицу уведомлений. Эти изменения влияют на карточки/очереди, поэтому их модель нужна до финальной верстки.
4. Согласовать навигацию и рабочие столы ролей; предоставить частые сценарии за 1–2 осмысленных перехода. Число переходов — целевой UX-критерий, не цитата из ТЗ.
5. Реализовывать очередями: core web/API → физический Android → iOS/push → реальные учетные/ППР данные → пилот. Внешние зависимости не блокируют проектирование экранов, но блокируют соответствующую приёмку.
6. Будущие процессы — отдельные модели/сценарии/объём работ; заранее зарезервировать места в структуре, не создавать сейчас пустые вкладки наравне с ежедневными действиями.

## Связь с 23 нормализованными требованиями

Это соответствие сохраняет прежние IDs рабочего ТЗ. Статус относится к механизму/указанному остатку, а не к новой промышленной приёмке.

| ID | Область | Статус | Группы доказательств |
| --- | --- | --- | --- |
| ARC-01 | Учет и эксплуатация | реализовано | ARC |
| INT-01 | Независимые источники | реализовано | IDENTITY |
| INT-02 | Надёжный обмен | реализовано | EXCHANGE |
| INT-03 | Среда обмена | реализовано | EXCHANGE |
| ACC-01 | Несколько связей человека | реализовано | ACCESS |
| ACC-02 | Финансы договора/ЛС | реализовано | ACCESS, FINANCE |
| ACC-03 | Независимые действия | реализовано | ACCESS |
| ACC-04 | Срок/отзыв/история | реализовано | ACCESS |
| MOB-01 | Два мобильных продукта | частично | MOBILE |
| TKT-01 | Цикл заявки | реализовано | WORKFLOW |
| TKT-02 | Платное согласование | реализовано | APPROVAL |
| TKT-03 | Исполнение/приёмка/отказ | реализовано | EXECUTION |
| TKT-04 | Диспетчеризация/архив | частично | DISPATCH, ARCHIVE, SLA, REGISTRATION |
| PPR-01 | Регламенты/генерация | реализовано | PPR |
| PPR-02 | Фактический Excel/CSV | нужен внешний доступ | PPR_IMPORT |
| PPR-03 | План-факт/перенос/замечание | реализовано | PPR_PROGRESS |
| MTR-01 | Подача/проверка показания | реализовано | READINGS |
| MTR-02 | Передача принятого показания | реализовано | READING_EXCHANGE |
| FIN-01 | Учётная витрина | реализовано | FINANCE |
| DOC-01 | Реестр документов | реализовано | DOCUMENTS |
| NTF-01 | Уведомления | частично | NOTIFICATIONS |
| AUD-01 | Аудит | реализовано | AUDIT |
| OPS-01 | Миграции/backup/приёмка | не проверено | PILOT, ARTEFACTS |

## Группы доказательств и полный реестр

Ниже раздел сформирован из структурированной матрицы; пути относятся к исследованному срезу репозитория. Статусы характеризуют перечисленный механизм в исходниках, а не промышленную готовность всей группы.

<a id="arc"></a>

### ARC — реализовано (MVP)

Операционная CRM отделена от учетной проекции; связанные с 1С договоры блокируют локальное начисление и оплату. Клиенты обращаются к CRM API.

Доказательства: [apps/api/src/domain/accounting.js](../../apps/api/src/domain/accounting.js), [apps/api/src/database/billing.js](../../apps/api/src/database/billing.js), [apps/api/src/operations.js](../../apps/api/src/operations.js), [apps/mobile/scripts/prepare.mjs](../../apps/mobile/scripts/prepare.mjs), [tests/accounting.test.mjs](../../tests/accounting.test.mjs).

<a id="identity"></a>

### IDENTITY — реализовано (MVP)

Идентичность sourceId + entityType + externalId, версии/снимки, запрет угадывания связей. Две реальные базы 1С совместно в этом аудите не проверялись.

Доказательства: [apps/api/src/domain/accounting.js](../../apps/api/src/domain/accounting.js), [packages/contracts/src/accounting.ts](../../packages/contracts/src/accounting.ts), [tests/accounting-catalog.test.mjs](../../tests/accounting-catalog.test.mjs), [tests/accounting-master.test.mjs](../../tests/accounting-master.test.mjs).

<a id="access"></a>

### ACCESS — реализовано (MVP)

Контекстные назначения, период, retainHistory, отдельные действия и отзыв; собственник не получает финансовые права арендатора автоматически. Матрица заказчика требует утверждения.

Доказательства: [apps/api/src/domain/context-access.js](../../apps/api/src/domain/context-access.js), [apps/api/src/domain/financial-access.js](../../apps/api/src/domain/financial-access.js), [packages/contracts/src/access.ts](../../packages/contracts/src/access.ts), [packages/contracts/src/permissions.ts](../../packages/contracts/src/permissions.ts), [apps/web/src/features/business/AccessWorkspace.tsx](../../apps/web/src/features/business/AccessWorkspace.tsx), [tests/business-workflows.test.mjs](../../tests/business-workflows.test.mjs), [tests/history-access.test.mjs](../../tests/history-access.test.mjs).

<a id="otp"></a>

### OTP — нужен внешний доступ (MVP)

Телефонный OTP, TTL/attempts и доставка через Telegram/VK/WhatsApp есть. Нужны реальные согласованные телефон, привязка и канал; тестовая admin-сессия не доказывает доставку OTP.

Доказательства: [apps/api/src/routes/auth.js](../../apps/api/src/routes/auth.js), [apps/api/src/services/delivery.js](../../apps/api/src/services/delivery.js), [apps/api/src/bot-links.js](../../apps/api/src/bot-links.js), [apps/web/src/features/auth/LoginPage.tsx](../../apps/web/src/features/auth/LoginPage.tsx), [tests/bot-links.test.mjs](../../tests/bot-links.test.mjs).

<a id="mobile"></a>

### MOBILE — частично (MVP)

Два appId client/worker, раздельные ресурсы, подготовка Android/iOS и ограничение ролей есть. Нет доказательства четырех release-подписей, физических камер/файлов, background/resume, плохой сети, iOS и push.

Доказательства: [apps/mobile/scripts/prepare.mjs](../../apps/mobile/scripts/prepare.mjs), [apps/mobile/scripts/android-debug.mjs](../../apps/mobile/scripts/android-debug.mjs), [apps/web/src/mobile-product.ts](../../apps/web/src/mobile-product.ts), [apps/mobile/README.md](../../apps/mobile/README.md), [tests/mobile-app.mjs](../../tests/mobile-products.mjs), [tests/realtime-mobile-origin.test.mjs](../../tests/realtime-mobile-origin.test.mjs).

<a id="crm"></a>

### CRM — реализовано (MVP)

Рабочие экраны и серверные permissions есть; функции распределены по многим разделам. У каждой роли собственные приоритеты и приемочные сценарии; единый экран со всеми функциями не является целью.

Доказательства: [apps/web/src/features/shell/ManagerScreen.tsx](../../apps/web/src/features/shell/ManagerScreen.tsx), [apps/web/src/features/shell/ManagerShell.tsx](../../apps/web/src/features/shell/ManagerShell.tsx), [packages/contracts/src/permissions.ts](../../packages/contracts/src/permissions.ts), [tests/platform.test.mjs](../../tests/platform.test.mjs), [tests/browser.mjs](../../tests/browser.mjs).

<a id="registration"></a>

### REGISTRATION — частично (MVP)

Номер, помещение, категория, приоритет, описание и автор сохраняются. В форме диспетчера нет отдельного канала/контактов звонящего; арендатор выбирается первым незавершенным договором помещения. Нужны явный заявитель и выбор договора при неоднозначности.

Доказательства: [apps/web/src/features/tickets/ManagerTicketCreate.tsx](../../apps/web/src/features/tickets/ManagerTicketCreate.tsx), [apps/web/src/state/actions/tickets.ts](../../apps/web/src/state/actions/tickets.ts), [apps/api/src/routes/tickets.js](../../apps/api/src/routes/tickets.js), [apps/api/src/database/tickets.js](../../apps/api/src/database/tickets.js), [tests/ticket-consistency.test.mjs](../../tests/ticket-consistency.test.mjs).

<a id="workflow"></a>

### WORKFLOW — реализовано (MVP)

Регистрация, назначение, выполнение, пауза, результат, независимая приемка, возврат и закрытие с версией решения и запретом обхода прямой сменой статуса.

Доказательства: [apps/api/src/domain/ticket-workflow.js](../../apps/api/src/domain/ticket-workflow.js), [apps/api/src/routes/business-workflows.js](../../apps/api/src/routes/business-workflows.js), [apps/web/src/features/business/TicketWorkflowPanel.tsx](../../apps/web/src/features/business/TicketWorkflowPanel.tsx), [tests/business-workflows.test.mjs](../../tests/business-workflows.test.mjs), [tests/postgres/business-workflows.test.mjs](../../tests/postgres/business-workflows.test.mjs).

<a id="dispatch"></a>

### DISPATCH — реализовано (MVP)

Службы/участники и маршрут категория → служба/принимающий уже есть; назначение проверяет состав службы. Нужен удобный вход в ежедневную диспетчеризацию, не повторная реализация модуля.

Доказательства: [apps/api/src/domain/dispatch.js](../../apps/api/src/domain/dispatch.js), [apps/api/src/persistence/migrations/015-dispatch.sql](../../apps/api/src/persistence/migrations/015-dispatch.sql), [apps/web/src/features/business/DispatchWorkspace.tsx](../../apps/web/src/features/business/DispatchWorkspace.tsx), [tests/dispatch.test.mjs](../../tests/dispatch.test.mjs), [tests/postgres/dispatch.test.mjs](../../tests/postgres/dispatch.test.mjs).

<a id="admin-config"></a>

### ADMIN_CONFIG — частично (MVP)

Пользователи, права, справочники, службы/маршруты редактируются. Статусы и SLA остаются константами; редактора статусов/SLA/эскалаций нет. Допустимую конфигурацию надо согласовать поверх стабильных команд/этапов.

Доказательства: [apps/web/src/features/business/AccessWorkspace.tsx](../../apps/web/src/features/business/AccessWorkspace.tsx), [apps/web/src/features/business/DispatchWorkspace.tsx](../../apps/web/src/features/business/DispatchWorkspace.tsx), [apps/api/src/database/constants.js](../../apps/api/src/database/constants.js), [apps/web/src/projectData.ts](../../apps/web/src/projectData.ts), [packages/contracts/src/business-workflows.ts](../../packages/contracts/src/business-workflows.ts).

<a id="approval"></a>

### APPROVAL — реализовано (MVP)

Текущая смета/условия согласуются уполномоченным лицом; новая версия снимает старое согласие; начало/акт требуют актуального решения. Виды платных услуг и согласующие задаются заказчиком.

Доказательства: [apps/api/src/domain/estimates.js](../../apps/api/src/domain/estimates.js), [apps/api/src/domain/ticket-workflow.js](../../apps/api/src/domain/ticket-workflow.js), [apps/web/src/features/platform/Estimates.tsx](../../apps/web/src/features/platform/Estimates.tsx), [apps/web/src/features/business/TicketWorkTerms.tsx](../../apps/web/src/features/business/TicketWorkTerms.tsx), [tests/platform.test.mjs](../../tests/platform.test.mjs), [tests/postgres/work-estimates.test.mjs](../../tests/postgres/work-estimates.test.mjs).

<a id="execution"></a>

### EXECUTION — реализовано (MVP)

Назначенные задачи, отказ до старта с причиной, пауза/возобновление, обязательные фото до/после, чек-лист и независимая приемка уже есть. Физический мобильный результат отдельно в MOBILE.

Доказательства: [apps/api/src/domain/ticket-workflow.js](../../apps/api/src/domain/ticket-workflow.js), [apps/api/src/domain/ticket-view.js](../../apps/api/src/domain/ticket-view.js), [apps/web/src/features/business/TicketWorkPhotos.tsx](../../apps/web/src/features/business/TicketWorkPhotos.tsx), [apps/web/src/features/tickets/Service.tsx](../../apps/web/src/features/tickets/Service.tsx), [apps/api/src/persistence/migrations/014-executor-refusal.sql](../../apps/api/src/persistence/migrations/014-executor-refusal.sql), [tests/executor-refusal.test.mjs](../../tests/executor-refusal.test.mjs), [tests/business-workflows.test.mjs](../../tests/business-workflows.test.mjs).

<a id="archive"></a>

### ARCHIVE — частично (MVP)

Поиск архива по помещению, периоду, категории, тексту и createdBy есть. createdBy — автор ввода, а не самостоятельный заявитель телефонного обращения; это требует модели/формы.

Доказательства: [apps/api/src/domain/ticket-search.js](../../apps/api/src/domain/ticket-search.js), [packages/contracts/src/ticket-search.ts](../../packages/contracts/src/ticket-search.ts), [apps/web/src/features/tickets/ManagerTickets.tsx](../../apps/web/src/features/tickets/ManagerTickets.tsx), [tests/ticket-search.test.mjs](../../tests/ticket-search.test.mjs).

<a id="history"></a>

### HISTORY — реализовано (MVP)

История статуса/исполнителя/срока и решений, комментарии/вложения, связанные ремонты оборудования сохраняются. Следует сделать контекстную историю легко доступной.

Доказательства: [apps/api/src/database/tickets.js](../../apps/api/src/database/tickets.js), [apps/api/src/domain/ticket-workflow.js](../../apps/api/src/domain/ticket-workflow.js), [apps/web/src/features/tickets/ManagerTicketDetail.tsx](../../apps/web/src/features/tickets/ManagerTicketDetail.tsx), [apps/web/src/features/operations/OperationCard.tsx](../../apps/web/src/features/operations/OperationCard.tsx), [tests/ticket-consistency.test.mjs](../../tests/ticket-consistency.test.mjs).

<a id="sla"></a>

### SLA — частично (MVP)

Сроки/просрочка отображаются в списках/канбане и сводках. Дефолтные SLA заданы константами; согласованные правила эскалации и их редактор не обнаружены.

Доказательства: [apps/api/src/database/constants.js](../../apps/api/src/database/constants.js), [packages/contracts/src/domain.js](../../packages/contracts/src/domain.js), [apps/web/src/features/tickets/ManagerTickets.tsx](../../apps/web/src/features/tickets/ManagerTickets.tsx), [apps/api/src/services/queries/workspace.js](../../apps/api/src/services/queries/workspace.js).

<a id="ppr"></a>

### PPR — реализовано (MVP)

Планы/регламенты, календарная повторяемость/горизонт/endDate, minute timer, задания без дублей и снимок чек-листа есть. Регламент и выданное задание надо различать в новом интерфейсе.

Доказательства: [apps/api/src/operations.js](../../apps/api/src/operations.js), [apps/api/src/domain/maintenance.js](../../apps/api/src/domain/maintenance.js), [apps/api/src/index.js](../../apps/api/src/index.js), [apps/web/src/features/operations/Operations.tsx](../../apps/web/src/features/operations/Operations.tsx), [tests/platform.test.mjs](../../tests/platform.test.mjs), [tests/maintenance-import.test.mjs](../../tests/maintenance-import.test.mjs).

<a id="ppr-import"></a>

### PPR_IMPORT — нужен внешний доступ (MVP)

CSV/XLSX, проверка колонок/дат/формул/неоднозначных связей, preview, атомарный импорт и повтор без потери ручных правок реализованы. Нужен фактический график заказчика для приемки.

Доказательства: [apps/api/src/services/maintenance-import.js](../../apps/api/src/services/maintenance-import.js), [apps/api/src/services/maintenance-sheet.js](../../apps/api/src/services/maintenance-sheet.js), [apps/web/src/features/platform/MaintenanceImport.tsx](../../apps/web/src/features/platform/MaintenanceImport.tsx), [tests/maintenance-import.test.mjs](../../tests/maintenance-import.test.mjs), [tests/postgres/maintenance-import.test.mjs](../../tests/postgres/maintenance-import.test.mjs).

<a id="ppr-progress"></a>

### PPR_PROGRESS — реализовано (MVP)

План/факт, просрочка, мотивированный перенос одного задания и технические замечания с сохранением исходного плана и истории оборудования.

Доказательства: [apps/api/src/domain/maintenance-progress.js](../../apps/api/src/domain/maintenance-progress.js), [apps/web/src/features/business/MaintenanceProgress.tsx](../../apps/web/src/features/business/MaintenanceProgress.tsx), [apps/web/src/features/operations/OperationCard.tsx](../../apps/web/src/features/operations/OperationCard.tsx), [tests/business-workflows.test.mjs](../../tests/business-workflows.test.mjs).

<a id="readings"></a>

### READINGS — реализовано (MVP)

Права на прибор/ЛС, открытый период, прежнее значение, формат/снижение/дубли/аномалии, собственное фото, решение инженера и статусы реализованы. Владелец справочника и правила периода требуют решений заказчика.

Доказательства: [apps/api/src/domain/readings.js](../../apps/api/src/domain/readings.js), [apps/web/src/features/business/ReadingsWorkspace.tsx](../../apps/web/src/features/business/ReadingsWorkspace.tsx), [packages/contracts/src/business-workflows.ts](../../packages/contracts/src/business-workflows.ts), [tests/business-workflows.test.mjs](../../tests/business-workflows.test.mjs), [tests/postgres/business-workflows.test.mjs](../../tests/postgres/business-workflows.test.mjs).

<a id="reading-exchange"></a>

### READING_EXCHANGE — реализовано (MVP)

Принятые значения создают source-bound outbox; ApplyMessage адаптера пишет в регистр расширения; ack после применения и дедупликация. Текущую доставку в рабочую 1С этот аудит не запускал.

Доказательства: [apps/api/src/domain/readings.js](../../apps/api/src/domain/readings.js), [apps/api/src/domain/accounting.js](../../apps/api/src/domain/accounting.js), [integrations/one-c/wirehouse_bridge.py](../../integrations/one-c/wirehouse_bridge.py), [integrations/one-c/src/Exchange.bsl](../../integrations/one-c/src/Exchange.bsl), [tests/one_c_bridge_test.py](../../tests/one_c_bridge_test.py), [tests/one-c-e2e.mjs](../../tests/one-c-e2e.mjs).

<a id="finance"></a>

### FINANCE — реализовано (MVP)

ЛС/периоды/услуги/asOf учётного источника, баланс/версии/права договора и ЛС; выписка БП строится из Хозрасчетный. В UI надо различать внутренний billing и витрину 1С.

Доказательства: [apps/api/src/domain/accounting.js](../../apps/api/src/domain/accounting.js), [apps/api/src/domain/financial-access.js](../../apps/api/src/domain/financial-access.js), [apps/web/src/features/business/AccountingWorkspace.tsx](../../apps/web/src/features/business/AccountingWorkspace.tsx), [integrations/one-c/src/Master.bsl](../../integrations/one-c/src/Master.bsl), [tests/accounting.test.mjs](../../tests/accounting.test.mjs), [tests/history-access.test.mjs](../../tests/history-access.test.mjs), [tests/one-c-full-e2e.mjs](../../tests/one-c-full-e2e.mjs).

<a id="documents"></a>

### DOCUMENTS — реализовано (MVP)

Единый реестр файлов/ссылок, связи с объектом/корпусом/помещением/оборудованием/договором/ЛС/заявкой/прибором и проверка прав/истории. Файлы ППР привязаны к конкретной заявке; отдельной связи с самим планом нет.

Доказательства: [apps/api/src/domain/documents.js](../../apps/api/src/domain/documents.js), [apps/api/src/routes/documents-registry.js](../../apps/api/src/routes/documents-registry.js), [apps/web/src/features/business/DocumentRegistry.tsx](../../apps/web/src/features/business/DocumentRegistry.tsx), [packages/contracts/src/business-workflows.ts](../../packages/contracts/src/business-workflows.ts), [tests/document-building.test.mjs](../../tests/document-building.test.mjs), [tests/history-access.test.mjs](../../tests/history-access.test.mjs).

<a id="exchange"></a>

### EXCHANGE — реализовано (MVP)

Inbox/outbox, source/environment/schemaVersion, хеш/версия, rollback, attempts/backoff, claim/ack, ручной повтор, capabilities/heartbeat есть. Серверная 1С и две реальные базы требуют отдельной приемки.

Доказательства: [apps/api/src/domain/accounting.js](../../apps/api/src/domain/accounting.js), [apps/api/src/domain/exchange-worker.js](../../apps/api/src/domain/exchange-worker.js), [apps/api/src/routes/accounting.js](../../apps/api/src/routes/accounting.js), [apps/web/src/features/business/ExchangeJournal.tsx](../../apps/web/src/features/business/ExchangeJournal.tsx), [integrations/one-c/wirehouse_bridge.py](../../integrations/one-c/wirehouse_bridge.py), [tests/accounting.test.mjs](../../tests/accounting.test.mjs), [tests/accounting-bridge.test.mjs](../../tests/accounting-bridge.test.mjs), [tests/accounting-catalog.test.mjs](../../tests/accounting-catalog.test.mjs), [tests/one_c_bridge_test.py](../../tests/one_c_bridge_test.py).

<a id="native"></a>

### NATIVE — частично (MVP)

CFE/BSL/агент поддерживают основные группы обмена и документы реализации. Обычного проведения в потоке акта нет: Doc.Write(); demo posting — отдельная ручная операция. Нужны обследование реальных баз, служебная роль, регламент и лицензии.

Доказательства: [integrations/one-c/src/Exchange.bsl](../../integrations/one-c/src/Exchange.bsl), [integrations/one-c/src/Master.bsl](../../integrations/one-c/src/Master.bsl), [integrations/one-c/src/Acts.bsl](../../integrations/one-c/src/Acts.bsl), [integrations/one-c/wirehouse_bridge.py](../../integrations/one-c/wirehouse_bridge.py), [docs/ONE_C_0_3_RU.md](../../docs/ONE_C_0_3_RU.md), [tests/one-c-full-e2e.mjs](../../tests/one-c-full-e2e.mjs), [tests/one_c_bridge_test.py](../../tests/one_c_bridge_test.py).

<a id="notifications"></a>

### NOTIFICATIONS — частично (MVP)

In-app события, email delivery статусы и сводные сигналы просрочки есть. Workflow-решения/показания/переносы ППР не вызывают полный контур уведомлений; APNs/FCM и реестра устройств нет. WSS не заменяет push закрытого приложения.

Доказательства: [apps/api/src/services/notifications.js](../../apps/api/src/services/notifications.js), [apps/api/src/services/queries/workspace.js](../../apps/api/src/services/queries/workspace.js), [apps/api/src/routes/tickets.js](../../apps/api/src/routes/tickets.js), [apps/api/src/routes/business-workflows.js](../../apps/api/src/routes/business-workflows.js), [apps/api/src/database/notifications.js](../../apps/api/src/database/notifications.js), [apps/mobile/README.md](../../apps/mobile/README.md).

<a id="audit"></a>

### AUDIT — реализовано (MVP)

Diff before/after, actor/source/requestId в транзакции; маскирование секретов; heartbeat не засоряет бизнес-аудит. Новые команды должны сохранять этот контракт.

Доказательства: [apps/api/src/persistence/audit.js](../../apps/api/src/persistence/audit.js), [apps/api/src/persistence/database.js](../../apps/api/src/persistence/database.js), [apps/web/src/features/platform/AuditLog.tsx](../../apps/web/src/features/platform/AuditLog.tsx), [apps/web/src/features/platform/AuditEventDetails.tsx](../../apps/web/src/features/platform/AuditEventDetails.tsx), [tests/platform.test.mjs](../../tests/platform.test.mjs), [tests/postgres/platform.test.mjs](../../tests/postgres/platform.test.mjs).

<a id="pilot"></a>

### PILOT — не проверено (внедрение)

Подтверждения текущего пилота на реальных правилах/файлах/пользователях заказчика нет. Помеченная демонстрация 28.10 — историческое свидетельство, не новая приемка.

Доказательства: [docs/ACCEPTANCE_2026-10-28.md](../../docs/ACCEPTANCE_2026-10-28.md), [docs/WORKING_BP_DEMO_2026-10-28.md](../../docs/WORKING_BP_DEMO_2026-10-28.md).

<a id="cost"></a>

### COST — частично (следующий этап)

Work logs со ставкой/трудозатратами/materialCost и сметы есть; полноценного расчета себестоимости и распределения зарплаты нет.

Доказательства: [apps/api/src/operations.js](../../apps/api/src/operations.js), [apps/api/src/domain/estimates.js](../../apps/api/src/domain/estimates.js), [apps/web/src/features/operations/TicketOperations.tsx](../../apps/web/src/features/operations/TicketOperations.tsx).

<a id="stock"></a>

### STOCK — нет (следующий этап)

Каталог материалов/строки смет не являются складским учетом: нет целевого процесса складов/остатков/партий/движений/резервирования/списаний в 1С.

Доказательства: [apps/api/src/routes/platform.js](../../apps/api/src/routes/platform.js), [apps/api/src/domain/estimates.js](../../apps/api/src/domain/estimates.js), [apps/api/src/persistence/schema.js](../../apps/api/src/persistence/schema.js).

<a id="telemetry"></a>

### TELEMETRY — нет (следующий этап)

Ручной ввод показаний есть; транспорта/приема телеметрии устройств не обнаружено. Нужны реальные протоколы и правила обработки времени/пропусков/дублей.

Доказательства: [apps/api/src/domain/readings.js](../../apps/api/src/domain/readings.js), [apps/api/src/routes/operations.js](../../apps/api/src/routes/operations.js), [apps/api/src/persistence/schema.js](../../apps/api/src/persistence/schema.js).

<a id="geometry"></a>

### GEOMETRY — частично (следующий этап)

Структура здания/этажей, редактор планов и DXF есть; многослойной истории перепланировок и архива версий геометрии нет.

Доказательства: [apps/api/src/domain/structure.js](../../apps/api/src/domain/structure.js), [apps/api/src/domain/cad.js](../../apps/api/src/domain/cad.js), [apps/web/src/features/platform/plans/PlanEditor.tsx](../../apps/web/src/features/platform/plans/PlanEditor.tsx), [tests/platform.test.mjs](../../tests/platform.test.mjs).

<a id="bi"></a>

### BI — частично (следующий этап)

Дашборд, суммы задолженности/расходов и прогноз есть; полноценная BI/P&L не определена и не реализована.

Доказательства: [apps/web/src/features/dashboard/ManagerDashboard.tsx](../../apps/web/src/features/dashboard/ManagerDashboard.tsx), [apps/web/src/features/billing/BillingForecast.tsx](../../apps/web/src/features/billing/BillingForecast.tsx), [apps/api/src/agenda.js](../../apps/api/src/agenda.js).

<a id="payments"></a>

### PAYMENTS — нет (следующий этап)

Ручная оплата/подтверждения и чтение оплат 1С есть; расширенного эквайринга/банковского платежного контура/ЭДО нет.

Доказательства: [apps/api/src/routes/billing.js](../../apps/api/src/routes/billing.js), [apps/api/src/database/billing.js](../../apps/api/src/database/billing.js), [apps/web/src/features/billing/ManagerBilling.tsx](../../apps/web/src/features/billing/ManagerBilling.tsx).

<a id="handover"></a>

### HANDOVER — нет (следующий этап)

Агрегата передачи помещения, совместного обхода, дефектной ведомости, повторного осмотра, акта передачи и выдачи ключей нет; service_act выполненных работ не заменяет акт передачи.

Доказательства: [apps/api/src/persistence/schema.js](../../apps/api/src/persistence/schema.js), [apps/api/src/routes/leases.js](../../apps/api/src/routes/leases.js), [apps/api/src/domain/ticket-workflow.js](../../apps/api/src/domain/ticket-workflow.js), [apps/web/src/features/leases/ManagerLeases.tsx](../../apps/web/src/features/leases/ManagerLeases.tsx).

<a id="artefacts"></a>

### ARTEFACTS — реализовано (сопровождение)

Код/контракты/схемы/scripts и инструкции существуют; часть отчетов исторически устарела и должна обновляться вместе с целевой приемкой.

Доказательства: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), [docs/API.md](../../docs/API.md), [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), [docs/DATABASE.md](../../docs/DATABASE.md), [integrations/one-c/README.md](../../integrations/one-c/README.md), [apps/mobile/README.md](../../apps/mobile/README.md).

<a id="summary"></a>

### SUMMARY — частично (MVP)

Основное ядро/CRM есть; полной приемки MVP нет из-за программных и внешних зависимостей. Число повторяющихся формулировок не является процентом готовности.

Доказательства: [docs/ACCEPTANCE_2026-10-28.md](../../docs/ACCEPTANCE_2026-10-28.md), [apps/api/src/routes/business-workflows.js](../../apps/api/src/routes/business-workflows.js), [apps/mobile/README.md](../../apps/mobile/README.md).

<a id="diagram"></a>

### DIAGRAM — не проверено (схема)

Три рисунка DOCX являются схемами, не отдельными функциями. Текст/таблицы сверены с кодом; пиксельная трактовка встроенных схем этим проходом не заявляется.

Доказательства: [docs/spec-2026-09.md](../../docs/spec-2026-09.md), [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Все 155 формулировок исходного ТЗ

| ID XML | Раздел ТЗ | Формулировка оригинала | Статус механизма | Группа / граница |
| --- | --- | --- | --- | --- |
| TZ-P009 | 1. Назначение и рамки документа | Ключевая идея1С остается учетным ядром по договорам, лицевым счетам, начислениям и финансовым данным. Операционная работа с заявками, ППР и исполнителями ведется в отдельном CRM/мобильном контуре. | реализовано | [ARC](#arc) · MVP |
| TZ-P012 | 1.1. Зафиксированные вводные | Два мобильных приложения: собственник/арендатор и исполнитель; обе платформы — iOS и Android. | частично | [MOBILE](#mobile) · MVP |
| TZ-P014 | 1.1. Зафиксированные вводные | Для диспетчера, инженера, администратора и руководителя требуется внутреннее рабочее место CRM. | реализовано | [CRM](#crm) · MVP |
| TZ-P015 | 1.1. Зафиксированные вводные | В проекте могут использоваться несколько независимых баз 1С; обмен должен учитывать источник данных. | реализовано | [IDENTITY](#identity) · MVP |
| TZ-P016 | 1.1. Зафиксированные вводные | Один пользователь может быть связан с несколькими помещениями, договорами и лицевыми счетами. | реализовано | [ACCESS](#access) · MVP |
| TZ-P017 | 1.1. Зафиксированные вводные | Связь пользователя с приложением в базовом сценарии строится по номеру телефона с возможностью ручной корректировки прав. | нужен внешний доступ | [OTP](#otp) · MVP |
| TZ-P018 | 1.1. Зафиксированные вводные | MVP должен в первую очередь закрыть заявки, исполнителей, ППР, фотоотчеты, роли, базовое отображение лицевых счетов/начислений и передачу показаний. | частично | [SUMMARY](#summary) · MVP |
| TZ-P020 | 1.2. Что не должно утяжелять первый релиз | Полный расчет себестоимости услуг и распределение зарплаты/материалов. | частично | [COST](#cost) · следующий этап |
| TZ-P021 | 1.2. Что не должно утяжелять первый релиз | Полноценный складской учет ТМЦ. | нет | [STOCK](#stock) · следующий этап |
| TZ-P022 | 1.2. Что не должно утяжелять первый релиз | Автоматическая телеметрия приборов учета. | нет | [TELEMETRY](#telemetry) · следующий этап |
| TZ-P023 | 1.2. Что не должно утяжелять первый релиз | Сложная пространственная графика и история перепланировок. | частично | [GEOMETRY](#geometry) · следующий этап |
| TZ-P024 | 1.2. Что не должно утяжелять первый релиз | Расширенная BI-аналитика и сложный платежный контур. | частично | [BI](#bi) · следующий этап |
| TZ-P027 | 2. Целевая модель решения | Решение предлагается разделить на учетный и операционный контуры. Это позволяет запускать клиентский сервис и эксплуатационные процессы без полной перестройки бухгалтерского учета. | реализовано | [ARC](#arc) · MVP |
| TZ-P032 | 2. Целевая модель решения | Договоры, лицевые счета, начисления, оплаты, контрагенты, помещения, приборы учета и учетные справочники. | реализовано | [IDENTITY](#identity) · MVP |
| TZ-P035 | 2. Целевая модель решения | Заявки, диспетчеризация, исполнители, ППР, сроки, фотоотчеты, документы, коммуникации. | реализовано | [CRM](#crm) · MVP |
| TZ-P038 | 2. Целевая модель решения | Объекты и ЛС, заявки, статусы, документы, начисления, показания, уведомления. | частично | [MOBILE](#mobile) · MVP |
| TZ-P041 | 2. Целевая модель решения | Задания, объект, чек-лист, комментарии, фото, фиксация выполнения. | частично | [MOBILE](#mobile) · MVP |
| TZ-P044 | 2. Целевая модель решения | Техническая документация, фотографии, акты и вложения, связанные с объектами и заявками. | реализовано | [DOCUMENTS](#documents) · MVP |
| TZ-P048 | 2.1. Принципы | Не дублировать в CRM бухгалтерскую логику, которая уже ведется в 1С. | реализовано | [ARC](#arc) · MVP |
| TZ-P049 | 2.1. Принципы | Не давать мобильным приложениям прямого доступа к 1С. | реализовано | [ARC](#arc) · MVP |
| TZ-P050 | 2.1. Принципы | Один объект недвижимости должен одинаково идентифицироваться во всех участвующих системах. | реализовано | [IDENTITY](#identity) · MVP |
| TZ-P051 | 2.1. Принципы | История заявок, согласований и выполнения работ не должна теряться при смене исполнителя или статуса. | реализовано | [HISTORY](#history) · MVP |
| TZ-P052 | 2.1. Принципы | Любой процесс должен допускать поэтапное расширение без переделки уже работающего MVP. | реализовано | [ARTEFACTS](#artefacts) · сопровождение |
| TZ-P057 | 3. Архитектура решения — концептуально | Рисунок 1. Концептуальная архитектура решения | не проверено | [DIAGRAM](#diagram) · схема |
| TZ-P058 | 3. Архитектура решения — концептуально | Граница ответственностиCRM отвечает за операционный процесс. 1С остается источником учетных данных. Интеграция между ними должна быть отдельным контролируемым контуром, чтобы изменения в 1С не требовали обновления мобильных приложений. | реализовано | [ARC](#arc) · MVP |
| TZ-P062 | 4. Пользователи и роли | Ролевая модель строится не только по типу пользователя, но и по конкретному объекту, помещению, договору или лицевому счету. Один и тот же человек может иметь разные роли по разным помещениям. | реализовано | [ACCESS](#access) · MVP |
| TZ-P066 | 4. Пользователи и роли | Видит связанные помещения и ЛС, создает заявки, получает уведомления и документы, передает показания при наличии права. | реализовано | [ACCESS](#access) · MVP |
| TZ-P068 | 4. Пользователи и роли | Работает только в рамках действующего договора и разрешенных ЛС: заявки, показания, документы и начисления по правилам доступа. | реализовано | [ACCESS](#access) · MVP |
| TZ-P070 | 4. Пользователи и роли | Регистрирует и классифицирует обращения, назначает службу/исполнителя, контролирует сроки и коммуникации. | реализовано | [DISPATCH](#dispatch) · MVP |
| TZ-P072 | 4. Пользователи и роли | Получает задания, фиксирует начало/результат работ, добавляет комментарии и фото, передает на подтверждение. | реализовано | [EXECUTION](#execution) · MVP |
| TZ-P074 | 4. Пользователи и роли | Контролирует ППР, сложные заявки, качество выполнения, просрочки, технические данные и отчетность. | реализовано | [PPR_PROGRESS](#ppr-progress) · MVP |
| TZ-P076 | 4. Пользователи и роли | Настраивает пользователей, права, справочники, маршруты, статусы и ручные связи с объектами/ЛС. | частично | [ADMIN_CONFIG](#admin-config) · MVP |
| TZ-P079 | 4.1. Ключевые правила доступа | Финансовые данные показываются по конкретному договору/лицевому счету, а не просто по факту связи с помещением. | реализовано | [ACCESS](#access) · MVP |
| TZ-P080 | 4.1. Ключевые правила доступа | Собственник и арендатор одного помещения могут видеть разный состав данных. | реализовано | [ACCESS](#access) · MVP |
| TZ-P081 | 4.1. Ключевые правила доступа | Право передавать показания и право согласовывать платную работу задаются отдельно. | реализовано | [ACCESS](#access) · MVP |
| TZ-P082 | 4.1. Ключевые правила доступа | После окончания договора доступ арендатора к новым операциям прекращается; исторические данные отображаются по согласованной политике. | реализовано | [ACCESS](#access) · MVP |
| TZ-P083 | 4.1. Ключевые правила доступа | Ручные изменения прав и связей должны фиксироваться в журнале действий. | реализовано | [ACCESS](#access) · MVP |
| TZ-P085 | 5. Основные объекты и связи | Для бизнес-логики достаточно зафиксировать связи между площадкой, строением, помещением, контрагентом, договором, лицевым счетом, пользователем, заявкой, оборудованием и ППР. Детальная структура полей определяется на этапе проектирования. | реализовано | [IDENTITY](#identity) · MVP |
| TZ-P087 | 5. Основные объекты и связи | Рисунок 2. Укрупненная модель связей | не проверено | [DIAGRAM](#diagram) · схема |
| TZ-P088 | 5. Основные объекты и связи | Критичное правило моделиПользователь не должен быть жестко привязан только к одному помещению или одному контрагенту. Нужна отдельная связь «пользователь — роль — объект/договор/ЛС» с периодом действия. | реализовано | [ACCESS](#access) · MVP |
| TZ-P092 | 6. Процесс обработки заявки | Целевой процесс объединяет обращения из мобильного приложения и обращения, которые диспетчер регистрирует по телефону, мессенджеру или e-mail. Любая заявка получает номер, объект, категорию, ответственного, историю статусов и подтверждение результата. | частично | [REGISTRATION](#registration) · MVP |
| TZ-P094 | 6. Процесс обработки заявки | Рисунок 3. Базовый жизненный цикл заявки | не проверено | [DIAGRAM](#diagram) · схема |
| TZ-P102 | 6.1. Регистрация и классификация | Создана заявка с объектом/помещением, описанием проблемы и контактами заявителя. | частично | [REGISTRATION](#registration) · MVP |
| TZ-P105 | 6.1. Регистрация и классификация | Определены категория, приоритет, служба, необходимость платного согласования. | реализовано | [DISPATCH](#dispatch) · MVP |
| TZ-P108 | 6.1. Регистрация и классификация | Назначен исполнитель или группа, установлен срок и при необходимости чек-лист. | реализовано | [DISPATCH](#dispatch) · MVP |
| TZ-P111 | 6.1. Регистрация и классификация | Зафиксированы действия, комментарии, фото и фактическое завершение работы. | реализовано | [WORKFLOW](#workflow) · MVP |
| TZ-P114 | 6.1. Регистрация и классификация | Результат принят, заявка закрыта либо возвращена в работу. | реализовано | [WORKFLOW](#workflow) · MVP |
| TZ-P117 | 6.2. Платная заявка | Если работа относится к платной услуге, после классификации заявка переводится на согласование. До назначения в работу фиксируется согласование стоимости или другого коммерческого условия уполномоченным лицом. Сам расчет стоимости может оставаться во внешнем/учетном контуре на первом этапе; CRM должна хранить факт согласования и результат. | реализовано | [APPROVAL](#approval) · MVP |
| TZ-P119 | 6.3. Контроль качества и история | Фото до/после и комментарии исполнителя сохраняются в карточке заявки. | реализовано | [HISTORY](#history) · MVP |
| TZ-P120 | 6.3. Контроль качества и история | Все изменения статуса, исполнителя и срока сохраняются в истории. | реализовано | [HISTORY](#history) · MVP |
| TZ-P121 | 6.3. Контроль качества и история | Просрочка должна быть видна диспетчеру и руководителю. | частично | [SLA](#sla) · MVP |
| TZ-P122 | 6.3. Контроль качества и история | Закрытая заявка остается доступной для поиска по помещению, заявителю, категории и периоду. | частично | [ARCHIVE](#archive) · MVP |
| TZ-P123 | 6.3. Контроль качества и история | Повторные обращения по одному объекту/оборудованию должны быть видны в истории. | реализовано | [HISTORY](#history) · MVP |
| TZ-P125 | 7. Процесс работы исполнителя | Мобильное приложение исполнителя заменяет передачу задач по телефону/мессенджерам и бумажное подтверждение выполнения. Исполнитель получает только назначенные ему задачи и необходимую информацию по объекту. | частично | [MOBILE](#mobile) · MVP |
| TZ-P126 | 7. Процесс работы исполнителя | Получить список назначенных задач с приоритетом и сроком. | реализовано | [EXECUTION](#execution) · MVP |
| TZ-P127 | 7. Процесс работы исполнителя | Открыть карточку объекта, описание заявки, контакты и доступную техническую документацию. | реализовано | [EXECUTION](#execution) · MVP |
| TZ-P128 | 7. Процесс работы исполнителя | Принять задачу в работу либо зафиксировать причину невозможности выполнения. | реализовано | [EXECUTION](#execution) · MVP |
| TZ-P129 | 7. Процесс работы исполнителя | Добавлять рабочие комментарии и фотографии по ходу выполнения. | реализовано | [EXECUTION](#execution) · MVP |
| TZ-P130 | 7. Процесс работы исполнителя | Отметить выполнение, приложить обязательные фото/результаты чек-листа. | реализовано | [EXECUTION](#execution) · MVP |
| TZ-P131 | 7. Процесс работы исполнителя | Передать результат на подтверждение диспетчеру, инженеру или заявителю — в зависимости от типа заявки. | реализовано | [EXECUTION](#execution) · MVP |
| TZ-P132 | 7. Процесс работы исполнителя | Минимум для первого релизаСписок задач, карточка задания, статусы, комментарии, фото, дата/время выполнения и передача результата на подтверждение. Учет рабочего времени и зарплаты — отдельный этап. | частично | [MOBILE](#mobile) · MVP |
| TZ-P135 | 8. ППР и регулярная техническая эксплуатация | Существующий процесс ППР ведется в табличных графиках по строениям и оборудованию. Целевая система должна перенести его в управляемый процесс, где план автоматически порождает задания исполнителям и позволяет видеть план/факт. | реализовано | [PPR](#ppr) · MVP |
| TZ-P139 | 8. ППР и регулярная техническая эксплуатация | Импорт или ручное создание перечня работ по объектам/оборудованию, периодичности и ответственным. | реализовано | [PPR](#ppr) · MVP |
| TZ-P141 | 8. ППР и регулярная техническая эксплуатация | По календарю создаются конкретные задания ППР с датой, объектом и исполнителем/службой. | реализовано | [PPR](#ppr) · MVP |
| TZ-P143 | 8. ППР и регулярная техническая эксплуатация | Исполнитель проходит чек-лист, добавляет комментарии и при необходимости фото. | реализовано | [EXECUTION](#execution) · MVP |
| TZ-P145 | 8. ППР и регулярная техническая эксплуатация | Инженер видит выполненные, просроченные и перенесенные задания, а также причины отклонений. | реализовано | [PPR_PROGRESS](#ppr-progress) · MVP |
| TZ-P147 | 8. ППР и регулярная техническая эксплуатация | По оборудованию и объекту сохраняется история проведенных работ и выявленных замечаний. | реализовано | [HISTORY](#history) · MVP |
| TZ-P150 | 8.1. Требования к импорту существующего графика | Поддержать загрузку текущего Excel/CSV-графика как исходного источника ППР. | нужен внешний доступ | [PPR_IMPORT](#ppr-import) · MVP |
| TZ-P151 | 8.1. Требования к импорту существующего графика | Перед загрузкой показывать ошибки и неоднозначные соответствия объектов/оборудования. | нужен внешний доступ | [PPR_IMPORT](#ppr-import) · MVP |
| TZ-P152 | 8.1. Требования к импорту существующего графика | После импорта пользователь должен иметь возможность скорректировать план в CRM без повторной загрузки файла. | реализовано | [PPR](#ppr) · MVP |
| TZ-P153 | 8.1. Требования к импорту существующего графика | Изменение плана не должно удалять историю уже выполненных заданий. | реализовано | [PPR](#ppr) · MVP |
| TZ-P155 | 9. Показания приборов учета и коммунальные данные | В текущем процессе объемы потребления рассчитываются технической службой и передаются в бухгалтерию; часть расчетов ведется в таблицах. В целевой схеме приложение предоставляет удобный канал ввода показаний, а учет и расчет начислений остаются в 1С. | реализовано | [ARC](#arc) · MVP |
| TZ-P156 | 9. Показания приборов учета и коммунальные данные | Пользователь видит доступные ему приборы учета по помещению/лицевому счету. | реализовано | [READINGS](#readings) · MVP |
| TZ-P157 | 9. Показания приборов учета и коммунальные данные | В открытом периоде вводит текущее показание и при необходимости прикладывает фотографию прибора. | реализовано | [READINGS](#readings) · MVP |
| TZ-P158 | 9. Показания приборов учета и коммунальные данные | Система выполняет базовые проверки: формат, сравнение с предыдущим показанием, явная аномалия. | реализовано | [READINGS](#readings) · MVP |
| TZ-P159 | 9. Показания приборов учета и коммунальные данные | Сомнительные значения направляются на проверку инженеру. | реализовано | [READINGS](#readings) · MVP |
| TZ-P160 | 9. Показания приборов учета и коммунальные данные | Принятое показание передается в 1С или иной согласованный учетный источник. | реализовано | [READING_EXCHANGE](#reading-exchange) · MVP |
| TZ-P161 | 9. Показания приборов учета и коммунальные данные | Статус обработки виден пользователю: принято, на проверке, отклонено. | реализовано | [READINGS](#readings) · MVP |
| TZ-P166 | 10.1. Что отображается пользователю | Связанные помещения и действующие договоры. | реализовано | [ACCESS](#access) · MVP |
| TZ-P167 | 10.1. Что отображается пользователю | Отдельные лицевые счета по согласованной логике договоров. | реализовано | [FINANCE](#finance) · MVP |
| TZ-P168 | 10.1. Что отображается пользователю | Начисления по периодам и услугам в детализации, которую предоставляет 1С. | реализовано | [FINANCE](#finance) · MVP |
| TZ-P169 | 10.1. Что отображается пользователю | Статус оплаты/задолженности — если данные доступны в учетном контуре. | реализовано | [FINANCE](#finance) · MVP |
| TZ-P170 | 10.1. Что отображается пользователю | Документы и вложения, разрешенные соответствующей роли. | реализовано | [DOCUMENTS](#documents) · MVP |
| TZ-P172 | 10.2. Документы и техническая документация | Технические файлы должны храниться централизованно и быть связаны с объектом, помещением, оборудованием, договором или заявкой. CRM может хранить сам файл либо ссылку на корпоративное хранилище; для пользователя это должно выглядеть как единая карточка документов. | реализовано | [DOCUMENTS](#documents) · MVP |
| TZ-P176 | 10.2. Документы и техническая документация | Проектная документация, технические паспорта, схемы, инструкции. | реализовано | [DOCUMENTS](#documents) · MVP |
| TZ-P178 | 10.2. Документы и техническая документация | Договоры, приложения, акты, документы по начислениям — в пределах прав. | реализовано | [DOCUMENTS](#documents) · MVP |
| TZ-P180 | 10.2. Документы и техническая документация | Паспорта, инструкции, регламенты обслуживания. | реализовано | [DOCUMENTS](#documents) · MVP |
| TZ-P182 | 10.2. Документы и техническая документация | Фото, акты выполнения, чек-листы, подтверждающие документы. | реализовано | [DOCUMENTS](#documents) · MVP |
| TZ-P185 | 11. Интеграция с 1С — на уровне процессов | Технические детали обмена должны быть описаны разработчиком после обследования конкретных баз 1С. На уровне ТЗ фиксируется только, какие группы данных должны участвовать в обмене и в каком направлении. | частично | [NATIVE](#native) · MVP |
| TZ-P191 | 11. Интеграция с 1С — на уровне процессов | Привязка пользователей, заявок, приборов, договоров и ППР к объектам. | реализовано | [IDENTITY](#identity) · MVP |
| TZ-P194 | 11. Интеграция с 1С — на уровне процессов | Идентификация собственника/арендатора и базовые контакты. | частично | [NATIVE](#native) · MVP |
| TZ-P197 | 11. Интеграция с 1С — на уровне процессов | Определение прав и отображение финансового кабинета. | реализовано | [ACCESS](#access) · MVP |
| TZ-P200 | 11. Интеграция с 1С — на уровне процессов | Отображение расчетов и задолженности без пересчета в CRM. | реализовано | [ARC](#arc) · MVP |
| TZ-P203 | 11. Интеграция с 1С — на уровне процессов | Показ пользователю доступных счетчиков/ресурсов. | частично | [NATIVE](#native) · MVP |
| TZ-P206 | 11. Интеграция с 1С — на уровне процессов | Передача принятых показаний после проверки. | реализовано | [READING_EXCHANGE](#reading-exchange) · MVP |
| TZ-P209 | 11. Интеграция с 1С — на уровне процессов | При необходимости в 1С передаются только данные, нужные для учета/списаний/аналитики. | частично | [NATIVE](#native) · MVP |
| TZ-P212 | 11. Интеграция с 1С — на уровне процессов | Связь фактических материалов с заявками и бухгалтерским учетом. | нет | [STOCK](#stock) · следующий этап |
| TZ-P215 | 11.1. Обязательные принципы обмена | Поддерживать несколько баз 1С без смешения данных. | реализовано | [IDENTITY](#identity) · MVP |
| TZ-P216 | 11.1. Обязательные принципы обмена | Не требовать прямого подключения мобильных приложений к 1С. | реализовано | [ARC](#arc) · MVP |
| TZ-P217 | 11.1. Обязательные принципы обмена | Иметь механизм контроля ошибок и повторной передачи данных. | реализовано | [EXCHANGE](#exchange) · MVP |
| TZ-P218 | 11.1. Обязательные принципы обмена | Не создавать дубли при повторном обмене. | реализовано | [EXCHANGE](#exchange) · MVP |
| TZ-P219 | 11.1. Обязательные принципы обмена | Разделять тестовый и промышленный контур. | реализовано | [EXCHANGE](#exchange) · MVP |
| TZ-P220 | 11.1. Обязательные принципы обмена | Изменения 1С по возможности выполнять через расширения, чтобы не затруднять обновление типовой конфигурации. | частично | [NATIVE](#native) · MVP |
| TZ-P222 | 12. Передача помещения и дефектные ведомости — следующий этап | В проектных материалах описан отдельный процесс передачи помещения арендатору: совместный обход, фиксация дефектов, устранение замечаний, подписание договора и акта приема-передачи, передача ключей и контактов диспетчерской. Этот процесс логично реализовать поверх уже созданного контура заявок и документов. | нет | [HANDOVER](#handover) · следующий этап |
| TZ-P226 | 12. Передача помещения и дефектные ведомости — следующий этап | Назначение даты, участники, мобильный чек-лист помещения. | нет | [HANDOVER](#handover) · следующий этап |
| TZ-P228 | 12. Передача помещения и дефектные ведомости — следующий этап | Замечание с категорией, фото, ответственным и сроком устранения. | нет | [HANDOVER](#handover) · следующий этап |
| TZ-P230 | 12. Передача помещения и дефектные ведомости — следующий этап | Дефект при необходимости превращается во внутреннюю заявку/задачу. | нет | [HANDOVER](#handover) · следующий этап |
| TZ-P232 | 12. Передача помещения и дефектные ведомости — следующий этап | Проверка устранения и фиксация результата. | нет | [HANDOVER](#handover) · следующий этап |
| TZ-P234 | 12. Передача помещения и дефектные ведомости — следующий этап | Хранение акта/договора, фиксация даты передачи и выдачи ключей. | нет | [HANDOVER](#handover) · следующий этап |
| TZ-P239 | 13. Состав MVP | Приложение собственника/арендатора iOS + Android | частично | [MOBILE](#mobile) · MVP |
| TZ-P240 | 13. Состав MVP | Полный расчет себестоимости услуг | частично | [COST](#cost) · следующий этап |
| TZ-P241 | 13. Состав MVP | Приложение исполнителя iOS + Android | частично | [MOBILE](#mobile) · MVP |
| TZ-P242 | 13. Состав MVP | Распределение зарплаты и трудозатрат | частично | [COST](#cost) · следующий этап |
| TZ-P243 | 13. Состав MVP | Внутренняя CRM диспетчера/инженера | реализовано | [CRM](#crm) · MVP |
| TZ-P244 | 13. Состав MVP | Полноценный склад ТМЦ и автоматические списания | нет | [STOCK](#stock) · следующий этап |
| TZ-P245 | 13. Состав MVP | Заявки, статусы, сроки, ответственные, фотоотчеты | частично | [SUMMARY](#summary) · MVP |
| TZ-P246 | 13. Состав MVP | Автоматическая телеметрия приборов | нет | [TELEMETRY](#telemetry) · следующий этап |
| TZ-P247 | 13. Состав MVP | ППР и задания исполнителям | реализовано | [PPR](#ppr) · MVP |
| TZ-P248 | 13. Состав MVP | Многослойные планировки и история геометрии | частично | [GEOMETRY](#geometry) · следующий этап |
| TZ-P249 | 13. Состав MVP | Роли собственник/арендатор/УК и права на объекты/ЛС | реализовано | [ACCESS](#access) · MVP |
| TZ-P250 | 13. Состав MVP | Расширенная BI-витрина и P&L | частично | [BI](#bi) · следующий этап |
| TZ-P251 | 13. Состав MVP | Базовое отображение ЛС/начислений из 1С | реализовано | [FINANCE](#finance) · MVP |
| TZ-P252 | 13. Состав MVP | Расширенный платежный/эквайринговый контур | нет | [PAYMENTS](#payments) · следующий этап |
| TZ-P253 | 13. Состав MVP | Ручная передача показаний с проверкой | реализовано | [READINGS](#readings) · MVP |
| TZ-P254 | 13. Состав MVP | Глубокая автоматизация платных калькуляций | частично | [COST](#cost) · следующий этап |
| TZ-P255 | 13. Состав MVP | Документы, уведомления и история действий | частично | [SUMMARY](#summary) · MVP |
| TZ-P256 | 13. Состав MVP | Полный электронный процесс передачи помещения | нет | [HANDOVER](#handover) · следующий этап |
| TZ-P259 | 13.1. Рекомендуемая последовательность запуска | Обследование 1С и согласование матрицы ролей/лицевых счетов. | частично | [NATIVE](#native) · MVP |
| TZ-P260 | 13.1. Рекомендуемая последовательность запуска | Прототип обмена: один объект, один пользователь, один ЛС, одна тестовая заявка. | реализовано | [EXCHANGE](#exchange) · MVP |
| TZ-P261 | 13.1. Рекомендуемая последовательность запуска | Разработка CRM и двух мобильных приложений. | частично | [MOBILE](#mobile) · MVP |
| TZ-P262 | 13.1. Рекомендуемая последовательность запуска | Подключение заявок, исполнителей, документов и уведомлений. | частично | [SUMMARY](#summary) · MVP |
| TZ-P263 | 13.1. Рекомендуемая последовательность запуска | Импорт ППР и запуск мобильного выполнения работ. | частично | [SUMMARY](#summary) · MVP |
| TZ-P264 | 13.1. Рекомендуемая последовательность запуска | Подключение показаний и финансового отображения из 1С. | частично | [SUMMARY](#summary) · MVP |
| TZ-P265 | 13.1. Рекомендуемая последовательность запуска | Пилот на ограниченной группе строений и пользователей. | не проверено | [PILOT](#pilot) · внедрение |
| TZ-P266 | 13.1. Рекомендуемая последовательность запуска | Тиражирование после исправления проблем данных и регламентов. | не проверено | [PILOT](#pilot) · внедрение |
| TZ-P272 | 14. Критерии приемки первого релиза | Пользователь входит по согласованному механизму и видит только разрешенные помещения/ЛС. | нужен внешний доступ | [OTP](#otp) · MVP |
| TZ-P274 | 14. Критерии приемки первого релиза | Один пользователь корректно работает с несколькими помещениями и договорами. | реализовано | [ACCESS](#access) · MVP |
| TZ-P276 | 14. Критерии приемки первого релиза | Для одного помещения роли получают разные данные и действия в соответствии с матрицей прав. | реализовано | [ACCESS](#access) · MVP |
| TZ-P278 | 14. Критерии приемки первого релиза | Создание → классификация → назначение → выполнение с фото → подтверждение → закрытие. | реализовано | [WORKFLOW](#workflow) · MVP |
| TZ-P280 | 14. Критерии приемки первого релиза | Есть отдельный этап согласования до выполнения и сохранена история решения. | реализовано | [APPROVAL](#approval) · MVP |
| TZ-P282 | 14. Критерии приемки первого релиза | Получает задачу в мобильном приложении, фиксирует результат и фото. | частично | [MOBILE](#mobile) · MVP |
| TZ-P284 | 14. Критерии приемки первого релиза | План создает задания; выполненные и просроченные работы видны инженеру. | реализовано | [PPR](#ppr) · MVP |
| TZ-P286 | 14. Критерии приемки первого релиза | Пользователь передает значение, инженер проверяет, результат передается в учетный контур. | частично | [SUMMARY](#summary) · MVP |
| TZ-P288 | 14. Критерии приемки первого релиза | Данные синхронизируются без дублей; ошибки видны ответственному и могут быть обработаны повторно. | реализовано | [EXCHANGE](#exchange) · MVP |
| TZ-P290 | 14. Критерии приемки первого релиза | Документы и фото доступны только тем ролям, которым разрешен соответствующий объект/процесс. | реализовано | [DOCUMENTS](#documents) · MVP |
| TZ-P292 | 14. Критерии приемки первого релиза | Сохраняется история ключевых действий, статусов, исполнителей и ручных изменений прав. | реализовано | [AUDIT](#audit) · MVP |
| TZ-P305 | 15.1. Что ожидается от стороннего разработчика | Уточненная схема архитектуры без изменения согласованных границ ответственности. | реализовано | [ARTEFACTS](#artefacts) · сопровождение |
| TZ-P306 | 15.1. Что ожидается от стороннего разработчика | Описание интеграции с конкретными базами 1С после технического обследования. | частично | [NATIVE](#native) · MVP |
| TZ-P307 | 15.1. Что ожидается от стороннего разработчика | Прототип ключевых пользовательских сценариев и матрица ролей. | реализовано | [ACCESS](#access) · MVP |
| TZ-P308 | 15.1. Что ожидается от стороннего разработчика | Оценка этапов MVP и перечень зависимостей/рисков. | реализовано | [ARTEFACTS](#artefacts) · сопровождение |
| TZ-P309 | 15.1. Что ожидается от стороннего разработчика | Рабочие сборки мобильных приложений и CRM, инструкции по развертыванию и администрированию. | частично | [MOBILE](#mobile) · MVP |
| TZ-P310 | 15.1. Что ожидается от стороннего разработчика | Документация по обмену, резервному копированию и восстановлению. | реализовано | [ARTEFACTS](#artefacts) · сопровождение |
| TZ-P311 | 15.1. Что ожидается от стороннего разработчика | Набор приемочных сценариев и результаты тестирования. | реализовано | [ARTEFACTS](#artefacts) · сопровождение |
| TZ-P312 | 15.1. Что ожидается от стороннего разработчика | Исходный код и все необходимые артефакты для дальнейшего сопровождения проекта. | реализовано | [ARTEFACTS](#artefacts) · сопровождение |
| TZ-P313 | 15.1. Что ожидается от стороннего разработчика | Итоговый ориентирПервый релиз должен дать работающий операционный процесс: пользователь создает обращение, диспетчер управляет им, исполнитель выполняет работу в мобильном приложении, инженер контролирует ППР, а 1С предоставляет учетный контекст — объекты, договоры, ЛС, начисления и приборы учета. | частично | [SUMMARY](#summary) · MVP |

## Открытые решения §15 исходного ТЗ

Эти вопросы не превращены в произвольные бизнес-правила. Ответы нужны до детальной приемки соответствующих процессов.

- **TZ-P295:** Какие типы договоров существуют и какие из них должны создавать отдельный лицевой счет.
- **TZ-P296:** Кто видит начисления и показания, если у помещения одновременно есть собственник и арендатор.
- **TZ-P297:** Какая база 1С является источником данных для каждого юридического лица/площадки.
- **TZ-P298:** Какие данные по начислениям и оплатам реально доступны в используемой конфигурации 1С.
- **TZ-P299:** Где ведется мастер-справочник приборов учета и кто подтверждает показания.
- **TZ-P300:** Какие типы заявок являются платными и кто имеет право согласовывать работу.
- **TZ-P301:** Какие статусы, SLA и правила эскалации нужны диспетчерской.
- **TZ-P302:** Какой объем существующего ППР и технической документации требуется загрузить на старте.
- **TZ-P303:** Нужна ли в первом релизе интеграция с платежами/ЭДО/другими внешними сервисами.

## Контроль полноты этого артефакта

- Оригинальных сопоставленных формулировок: **155/155**; уникальных XML-идентификаторов — 155.
- Групп доказательств: **37**; каждый указанный файл существует в исследованном репозитории.
- Внешние системы, рабочие данные/сеансы/права и приложение в ходе аудита не изменялись.
- Существующие тесты в этом аудите не запускались. Приёмка устройства/production/1С не приписывается статическому чтению кода.
- Количества статусов в JSON — счётчик трассируемых формулировок с повторами, **не процент готовности**.
