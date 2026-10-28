# Отдельные мобильные продукты

`client` — кабинет собственника/арендатора: телефонный вход, разрешенные помещения/ЛС, финансовые выписки 1С, показания, заявки, документы. `worker` — назначенные задания исполнителя, фото до/после, чек-лист, пауза/отказ, передача результата. Разные appId: `ru.skladkontur.client` и `ru.skladkontur.worker`; отдельные локальные данные, проекты Android/iOS и артефакты. Вход административной учетной записью в эти продукты отклоняется до загрузки рабочего пространства. Права на API всегда проверяет сервер.

Capacitor закреплен на 7.6.9. Web-ресурсы упакованы в приложение; HTTPS origin API задается при сборке, без секретов 1С. Административный web CRM сохраняет обычный режим.

```powershell
$env:VITE_WAREHOUSE_API_BASE_URL='https://your-crm.example'
node apps/mobile/scripts/prepare.mjs client android
node apps/mobile/scripts/prepare.mjs worker android
$env:JAVA_HOME='D:/DevTools/temurin21/JDK21-DIRECTORY'
$env:ANDROID_HOME='D:/DevTools/android-sdk'
node apps/mobile/scripts/android-debug.mjs client
node apps/mobile/scripts/android-debug.mjs worker
node apps/mobile/scripts/prepare.mjs client ios
node apps/mobile/scripts/prepare.mjs worker ios
```

Генерируемые проекты и web-ресурсы: `.local/mobile/<product>/`. APK: `android/app/build/outputs/apk/debug/app-debug.apk`. Это тестовая подпись Android, не release-подпись магазина. JDK21/Gradle/SDK устанавливаются отдельно; кэш Gradle по умолчанию находится на диске проекта. API origin должен разрешать доступ с локального origin мобильного контейнера.

Для iOS перенести проект на Mac, установить CocoaPods/Xcode, выполнить `cap sync ios`, выбрать отдельный Bundle ID, Apple Team и профиль подписи; затем собрать/установить на iPhone. Генерация Xcode-проекта на Windows не создает IPA. Android/iOS-фото используют выбор файла с `capture=environment`; физическая камера, восстановление сессии, фон и потеря сети требуют проверки на устройствах.

**Оставшаяся приемка:** release-подписи четырех сборок, реальные устройства, APNs/FCM и серверная доставка push. Подготовленные проекты/собранный APK не закрывают эти пункты. Для push нужны принадлежащие заказчику проекты Firebase/Apple и ключи доставки; никаких общих демонстрационных ключей в приложение не добавляется.
