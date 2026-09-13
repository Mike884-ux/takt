export type SpotLot = {
  id?: string;
  pair: string;
  symbol: string;
  entry: number;
  qty: number;
  target?: number;
  stop?: number;
};

export type RiskSettings = {
  cashMin: number;
  maxCore: number;
  maxAlt: number;
  stopPct: number;
  targetPct: number;
  clipPct: number;
  riskPerTrade: number;
  maxMeme: number;
};

export const SPOT_UNIVERSE = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "TONUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "SUIUSDT",
  "DOGEUSDT",
  "PEPEUSDT",
] as const;

export const DEFAULT_RISK: RiskSettings = {
  cashMin: 0.1,
  maxCore: 0.4,
  maxAlt: 0.18,
  stopPct: 0.1,
  targetPct: 0.18,
  clipPct: 0.15,
  riskPerTrade: 0.01,
  maxMeme: 0.15,
};

export const RISK_PRESETS: Record<
  "cautious" | "normal" | "aggressive",
  { label: string; hint: string; risk: RiskSettings }
> = {
  cautious: {
    label: "Осторожный",
    hint: "Больше кэша, узкий стоп, мемы почти не держим",
    risk: {
      cashMin: 0.2,
      maxCore: 0.5,
      maxAlt: 0.12,
      stopPct: 0.08,
      targetPct: 0.14,
      clipPct: 0.1,
      riskPerTrade: 0.005,
      maxMeme: 0.08,
    },
  },
  normal: {
    label: "Обычный",
    hint: "1% капитала на сделку, альт до 18%",
    risk: DEFAULT_RISK,
  },
  aggressive: {
    label: "Агрессивный",
    hint: "Шире стоп, больше альта — только если готов к просадке",
    risk: {
      cashMin: 0.05,
      maxCore: 0.45,
      maxAlt: 0.25,
      stopPct: 0.15,
      targetPct: 0.28,
      clipPct: 0.22,
      riskPerTrade: 0.02,
      maxMeme: 0.25,
    },
  },
};

export function levelsOf(entry: number, risk: RiskSettings) {
  return {
    stop: entry * (1 - risk.stopPct),
    target: entry * (1 + risk.targetPct),
  };
}

export function isCore(symbol: string) {
  return symbol === "BTCUSDT" || symbol === "ETHUSDT";
}

export function holdingValue(row: SpotLot, price: number) {
  return price * row.qty;
}

export function bookStats(
  holdings: SpotLot[],
  prices: Map<string, number>,
  cash: number,
  risk: RiskSettings = DEFAULT_RISK,
) {
  const rows = holdings.map((row) => {
    const price = prices.get(row.symbol) ?? row.entry;
    const value = holdingValue(row, price);
    const pnl = (price - row.entry) * row.qty;
    const pct = row.entry > 0 ? ((price - row.entry) / row.entry) * 100 : 0;
    return { row, price, value, pnl, pct };
  });
  const deployed = rows.reduce((sum, item) => sum + item.value, 0);
  const equity = Math.max(0, cash + deployed);
  const cashPct = equity > 0 ? cash / equity : 0;
  const marked = rows.map((item) => {
    const weight = equity > 0 ? item.value / equity : 0;
    const cap = isCore(item.row.symbol) ? risk.maxCore : risk.maxAlt;
    return { ...item, weight, cap, over: weight > cap + 0.01 };
  });
  const flags: string[] = [];
  if (cash > 1 && cashPct < risk.cashMin) {
    flags.push(
      `Кэш ${(cashPct * 100).toFixed(0)}% — мало, держать ≥${Math.round(risk.cashMin * 100)}%`,
    );
  }
  for (const item of marked) {
    if (item.over) {
      flags.push(
        `${item.row.pair} ${(item.weight * 100).toFixed(0)}% — потолок ${Math.round(item.cap * 100)}%`,
      );
    }
    if (item.row.stop && item.price <= item.row.stop) {
      flags.push(`${item.row.pair}: стоп — продавать по рынку`);
    }
    if (item.row.target && item.price >= item.row.target) {
      flags.push(`${item.row.pair}: цель — можно продавать`);
    }
  }
  return { rows: marked, deployed, cash, equity, cashPct, flags };
}

export type RiskGrade = "low" | "medium" | "high" | "extreme";

const MEME = new Set(["DOGEUSDT", "PEPEUSDT", "SHIBUSDT", "WIFUSDT", "BONKUSDT"]);

export function portfolioRisk(
  holdings: SpotLot[],
  prices: Map<string, number>,
  changes: Map<string, number>,
  cash: number,
  risk: RiskSettings = DEFAULT_RISK,
) {
  const stats = bookStats(holdings, prices, cash, risk);
  let score = 88;
  const notes: string[] = [];
  const max = stats.rows.reduce(
    (best, row) => (row.weight > best.weight ? row : best),
    stats.rows[0] ?? {
      weight: 0,
      row: { pair: "", symbol: "", entry: 0, qty: 0 },
      pnl: 0,
      pct: 0,
    },
  );
  if (max && max.weight >= 0.7) {
    score -= 32;
    notes.push(`${max.row.pair} ${(max.weight * 100).toFixed(0)}% портфеля — слишком много в одном`);
  } else if (max && max.weight >= 0.5) {
    score -= 18;
    notes.push(`${max.row.pair} больше половины портфеля`);
  }
  const memeW = stats.rows
    .filter((row) => MEME.has(row.row.symbol))
    .reduce((sum, row) => sum + row.weight, 0);
  if (memeW >= risk.maxMeme + 0.05) {
    score -= 22;
    notes.push(`Мемы ${(memeW * 100).toFixed(0)}% — резкие просадки вероятны`);
  } else if (memeW >= risk.maxMeme) {
    score -= 10;
    notes.push(`Мемы ${(memeW * 100).toFixed(0)}% портфеля`);
  }
  const alts = stats.rows.filter((row) => !isCore(row.row.symbol)).length;
  if (alts >= 4) {
    score -= 10;
    notes.push(`${alts} альтов — размазано, сложнее контролировать`);
  }
  if (holdings.length === 1 && max && !isCore(max.row.symbol)) {
    score -= 12;
    notes.push("Одна альт без ядра — нет подушки");
  }
  for (const row of stats.rows) {
    if (row.pct <= -12) {
      score -= 8;
      notes.push(`${row.row.pair} ${row.pct.toFixed(0)}% от входа`);
    }
    const chg = changes.get(row.row.symbol);
    if (chg !== undefined && Math.abs(chg) >= 8 && row.weight >= 0.15) {
      score -= 6;
      notes.push(`${row.row.pair} за сутки ${chg.toFixed(1)}% — позиция дёргается`);
    }
  }
  score = Math.max(8, Math.min(98, Math.round(score)));
  const grade: RiskGrade =
    score >= 75 ? "low" : score >= 55 ? "medium" : score >= 35 ? "high" : "extreme";
  const label =
    grade === "low"
      ? "риск низкий"
      : grade === "medium"
        ? "риск средний"
        : grade === "high"
          ? "риск высокий"
          : "риск очень высокий";
  if (!notes.length) {
    notes.push("Концентрация в норме, резких дыр не видно.");
  }
  return { score, grade, label, notes: notes.slice(0, 5), stats };
}

export function bucketOf(symbol: string): "core" | "growth" | "spec" {
  if (isCore(symbol)) return "core";
  if (MEME.has(symbol)) return "spec";
  return "growth";
}

export function manageRisk(
  holdings: SpotLot[],
  prices: Map<string, number>,
  changes: Map<string, number>,
  cash: number,
  risk: RiskSettings = DEFAULT_RISK,
) {
  const scored = portfolioRisk(holdings, prices, changes, cash, risk);
  const { stats } = scored;
  const rows = stats.rows.map((item) => {
    const auto = levelsOf(item.row.entry, risk);
    const stop = item.row.stop && item.row.stop > 0 ? item.row.stop : auto.stop;
    const target =
      item.row.target && item.row.target > 0 ? item.row.target : auto.target;
    const atRisk = Math.max(0, (item.price - stop) * item.row.qty);
    const toStop = item.price > 0 ? ((stop - item.price) / item.price) * 100 : 0;
    const toTarget =
      item.price > 0 ? ((target - item.price) / item.price) * 100 : 0;
    const riskUnit = Math.max(item.row.entry - stop, item.row.entry * 0.001);
    const rr = (target - item.row.entry) / riskUnit;
    const bucket = bucketOf(item.row.symbol);
    const stopHit = item.price <= stop;
    const targetHit = item.price >= target;
    const nearStop = !stopHit && toStop > -4;
    return {
      ...item,
      stop,
      target,
      atRisk,
      toStop,
      toTarget,
      rr,
      bucket,
      stopHit,
      targetHit,
      nearStop,
      missingStop: !(item.row.stop && item.row.stop > 0),
    };
  });
  const moneyAtRisk = rows.reduce((sum, row) => sum + row.atRisk, 0);
  const openPct = stats.equity > 0 ? moneyAtRisk / stats.equity : 0;
  const budget = stats.equity * risk.riskPerTrade;
  const buckets = {
    core: rows.filter((r) => r.bucket === "core").reduce((s, r) => s + r.weight, 0),
    growth: rows
      .filter((r) => r.bucket === "growth")
      .reduce((s, r) => s + r.weight, 0),
    spec: rows.filter((r) => r.bucket === "spec").reduce((s, r) => s + r.weight, 0),
  };
  const shock = (symbol: string) => {
    if (isCore(symbol)) return 0.82;
    if (MEME.has(symbol)) return 0.5;
    return 0.68;
  };
  const crashValue =
    cash +
    rows.reduce((sum, row) => sum + row.value * shock(row.row.symbol), 0);
  const crashPct =
    stats.equity > 0 ? ((crashValue - stats.equity) / stats.equity) * 100 : 0;
  const actions: string[] = [];
  if (rows.some((r) => r.missingStop)) {
    actions.push("Проставить стопы — без стопа позиция бесконечная");
  }
  for (const row of rows) {
    if (row.stopHit) {
      actions.push(`${row.row.pair}: цена на стопе — продавать, не усреднять`);
    } else if (row.nearStop) {
      actions.push(
        `${row.row.pair}: до стопа ${row.toStop.toFixed(1)}% — не докупать`,
      );
    }
    if (row.targetHit) {
      actions.push(`${row.row.pair}: цель — зафиксировать часть`);
    }
    if (row.over) {
      actions.push(
        `${row.row.pair}: вес ${(row.weight * 100).toFixed(0)}% — урезать`,
      );
    }
    if (row.atRisk > budget * 1.4 && stats.equity > 1) {
      actions.push(
        `${row.row.pair}: в риске $${row.atRisk.toFixed(0)} при бюджете $${budget.toFixed(0)} — меньше размер или ближе стоп`,
      );
    }
  }
  if (buckets.spec > risk.maxMeme) {
    actions.push(
      `Мемы ${(buckets.spec * 100).toFixed(0)}% — потолок ${Math.round(risk.maxMeme * 100)}%`,
    );
  }
  if (buckets.core < 0.25 && stats.deployed > 0 && buckets.spec + buckets.growth > 0.5) {
    actions.push("Нет ядра BTC/ETH — в просадке альты падают вместе");
  }
  if (openPct > 0.08) {
    actions.push(
      `Открытый риск ${(openPct * 100).toFixed(1)}% капитала — много, если рынок глянет вниз`,
    );
  }
  return {
    scored,
    stats,
    rows,
    moneyAtRisk,
    openPct,
    budget,
    buckets,
    crashValue,
    crashPct,
    actions: actions.slice(0, 6),
  };
}

export function sizeForBuy(
  symbol: string,
  equity: number,
  cash: number,
  sizePct: number,
  risk: RiskSettings = DEFAULT_RISK,
) {
  const cap = isCore(symbol) ? risk.maxCore : risk.maxAlt;
  const fromBudget = risk.riskPerTrade / Math.max(risk.stopPct, 0.01);
  const want = equity * Math.min(sizePct / 100, cap, risk.clipPct, fromBudget);
  const room = Math.max(0, cash - equity * risk.cashMin);
  return Math.max(0, Math.min(want, room, cash));
}

export function pairOf(symbol: string) {
  if (symbol.endsWith("USDT")) return `${symbol.slice(0, -4)}/USDT`;
  if (symbol.endsWith("USD")) return `${symbol.slice(0, -3)}/USD`;
  if (symbol.endsWith("RUB")) return `${symbol.slice(0, -3)}/RUB`;
  return `${symbol}/USDT`;
}

export const SPOT_COINS: {
  symbol: string;
  base: string;
  name: string;
  tone: string;
}[] = [
  { symbol: "BTCUSDT", base: "BTC", name: "Bitcoin", tone: "#c9a06a" },
  { symbol: "ETHUSDT", base: "ETH", name: "Ethereum", tone: "#8fa3c4" },
  { symbol: "BNBUSDT", base: "BNB", name: "BNB", tone: "#c4b06a" },
  { symbol: "SOLUSDT", base: "SOL", name: "Solana", tone: "#7aa9a0" },
  { symbol: "XRPUSDT", base: "XRP", name: "XRP", tone: "#8a96a8" },
  { symbol: "TONUSDT", base: "TON", name: "Toncoin", tone: "#6e9bb8" },
  { symbol: "AVAXUSDT", base: "AVAX", name: "Avalanche", tone: "#c48484" },
  { symbol: "LINKUSDT", base: "LINK", name: "Chainlink", tone: "#6e8ec4" },
  { symbol: "SUIUSDT", base: "SUI", name: "Sui", tone: "#6e9ad0" },
  { symbol: "DOGEUSDT", base: "DOGE", name: "Dogecoin", tone: "#c4b07a" },
  { symbol: "PEPEUSDT", base: "PEPE", name: "Pepe", tone: "#7aad7a" },
  { symbol: "GOLDUSD", base: "GOLD", name: "Золото", tone: "#c9a06a" },
  { symbol: "SILVERUSD", base: "SILVER", name: "Серебро", tone: "#a8b0b8" },
  { symbol: "AAPLUSD", base: "AAPL", name: "Apple", tone: "#8fa3c4" },
  { symbol: "NVDAUSD", base: "NVDA", name: "Nvidia", tone: "#7aad7a" },
  { symbol: "TSLAUSD", base: "TSLA", name: "Tesla", tone: "#c48484" },
];

export function coinOf(symbol: string) {
  return (
    SPOT_COINS.find((item) => item.symbol === symbol) ?? {
      symbol,
      base: symbol.replace(/USDT$|USD$|RUB$/, ""),
      name: symbol.replace(/USDT$|USD$|RUB$/, ""),
      tone: "#8b959e",
    }
  );
}
