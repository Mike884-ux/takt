export type AssetKind = "crypto" | "stock" | "metal" | "energy" | "index";

export type ListedAsset = {
  base: string;
  quote: string;
  kind: AssetKind;
  name: string;
  yahoo?: string;
  tv?: string;
  aliases: string[];
};

export const EXTRA_ASSETS: ListedAsset[] = [
  {
    base: "GOLD",
    quote: "USD",
    kind: "metal",
    name: "Золото",
    yahoo: "GC=F",
    tv: "TVC:GOLD",
    aliases: ["золото", "gold", "xau", "xauusd", "голд"],
  },
  {
    base: "SILVER",
    quote: "USD",
    kind: "metal",
    name: "Серебро",
    yahoo: "SI=F",
    tv: "TVC:SILVER",
    aliases: ["серебро", "silver", "xag", "xagusd"],
  },
  {
    base: "PLAT",
    quote: "USD",
    kind: "metal",
    name: "Платина",
    yahoo: "PL=F",
    aliases: ["платина", "platinum", "xpt"],
  },
  {
    base: "OIL",
    quote: "USD",
    kind: "energy",
    name: "Нефть WTI",
    yahoo: "CL=F",
    tv: "TVC:USOIL",
    aliases: ["нефть", "oil", "wti", "crude"],
  },
  {
    base: "BRENT",
    quote: "USD",
    kind: "energy",
    name: "Brent",
    yahoo: "BZ=F",
    tv: "TVC:UKOIL",
    aliases: ["brent", "брент"],
  },
  {
    base: "SPX",
    quote: "USD",
    kind: "index",
    name: "S&P 500",
    yahoo: "^GSPC",
    tv: "SP:SPX",
    aliases: ["spx", "sp500", "s&p", "snp"],
  },
  {
    base: "NDX",
    quote: "USD",
    kind: "index",
    name: "Nasdaq 100",
    yahoo: "^NDX",
    tv: "NASDAQ:NDX",
    aliases: ["ndx", "nasdaq", "ндаск", "ндак"],
  },
  {
    base: "AAPL",
    quote: "USD",
    kind: "stock",
    name: "Apple",
    yahoo: "AAPL",
    tv: "NASDAQ:AAPL",
    aliases: ["aapl", "apple", "эппл", "эпл"],
  },
  {
    base: "MSFT",
    quote: "USD",
    kind: "stock",
    name: "Microsoft",
    yahoo: "MSFT",
    tv: "NASDAQ:MSFT",
    aliases: ["msft", "microsoft", "майкрософт", "микрософт"],
  },
  {
    base: "NVDA",
    quote: "USD",
    kind: "stock",
    name: "Nvidia",
    yahoo: "NVDA",
    tv: "NASDAQ:NVDA",
    aliases: ["nvda", "nvidia", "нвидиа", "видия"],
  },
  {
    base: "TSLA",
    quote: "USD",
    kind: "stock",
    name: "Tesla",
    yahoo: "TSLA",
    tv: "NASDAQ:TSLA",
    aliases: ["tsla", "tesla", "тесла"],
  },
  {
    base: "AMZN",
    quote: "USD",
    kind: "stock",
    name: "Amazon",
    yahoo: "AMZN",
    tv: "NASDAQ:AMZN",
    aliases: ["amzn", "amazon", "амазон"],
  },
  {
    base: "GOOGL",
    quote: "USD",
    kind: "stock",
    name: "Alphabet",
    yahoo: "GOOGL",
    tv: "NASDAQ:GOOGL",
    aliases: ["googl", "google", "гугл", "alphabet"],
  },
  {
    base: "META",
    quote: "USD",
    kind: "stock",
    name: "Meta",
    yahoo: "META",
    tv: "NASDAQ:META",
    aliases: ["meta", "facebook", "фейсбук", "мета"],
  },
  {
    base: "AMD",
    quote: "USD",
    kind: "stock",
    name: "AMD",
    yahoo: "AMD",
    tv: "NASDAQ:AMD",
    aliases: ["amd"],
  },
  {
    base: "NFLX",
    quote: "USD",
    kind: "stock",
    name: "Netflix",
    yahoo: "NFLX",
    tv: "NASDAQ:NFLX",
    aliases: ["nflx", "netflix", "нетфликс"],
  },
  {
    base: "SBER",
    quote: "RUB",
    kind: "stock",
    name: "Сбер",
    yahoo: "SBER.ME",
    aliases: ["sber", "сбер", "сбербанк"],
  },
  {
    base: "GAZP",
    quote: "RUB",
    kind: "stock",
    name: "Газпром",
    yahoo: "GAZP.ME",
    aliases: ["gazp", "газпром"],
  },
  {
    base: "LKOH",
    quote: "RUB",
    kind: "stock",
    name: "Лукойл",
    yahoo: "LKOH.ME",
    aliases: ["lkoh", "лукойл", "lukoil"],
  },
];

const BY_BASE = new Map(EXTRA_ASSETS.map((item) => [item.base, item]));

export function assetOf(token: string): ListedAsset | undefined {
  const raw = token.trim().toUpperCase();
  if (BY_BASE.has(raw)) return BY_BASE.get(raw);
  const stripped = raw.replace(/USDT$|USD$|RUB$/, "");
  return BY_BASE.get(stripped);
}

export function extraAliases(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of EXTRA_ASSETS) {
    map[item.base.toLowerCase()] = item.base;
    for (const alias of item.aliases) {
      map[alias.toLowerCase()] = item.base;
    }
  }
  return map;
}

export const EXTRA_BASES = EXTRA_ASSETS.map((item) => item.base);

export const QUICK_MARKETS = [
  "GOLD/USD",
  "SILVER/USD",
  "OIL/USD",
  "AAPL/USD",
  "NVDA/USD",
  "TSLA/USD",
] as const;
