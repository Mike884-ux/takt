import { getSql } from "./db";
import type { Signal, SignalStats } from "./types";

const HORIZON_MS: Record<string, number> = {
  "5m": 2 * 3600_000,
  "15m": 4 * 3600_000,
  "30m": 8 * 3600_000,
  "1h": 12 * 3600_000,
  "2h": 24 * 3600_000,
  "4h": 24 * 3600_000,
  "12h": 48 * 3600_000,
  "1d": 72 * 3600_000,
  "2d": 4 * 24 * 3600_000,
  "3d": 6 * 24 * 3600_000,
  "10d": 12 * 24 * 3600_000,
  "1w": 14 * 24 * 3600_000,
  "1M": 45 * 24 * 3600_000,
};

type SignalRow = {
  id: number;
  symbol: string;
  pair: string;
  interval: string;
  signal: string;
  confidence: number;
  price: number;
  created_at: string;
  check_after: string;
  checked_at: string | null;
  result_price: number | null;
  outcome: string | null;
};

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function grade(signal: string, entry: number, later: number): string {
  if (signal === "WAIT") return "skip";
  const move = (later - entry) / entry;
  if (signal === "LONG") {
    if (move >= 0.004) return "win";
    if (move <= -0.004) return "loss";
    return "flat";
  }
  if (signal === "SHORT") {
    if (move <= -0.004) return "win";
    if (move >= 0.004) return "loss";
    return "flat";
  }
  return "skip";
}

export async function settleDue(symbol: string, price: number): Promise<void> {
  try {
    const sql = await getSql();
    const due = await sql<SignalRow>`
      select * from signals
      where symbol = ${symbol}
        and checked_at is null
        and check_after <= now()
      order by id asc
      limit 40
    `;
    for (const row of due) {
      const outcome = grade(row.signal, asNumber(row.price), price);
      await sql`
        update signals
        set checked_at = now(),
            result_price = ${price},
            outcome = ${outcome}
        where id = ${row.id}
      `;
    }
  } catch {
    /* preview db may still be migrating */
  }
}

export async function recordSignal(input: {
  symbol: string;
  pair: string;
  interval: string;
  signal: Signal;
  confidence: number;
  price: number;
}): Promise<void> {
  try {
    const sql = await getSql();
    const horizon = HORIZON_MS[input.interval] ?? 12 * 3600_000;
    const checkAfter = new Date(Date.now() + horizon).toISOString();
    await sql`
      insert into signals (symbol, pair, interval, signal, confidence, price, check_after)
      values (
        ${input.symbol},
        ${input.pair},
        ${input.interval},
        ${input.signal},
        ${input.confidence},
        ${input.price},
        ${checkAfter}
      )
    `;
  } catch {
    /* ignore */
  }
}

export async function signalStats(symbol: string): Promise<SignalStats> {
  try {
    const sql = await getSql();
    const rows = await sql<{ outcome: string | null }>`
      select outcome from signals
      where symbol = ${symbol}
        and outcome is not null
        and outcome <> 'skip'
      order by id desc
      limit 80
    `;
    const scored = rows.filter(
      (row) => row.outcome === "win" || row.outcome === "loss" || row.outcome === "flat",
    );
    const wins = scored.filter((row) => row.outcome === "win").length;
    const sample = scored.length;
    const hitRate = sample ? Math.round((wins / sample) * 100) : 0;
    const lastNote = sample
      ? `По ${symbol.replace("USDT", "")}: ${wins} из ${sample} сработали`
      : "Ещё мало закрытых сигналов — статистика появится после первых проверок";
    return { sample, hitRate, lastNote };
  } catch {
    return {
      sample: 0,
      hitRate: 0,
      lastNote: "История сигналов ещё пустая",
    };
  }
}

export async function listSignals(limit = 40): Promise<
  {
    id: number;
    pair: string;
    interval: string;
    signal: string;
    confidence: number;
    price: number;
    createdAt: string;
    outcome: string | null;
    resultPrice: number | null;
  }[]
> {
  const sql = await getSql();
  const cap = Math.min(200, Math.max(1, Math.floor(limit)));
  const rows = await sql.query<SignalRow>(
    `select * from signals order by id desc limit ${cap}`,
  );
  return rows.map((row) => ({
    id: row.id,
    pair: row.pair,
    interval: row.interval,
    signal: row.signal,
    confidence: row.confidence,
    price: asNumber(row.price),
    createdAt: String(row.created_at),
    outcome: row.outcome,
    resultPrice: row.result_price === null ? null : asNumber(row.result_price),
  }));
}
