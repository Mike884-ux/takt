import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { DEFAULT_RISK, type RiskSettings } from "@/lib/spot-risk";

export type CloudHolding = {
  id: string;
  pair: string;
  symbol: string;
  entry: number;
  qty: number;
  target?: number;
  stop?: number;
};

export type CloudFill = {
  id: string;
  side: "buy" | "sell";
  pair: string;
  symbol: string;
  price: number;
  qty: number;
  usd: number;
  pnl?: number;
  at: number;
};

export type CloudBook = {
  cash: number;
  holdings: CloudHolding[];
  fills: CloudFill[];
  risk: RiskSettings;
  lastDaily: string;
  empty: boolean;
};

function asJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function clampRisk(risk: Partial<RiskSettings> | undefined): RiskSettings {
  const n = (v: number | undefined, d: number, min: number, max: number) => {
    const x = typeof v === "number" && Number.isFinite(v) ? v : d;
    return Math.min(max, Math.max(min, x));
  };
  const src = risk ?? {};
  return {
    cashMin: n(src.cashMin, DEFAULT_RISK.cashMin, 0.05, 0.4),
    maxCore: n(src.maxCore, DEFAULT_RISK.maxCore, 0.1, 0.8),
    maxAlt: n(src.maxAlt, DEFAULT_RISK.maxAlt, 0.05, 0.4),
    stopPct: n(src.stopPct, DEFAULT_RISK.stopPct, 0.03, 0.25),
    targetPct: n(src.targetPct, DEFAULT_RISK.targetPct, 0.05, 0.5),
    clipPct: n(src.clipPct, DEFAULT_RISK.clipPct, 0.05, 0.4),
    riskPerTrade: n(src.riskPerTrade, DEFAULT_RISK.riskPerTrade, 0.003, 0.03),
    maxMeme: n(src.maxMeme, DEFAULT_RISK.maxMeme, 0.05, 0.4),
  };
}

export const loadBook = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CloudBook> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      cash: number;
      holdings: unknown;
      fills: unknown;
      risk: unknown;
      last_daily: string;
    }>`
      select cash, holdings, fills, risk, last_daily
      from user_books
      where user_id = ${context.userId}
      limit 1
    `;
    const row = rows[0];
    if (!row) {
      return {
        cash: 0,
        holdings: [],
        fills: [],
        risk: DEFAULT_RISK,
        lastDaily: "",
        empty: true,
      };
    }
    const holdings = asJson<CloudHolding[]>(row.holdings, []);
    return {
      cash: Number(row.cash) || 0,
      holdings: Array.isArray(holdings) ? holdings : [],
      fills: asJson<CloudFill[]>(row.fills, []),
      risk: clampRisk(asJson<Partial<RiskSettings>>(row.risk, {})),
      lastDaily: row.last_daily ?? "",
      empty:
        holdings.length === 0 &&
        asJson<CloudFill[]>(row.fills, []).length === 0 &&
        !(Number(row.cash) > 0),
    };
  });

export const saveBook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Omit<CloudBook, "empty">) => ({
    cash: Math.max(0, Number(input.cash) || 0),
    holdings: (input.holdings ?? []).slice(0, 20),
    fills: (input.fills ?? []).slice(0, 80),
    risk: clampRisk(input.risk),
    lastDaily: String(input.lastDaily ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const holdings = JSON.stringify(data.holdings);
    const fills = JSON.stringify(data.fills);
    const risk = JSON.stringify(data.risk);
    await sql`
      insert into user_books (user_id, cash, holdings, fills, risk, last_daily, updated_at)
      values (${context.userId}, ${data.cash}, ${holdings}::jsonb, ${fills}::jsonb, ${risk}::jsonb, ${data.lastDaily}, now())
      on conflict (user_id) do update set
        cash = excluded.cash,
        holdings = excluded.holdings,
        fills = excluded.fills,
        risk = excluded.risk,
        last_daily = excluded.last_daily,
        updated_at = now()
    `;
    return { ok: true as const };
  });
