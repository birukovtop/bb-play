# BlackBears Play 🐻

**PWA-приложение для бронирования в игровом клубе**

---

## 📋 Описание

BlackBears Play — современное Progressive Web App (PWA) для онлайн-бронирования мест в компьютерном клубе. Приложение поддерживает авторизацию через SMS, систему друзей, пополнение баланса, бронирование компьютеров и административную панель.

### ✨ Основные возможности

- **Авторизация и регистрация** с SMS-верификацией
- **Бронирование** игровых мест с выбором даты, времени и длительности
- **Система друзей** — добавление, приглашения, совместные бронирования
- **Пополнение баланса** — карты, СБП
- **Профиль пользователя** — аватарки, история сессий
- **Приглашения** — реферальная система с бонусами
- **Админ-панель** — управление пользователями, бронированиями, настройками
- **PWA** — установка на домашний экран, работа офлайн (Service Worker)
- **Мультиязычность** — поддержка русского языка

---

## 🛠 Технологический стек

| Компонент | Технология |
|-----------|------------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | PHP 7.4+, MySQL 5.7+ |
| **PWA** | Service Worker, Web App Manifest |
| **UI** | Кастомный дизайн (Dark Fantasy Cyberpunk) |
| **Библиотеки** | QRCode.js |

---

## 📁 Структура проекта

```
public_html/
├── index.html              # Основное приложение (PWA)
├── invite.html             # Страница приглашения
├── manifest.webmanifest    # PWA манифест
├── sw.js                   # Service Worker
├── .htaccess               # Apache конфигурация
│
├── api/                    # REST API (PHP)
│   ├── auth/
│   │   ├── login.php       # Авторизация
│   │   ├── register.php    # Регистрация
│   │   ├── logout.php      # Выход
│   │   └── sms_verify.php  # SMS-верификация
│   ├── booking/
│   │   ├── booking.php     # Создание бронирования
│   │   ├── bookings.php    # Список бронирований
│   │   └── booking_cancel.php  # Отмена бронирования
│   ├── user/
│   │   ├── profile.php     # Профиль
│   │   ├── avatar.php      # Аватар
│   │   ├── friends.php     # Друзья
│   │   └── topup.php       # Пополнение баланса
│   └── cafes.php           # Список клубов
│
├── admin/                  # Админ-панель
│   ├── index.html          # UI админки
│   └── api/admin-api.php   # Admin API
│
├── js/                     # Frontend JavaScript
│   ├── app.js              # Точка входа
│   ├── auth.js             # Логика авторизации
│   ├── booking.js          # Бронирование
│   ├── friends.js          # Друзья
│   ├── profile.js          # Профиль
│   ├── pwa.js              # PWA функционал
│   └── texts.ru.js         # Переводы
│
├── css/
│   └── style.css           # Стили (5300+ строк)
│
└── assets/
    ├── pwa/                # Иконки PWA
    ├── games/              # Иконки игр
    └── bear.svg            # Логотип Барни
```

---

## 🚀 Установка и запуск

### Предварительные требования

- PHP 7.4 или выше
- MySQL 5.7 или выше / MariaDB 10.3+
- Apache с mod_rewrite (или Nginx)
- XAMPP (для локальной разработки)

### 1. Клонирование репозитория

```bash
cd D:/xampp/htdocs/
# Проект уже размещён в swebrubir2/public_html
```

### 2. Настройка базы данных

Создайте базу данных `swebrubir2` и настройте подключение:

```php
// api/config.php
define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3308);
define('DB_NAME', 'swebrubir2');
define('DB_USER', 'ваш_пользователь');
define('DB_PASS', 'ваш_пароль');
```

### 3. Конфигурация приложения

Создайте `config/app.php` в корне проекта:

```php
<?php
return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3308,
        'name' => 'swebrubir2',
        'user' => '',
        'pass' => '',
    ],
    'site_url' => 'http://localhost/swebrubir2/public_html',
    'remote_api_base' => 'https://vibe.blackbearsplay.ru',
    'storage_path' => __DIR__ . '/../storage',
];
```

### 4. Настройка Apache

Убедитесь, что включены модули:
- `mod_rewrite`
- `mod_headers`

`.htaccess` уже настроен в корне проекта.

### 5. Запуск

Откройте в браузере:
- **Основное приложение:** `http://localhost/swebrubir2/public_html/`
- **Админ-панель:** `http://localhost/swebrubir2/public_html/admin/`

---

## 🔌 API Endpoints

### Аутентификация
| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/login.php` | Вход по логину/паролю |
| POST | `/api/register.php` | Регистрация |
| POST | `/api/sms_verify.php` | Подтверждение SMS |
| POST | `/api/logout.php` | Выход |

### Бронирование
| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/booking.php` | Создать бронирование |
| GET | `/api/bookings.php` | Мои бронирования |
| POST | `/api/booking_cancel.php` | Отменить бронирование |

### Пользователь
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/profile.php` | Профиль |
| POST | `/api/avatar.php` | Загрузка аватара |
| GET | `/api/friends.php` | Список друзей |
| POST | `/api/topup.php` | Пополнение баланса |

---

## 🎨 Дизайн

Приложение использует **Dark Fantasy Cyberpunk** тему:

- **Основной фон:** `#0a0e1a`
- **Акцентный цвет (золото):** `#f5c542`
- **Неоновые акценты:** `#00d4ff` (синий), `#8b5cf6` (фиолетовый)
- **Шрифты:** Segoe UI, системные шрифты

---

## 📱 PWA Features

- **Installable** — добавление на домашний экран
- **Offline-first** — кэширование через Service Worker
- **Responsive** — адаптивный дизайн для мобильных устройств
- **Push Notifications** — подготовка для уведомлений

---

## 🔐 Безопасность

- Сессии с `SameSite=Strict` cookie
- CSRF-защита
- Prepared statements (PDO) для защиты от SQL-инъекций
- Валидация входных данных
- Хеширование паролей

---

## 🤝 Вклад

1. Форкните проект
2. Создайте функциональную ветку (`git checkout -b feature/amazing-feature`)
3. Закоммитьте изменения (`git commit -m 'Add amazing feature'`)
4. Отправьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

---

## 📄 Лицензия

Проект принадлежит **BlackBears Play**. Все права защищены.

---

## 📞 Поддержка

Для вопросов обращайтесь к администрации компьютерного клуба.

---

**BlackBears Play** — играй с комфортом! 🎮
