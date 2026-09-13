import { BOOK_TFS, INTERVALS } from "./types";
import { EXTRA_BASES, extraAliases, assetOf } from "./markets";

const ALIASES: Record<string, string> = {
  btc: "BTC",
  bitcoin: "BTC",
  биткоин: "BTC",
  биток: "BTC",
  бтс: "BTC",
  eth: "ETH",
  ethereum: "ETH",
  эфир: "ETH",
  эфириум: "ETH",
  этх: "ETH",
  doge: "DOGE",
  dogecoin: "DOGE",
  доги: "DOGE",
  додж: "DOGE",
  догикоин: "DOGE",
  sol: "SOL",
  solana: "SOL",
  солана: "SOL",
  соль: "SOL",
  xrp: "XRP",
  ripple: "XRP",
  риппл: "XRP",
  ton: "TON",
  toncoin: "TON",
  тон: "TON",
  bnb: "BNB",
  ada: "ADA",
  cardano: "ADA",
  avax: "AVAX",
  avalanche: "AVAX",
  link: "LINK",
  chainlink: "LINK",
  pepe: "PEPE",
  wif: "WIF",
  bonk: "BONK",
  shib: "SHIB",
  shiba: "SHIB",
  sui: "SUI",
  apt: "APT",
  near: "NEAR",
  arb: "ARB",
  op: "OP",
  trx: "TRX",
  ltc: "LTC",
  litecoin: "LTC",
  dot: "DOT",
  polkadot: "DOT",
  atom: "ATOM",
  inj: "INJ",
  tia: "TIA",
  sei: "SEI",
  render: "RENDER",
  fet: "FET",
  tao: "TAO",
  aave: "AAVE",
  matic: "POL",
  pol: "POL",
  polygon: "POL",
  ...extraAliases(),
};

const KNOWN = new Set([
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "XRP",
  "ADA",
  "DOGE",
  "TON",
  "AVAX",
  "DOT",
  "LINK",
  "LTC",
  "BCH",
  "UNI",
  "ATOM",
  "NEAR",
  "APT",
  "SUI",
  "ARB",
  "OP",
  "FIL",
  "INJ",
  "TIA",
  "SEI",
  "PEPE",
  "SHIB",
  "FLOKI",
  "WIF",
  "BONK",
  "TRX",
  "POL",
  "RENDER",
  "FET",
  "TAO",
  "AAVE",
  "MKR",
  "LDO",
  "STX",
  "IMX",
  "RUNE",
  "CRV",
  "GALA",
  "APE",
  "HBAR",
  "ALGO",
  "VET",
  "EGLD",
  "FTM",
  "SAND",
  "MANA",
  "AXS",
  "ENS",
  "QNT",
  "GRT",
  "SNX",
  "COMP",
  "DYDX",
  "ORDI",
  "WLD",
  "JUP",
  "PYTH",
  "ONDO",
  "ENA",
  "EIGEN",
  "PENDLE",
  "STRK",
  "ZK",
  "BLUR",
  "MEME",
  "NOT",
  "DOGS",
  "CATI",
  "HMSTR",
  "BOME",
  "POPCAT",
  "MEW",
  "NEIRO",
  "PNUT",
  "ACT",
  "GOAT",
  "AI16Z",
  "VIRTUAL",
  "PENGU",
  "TRUMP",
  "MELANIA",
  "FARTCOIN",
  "HYPE",
  "KAITO",
  "IP",
  "BERA",
  "MOVE",
  "S",
  ...EXTRA_BASES,
]);

const QUOTES = new Set(["USDT", "USD", "USDC", "BTC", "ETH", "FDUSD", "EUR", "RUB"]);

const INTERVAL_PATTERNS: { re: RegExp; id: string }[] = [
  { re: /\b(10\s*d|10д|10\s*дн)\b/i, id: "10d" },
  { re: /\b(1\s*M|1мес|месяц|monthly|month)\b/i, id: "1M" },
  { re: /\b(1\s*w|1н|недел[яи]|weekly|week)\b/i, id: "1w" },
  { re: /\b(3\s*d|3д|три дня)\b/i, id: "3d" },
  { re: /\b(2\s*d|2д|два дня)\b/i, id: "2d" },
  { re: /\b(12\s*h|12ч)\b/i, id: "12h" },
  { re: /\b(1\s*d|1д|дневк[аеи]|дн[ея]м?|daily|day)\b/i, id: "1d" },
  { re: /\b(4\s*h|4ч|4\s*час|четыре часа|h4)\b/i, id: "4h" },
  { re: /\b(1\s*h|1ч|час(?:овк[аеи])?|hourly|h1)\b/i, id: "1h" },
  { re: /\b(30\s*m|30м|30\s*мин|полчаса)\b/i, id: "30m" },
  { re: /\b(15\s*m|15м|15\s*мин)\b/i, id: "15m" },
  { re: /\b(5\s*m|5м|5\s*мин)\b/i, id: "5m" },
  { re: /\b(1\s*m|1м|1\s*мин)\b/i, id: "1m" },
];

const FOLLOWUP_RE =
  /почему|зачем|объясни|расскажи|что это|как так|риск|новост|стоп|цел[иь]|инвалид|когда вход|стоит ли|можно ли|а если|главн|ломается|мешают|простыми|что должно/i;

const ANALYZE_RE =
  /анализ|разбор|зайти|вход в|лонг|шорт|купить|продать|таймфрейм|\d+\s*(m|h|д|ч|м)|заходить/i;

const BRIEF_RE =
  /обзор рынка|сводка рынка|что сейчас на рынке|брифинг|рынок сегодня|как рынок|что по рынку/i;

const NEWS_RE =
  /^(торговл\w*\s+на\s+новост\w*|лента( новост\w*)?|новости|news)\??$/i;

const NEWS_DESK_RE =
  /торговл\w*\s+на\s+новост|лента новост|разбор новост|news\s*desk/i;

const BOOK_RE =
  /портфел|мои позици|мои монет|проверь портфел|что делать с портфел|дневн\w* разбор|разбор дня|анализ портфел|анализ риска|риск портфел|разбор портфел/i;

const SPOT_RE =
  /что купить|купи на спот|спотов\w*|спот (сейчас|сегодня)|какие монет\w* купить/i;

const VOL_RE =
  /волатил|volatility|\batr\b|насколько (дерг|дёрг)|ход портфел/i;

const STRATEGY_RE =
  /стратег|стратегия|план на (день|сегодня)|что делать сейчас|помоги торговать|режим рынка|как торговать сегодня/i;

export type ParsedQuery = {
  base: string;
  quote: string;
  symbol: string;
  interval: string;
  intervalLabel: string;
};

export type RouteIntent =
  | { kind: "analyze"; parsed: ParsedQuery }
  | { kind: "followup" }
  | { kind: "brief" }
  | { kind: "news" }
  | { kind: "book" }
  | { kind: "spot" }
  | { kind: "strategy" }
  | { kind: "vol" }
  | { kind: "chat" };

function intervalLabel(id: string): string {
  const found =
    BOOK_TFS.find((item) => item.id === id) ??
    INTERVALS.find((item) => item.id === id);
  if (found) return found.full;
  if (id === "30m") return "30 минут";
  if (id === "1m") return "1 минута";
  return id;
}

function normalizeToken(raw: string): string {
  return raw.replace(/[^a-zа-яё0-9]/gi, "").toLowerCase();
}

export function detectBaseInText(text: string): string | null {
  const lower = text.toLowerCase();
  const entries = Object.entries(ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, base] of entries) {
    const re = new RegExp(`(^|[^a-zа-яё0-9])${alias}([^a-zа-яё0-9]|$)`, "i");
    if (re.test(lower)) return base;
  }
  for (const known of KNOWN) {
    const re = new RegExp(`(^|[^A-Za-z0-9])${known}([^A-Za-z0-9]|$)`, "i");
    if (re.test(text)) return known;
  }
  return null;
}

function resolveBase(token: string): string | null {
  const clean = normalizeToken(token);
  if (!clean) return null;
  if (ALIASES[clean]) return ALIASES[clean];
  const upper = clean.toUpperCase();
  if (KNOWN.has(upper)) return upper;
  if (upper.length >= 2 && upper.length <= 10 && /^[A-Z0-9]+$/.test(upper)) {
    return upper;
  }
  return null;
}

export function parseQuery(
  text: string,
  fallbackInterval = "1h",
): ParsedQuery | null {
  const raw = text.trim();
  if (!raw) return null;

  let interval = fallbackInterval;
  for (const { re, id } of INTERVAL_PATTERNS) {
    if (re.test(raw)) {
      interval = id;
      break;
    }
  }

  const pair =
    raw.match(
      /\b([A-Za-zА-Яа-яЁё]{2,12})\s*[\/\-]\s*(USDT|USD|USDC|BTC|ETH|FDUSD|EUR|RUB)\b/i,
    ) ?? raw.match(/\$?([A-Za-z]{2,12})(USDT|USD|USDC|RUB)\b/i);

  let base: string | null = null;
  let quote = "USDT";

  if (pair) {
    base = resolveBase(pair[1] ?? "");
    const q = (pair[2] ?? "USDT").toUpperCase();
    if (QUOTES.has(q)) quote = q;
  }

  if (!base) {
    const tokens = raw.split(/[\s,;:!?]+/).filter(Boolean);
    for (const token of tokens) {
      const resolved = resolveBase(token.replace(/^\$/, ""));
      if (resolved && !QUOTES.has(resolved)) {
        base = resolved;
        break;
      }
    }
  }

  if (!base) return null;
  const listed = assetOf(base);
  if (listed) {
    if (!pair) quote = listed.quote;
    else if (quote === "USDT" && listed.quote !== "USDT") quote = listed.quote;
  } else if (quote === "USD") {
    quote = "USDT";
  }

  const symbol = `${base}${quote}`;
  return {
    base,
    quote,
    symbol,
    interval,
    intervalLabel: intervalLabel(interval),
  };
}

export function routeIntent(
  text: string,
  interval: string,
  lastSymbol?: string,
): RouteIntent {
  const raw = text.trim();
  if (VOL_RE.test(raw) && !parseQuery(raw, interval)) {
    return { kind: "vol" };
  }
  if (STRATEGY_RE.test(raw) && !/[\/\-]/.test(raw)) {
    return { kind: "strategy" };
  }
  if (SPOT_RE.test(raw) && !/[\/\-]/.test(raw)) {
    return { kind: "spot" };
  }
  if (BOOK_RE.test(raw) && !/[\/\-]/.test(raw)) {
    return { kind: "book" };
  }
  if (NEWS_RE.test(raw) || (NEWS_DESK_RE.test(raw) && !parseQuery(raw, interval))) {
    return { kind: "news" };
  }
  if (BRIEF_RE.test(raw) && !/[\/\-]/.test(raw)) {
    const parsedBrief = parseQuery(raw, interval);
    if (!parsedBrief) return { kind: "brief" };
  }

  const parsed = parseQuery(raw, interval);
  if (parsed) {
    const samePair = lastSymbol === parsed.symbol;
    if (samePair && FOLLOWUP_RE.test(raw) && !ANALYZE_RE.test(raw)) {
      return { kind: "followup" };
    }
    return { kind: "analyze", parsed };
  }

  if (BRIEF_RE.test(raw)) return { kind: "brief" };
  if (lastSymbol) return { kind: "followup" };
  if (FOLLOWUP_RE.test(raw) || raw.includes("?")) return { kind: "chat" };
  return { kind: "chat" };
}
