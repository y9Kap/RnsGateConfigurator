# RNS Gate — Configurator

Лёгкий конфигуратор для RNS Gate без фреймворков: TypeScript + esbuild, чистый DOM API и один bundle для браузера. Поддерживает оффлайн‑просмотр UI (file://), специализированные формы для WiFi/Ethernet и просмотр «сырых» данных для прочих разделов.

Смотрите также файл CHANGELOG.md для истории изменений.

## Возможности
- Разделы: RNSD, FreeDV (сырой вывод), WiFi и Ethernet (формы).
- Примечание: секция LoraSPI больше не поддерживается и удалена из кода.
- WiFi: режимы client/AP, загрузка через GET /cgi-bin/wifi/info, сохранение через POST /cgi-bin/wifi/apply, DHCP/Static, локальные подсказки и профиль (localStorage: profile_wifi).
- Ethernet: загрузка через GET /cgi-bin/ethernet/info, сохранение через POST /cgi-bin/ethernet/apply, DHCP/Static, локальные подсказки и профиль (localStorage: profile_ethernet).
- Статус‑бар сети: online, offline, busy, error, мягкие переключения цвета; центрированное сообщение в шапке.
- Оффлайн‑режим: UI доступен при открытии file:// и при отсутствии сети; формы WiFi/Ethernet рендерятся с дефолтами без запросов.

## Быстрый старт
1. Установка зависимостей: npm ci (или npm install).
2. Сборка: npm run build.
3. Копирование статических файлов: npm run copy:static.
4. Открыть UI: dist/index.html (можно через file:// или отдать как статику).

Команда npm run build:all выполнит сборку, копирование html/css и затем копирование dist в локальный серверный проект (путь внутри скрипта copy:server следует адаптировать под ваше окружение).

## Интеграция с CGI
- Базовый путь к CGI: /cgi-bin.
- Переопределение: задайте в окне браузера глобальную переменную window.CGI_BASE или window.__CGI_BASE__ до подключения bundle.js.
- Эндпоинты, ожидаемые клиентом:
  - GET  {CGI_BASE}/wifi/info
  - POST {CGI_BASE}/wifi/apply (application/x-www-form-urlencoded)
  - GET  {CGI_BASE}/ethernet/info
  - POST {CGI_BASE}/ethernet/apply (application/x-www-form-urlencoded)
  - GET  {CGI_BASE}/{section}/info для RNSD/FreeDV

При ответе JSON (Content-Type: application/json) тело парсится; иначе текст показывается «как есть». Ошибки HTTP сопровождаются сообщением из JSON.message или заголовка <title>.

## Структура
- src/api.ts — API‑клиент (GET/POST, таймаут, оффлайн‑проверка, разбор ошибок).
- src/index.ts — UI, формы WiFi/Ethernet, статус‑бар, навигация.
- index.html — базовая страница (копируется в dist/).
- styles.css — стили (копируются в dist/).
- dist/ — результаты сборки.

## Скрипты npm
- build — сборка TypeScript в dist/bundle.js (esbuild, minify, sourcemap).
- copy:static — копирование index.html и styles.css в dist/.
- copy:server — копирование dist в локальный серверный проект (путь по умолчанию: /home/y9kap/IdeaProjects/rnsGateServer/ — измените при необходимости).
- build:all — build → copy:static → copy:server.

## Релизы с готовым dist
Начиная с этой версии, GitHub Actions автоматически собирает проект при публикации релиза и прикрепляет архив dist.zip в раздел Releases. Чтобы запустить локально без сборки:
- скачайте dist.zip из последнего релиза;
- распакуйте архив;
- откройте файл dist/index.html напрямую в браузере (file://) или отдайте папку dist как статику на любом веб‑сервере.

## Настройки и локальное хранение
- Переключатель режима автозаполнения: localStorage key autofillMode (hints|fill).
- Профили форм: profile_wifi и profile_ethernet.

## Лицензия
ISC (см. package.json).
