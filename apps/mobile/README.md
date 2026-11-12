# Мобильное приложение

Одно приложение «Склад Контур» (`ru.skladkontur.app`) для Android и iOS на Capacitor 7.6.9. Код интерфейса — тот же `apps/web`: сборка упаковывает его в приложение, а нативное поведение включается только внутри него (в браузере всё работает как раньше). Обзор решений, порядок выкладки и ограничения: [docs/MOBILE_APP_2026-11-09.md](../../docs/MOBILE_APP_2026-11-09.md).

## Кто входит

После входа роль учетной записи определяет кабинет. Экран входа предлагает две вкладки:

- **Клиент** — собственник или арендатор, вход по телефону с кодом из Telegram/VK: разрешенные помещения и ЛС, выписки 1С, показания, заявки, документы.
- **Сотрудник** — исполнитель, вход по email и паролю: назначенные задания, фото до/после, чек-лист, пауза/отказ, сдача результата.

Разрешенные роли задаются при сборке переменной `WAREHOUSE_MOBILE_ROLES` (по умолчанию `tenant,worker`). Учетные записи других ролей получают «Эта учетная запись не используется в мобильном приложении. Войдите через веб-версию.» Чтобы добавить управляющего, соберите с `WAREHOUSE_MOBILE_ROLES=tenant,worker,manager` и проверьте его экраны на телефоне. Права на API всегда проверяет сервер.

Bundle ID `ru.skladkontur.app` после публикации менять нельзя: другой ID — это другое приложение. Название и ID заданы в `scripts/prepare.mjs`.

## Сборка

Нужны Node.js 24.11+, для Android — JDK 21 и Android SDK, для iOS — Mac с Xcode и CocoaPods. Адрес API — HTTPS origin CRM, секреты 1С в приложение не попадают.

```powershell
$env:VITE_WAREHOUSE_API_BASE_URL='https://your-crm.example'
npm run mobile:android        # web-сборка + Android-проект в .local/mobile/app/android
npm run test:mobile           # проверка входа собранной версии в браузере

$env:JAVA_HOME='D:/DevTools/temurin21/JDK21-DIRECTORY'
$env:ANDROID_HOME='D:/DevTools/android-sdk'
npm run android:debug         # APK с тестовой подписью

npm run mobile:ios            # Xcode-проект в .local/mobile/app/ios
```

Отладочный APK: `.local/mobile/app/android/app/build/outputs/apk/debug/app-debug.apk`. Кэш Gradle по умолчанию: `.local/mobile/gradle-cache`. Каталог `.local/` не попадает в Git.

### Проверка на эмуляторе Android

Для эмулятора приложение можно собрать на локальный API по обычному HTTP: эмулятор видит компьютер по адресу `10.0.2.2`. Такая сборка открывается с `http://localhost`, разрешает незашифрованные запросы и помечается `devHttp` в `build-manifest.json`; `android-release.mjs` её не подписывает.

```bash
WAREHOUSE_MOBILE_DEV_HTTP=1 VITE_WAREHOUSE_API_BASE_URL=http://10.0.2.2:3001 npm run mobile:android
# репозиторий в WSL: скопировать проект на диск Windows для Android Studio
node apps/mobile/scripts/export-android.mjs /mnt/c/Users/<you>/wirehouse-mobile
```

В Android Studio: **File → Open** → `C:\Users\<you>\wirehouse-mobile\.local\mobile\app\android`, дождаться Gradle Sync, выбрать эмулятор и нажать **Run**. Android Studio использует свой JDK и SDK, отдельная установка не нужна. API в WSL на `127.0.0.1:3001` доступен эмулятору через пересылку портов WSL. После изменений в коде повторить обе команды и снова нажать Run. Повторный экспорт сохраняет `local.properties`, `.idea` и кэши сборки, поэтому студия не синхронизирует проект заново.

Без Android Studio (после первого Gradle Sync, когда Gradle и JDK уже скачаны) APK собирается и ставится из WSL:

```bash
cd /mnt/c/Users/<you>/wirehouse-mobile/.local/mobile/app/android
JAVA_HOME='C:\Users\<you>\.jdks\jbr-21.0.11' WSLENV=JAVA_HOME/w cmd.exe /c gradlew.bat assembleDebug
ADB=/mnt/c/Users/<you>/AppData/Local/Android/Sdk/platform-tools/adb.exe
$ADB install -r 'C:\Users\<you>\wirehouse-mobile\.local\mobile\app\android\app\build\outputs\apk\debug\app-debug.apk'
```

`JAVA_HOME` — JDK, который выбран в студии (Settings → Build Tools → Gradle → Gradle JDK); JDK 25 из комплекта студии Gradle 8.11 не запускает, системный JDK 17 не компилирует Capacitor 7. Режим полета для проверки очереди: `$ADB shell cmd connectivity airplane-mode enable|disable`.

### Проверка на своем телефоне по USB

Без сервера с этой веткой телефон можно подключить к локальному API кабелем. Включить на телефоне «Для разработчиков» → «Отладка по USB», подключить кабель и разрешить отладку.

```bash
WAREHOUSE_MOBILE_DEV_HTTP=1 VITE_WAREHOUSE_API_BASE_URL=http://127.0.0.1:3001 npm run mobile:android
# собрать APK, как выше (Android Studio или gradlew.bat assembleDebug)
adb -s <serial> reverse tcp:3001 tcp:3001   # 127.0.0.1:3001 на телефоне → API на компьютере
adb -s <serial> install -r app-debug.apk
```

Адрес `127.0.0.1`, а не `localhost`: на `localhost` приложение раздает собственные файлы. Проброс держится, пока подключен кабель; после переподключения команду `adb reverse` нужно повторить.

### Release-подпись Android

```powershell
$env:ANDROID_KEYSTORE_PATH='D:/secrets/sklad-kontur.jks'
$env:ANDROID_KEYSTORE_PASSWORD='…'
$env:ANDROID_KEY_ALIAS='sklad-kontur'
$env:ANDROID_KEY_PASSWORD='…'
npm run mobile:android
npm run android:release       # .local/mobile/release/sklad-kontur-<версия>.aab и .apk
```

`scripts/android-release.mjs` проверяет окружение (`scripts/check-release-env.mjs android`), записывает `keystore.properties` внутрь `.local/`, подключает подпись в `build.gradle` и собирает AAB (для магазинов) и APK (для прямой установки и RuStore). Ключ создается один раз (`keytool -genkeypair -v -keystore sklad-kontur.jks -alias sklad-kontur -keyalg RSA -keysize 4096 -validity 10000`) и хранится вне репозитория в нескольких местах: Android принимает обновление только с той же подписью, потерянный ключ означает новое приложение.

Версия берется из `apps/mobile/package.json` (`0.4.0` → versionCode `400`); перед каждым выпуском её нужно поднимать. [Описание выпуска 0.4.0](../../docs/RELEASE_2026-11-12_MOBILE_0_4_0.md).

### iOS

Скопировать `.local/mobile/app/ios` на Mac (или собрать в CI на macOS), выполнить `npx cap sync ios`, открыть `App.xcworkspace`, выбрать Apple Team и собрать на iPhone. Без платного Apple Developer установка возможна только на свои устройства с подписью на 7 дней; TestFlight, App Store и push требуют платного аккаунта. Скрипт добавляет в `Info.plist` описания доступа к камере и фото, без них iOS закрывает приложение при открытии камеры.

## Что делает приложение внутри телефона

Код: `apps/web/src/platform/`. Всё включается только в мобильной сборке или при наличии нативного моста Capacitor.

| Возможность | Как работает | Файл |
| --- | --- | --- |
| Скачивание файлов | Документы, выписки, фото и выгрузки сохраняются во временный кэш и открываются системным меню «Поделиться». WebView не поддерживает `<a download>` и blob-ссылки. | `native.ts` |
| Сохранение входа | Токен дублируется в `@capacitor/preferences` и восстанавливается при запуске, если iOS очистил хранилище WebView. | `native.ts` |
| Вырез экрана | iOS: `viewport-fit=cover`, верхние панели смещаются на `env(safe-area-inset-top)`. Android 15: `adjustMarginsForEdgeToEdge: auto`. | `styles/mobile-app.css` |
| Камера | Поля фото работ и показаний (`capture="environment"`) в приложении принимают `image/*`: только так Capacitor на Android открывает камеру, а не галерею. Манифест объявляет `<queries>` для `IMAGE_CAPTURE`, иначе Android 11+ скрывает от приложения программу камеры. | `photo.ts`, `scripts/prepare.mjs` |
| Системные полосы | Тема Android всегда светлая (веб-интерфейс без темной темы): темные значки строки состояния и навигации на белом фоне. | `scripts/prepare.mjs` |
| Сжатие фото | JPEG/PNG/WebP больше 600 КБ уменьшаются до 2048 px и пережимаются в JPEG, чтобы укладываться в 30 с на слабой связи. Документы и маленькие файлы не меняются. | `photo.ts` |
| Просмотр без сети | Успешные GET-ответы сохраняются в IndexedDB с привязкой к сессии (до 300). Без связи показываются сохраненные данные и плашка «Нет связи с сервером… данные, сохранённые …». При возврате связи экран перезагружается, при выходе сохраненное удаляется. Файлы без сети не открываются. | `offline-cache.ts` |
| Защита от повторов | Сервер хранит квитанции шести разрешённых маршрутов: создание заявки, комментарий, вложение заявки, пункт чек-листа, решение по работе и загрузка документа. Повтор с тем же ключом и телом получает исходный результат после проверки актуальных прав. Остальные маршруты выполняются обычным способом. Область и срок хранения — в [API](../../docs/API.md). | `api/client.ts`, `http/idempotency.js` |
| Очередь действий без сети | Комментарий, файл к заявке, фото работы, отметка чек-листа и решения по заданию (начать, приостановить, продолжить, сдать, отказаться) сохраняются на телефоне и отправляются по порядку при возврате связи, при запуске и каждые 30 с. Пока очередь не пуста, новые такие действия встают за ней. Отклоненное действие повторяется один раз после отправки следующих (например, «начать» после фото «до»), иначе показывается как «Не отправлено» с причиной. Выход с неотправленными действиями требует подтверждения. | `outbox.ts` |
| Push-уведомления | См. ниже. | `push.ts` |

Без очереди остаются показания приборов и создание заявок: для них нужен ответ сервера (номер загруженного фото, номер новой заявки). Сервер записывает время отправки действия, а не время нажатия. Очередь работает, пока приложение открыто; закрытое приложение отправит её при следующем запуске.

## Push-уведомления

Уведомления приложения (новая заявка, комментарий, изменение заявки) приходят на телефон получателей, кроме автора действия, и открывают заявку по нажатию. Push включается отдельно для каждой платформы и только с ключами заказчика; без них приложение к push не обращается (на Android регистрация без Firebase привела бы к падению).

- **Android.** В Firebase-проекте заказчика создать Android-приложение `ru.skladkontur.app`, скачать `google-services.json` и собирать с `WAREHOUSE_GOOGLE_SERVICES_JSON=<путь>`. На сервере задать `FCM_SERVICE_ACCOUNT_FILE` (ключ сервисного аккаунта того же проекта).
- **iOS.** Включить Push Notifications для Bundle ID, создать APNs-ключ (.p8) и собирать с `WAREHOUSE_IOS_PUSH=1` (скрипт добавит entitlement и обработчики в `AppDelegate`). На сервере задать `APNS_PRIVATE_KEY_FILE`, `APNS_KEY_ID`, `APNS_TEAM_ID`; для сборок из Xcode — `APNS_ENVIRONMENT=sandbox`, для TestFlight/App Store — `production`.
- Сборка без этих переменных убирает ранее добавленные `google-services.json` и entitlement, чтобы iOS-проект подписывался бесплатным Apple ID.

Проверено с поддельными серверами FCM/APNs (`tests/postgres/push.test.mjs`) и имитацией моста Capacitor; доставка на реальные телефоны требует ключей.

## Совместимость с сервером

Приложение обращается к API с другого origin (`capacitor://localhost`, `https://localhost`), поэтому сервер нужно обновить **до** раздачи новой сборки: миграции `017` (повторы команд) и `018` (устройства push), заголовок `Idempotency-Key` в CORS. Старый сервер отклонит предварительные CORS-запросы, и действия из нового приложения не пройдут.

## История

- Ранее выпускались два тестовых APK (`ru.skladkontur.client`, `ru.skladkontur.worker`, версия 0.3.0). Это другие приложения: на тестовых телефонах их нужно удалить вручную. Каталоги `.local/mobile/client` и `.local/mobile/worker` больше не используются.
- Старая обертка `apps/android` (весь веб в одном Android-приложении с тем же ID `ru.skladkontur.app`) удалена 09.11.2026: она не выпускалась, а ее release-подпись перенесена в `scripts/android-release.mjs`. Переменные `WAREHOUSE_ANDROID_APP_ID`/`WAREHOUSE_ANDROID_APP_NAME` больше не используются.

## Оставшаяся приемка

Release-ключ Android и выпуск AAB/APK, проверка на реальных Android и iPhone (камера, «Поделиться», восстановление входа, работа без сети и очередь), ключи FCM/APNs заказчика и доставка push, платный Apple Developer для TestFlight/App Store. Для push нужны принадлежащие заказчику проекты Firebase/Apple; общих демонстрационных ключей в приложении нет.
