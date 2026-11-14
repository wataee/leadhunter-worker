# LeadHunter Monorepo (Web App + 24/7 Telegram Worker)

Репозиторий проекта **LeadHunter** — платформа поиска YouTube-клиентов и мониторинга вакансий для видеомонтажёров.

---

## Структура репозитория

```
├── server.js              # 24/7 MTProto Telegram-слушатель (хостится на Render.com)
├── auth.js                # Скрипт авторизации сессии Telegram
├── package.json           # Зависимости и команды воркера
├── web/                   # Исходный код веб-приложения LeadHunter (Netlify)
│   ├── src/               # React 18 + TypeScript + Tailwind CSS
│   ├── netlify/functions/ # Serverless API (ai-score, tg-feed, youtube-search)
│   ├── public/            # Статические ресурсы
│   ├── package.json       # Зависимости фронтенда
│   └── netlify.toml       # Конфигурация деплоя на Netlify
```

---

## 1. Облачный Telegram-воркер (Render.com)

Фоновый микро-сервис на Node.js для отслеживания вакансий и лидов в Telegram в реальном времени 24/7.
- **Хостинг:** Render.com (Web Service)
- **Технология:** Telegram Client (MTProto GramJS)
- **Самопинг:** встроенный таймер каждые 10 минут, предотвращающий засыпание на бесплатном тарифе.

### Переменные окружения на Render:
- `API_ID` — ID приложения Telegram
- `API_HASH` — Hash приложения Telegram
- `SESSION_STRING` — сгенерированная строка сессии
- `WEBHOOK_URL` — вебхук для отправки найденных лидов

---

## 2. Веб-приложение (папка `web/`)

- **Продакшн:** [fleurleads-work.netlify.app](https://fleurleads-work.netlify.app)
- **Стек:** React, Vite, TypeScript, Tailwind CSS, Zustand, Netlify Functions.
- **Функции:**
  - **Поиск каналов (Finder):** поиск YouTube-авторов, оценка через правила и AI.
  - **База клиентов (Leads):** Канбан-доска и таблица с воронкой статусов и напоминаний.
  - **Мониторинг вакансий (Vacancies):** живая лента из Telegram-чатов и каналов от 24/7 воркера.
  - **Конструктор сообщений (Templates):** адаптивные шаблоны для откликов на вакансии и первого контакта с авторами каналов.
