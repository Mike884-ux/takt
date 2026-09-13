# Takt

Спотовый аналитик: разбор пары, новости, портфель, Telegram-бот.

## Стек

- TanStack Start + React + Tailwind
- Postgres (Neon в проде, PGLite в превью)
- Better Auth (email, Google, X)
- Telegram webhook `/api/telegram`

## Запуск

```bash
npm install
npm run dev
```

Нужны переменные окружения (не коммить):

- `DATABASE_URL` — Postgres
- `TELEGRAM_BOT_TOKEN` — токен бота
- ключи Better Auth / OAuth — как в деплое

## Что умеет

- Лонг / шорт / ждать по паре и таймфрейму
- Объём покупок/продаж, ATR, волатильность
- Спотовый портфель с сохранением на аккаунт
- Резервные копии, история чата
- Кнопки: Стратег, Анализ портфеля, Что купить, Волатильность

Не править `src/lib/auth/` кроме email/password.
