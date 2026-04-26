# BlackBears Play — Архитектура проекта

## Обзор

**BlackBears Play** — это кроссплатформенное приложение для бронирования компьютеров в компьютерных клубах. Проект представляет собой PWA (Progressive Web App), обернутое в Capacitor для нативных мобильных платформ (Android/iOS).

---

## Особенности

### 1. Гибридная архитектура
- **Frontend**: Чистый JavaScript (ES6+) без фреймворков
- **Backend**: PHP (легковесный REST-like API)
- **Мобильная обёртка**: Capacitor 7.x
- **База данных**: MySQL 8.x (utf8mb4)

### 2. Многоуровневая система API
- **Локальный PHP API** (`/api/*.php`) — аутентификация, регистрации, брони, друзья, заказы
- **Прокси-слой** (`proxy.php`) — обход CORS для доступа к внешнему API клубов
- **Внешний API** (`vibe.blackbearsplay.ru`) — данные о клубах, тарифы, доступность ПК, рейтинги

### 3. Игровой UX/UI
- Dark Fantasy Cyberpunk тема с неоновыми акцентами
- Персонаж-компаньон (Барни) с анимациями
- Диалоговый интерфейс навигации
- Звуковые эффекты и тактильная обратная связь

### 4. Социальные функции
- Система друзей (запросы, принятие, бронирование для друзей)
- Приглашения с реферальными бонусами
- Рейтинги игроков
- Гостевые аккаунты

### 5. Интеграции
- **iCafeCloud** — управление компьютерными клубами
- **VK API** — лента новостей из группы клуба
- **SMS-верификация** — подтверждение телефона
- **TTS (Text-to-Speech)** — озвучка диалогов

---

## Архитектура

### Структура проекта

```
swebrubir2/
├── public_html/              # Frontend (web directory для Capacitor)
│   ├── index.html           # Единая точка входа (SPA)
│   ├── css/style.css        # Темы, анимации, UI-компоненты
│   ├── js/
│   │   ├── app.js           # Главный модуль, инициализация
│   │   ├── api.js           # Клиент API (все запросы)
│   │   ├── auth.js          # Авторизация, регистрация
│   │   ├── booking.js       # Логика бронирования
│   │   ├── friends.js       # Управление друзьями
│   │   ├── profile.js       # Профиль пользователя
│   │   ├── dialogs.js       # Диалоговые сцены
│   │   ├── ui.js            # UI-утилиты, рендеринг
│   │   ├── state.js         # Глобальное состояние (реактивное)
│   │   ├── support.js       # Чат-бот поддержки
│   │   └── texts.ru.js      # Локализация
│   ├── assets/              # SVG-иконки, аватары, PWA-ресурсы
│   └── vendor/              # QRCode.js и др.
│
├── public_html/api/         # PHP Backend API
│   ├── config.php           # Конфигурация БД, утилиты
│   ├── login.php            # Аутентификация
│   ├── register.php         # Регистрация + SMS
│   ├── booking.php          # Создание брони
│   ├── booking_cancel.php   # Отмена брони
│   ├── friends.php          # API друзей
│   ├── invite.php           # Приглашения
│   ├── proxy.php            # Прокси к внешнему API
│   ├── cafes.php            # Список клубов
│   ├── orders.php           # Заказ еды
│   └── ... (20+ эндпоинтов)
│
├── migrations/              # SQL-скрипты миграций
│   ├── 001_schema.sql       # Основная схема БД
│   ├── 002_seed_data.sql    # Стартовые данные
│   └── 000_drop_failed_import.sql
│
├── config/
│   └── app.php              # Конфиг приложения (БД, ключи, API)
│
├── storage/
│   ├── cache/               # Кэш (VK посты, токены)
│   └── logs/                # Логи ошибок
│
├── android/                 # Нативный Android-проект (Capacitor)
├── capacitor.config.ts      # Конфиг Capacitor
└── package.json             # Зависимости Node.js
```

### Модульная система Frontend

```javascript
// app.js — оркестратор
App.init()
├── UI.init()                // Инициализация DOM, событий
├── AppState.init()          // Реактивное состояние
├── Auth.init()              // Модуль авторизации
├── Friends.init()           // Модуль друзей
├── Avatar.init()            // Аватары
└── _bindGlobalButtons()     // Глобальные обработчики
```

**Модули**:
- `Auth` — вход, регистрация, SMS-верификация, выход
- `Booking` — выбор ПК, дат, времени, создание брони
- `Friends` — список друзей, бронирование для друзей
- `Profile` — профиль, баланс, история, настройки
- `Support` — чат-бот поддержки
- `Avatar` — кастомные/预设 аватары
- `Dialogs` — сценарии диалогов (меню, уведомления)

### Состояние (AppState)

```javascript
AppState = {
  currentUser: null,         // Текущий пользователь
  cafes: [],                 // Список клубов
  bookings: [],              // Активные брони
  friends: [],               // Друзья
  pendingInvites: [],        // Ожидающие приглашения
  selectedPC: null,          // Выбранный ПК
  // ... и методы saveSession()/loadSession()
}
```

Состояние кэшируется в `sessionStorage` для быстрого восстановления после перезагрузки.

### API-слой

**Клиент API** (`api.js`) :
- `_localRequest()` — запросы к локальному PHP API
- `_viaProxy()` — прокси-запросы к внешнему API
- Методы для всех сущностей: `login()`, `register()`, `getCafes()`, `createBooking()`, `getFriendsList()` и др.

**PHP API**:
- Единый формат ответа: `{ code, message, data }`
- Сессии с CSRF-защитой (`SameSite=Strict`)
- Подготовка PDO с prepared statements
- Утилиты: `getDB()`, `requireAuth()`, `jsonResponse()`, `remoteGet/Post()`

### База данных

**Основные таблицы**:
- `users` — пользователи (логин, пароль, баланс, memberId)
- `cafes` — компьютерные клубы
- `bookings` — брони
- `balance_history` — история операций с балансом
- `friendships` — связи друзей
- `invitations` — реферальные приглашения
- `friend_bookings` — брони для друзей
- `food_orders` — заказы еды

---

## Использованные инструменты и библиотеки

### Frontend
| Инструмент | Назначение |
|------------|------------|
| **Vanilla JS (ES6+)** | Основной язык без фреймворков |
| **CSS3 (Custom Properties)** | Темы, анимации, адаптивность |
| **QRCode.js** | Генерация QR-кодов для оплаты |
| **Web Audio API** | Звуковые эффекты |
| **Service Worker** | PWA офлайн-режим |
| **Web App Manifest** | Иконки, запуск как приложение |

### Backend
| Инструмент | Назначение |
|------------|------------|
| **PHP 8.x** | Серверная логика |
| **PDO (MySQL)** | Работа с БД |
| **cURL** | HTTP-запросы к внешнему API |
| **Session API** | Аутентификация |
| **JSON** | Формат обмена данными |

### Mobile
| Инструмент | Назначение |
|------------|------------|
| **Capacitor 7.2.0** | Нативная обёртка для Android/iOS |
| **Android Gradle** | Сборка Android-приложения |

### AI-сервисы и внешние интеграции
| Сервис | Назначение |
|--------|------------|
| **VK API** | Лента новостей из группы клуба |
| **TTS API** | Озвучка диалогов (Text-to-Speech) |
| **SMS-шлюз** | Верификация по телефону |
| **iCafeCloud API** | Управление клубами, ПК, тарифами |

### Подходы и паттерны
1. **SPA (Single Page Application)** — все экраны в одном HTML, переключение через JS
2. **Module Pattern** — каждый модуль (`Auth`, `Booking` и т.д.) инкапсулирован в объект
3. **Proxy Pattern** — обход CORS через PHP-прокси
4. **Session Storage** — кэширование состояния для быстрого восстановления
5. **Graceful Fallback** — при недоступности API используются кэшированные данные
6. **Responsive Design** — адаптивность под мобильные устройства
7. **Dark Theme by Default** — темная тема с неоновыми акцентами (Cyberpunk стиль)

---

## Безопасность

- **Пароли**: Генерируются криптографически стойким методом (`crypto.getRandomValues`)
- **Сессии**: `HttpOnly`, `Secure`, `SameSite=Strict` cookie
- **SQL**: Prepared statements через PDO
- **CORS**: Ограничение по `ALLOWED_ORIGIN`
- **Валидация**: Проверка email, телефона, данных на клиенте и сервере

---

## Запуск проекта

### Frontend + Backend (локально)
1. Установить XAMPP (Apache + PHP + MySQL)
2. Поместить проект в `D:\xampp\htdocs\bbplaym4\swebrubir2\`
3. Настроить `config/app.php` (параметры БД)
4. Импортировать `migrations/001_schema.sql` в MySQL
5. Открыть `https://localhost/swebrubir2/public_html/`

### Мобильное приложение (Android)
```bash
cd swebrubir2
npm run cap:add:android
npm run cap:sync
npm run cap:open:android
```

### Web-приложение
1. Открыть https://taskcash.ru/

---

## Версии
- **Capacitor**: 7.2.0
- **TypeScript**: 6.0.3
- **QRCode.js**: 1.0.0
- **PHP**: 8.x
- **MySQL**: 8.x

---

*Документ создан автоматически на основе анализа кода проекта.*
*Дата: 26 апреля 2026 г.*