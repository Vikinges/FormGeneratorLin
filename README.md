# PDF Generator - Генератор форм с электронной подписью

## 📋 Описание

Веб-приложение для создания и заполнения форм с функциональностью электронной подписи. После подписания форма автоматически конвертируется в PDF документ, который невозможно редактировать.

## ✨ Основные возможности

- **Interactive builder** – assemble forms with intuitive drag-and-drop
- **Available elements in the palette:**
  - Text field
  - Paragraph (auto-resizing textarea with suggestion history)
  - Checkbox
  - Signature (pointer drawing pad)
  - Photo upload
- **Reusable field presets** – duplicate and tweak elements without reconfiguring
- **Rich styling** – modern landing layout with sticky palette and hero onboarding
- **A4 canvas with zoom & pan** – hold space to pan, use Ctrl/Cmd + scroll to zoom
- **Debug logging toggle** – set window.__FORM_EDITOR_DEBUG__ = true to trace drag/resize/save events
- **PDF generation** – sign the form and receive a ready-to-share PDF


## 🏗️ Архитектура

Проект состоит из:
- **Backend**: Node.js + Express + SQLite
- **Frontend**: React + React DnD
- **PDF генерация**: PDFKit
- **Аутентификация**: JWT

### Модульная структура

```
/
├── server.js              # Основной сервер Express
├── pdf-generator.js       # Модуль генерации PDF
├── package.json           # Зависимости backend
├── client/                # React приложение
│   ├── src/
│   │   ├── components/    # React компоненты
│   │   │   ├── Auth.js
│   │   │   ├── Dashboard.js
│   │   │   ├── FormEditor.js
│   │   │   ├── FormViewer.js
│   │   │   └── AdminPanel.js
│   │   └── services/     # API сервисы
│   └── package.json
└── README.md
```

## 🚀 Запуск

### Локальная разработка

```bash
# Установка зависимостей
npm install
cd client && npm install && cd ..

# Сборка клиента
cd client
cd ..

# Запуск сервера
npm start
```

Приложение будет доступно по адресу `http://localhost:3000`

### Docker

```bash
# Сборка образа
docker-compose build

# Запуск контейнера
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down
```

## 🔐 Учетные данные по умолчанию

- **Логин**: admin
- **Пароль**: admin

⚠️ **ВАЖНО**: Измените пароль после первого входа через админ-панель!

## 📡 API Endpoints

### Health Check
```
GET /health
```

### Аутентификация
```
POST /api/auth/login
POST /api/auth/change-password (требует JWT)
```

### Управление формами
```
GET /api/forms              # Получить все формы
GET /api/forms/:id          # Получить форму
POST /api/forms             # Создать форму (админ)
PUT /api/forms/:id          # Обновить форму (админ)
DELETE /api/forms/:id       # Удалить форму (админ)
```

### Заполнение и подпись
```
POST /api/forms/:id/fill    # Сохранить заполненную форму
POST /api/forms/:id/sign    # Подписать форму
```

## 🧩 Компоненты интерфейса

### Auth.js
Страница входа в систему с защитой от несанкционированного доступа.

### Dashboard.js
Главная страница с сеткой карточек всех созданных форм. Возможности:
- Создание новой формы
- Редактирование существующих форм
- Просмотр/заполнение формы
- Удаление форм (только админ)
- Переход в админ-панель

### FormEditor.js
Визуальный редактор форм с drag-and-drop:
- Панель элементов слева
- Добавление/удаление полей
- Настройка свойств полей
- Зависимости между элементами

### FormViewer.js
Страница заполнения формы:
- Все типы полей формы
- Канвас для рисования подписи
- Загрузка файлов
- Проверка обязательных полей
- Финальное подписание и отправка



### Field suggestions & autocomplete
- Values typed into Text or Paragraph fields are stored in the ield_suggestions table once the form is signed.
- Suggestions surface after typing two characters; Paragraph fields render a clickable list, while Text fields use the native datalist.
- Picking a suggestion fills the field and clears the dropdown so you can continue typing without losing focus.
- Use the debug toggle (window.__FORM_EDITOR_DEBUG__ = true) when you need to trace drag, resize, or save events in the console.
### AdminPanel.js
Панель администратора:
- Смена пароля
- Смена email
- Информация о системе

## 📄 Генерация PDF

После подписания формы автоматически генерируется PDF документ со следующими характеристиками:

- Фиксация времени подписания
- Включение всех подписей в документ
- Защита от редактирования (read-only после подписания)
- Сохранение всех данных формы
- Включение метаданных (дата создания, подписи)

PDF сохраняется в директории `generated/` и недоступен для модификации.

## 🔒 Безопасность

- JWT токены для аутентификации
- Хеширование паролей с bcrypt
- CSRF защита
- Валидация всех входных данных
- Санитизация загружаемых файлов
- SQL injection защита

## 📱 Адаптивность

Интерфейс полностью адаптирован для мобильных устройств:
- Responsive grid layout
- Touch-события для подписи
- Оптимизированные размеры кнопок
- Удобная навигация на маленьких экранах

## 🛠️ Технологии

**Backend:**
- Express.js
- SQLite3
- JWT (jsonwebtoken)
- bcryptjs
- multer (загрузка файлов)
- PDFKit

**Frontend:**
- React 18
- React Router
- React DnD (drag-and-drop)
- Axios
- CSS3 (responsive)

**DevOps:**
- Docker
- Docker Compose
- Multi-stage builds

## Отладка перетаскивания

В файле `client/src/components/FormEditor.js` появился флаг `ENABLE_FORM_DEBUG`. Установите его в `true`, чтобы в консоли браузера отображались подробные логи всех операций на канвасе: перемещения, изменение параметров, удаление и сохранение элементов. Это ускоряет поиск проблем с координатами.

## 📝 Документация модулей

### server.js
Основной сервер Express с следующими модулями:
- Инициализация базы данных
- Роутинг API
- Middleware для аутентификации
- Обработка файлов
- Health checks

### pdf-generator.js
Модуль генерации PDF документов:
- `generate()` - основная функция создания PDF
- `validatePDF()` - валидация созданного файла
- Поддержка изображений подписей
- Метаданные и timestamp

### authService.js
Сервис аутентификации:
- Логин/логаут
- Смена пароля
- Управление JWT токенами
- Проверка валидности токенов

### formService.js
Сервис для работы с формами:
- CRUD операции для форм
- Заполнение и сохранение форм
- Подписание форм
- Загрузка файлов

## 🐳 Интеграция с Hub

Этот контейнер готов к интеграции с Linart Systems Hub:

```yaml
# Добавьте в docker-compose.yml Hub
pdfgenirator:
  build:
    context: ./pdfgenirator
  container_name: pdfgenirator
  ports:
    - "3003:3000"
  environment:
    - PORT=3000
  healthcheck:
    test: ["CMD-SHELL", "wget -q -O - http://localhost:3000/health || exit 1"]
    interval: 10s
```

## 🎯 Дальнейшие улучшения

- [ ] Добавить поддержку сложных зависимостей между полями
- [ ] Экспорт/импорт шаблонов форм
- [ ] История изменений форм
- [ ] Email уведомления при подписании
- [ ] Интеграция с внешними API
- [ ] Расширенная статистика использования

## 📧 Контакты

Для вопросов и поддержки создайте issue в репозитории проекта.

---

**Версия:** 1.0.0  
**Лицензия:** MIT  
**Статус:** Production Ready

