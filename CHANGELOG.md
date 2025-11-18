# Changelog

Формат основан на «Keep a Changelog» и придерживается Semantic Versioning.

## [1.0.0] - 2025-11-18
### Added
- Начальная версия конфигуратора «RNS Gate — Configurator» (TypeScript + esbuild, без фреймворков).
- Разделы интерфейса: RNSd, FreeDV, LoraSPI (отображение сырых данных), WiFi и Ethernet (специализированные формы).
- Форма WiFi:
  - Режимы: client/AP.
  - Получение текущей конфигурации через GET /wifi/info.
  - Переключение DHCP/Static, поля IP/Mask/Gateway/DNS1/DNS2.
  - Сохранение через POST /wifi/apply (application/x-www-form-urlencoded).
  - Подсказки/автозаполнение и локальный профиль (localStorage: profile_wifi).
- Форма Ethernet:
  - Получение конфигурации через GET /ethernet/info.
  - Переключение DHCP/Static, поля IP/Mask/Gateway/DNS1/DNS2.
  - Сохранение через POST /ethernet/apply (application/x-www-form-urlencoded).
  - Подсказки/автозаполнение и локальный профиль (localStorage: profile_ethernet).
- Статус-бар сети с индикацией: online, offline, busy, error.
  - Искусственная задержка смены цветов индикатора для мягких переходов.
  - Центрированное сообщение о состоянии/ошибках в верхней панели.
- Оффлайн-режим: корректная работа UI при открытии file:// и/или отсутствии сети (navigator.onLine = false).
  - В оффлайне специализированные формы рендерятся с дефолтами, запросы к CGI не выполняются.
- API-клиент (src/api.ts):
  - Базовый путь /cgi-bin (переопределяемый через window.CGI_BASE или window.__CGI_BASE__).
  - GET/POST с таймаутом, разбором ошибок и поддержкой JSON или текстовых ответов.
- Сборка через esbuild: bundle, minify, sourcemap → dist/bundle.js.
- Скрипты npm:
  - build — сборка.
  - copy:static — копирование index.html и styles.css в dist.
  - copy:server — копирование dist в локальный серверный проект (путь можно менять под окружение).
  - build:all — последовательный запуск сборки и копирования.
- Базовые стили интерфейса (styles.css): сайдбар, контент, формы, переключатели, статус-индикатор, код-блоки.

[1.0.0]: https://example.com/rns-gate-configurator/releases/1.0.0
