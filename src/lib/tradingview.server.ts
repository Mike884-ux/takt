import type { TvSnapshot } from "./types";
import { tvActionFromScore } from "./types";
import { assetOf } from "./markets";

const UA = "TaktAnalyst/1.0";
const SCAN = "https://scanner.tradingview.com";

const TF_SUFFIX: Record<string, string> = {
  "1m": "|1",
  "5m": "|5",
  "15m": "|15",
  "30m": "|30",
  "1h": "|60",
  "2h": "|120",
  "4h": "|240",
  "12h": "|720",
  "1d": "",
  "2d": "|120",
  "3d": "|3D",
  "10d": "|720",
  "1w": "|1W",
  "1M": "|1M",
};

function suffixFor(interval: string): string {
  return TF_SUFFIX[interval] ?? "";
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function candidates(base: string, quote: string): string[] {
  const pair = `${base}${quote}`;
  const usd = `${base}USD`;
  return [
    `BINANCE:${pair}`,
    `BYBIT:${pair}`,
    `OKX:${pair}`,
    `BITGET:${pair}`,
    `MEXC:${pair}`,
    `GATEIO:${pair}`,
    `KRAKEN:${pair}`,
    `COINBASE:${usd}`,
    `COINBASE:${base}${quote === "USDT" ? "USDC" : quote}`,
  ];
}

async function resolveSymbol(base: string, quote: string): Promise<string | null> {
  const listed = assetOf(base);
  if (listed?.tv) return listed.tv;
  const tickers = candidates(base, quote);
  try {
    const scanned = await postJson<{ data?: { s: string }[] }>(
      `${SCAN}/crypto/scan`,
      { symbols: { tickers }, columns: ["close"] },
    );
    const hit = scanned.data?.[0]?.s;
    if (hit) return hit;
  } catch {
    /* fall through */
  }

  try {
    const named = await postJson<{ data?: { s: string }[] }>(
      `${SCAN}/crypto/scan`,
      {
        filter: [{ left: "name", operation: "equal", right: `${base}${quote}` }],
        columns: ["name", "close"],
        range: [0, 1],
      },
    );
    return named.data?.[0]?.s ?? null;
  } catch {
    return null;
  }
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function fetchTradingView(
  base: string,
  quote: string,
  interval: string,
): Promise<TvSnapshot | undefined> {
  const symbol = await resolveSymbol(base, quote);
  if (!symbol) return undefined;

  const sfx = suffixFor(interval);
  const fields = [
    `Recommend.All${sfx}`,
    `Recommend.Other${sfx}`,
    `Recommend.MA${sfx}`,
    `RSI${sfx}`,
    `MACD.macd${sfx}`,
    `MACD.signal${sfx}`,
  ].join(",");

  const encoded = encodeURIComponent(symbol);
  const raw = await getJson<Record<string, unknown> | null>(
    `${SCAN}/symbol?symbol=${encoded}&fields=${encodeURIComponent(fields)}&no_404=true`,
  );
  if (!raw || typeof raw !== "object") return undefined;

  const summary = num(raw[`Recommend.All${sfx}`]);
  const oscillators = num(raw[`Recommend.Other${sfx}`]);
  const movingAverages = num(raw[`Recommend.MA${sfx}`]);
  if (summary === undefined) return undefined;

  return {
    symbol,
    summary,
    oscillators: oscillators ?? 0,
    movingAverages: movingAverages ?? 0,
    summaryLabel: tvActionFromScore(summary),
    oscillatorsLabel: tvActionFromScore(oscillators ?? 0),
    movingAveragesLabel: tvActionFromScore(movingAverages ?? 0),
    rsi: num(raw[`RSI${sfx}`]),
    macd: num(raw[`MACD.macd${sfx}`]),
    macdSignal: num(raw[`MACD.signal${sfx}`]),
  };
}
