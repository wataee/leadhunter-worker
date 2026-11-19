# LeadHunter Monorepo (Web App + 24/7 Telegram Worker)

Репозиторий платформы **LeadHunter** — специализированного сервиса для видеомонтажёров по поиску YouTube-клиентов и мониторингу вакансий в реальном времени.

---

## 🏛 Архитектура системы

```mermaid
flowchart LR
    TG["Telegram Чаты и Каналы"] -->|MTProto 24/7| Worker["Worker (Render)\nserver.js"]
    Worker -->|POST /api/tg-notify\nX-Webhook-Secret| NetlifyNotify["Netlify Function\ntg-notify"]
    Worker -->|Redis REST / LRANGE| Redis[("Upstash Redis\n(Leads & Deduplication)")]
    
    WebBrowser["Браузер (Клиент)\nReact 18 + Zustand"] -->|POST /api/tg-feed| NetlifyFeed["Netlify Function\ntg-feed"]
    NetlifyFeed -->|GET /recent| Worker
    NetlifyFeed -.->|Fallback| TGScrape["Web Preview t.me/s/..."]
    
    BotUser["Telegram Бот"] -->|POST /api/tg-callback| NetlifyCallback["Netlify Function\ntg-callback"]
    NetlifyCallback -->|HSET leadhunter:inbox| Redis
    WebBrowser -->|GET /api/inbox| NetlifyInbox["Netlify Function\ninbox"]
```

---

## ⚙️ Переменные окружения (Environment Variables)

### 1. Telegram Worker (Render.com)

| Переменная | Обязательна | Назначение / Описание |
|---|:---:|---|
| `API_ID` | **Да** | Цифровой ID Telegram приложения из [my.telegram.org](https://my.telegram.org) |
| `API_HASH` | **Да** | 32-значный hex хэш приложения из [my.telegram.org](https://my.telegram.org) |
| `SESSION_STRING` | **Да** | Строка сессии GramJS, генерируется локально командой `npm run auth` |
| `WEBHOOK_SECRET` | **Да** | Секретный токен для защиты эндпоинтов `/recent`, `/metrics` (мин. 16 символов) |
| `WEBHOOK_URL` | Нет | URL эндпоинта отправки уведомлений (`https://<site>/api/tg-notify`). Если не задан, сбор идёт в память/recent.json |
| `ALLOWED_ORIGIN` | Нет | Домен сайта (например `https://fleurleads-work.netlify.app`) для проверки совпадения с WEBHOOK_URL |
| `ALLOW_ANY_WEBHOOK_HOST`| Нет | Флаг `1` отключает проверку совпадения домена WEBHOOK_URL с ALLOWED_ORIGIN |
| `ALLOWED_CHATS` | Нет | Белый список каналов через запятую (например `work_videoedit,kinovideojob`) |
| `ALLOWED_CHATS_FILE` | Нет | Путь к файлу белого списка (перечитывается каждые 10 минут) |
| `UPSTASH_REDIS_REST_URL`| Нет | URL базы данных Upstash Redis для дедупликации и кэша |
| `UPSTASH_REDIS_REST_TOKEN`| Нет| Токен авторизации Upstash Redis REST |
| `PORT` | Нет | Порт HTTP-сервера проверки здоровья (по умолчанию `8080`) |
| `RATE_LIMIT_PER_MINUTE` | Нет | Лимит мгновенных уведомлений в минуту (по умолчанию `5`, затем объединяются в дайджест) |
| `RENDER_EXTERNAL_URL` | Нет | Внешний URL сервиса на Render для фонового самопинга раз в 10 минут |

> 💡 **Рекомендация по бесплатному тарифу Render**:
> Бесплатные Web Services на Render засыпают при отсутствии входящих запросов через 15 минут. В `server.js` встроен автоматический самопинг (при указании `RENDER_EXTERNAL_URL`). Для 100% гарантии бодрствования рекомендуется подключить внешний пингер (например, [UptimeRobot](https://uptimerobot.com) или [cron-job.org](https://cron-job.org)) с интервалом проверки каждые 10 минут по адресу `https://<worker-host>/`.

---

### 2. Веб-приложение (Netlify)

| Переменная | Обязательна | Назначение / Описание |
|---|:---:|---|
| `APP_PASSWORD` | **Да (в prod)** | Пароль администратора для входа в веб-приложение |
| `APP_SESSION_SECRET` | Рекомендуется | Секрет подписи сессионных cookie (мин. 32 символа). Если не задан, вычисляется из `APP_PASSWORD` |
| `WEBHOOK_SECRET` | **Да** | Секретный токен для приёма лидов от воркера и callback-запросов от Telegram-бота |
| `TELEGRAM_BOT_TOKEN` | Для бота | Токен бота от [@BotFather](https://t.me/BotFather) для отправки уведомлений и обработки кнопок |
| `TELEGRAM_CHAT_ID` | Для бота | Ваш личный Telegram Chat ID для приёма лидов и кнопок отклика |
| `UPSTASH_REDIS_REST_URL`| Для воронки | URL Upstash Redis для синхронизации кнопок «В воронку» и скрытия каналов |
| `UPSTASH_REDIS_REST_TOKEN`| Для воронки| Токен доступа Upstash Redis REST |
| `TG_WORKER_URL` | Для статуса | URL воркера на Render (например `https://leadhunter-worker.onrender.com`) для индикатора статуса |
| `YOUTUBE_API_KEY` | Опционально | Ключ Google Cloud YouTube Data API v3 для поиска каналов в Lead Finder |
| `GEMINI_API_KEY` | Опционально | Ключ Google AI Studio (Gemini 2.5 Flash) для генерации питчей |
| `GROQ_API_KEY` | Опционально | Резервный AI-ключ Groq Cloud |
| `OPENROUTER_API_KEY` | Опционально | Резервный AI-ключ OpenRouter |
| `ANTHROPIC_API_KEY` | Опционально | Резервный AI-ключ Anthropic Claude |

---

## 🔍 Диагностика: почему нет вакансий

Если в ленте пусто или перестали приходить уведомления в Telegram, выполните следующие 5 шагов:

1. **Проверьте статус воркера**:
   Откройте в браузере или выполните:
   ```bash
   curl https://<worker-host>/
   ```
   Ответ должен быть HTTP 200:
   `{"status": "online", "telegram": {"connected": true, ...}}`.
   Если `connected: false` — проверьте логи воркера на Render на наличие `AUTH_KEY_UNREGISTERED` или `FLOOD_WAIT`. При необходимости перевыпустите сессию: `npm run auth`.

2. **Проверьте привязку Telegram Webhook**:
   В корне проекта выполните:
   ```bash
   npm run tg:webhook
   ```
   Скрипт выведет текущий статус вебхука бота. Убедитесь, что `pending_update_count` не завис и поле `last_error_message` пустое.

3. **Проверьте метрики и лог фильтрации воркера**:
   ```bash
   curl -H "X-Webhook-Secret: <ВАШ_СЕКРЕТ>" https://<worker-host>/metrics
   ```
   В ответе просмотрите секцию `privacyStats` и `skippedByFilter`, чтобы убедиться, что каналы опрашиваются, а вакансии не отсекаются стоп-словами.

4. **Проверьте системное здоровье в веб-приложении**:
   Откройте `https://<site>/api/health` в браузере или нажмите значок статуса в интерфейсе (SystemHealthModal). Убедитесь, что все компоненты (telegramBot, redis, worker) в статусе `ok`.

5. **Проверьте список активных каналов**:
   Запросите:
   ```bash
   curl -H "Authorization: Bearer <WEBHOOK_SECRET>" https://<site>/api/sources-enabled
   ```
   Убедитесь, что `count` больше 0 (базовый каталог содержит 223 проверенных источника EU/US/KZ).

---

## 🎯 Возможности и ключевые компоненты

### 1. Трёхуровневый фильтр лидов (Разовые заказы вместо штата)
Система разработана специально для видеомонтажёров-фрилансеров и отсекает офисную работу, вакансии в штат, предложения услуг от других монтажёров и инфобизнес-курсы:
* **Уровень 1 (Hard Stops)**: Мгновенная проверка по регулярным выражениям с границами слов (`\b`, Cyrillic word boundaries) на штат, офис, оклад, график 5/2, ТК, соцпакет, испытательный срок, «отправляйте резюме HR», рекламу курсов, нецелевые профессии и строительный монтаж. Исключает ложные срабатывания при отрицании («не в штат», «no full-time»).
* **Уровень 2 (Weighted Scoring 0–100)**: Взвешенный скоринг в `web/src/shared/filter.config.json`. Начисляет баллы за разовость («разово», «на проект», «N роликов», «тест», «per video», «one-time», «fixed price», ссылки на ТЗ, дедлайн) и штрафует за размытые формулировки и штатность.
* **Уровень 3 (AI Fallback)**: Пограничные лиды (скор 40–60) проверяются через существующий модуль `_shared/ai.ts` с кэшированием по хэшу текста и защитой от prompt injection.
* **Обратная связь в Telegram**: Под каждым постом в боте доступны кнопки `👍 Подходит` и `👎 Мусор`. Вердикты сохраняются в Redis/хранилище, а скрипт `node scripts/tune-filter.mjs` анализирует выборку и рекомендует точную калибровку весов.

---

### 2. Интеграция с Upwork (Email Webhook & Chrome Ingest)
* **Email Webhook (`/api/upwork-email`)**: Принимает регулярные оповещения о новых заказах от `donotreply@upwork.com` (напрямую или через Cloudflare Email Routing / ForwardEmail).
  1. В Upwork: сохраните поиск (например, `video editing`) через **Save Search**.
  2. В **Settings → Notification Settings → Job recommendations**: включите отправку на email.
  3. В почтовом сервисе настройте правило: при получении письма пересылать на вебхук: `https://<site>/api/upwork-email` с заголовком `X-Webhook-Secret: <WEBHOOK_SECRET>`.
* **Безопасность**: Запрещена передача секрета в query-параметрах URL; обязательна длина `WEBHOOK_SECRET` не менее 16 символов; проверка через `crypto.timingSafeEqual`.
* **Честный ROI**: Для новых клиентов с $0 spent / 0 hires автоматически устанавливается статус `❓ Новый клиент (неполные данные)` с пониженным скором и предупреждением.
* **Мгновенные Telegram-уведомления**: Качественные заказы (ROI $\ge 45$) немедленно доставляются в Telegram-бота с готовым первым хуком отклика и кнопками прямого перехода на Upwork и добавления в воронку.
* **Атомарное хранилище**: Исключены race conditions при параллельных загрузках за счёт атомарных `SETEX` (с TTL 14 дней) и `LPUSH/LTRIM`.

---

### 3. Telegram-каталог и оптимизация поллера
* **233 проверенных источника** по регионам Казахстан (KZ), США / Global (US) и Европа (EU). Нулевое присутствие каналов РФ.
* **Приоритетный поллер**: Опрос каналов выполняется не вслепую, а с разделением на батчи по реальной доле заказов (`gigRate`). Высокорезультативные каналы опрашиваются каждые 6–9 минут вместо 34 минут.
* **Опрос с `min_id`**: GramJS запрашивает только сообщения с `id > lastId`, исключая повторное скачивание трафика.
* **Персистентность `lastPolledId`**: Прогресс опроса сохраняется в `storage.js` (Redis / `last-polled.json`), благодаря чему перезапуск воркера на Render free не вызывает повторный прогон старых постов.
* **Защита от устаревших постов**: Параметр `MAX_POST_AGE_HOURS=48` отсекает посты старше 48 часов при первичной загрузке.
* **Еженедельная автоматизация**: GitHub Actions `.github/workflows/verify-sources.yml` еженедельно переоценивает метрики `gigRate`, `gigsPerWeek` и открывает Pull Request с обновлением каталога. Требует секреты `API_ID`, `API_HASH`, `SESSION_STRING` в GitHub Repository Secrets.

---

### 4. Instagram Исходящий Проспектинг (Outbound Prospecting)
* **Единый интерфейс в Finder**: Встроен непосредственно на экран поиска каналов (переключатель `YouTube` / `Instagram`) без создания лишних страниц по `DESIGN_RULES.md`.
* **Фокус на исходящий поиск**: Поиск предпринимателей, экспертов и блогеров по нишевым запросам (недвижимость, авто, инфобизнес, SaaS, подкасты).
* **Скоринг профилей**: Оценка аудитории (Sweet spot: 3 000 – 75 000 подписчиков), частоты публикации Reels, наличия продукта и открытых контактов (Telegram, WhatsApp, Email, Taplink).
* **Персональные питчи**: Модуль автоматически подбирает deep-link кейс из `portfolioMatcher.js` и генерирует черновик персонального отклика.
* **Безопасность**: Полное отсутствие авто-отправок, авто-лайков и спам-ботов. Пользователь отправляет сообщение исключительно вручную.
* **Подробное исследование API**: Читайте `docs/INSTAGRAM.md`.

---

## 🚀 Команды разработки

```bash
# Запуск полного набора тестов (воркер, фильтрация, аутентификация, хранилище, веб)
npm test

# Линтинг кода
npm run lint

# Проверка типов TypeScript
npm run typecheck

# Сборка веб-приложения
npm run build

# Интерактивная авторизация в Telegram (генерация SESSION_STRING)
npm run auth

# Установка Telegram Webhook для кнопок бота
npm run tg:webhook
```
