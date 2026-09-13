import { parseQuery, routeIntent } from "./parse-query";
import { BOOK_TFS, klineOf } from "./types";

export const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

const API = `https://api.telegram.org/bot${TOKEN}`;

type TgMessage = {
  message_id: number;
  chat: { id: number };
  from?: { id: number; username?: string; first_name?: string };
  text?: string;
};
type TgCallback = {
  id: string;
  data?: string;
  message?: TgMessage;
  from?: { id: number; username?: string; first_name?: string };
};

type LastCard = {
  pair: string;
  interval: string;
  signal: string;
  stop: string;
  headline: string;
};

type ChatMem = {
  pair?: string;
  interval: string;
  last?: LastCard;
};

const memory = new Map<string, ChatMem>();

const MENU = {
  keyboard: [
    [{ text: "BTC" }, { text: "ETH" }, { text: "GOLD" }, { text: "AAPL" }],
    [{ text: "NVDA" }, { text: "TSLA" }, { text: "SILVER" }, { text: "DOGE" }],
    [{ text: "15м" }, { text: "30м" }, { text: "1ч" }, { text: "4ч" }, { text: "1д" }],
    [{ text: "Стратег" }, { text: "Счёт" }, { text: "Новости" }, { text: "Меню" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Пара или: купил 100 doge по 0.08",
};

const TX_RE =
  /^(купил[аи]?|продал[аи]?|buy|sell)\s+([\d.,]+)\s+([a-zA-Zа-яё]{2,12})(?:\s*(?:по|at|@)\s*([\d.,]+))?/i;

function memOf(userId: string): ChatMem {
  const hit = memory.get(userId);
  if (hit) return hit;
  const next: ChatMem = { interval: "1h" };
  memory.set(userId, next);
  return next;
}

async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(json.description ?? method);
  return json;
}

function px(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(5);
  return n.toPrecision(4);
}

function word(signal: string) {
  if (signal === "LONG") return "КУПИТЬ";
  if (signal === "SHORT") return "ПРОДАТЬ";
  return "ЖДАТЬ";
}

function trendWord(trend: string) {
  if (trend === "up") return "вверх";
  if (trend === "down") return "вниз";
  return "боковик";
}

function tfOf(text: string): string | null {
  const raw = text.trim().toLowerCase();
  const hit = BOOK_TFS.find(
    (item) =>
      item.id.toLowerCase() === raw ||
      item.label.toLowerCase() === raw ||
      item.full.toLowerCase() === raw,
  );
  return hit?.id ?? null;
}

async function reply(chatId: number, text: string) {
  await tg("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    reply_markup: MENU,
  });
}

async function typing(chatId: number) {
  await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(
    () => undefined,
  );
}

async function showAccount(
  chatId: number,
  userId: string,
  who?: { username?: string; firstName?: string },
) {
  const acc = await import("./tg-account.server");
  const book = await acc.touchAccount({
    tgId: userId,
    username: who?.username,
    firstName: who?.firstName,
  });
  const code = acc.accountCode(userId);
  const name = book.firstName || book.username || "трейдер";
  if (!book.lots.length) {
    await reply(
      chatId,
      [
        `Привет, ${name}.`,
        `Это твой счёт Takt · ${code}`,
        "Чужие сделки сюда не попадают.",
        "",
        "Позиций нет. Запиши так:",
        "купил 100 doge по 0.08",
        "продал 50 doge по 0.09",
      ].join("\n"),
    );
    return;
  }
  const marketMod = await import("./market.server");
  const tickers = await marketMod.fetchTickers(book.lots.map((lot) => lot.symbol));
  const priceOf = new Map(tickers.map((row) => [row.symbol, row.price]));
  let value = 0;
  let cost = 0;
  const rows = book.lots.map((lot) => {
    const now = priceOf.get(lot.symbol) ?? lot.entry;
    const worth = now * lot.qty;
    const spent = lot.entry * lot.qty;
    value += worth;
    cost += spent;
    const pnl = worth - spent;
    const mark = pnl >= 0 ? "+" : "";
    return `${lot.pair.replace("/USDT", "")}  ${px(lot.qty)}  вход ${px(lot.entry)}  сейчас ${px(now)}  ${mark}$${pnl.toFixed(2)}`;
  });
  const pnl = value - cost;
  const mark = pnl >= 0 ? "+" : "";
  await reply(
    chatId,
    [
      `Счёт ${name} · ${code}`,
      `Итого $${value.toFixed(2)}  (${mark}$${pnl.toFixed(2)})`,
      "",
      ...rows,
      "",
      "Записать: купил 100 doge по 0.08",
    ].join("\n"),
  );
}

async function applyTx(chatId: number, userId: string, text: string) {
  const match = text.match(TX_RE);
  if (!match) return false;
  const side = /прода|sell/i.test(match[1] ?? "") ? "sell" : "buy";
  const qty = Number((match[2] ?? "").replace(",", "."));
  const coin = match[3] ?? "";
  const parsed = parseQuery(coin, "1h");
  if (!parsed || !Number.isFinite(qty) || qty <= 0) {
    await reply(chatId, "Не понял сделку. Так: купил 100 doge по 0.08");
    return true;
  }
  let price = Number((match[4] ?? "").replace(",", "."));
  if (!Number.isFinite(price) || price <= 0) {
    const marketMod = await import("./market.server");
    const market = await marketMod.fetchMarket(parsed.base, parsed.quote, "1h");
    price = market.price;
  }
  if (!price) {
    await reply(chatId, "Нет цены. Напиши: купил 100 doge по 0.08");
    return true;
  }
  const acc = await import("./tg-account.server");
  await acc.touchAccount({ tgId: userId });
  if (side === "buy") {
    const lot = await acc.recordBuy({
      tgId: userId,
      symbol: parsed.symbol,
      qty,
      price,
    });
    await reply(
      chatId,
      `Записал на твой счёт.\n${lot.pair}  +${px(qty)} по ${px(price)}\nСредний вход ${px(lot.entry)}`,
    );
    return true;
  }
  const sold = await acc.recordSell({
    tgId: userId,
    symbol: parsed.symbol,
    qty,
    price,
  });
  if ("error" in sold) {
    await reply(chatId, sold.error);
    return true;
  }
  const mark = sold.pnl >= 0 ? "+" : "";
  await reply(
    chatId,
    `Продажа на твоём счёте.\n${sold.pair}  −${px(qty)} по ${px(price)}\nP/L ${mark}$${sold.pnl.toFixed(2)}`,
  );
  return true;
}

async function fastPair(text: string, interval: string) {
  const parsed = parseQuery(text, interval);
  if (!parsed) return null;
  const marketMod = await import("./market.server");
  const {
    computeTechnicals,
    computeFlow,
    computeTradePlan,
    heuristicVerdict,
  } = await import("./indicators");
  const market = await marketMod.fetchMarket(
    parsed.base,
    parsed.quote,
    klineOf(parsed.interval),
  );
  if (!market.price) return null;
  const tech = computeTechnicals(market.candles);
  const flow = computeFlow(market.candles);
  const analysis = heuristicVerdict(market.price, tech);
  const plan = computeTradePlan({
    price: market.price,
    atr: tech.atr,
    signal: analysis.signal,
    interval: parsed.interval,
  });
  const chg = `${market.change24h >= 0 ? "+" : ""}${market.change24h.toFixed(2)}%`;
  const body = [
    `${parsed.base}/${parsed.quote} · ${parsed.intervalLabel}`,
    "",
    `${word(analysis.signal)} · ${analysis.confidence}%`,
    "",
    `Цена ${px(market.price)}  ${chg}`,
    flow ? `Покупки ${flow.buyPct}% · продажи ${flow.sellPct}%` : "",
    `RSI ${tech.rsi} · ${trendWord(tech.trend)}`,
    "",
    analysis.headline,
    analysis.signal === "WAIT" ? "Сейчас не входить." : `Вход: ${analysis.entryZone}`,
    `Стоп ${px(plan.stopPrice)}`,
    `Цель ${px(plan.targetPrice)}`,
    "",
    "Не инвестрекомендация.",
  ]
    .filter((line) => line != null)
    .join("\n");
  return {
    body,
    pair: `${parsed.base}/${parsed.quote}`,
    interval: parsed.interval,
    card: {
      pair: `${parsed.base}/${parsed.quote}`,
      interval: parsed.interval,
      signal: analysis.signal,
      stop: px(plan.stopPrice),
      headline: analysis.headline,
    } satisfies LastCard,
  };
}

async function fastSpot() {
  const marketMod = await import("./market.server");
  const { SPOT_UNIVERSE } = await import("./spot-risk");
  const tickers = await marketMod.fetchTickers([...SPOT_UNIVERSE].slice(0, 8));
  const lines = tickers.slice(0, 6).map((row) => {
    const name = row.symbol.replace("USDT", "");
    const chg = `${row.change24h >= 0 ? "+" : ""}${row.change24h.toFixed(1)}%`;
    const core = row.symbol === "BTCUSDT" || row.symbol === "ETHUSDT";
    const act =
      row.change24h >= 8
        ? "не трогать"
        : row.change24h <= -8 && core
          ? "можно докупить"
          : core
            ? "ядро, можно держать"
            : "ждать";
    return `${name}  ${chg}  · ${act}`;
  });
  return ["Что купить сейчас", "", ...lines, "", "Не инвестрекомендация."].join(
    "\n",
  );
}

async function fastNews() {
  const marketMod = await import("./market.server");
  const news = await marketMod.fetchHeadlineTape().catch(() => []);
  if (!news.length) return "Свежих новостей нет. Напиши пару — разберём график.";
  return ["Новости", "", ...news.slice(0, 5).map((item) => `• ${item.title}`)].join(
    "\n",
  );
}

async function fastStrategy() {
  const marketMod = await import("./market.server");
  const tickers = await marketMod.fetchTickers(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
  const btc = tickers.find((row) => row.symbol === "BTCUSDT");
  const chg = btc?.change24h ?? 0;
  const stance = chg <= -2.5 ? "ЗАЩИТА" : chg >= 2.5 ? "АТАКА" : "ЖДАТЬ";
  const now =
    stance === "ЗАЩИТА"
      ? "Не докупать альты. Сначала стопы. Кэш важнее."
      : stance === "АТАКА"
        ? "Можно ядро спотом. Альт — маленькая доля."
        : "Края нет. Держать ядро, новые сделки не открывать.";
  const rows = tickers.map((row) => {
    const name = row.symbol.replace("USDT", "");
    const d = `${row.change24h >= 0 ? "+" : ""}${row.change24h.toFixed(1)}%`;
    return `${name}  ${d}`;
  });
  return [`Стратег · ${stance}`, "", now, "", ...rows, "", "Не инвестрекомендация."].join(
    "\n",
  );
}

async function runText(
  chatId: number,
  userId: string,
  raw: string,
  who?: { username?: string; firstName?: string },
) {
  const text = raw.trim();
  if (!text) return;
  const mem = memOf(userId);

  try {
    const acc = await import("./tg-account.server");
    const book = await acc.touchAccount({
      tgId: userId,
      username: who?.username,
      firstName: who?.firstName,
    });
    if (!mem.pair && book.lastPair) mem.pair = book.lastPair;
    if (book.interval) mem.interval = book.interval;
  } catch {
    /* db may still migrate */
  }

  if (
    text === "/start" ||
    text === "/help" ||
    text.toLowerCase() === "меню"
  ) {
    const name = who?.firstName || "трейдер";
    await reply(
      chatId,
      [
        `Привет, ${name}.`,
        "Это твой счёт Takt. Чужие сделки сюда не попадают.",
        "",
        "Жми пару или напиши:",
        "DOGE 1ч",
        "золото",
        "AAPL",
        "купил 100 doge по 0.08",
      ].join("\n"),
    );
    return;
  }

  const aliases: Record<string, string> = {
    "/strateg": "стратег",
    "/strategy": "стратег",
    "/spot": "что купить",
    "/news": "новости",
    "/market": "обзор рынка",
    "/account": "счёт",
    счёт: "счёт",
    счет: "счёт",
  };
  const asked = aliases[text.toLowerCase()] ?? text;

  if (asked === "счёт" || asked === "портфель") {
    await typing(chatId);
    await showAccount(chatId, userId, who);
    return;
  }

  if (await applyTx(chatId, userId, asked)) return;

  const tfTap = tfOf(asked);
  if (tfTap) {
    mem.interval = tfTap;
    import("./tg-account.server")
      .then((acc) => acc.savePrefs(userId, { interval: tfTap }))
      .catch(() => undefined);
    if (mem.pair) {
      await runText(chatId, userId, `${mem.pair} ${tfTap}`, who);
      return;
    }
    const label = BOOK_TFS.find((item) => item.id === tfTap)?.label ?? tfTap;
    await reply(chatId, `Таймфрейм ${label}. Жми BTC или напиши пару.`);
    return;
  }

  await typing(chatId);
  const intent = routeIntent(asked.replace(/^\/+/, ""), mem.interval, mem.pair);

  try {
    if (intent.kind === "strategy") {
      await reply(chatId, await fastStrategy());
      return;
    }
    if (intent.kind === "spot") {
      await reply(chatId, await fastSpot());
      return;
    }
    if (intent.kind === "news" || intent.kind === "brief") {
      await reply(chatId, await fastNews());
      return;
    }
    if (intent.kind === "book") {
      await showAccount(chatId, userId, who);
      return;
    }

    const scan = await fastPair(asked, mem.interval);
    if (scan) {
      mem.pair = scan.pair;
      mem.interval = scan.interval;
      mem.last = scan.card;
      import("./tg-account.server")
        .then((acc) =>
          acc.savePrefs(userId, { interval: scan.interval, lastPair: scan.pair }),
        )
        .catch(() => undefined);
      await reply(chatId, scan.body);
      return;
    }

    if (mem.last && (intent.kind === "followup" || intent.kind === "chat")) {
      await reply(
        chatId,
        [
          `${mem.last.pair} · ${word(mem.last.signal)}`,
          mem.last.headline,
          `Стоп ${mem.last.stop}`,
        ].join("\n"),
      );
      return;
    }

    await reply(chatId, "Не понял.\nЖми BTC или напиши: купил 100 doge по 0.08");
  } catch (error) {
    console.error("[tg]", error);
    await reply(chatId, "Сейчас не смог ответить. Нажми ещё раз.").catch(
      () => undefined,
    );
  }
}

export async function handleTelegramUpdate(update: {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallback;
}): Promise<void> {
  const cb = update.callback_query;
  if (cb?.id) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id }).catch(
      () => undefined,
    );
    const chatId = cb.message?.chat.id ?? cb.from?.id;
    const userId = cb.from?.id;
    if (!chatId || !userId || !cb.data) return;
    await runText(chatId, String(userId), cb.data.replace(/^(tf|q):/, ""), {
      username: cb.from?.username,
      firstName: cb.from?.first_name,
    });
    return;
  }

  const message = update.message;
  const text = message?.text?.trim();
  const chatId = message?.chat.id;
  const userId = message?.from?.id;
  if (!message || !chatId || !userId || !text) return;
  await runText(chatId, String(userId), text, {
    username: message.from?.username,
    firstName: message.from?.first_name,
  });
}

export async function telegramReady(): Promise<{
  ok: boolean;
  bot?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${API}/getMe`, {
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await res.json()) as {
      ok: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (!body.ok) return { ok: false, error: body.description ?? "token" };
    return { ok: true, bot: body.result?.username };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "telegram",
    };
  }
}
