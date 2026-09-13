import type { Candle, Derivatives, NewsItem, NewsTone, SectorView } from "./types";
import { klineOf } from "./types";
import { assetOf } from "./markets";
import {
  GECKO_IDS,
  SECTORS,
  pearson,
  rankSector,
  returnsOf,
} from "./market-context";

const UA = "TaktAnalyst/1.0";
const YAHOO_UA =
  "Mozilla/5.0 (compatible; Takt/1.0; +https://x.ai)";
const VISION = "https://data-api.binance.vision/api/v3";
const OKX = "https://www.okx.com/api/v5";
const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart";

async function getJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

async function getText(url: string, timeoutMs = 2200): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, text/xml, */*" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.text();
}

type VisionTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
};

type VisionKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

function toCandle(row: VisionKline): Candle {
  const volume = Number(row[5]);
  const buyV = Number(row[9]);
  const quoteV = Number(row[7]);
  const buyQuote = Number(row[10]);
  return {
    t: row[0],
    o: Number(row[1]),
    h: Number(row[2]),
    l: Number(row[3]),
    c: Number(row[4]),
    v: volume,
    buyV: Number.isFinite(buyV) ? buyV : undefined,
    quoteV: Number.isFinite(quoteV) ? quoteV : undefined,
    buyQuote: Number.isFinite(buyQuote) ? buyQuote : undefined,
  };
}

const OKX_BAR: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "2h": "2H",
  "4h": "4H",
  "12h": "12H",
  "1d": "1D",
  "3d": "3D",
  "1w": "1W",
  "1M": "1M",
};

export type MarketPack = {
  candles: Candle[];
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume: number;
  source: string;
};

async function fromVision(
  symbol: string,
  interval: string,
): Promise<MarketPack> {
  const [ticker, klines] = await Promise.all([
    getJson<VisionTicker>(`${VISION}/ticker/24hr?symbol=${symbol}`),
    getJson<VisionKline[]>(
      `${VISION}/klines?symbol=${symbol}&interval=${klineOf(interval)}&limit=120`,
    ),
  ]);
  const candles = klines.map(toCandle);
  const last = candles[candles.length - 1];
  return {
    candles,
    price: Number(ticker.lastPrice) || last?.c || 0,
    change24h: Number(ticker.priceChangePercent) || 0,
    high24h: Number(ticker.highPrice) || 0,
    low24h: Number(ticker.lowPrice) || 0,
    volume: Number(ticker.quoteVolume) || 0,
    source: "Binance",
  };
}

async function fromOkx(base: string, quote: string, interval: string): Promise<MarketPack> {
  const instId = `${base}-${quote}`;
  const bar = OKX_BAR[klineOf(interval)] ?? "1H";
  type OkxTicker = {
    code: string;
    data?: {
      last: string;
      open24h: string;
      high24h: string;
      low24h: string;
      volCcy24h: string;
    }[];
  };
  type OkxCandle = {
    code: string;
    data?: string[][];
  };
  const [ticker, candlesRes] = await Promise.all([
    getJson<OkxTicker>(`${OKX}/market/ticker?instId=${instId}`),
    getJson<OkxCandle>(
      `${OKX}/market/candles?instId=${instId}&bar=${bar}&limit=120`,
    ),
  ]);
  const t = ticker.data?.[0];
  const rows = (candlesRes.data ?? []).slice().reverse();
  const candles: Candle[] = rows.map((row) => ({
    t: Number(row[0]),
    o: Number(row[1]),
    h: Number(row[2]),
    l: Number(row[3]),
    c: Number(row[4]),
    v: Number(row[5]),
  }));
  const last = candles[candles.length - 1];
  const price = Number(t?.last) || last?.c || 0;
  const open = Number(t?.open24h) || price;
  return {
    candles,
    price,
    change24h: open ? ((price - open) / open) * 100 : 0,
    high24h: Number(t?.high24h) || 0,
    low24h: Number(t?.low24h) || 0,
    volume: Number(t?.volCcy24h) || 0,
    source: "OKX",
  };
}

async function getYahoo<T>(url: string, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

function yahooWindow(interval: string): { interval: string; range: string } {
  const tf = klineOf(interval);
  if (tf === "1m" || tf === "5m") return { interval: tf, range: "5d" };
  if (tf === "15m" || tf === "30m") return { interval: tf, range: "1mo" };
  if (tf === "1h" || tf === "2h") return { interval: "60m", range: "1mo" };
  if (tf === "4h" || tf === "12h") return { interval: "60m", range: "3mo" };
  if (tf === "1d" || tf === "3d") return { interval: "1d", range: "1y" };
  if (tf === "1w") return { interval: "1wk", range: "5y" };
  if (tf === "1M") return { interval: "1mo", range: "10y" };
  return { interval: "60m", range: "1mo" };
}

async function fromYahoo(yahoo: string, interval: string): Promise<MarketPack> {
  const spec = yahooWindow(interval);
  const url = `${YAHOO}/${encodeURIComponent(yahoo)}?interval=${spec.interval}&range=${spec.range}&includePrePost=false`;
  const body = await getYahoo<{
    chart?: {
      result?: {
        timestamp?: number[];
        meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
        indicators?: {
          quote?: {
            open?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
            volume?: (number | null)[];
          }[];
        };
      }[];
    };
  }>(url);
  const result = body.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0];
  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = Number(q?.open?.[i]);
    const h = Number(q?.high?.[i]);
    const l = Number(q?.low?.[i]);
    const c = Number(q?.close?.[i]);
    if (![o, h, l, c].every((n) => Number.isFinite(n) && n > 0)) continue;
    const prev = candles[candles.length - 1];
    if (prev && (c < prev.c * 0.25 || c > prev.c * 4)) continue;
    candles.push({
      t: (ts[i] ?? 0) * 1000,
      o,
      h,
      l,
      c,
      v: Math.max(0, Number(q?.volume?.[i]) || 0),
    });
  }
  const last = candles[candles.length - 1];
  const price = result?.meta?.regularMarketPrice || last?.c || 0;
  const prev =
    candles.find((row) => last && last.t - row.t >= 20 * 3600_000)?.c ??
    result?.meta?.chartPreviousClose ??
    price;
  const high24h = Math.max(...candles.slice(-24).map((row) => row.h), price);
  const low24h = Math.min(...candles.slice(-24).map((row) => row.l), price);
  return {
    candles,
    price,
    change24h: prev ? ((price - prev) / prev) * 100 : 0,
    high24h,
    low24h,
    volume: candles.slice(-24).reduce((sum, row) => sum + row.v, 0),
    source: "Yahoo",
  };
}

export async function fetchMarket(
  base: string,
  quote: string,
  interval: string,
): Promise<MarketPack> {
  const listed = assetOf(base);
  if (listed?.yahoo) {
    return fromYahoo(listed.yahoo, interval);
  }
  const symbol = `${base}${quote === "USD" ? "USDT" : quote}`;
  try {
    return await fromVision(symbol, interval);
  } catch {
    return await fromOkx(base, quote === "USD" ? "USDT" : quote, interval);
  }
}

export async function fetchTickers(
  symbols: string[],
): Promise<{ symbol: string; price: number; change24h: number }[]> {
  const crypto: string[] = [];
  const other: string[] = [];
  for (const symbol of symbols) {
    if (assetOf(symbol)?.yahoo) other.push(symbol);
    else crypto.push(symbol);
  }
  const out: { symbol: string; price: number; change24h: number }[] = [];
  if (crypto.length) {
    try {
      const encoded = encodeURIComponent(JSON.stringify(crypto));
      const rows = await getJson<VisionTicker[] | VisionTicker>(
        `${VISION}/ticker/24hr?symbols=${encoded}`,
      );
      const list = Array.isArray(rows) ? rows : [rows];
      const bySymbol = new Map(list.map((row) => [row.symbol, row]));
      for (const symbol of crypto) {
        const row = bySymbol.get(symbol);
        if (!row) continue;
        out.push({
          symbol: row.symbol,
          price: Number(row.lastPrice),
          change24h: Number(row.priceChangePercent),
        });
      }
    } catch {
      /* skip */
    }
  }
  await Promise.all(
    other.slice(0, 4).map(async (symbol) => {
      const listed = assetOf(symbol);
      if (!listed?.yahoo) return;
      try {
        const pack = await fromYahooLite(listed.yahoo);
        out.push({
          symbol,
          price: pack.price,
          change24h: pack.change24h,
        });
      } catch {
        /* skip */
      }
    }),
  );
  return out;
}

async function fromYahooLite(yahoo: string): Promise<{ price: number; change24h: number }> {
  const url = `${YAHOO}/${encodeURIComponent(yahoo)}?interval=1d&range=5d&includePrePost=false`;
  const body = await getYahoo<{
    chart?: {
      result?: {
        meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
        indicators?: { quote?: { close?: (number | null)[] }[] };
      }[];
    };
  }>(url, 2500);
  const result = body.chart?.result?.[0];
  const closes = (result?.indicators?.quote?.[0]?.close ?? []).filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n),
  );
  const price = result?.meta?.regularMarketPrice || closes[closes.length - 1] || 0;
  const prev = closes[closes.length - 2] || result?.meta?.chartPreviousClose || price;
  return { price, change24h: prev ? ((price - prev) / prev) * 100 : 0 };
}

export async function fetchDepth(
  symbol: string,
): Promise<{ bidPct: number; askPct: number } | undefined> {
  try {
    const body = await getJson<{
      bids?: [string, string][];
      asks?: [string, string][];
    }>(`${VISION}/depth?symbol=${symbol}&limit=20`, 5000);
    let bid = 0;
    let ask = 0;
    for (const row of body.bids ?? []) {
      bid += Number(row[0]) * Number(row[1]);
    }
    for (const row of body.asks ?? []) {
      ask += Number(row[0]) * Number(row[1]);
    }
    const total = bid + ask;
    if (total <= 0) return undefined;
    return {
      bidPct: Math.round((bid / total) * 100),
      askPct: Math.round((ask / total) * 100),
    };
  } catch {
    return undefined;
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;|'/g, "'")
    .trim();
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return decodeXml(match?.[1] ?? "");
}

function parseRss(xml: string, source: string): NewsItem[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((block) => ({
      title: tag(block, "title"),
      source,
      url: tag(block, "link") || tag(block, "guid"),
      published: tag(block, "pubDate") || tag(block, "published"),
    }))
    .filter((item) => item.title && !/google новост|google news/i.test(item.title));
}

const COIN_QUERY: Record<string, string> = {
  BTC: "Bitcoin OR BTC",
  ETH: "Ethereum OR ETH",
  DOGE: "Dogecoin OR DOGE",
  SOL: "Solana OR SOL crypto",
  XRP: "XRP OR Ripple",
  TON: "Toncoin OR TON crypto",
  PEPE: "PEPE meme coin",
  BNB: "BNB OR Binance Coin",
  ADA: "Cardano OR ADA",
  AVAX: "Avalanche OR AVAX",
  LINK: "Chainlink OR LINK",
  GOLD: "gold OR золото OR XAU",
  SILVER: "silver OR серебро OR XAG",
  OIL: "oil WTI OR нефть",
  BRENT: "Brent oil",
  AAPL: "Apple stock OR AAPL",
  MSFT: "Microsoft stock OR MSFT",
  NVDA: "Nvidia stock OR NVDA",
  TSLA: "Tesla stock OR TSLA",
  AMZN: "Amazon stock OR AMZN",
  GOOGL: "Google stock OR Alphabet OR GOOGL",
  META: "Meta stock OR Facebook OR META",
  AMD: "AMD stock",
  NFLX: "Netflix stock",
  SBER: "Сбербанк OR SBER",
  GAZP: "Газпром OR GAZP",
  LKOH: "Лукойл OR LKOH",
  SPX: "S&P 500",
  NDX: "Nasdaq 100",
};

const BEAR_NEWS =
  /hack|взлом|украд|паден|crash|sell[- ]?off|банкрот|закрыв|lawsuit|штраф|dump|outflow|liquidat|sec\b|запрет|обвал|rug|exploit/i;
const BULL_NEWS =
  /etf|рост|вырос|rally|surge|inflow|ath|одобр|buyback|adoption|golden cross|approval|spot etf|накопил|покупк/i;

export function guessNewsTone(title: string): NewsTone {
  if (BEAR_NEWS.test(title)) return "bear";
  if (BULL_NEWS.test(title)) return "bull";
  return "neutral";
}

export function stampNews(items: NewsItem[]): NewsItem[] {
  return items.map((item) => ({
    ...item,
    tone: item.tone ?? guessNewsTone(item.title),
  }));
}

const JUNK_NEWS =
  /конвертировать|convert\s+\d|to gbp|to usd|to eur|to nzd|в gbp|в usd|в eur|calculator|price widget|обмен\s+\d|график бессрочных|в реальном времени сегодня|market cap and chart|прогноз цены bitcoin: консолидация|robinhood\.com|prediction market|price range on/i;

function publishedAt(value: string): number {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

export async function fetchNews(base: string): Promise<NewsItem[]> {
  const listed = assetOf(base);
  const q = encodeURIComponent(COIN_QUERY[base] ?? `${base} ${listed ? "stock OR gold OR oil" : "crypto"}`);
  const urls = [
    {
      url: `https://news.google.com/rss/search?q=${q}+when:1d&hl=ru&gl=RU&ceid=RU:ru`,
      source: "Google News",
    },
    {
      url: `https://news.google.com/rss/search?q=${q}+when:1d&hl=en-US&gl=US&ceid=US:en`,
      source: "Google News",
    },
    ...(listed
      ? []
      : [
          { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
          { url: "https://decrypt.co/feed", source: "Decrypt" },
          {
            url: "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml",
            source: "CoinDesk",
          },
        ]),
  ];

  const settled = await Promise.allSettled(urls.map((item) => getText(item.url)));
  const news: NewsItem[] = [];
  settled.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const source = urls[index]?.source ?? "News";
    news.push(...parseRss(result.value, source));
  });

  const keys = (COIN_QUERY[base] ?? base)
    .split(/[^a-z0-9]+/i)
    .filter((part) => part.length > 2)
    .map((part) => part.toLowerCase());
  keys.push(base.toLowerCase());

  const filtered = news.filter((item) => {
    if (JUNK_NEWS.test(item.title)) return false;
    const hay = item.title.toLowerCase();
    if (item.source === "Google News") return true;
    return keys.some((key) => hay.includes(key));
  });

  const dayAgo = Date.now() - 36 * 60 * 60 * 1000;
  filtered.sort((a, b) => {
    const recency = (item: NewsItem) => {
      const at = publishedAt(item.published);
      return at >= dayAgo ? 2 : at > 0 ? 1 : 0;
    };
    const hit = (title: string) =>
      keys.some((key) => title.toLowerCase().includes(key)) ? 1 : 0;
    return recency(b) + hit(b.title) - (recency(a) + hit(a.title))
      || publishedAt(b.published) - publishedAt(a.published);
  });

  const seen = new Set<string>();
  const unique: NewsItem[] = [];
  for (const item of filtered) {
    const key = item.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= 8) break;
  }
  return stampNews(unique);
}

let tapeMemo: { at: number; value: NewsItem[] } | null = null;

export async function fetchHeadlineTape(): Promise<NewsItem[]> {
  if (tapeMemo && Date.now() - tapeMemo.at < 180_000) return tapeMemo.value;
  const q = encodeURIComponent(
    "(Bitcoin OR Ethereum OR Solana OR crypto OR ETF) when:1d",
  );
  const urls = [
    {
      url: `https://news.google.com/rss/search?q=${q}&hl=ru&gl=RU&ceid=RU:ru`,
      source: "Google News",
    },
    { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
  ];
  const settled = await Promise.allSettled(urls.map((item) => getText(item.url)));
  const news: NewsItem[] = [];
  settled.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    news.push(...parseRss(result.value, urls[index]?.source ?? "News"));
  });
  const dayAgo = Date.now() - 36 * 60 * 60 * 1000;
  const filtered = news.filter((item) => !JUNK_NEWS.test(item.title));
  filtered.sort((a, b) => publishedAt(b.published) - publishedAt(a.published));
  const seen = new Set<string>();
  const unique: NewsItem[] = [];
  for (const item of filtered) {
    const key = item.title.toLowerCase().slice(0, 72);
    if (seen.has(key)) continue;
    const at = publishedAt(item.published);
    if (at && at < dayAgo) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= 8) break;
  }
  const stamped = stampNews(unique);
  tapeMemo = { at: Date.now(), value: stamped };
  return stamped;
}

export async function fetchFearGreed(): Promise<
  { value: number; label: string } | undefined
> {
  try {
    const body = await getJson<{
      data?: { value: string; value_classification: string }[];
    }>("https://api.alternative.me/fng/?limit=1");
    const row = body.data?.[0];
    if (!row) return undefined;
    return { value: Number(row.value), label: row.value_classification };
  } catch {
    return undefined;
  }
}

export async function fetchFunding(
  base: string,
  quote: string,
): Promise<{ rate: number; inst: string } | undefined> {
  try {
    const body = await getJson<{
      data?: { fundingRate: string; instId: string }[];
    }>(`${OKX}/public/funding-rate?instId=${base}-${quote}-SWAP`);
    const row = body.data?.[0];
    if (!row) return undefined;
    return { rate: Number(row.fundingRate), inst: row.instId };
  } catch {
    return undefined;
  }
}

export async function fetchKlines(
  symbol: string,
  interval: string,
  limit = 80,
): Promise<Candle[]> {
  const listed = assetOf(symbol);
  if (listed?.yahoo) {
    try {
      const pack = await fromYahoo(listed.yahoo, interval);
      return pack.candles.slice(-limit);
    } catch {
      return [];
    }
  }
  try {
    const rows = await getJson<VisionKline[]>(
      `${VISION}/klines?symbol=${symbol}&interval=${klineOf(interval)}&limit=${limit}`,
    );
    return rows.map(toCandle);
  } catch {
    return [];
  }
}

export async function fetchDerivatives(
  symbol: string,
): Promise<Derivatives | undefined> {
  const base = symbol.replace(/USDT$/, "");
  const instId = `${base}-USDT-SWAP`;
  try {
    const [oiBody, lsBody, liqBody] = await Promise.all([
      getJson<{
        data?: { oi: string; oiUsd?: string }[];
      }>(`${OKX}/public/open-interest?instType=SWAP&instId=${instId}`),
      getJson<{ data?: [string, string][] }>(
        `${OKX}/rubik/stat/contracts/long-short-account-ratio?ccy=${base}`,
      ),
      getJson<{
        data?: {
          details?: {
            posSide?: string;
            side?: string;
            sz?: string;
          }[];
        }[];
      }>(
        `${OKX}/public/liquidation-orders?instType=SWAP&uly=${base}-USDT&state=filled&limit=20`,
      ),
    ]);
    const oi = Number(oiBody.data?.[0]?.oi);
    if (!Number.isFinite(oi) || oi <= 0) return undefined;
    const ratios = lsBody.data ?? [];
    const latestRatio = Number(ratios[0]?.[1]);
    const olderRatio = Number(ratios[Math.min(ratios.length - 1, 24)]?.[1]);
    const longPct = latestRatio
      ? (latestRatio / (1 + latestRatio)) * 100
      : 50;
    const shortPct = 100 - longPct;
    const details = liqBody.data?.[0]?.details ?? [];
    let longLiq = 0;
    let shortLiq = 0;
    for (const row of details) {
      const sz = Number(row.sz);
      if (!Number.isFinite(sz)) continue;
      if (row.posSide === "long" || row.side === "sell") longLiq += sz;
      else shortLiq += sz;
    }
    const ratioDelta =
      latestRatio && olderRatio ? latestRatio - olderRatio : 0;
    let squeeze: Derivatives["squeeze"] = "balanced";
    if (longLiq > shortLiq * 2 && longLiq > 0) squeeze = "flushed";
    else if (longPct >= 60 && ratioDelta > 0.05) squeeze = "long-squeeze";
    else if (longPct <= 40 && ratioDelta < -0.05) squeeze = "short-squeeze";
    const liqLine =
      longLiq + shortLiq > 0
        ? `ликвидации: лонги ${longLiq.toFixed(2)} / шорты ${shortLiq.toFixed(2)}`
        : "свежих ликвидаций почти нет";
    const note =
      squeeze === "long-squeeze"
        ? `Лонгов ${longPct.toFixed(0)}% и они растут — риск сквиза лонгов. ${liqLine}`
        : squeeze === "short-squeeze"
          ? `Шортов ${shortPct.toFixed(0)}% и они растут — риск сквиза шортов. ${liqLine}`
          : squeeze === "flushed"
            ? `Уже выбивают лонги. ${liqLine}`
            : `Лонги/шорты ${longPct.toFixed(0)}/${shortPct.toFixed(0)}. ${liqLine}`;
    return {
      oi,
      oiChangePct: Number((ratioDelta * 10).toFixed(2)),
      longPct: Number(longPct.toFixed(1)),
      shortPct: Number(shortPct.toFixed(1)),
      squeeze,
      note,
    };
  } catch {
    return undefined;
  }
}

export async function fetchCorrelation(
  symbol: string,
  interval: string,
  candles: Candle[],
): Promise<{ vs: string; value: number; note: string } | undefined> {
  if (symbol === "BTCUSDT") return undefined;
  const btc = await fetchKlines("BTCUSDT", interval, 80);
  if (btc.length < 12 || candles.length < 12) return undefined;
  const value = pearson(returnsOf(candles), returnsOf(btc));
  const abs = Math.abs(value);
  const note =
    abs >= 0.75
      ? "Почти тащится за BTC — отдельный сигнал по альту слабее"
      : abs >= 0.4
        ? "Частично следует за BTC"
        : "Живёт своей жизнью относительно BTC";
  return { vs: "BTC", value: Number(value.toFixed(2)), note };
}

export async function fetchSector(base: string): Promise<SectorView | undefined> {
  const sector = SECTORS[base] ?? { name: "рынок", peers: [base, "BTC", "ETH"] };
  const symbols = Array.from(new Set(sector.peers)).map((item) => `${item}USDT`);
  const tickers = await fetchTickers(symbols);
  return rankSector(
    base,
    tickers.map((row) => ({
      base: row.symbol.replace("USDT", ""),
      change24h: row.change24h,
    })),
  );
}

export async function fetchMarketCap(base: string): Promise<number | undefined> {
  const id = GECKO_IDS[base];
  if (!id) return undefined;
  try {
    const rows = await getJson<{ market_cap?: number }[]>(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${id}&per_page=1`,
      5000,
    );
    return rows[0]?.market_cap;
  } catch {
    return undefined;
  }
}
