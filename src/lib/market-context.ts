import type { CalendarEvent, Candle, CoinRisk, SectorView } from "./types";

export const GECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  TON: "the-open-network",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  LTC: "litecoin",
  NEAR: "near",
  SUI: "sui",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  PEPE: "pepe",
  WIF: "dogwifcoin",
  BONK: "bonk",
  SHIB: "shiba-inu",
  ATOM: "cosmos",
  INJ: "injective-protocol",
  TIA: "celestia",
  SEI: "sei-network",
  AAVE: "aave",
  UNI: "uniswap",
  TRX: "tron",
};

export const SECTORS: Record<string, { name: string; peers: string[] }> = {
  BTC: { name: "мажоры", peers: ["BTC", "ETH"] },
  ETH: { name: "L1", peers: ["ETH", "SOL", "AVAX", "NEAR", "SUI", "ADA"] },
  SOL: { name: "L1", peers: ["ETH", "SOL", "AVAX", "NEAR", "SUI", "ADA"] },
  AVAX: { name: "L1", peers: ["ETH", "SOL", "AVAX", "NEAR", "SUI", "ADA"] },
  NEAR: { name: "L1", peers: ["ETH", "SOL", "AVAX", "NEAR", "SUI", "ADA"] },
  SUI: { name: "L1", peers: ["ETH", "SOL", "AVAX", "NEAR", "SUI", "ADA"] },
  ADA: { name: "L1", peers: ["ETH", "SOL", "AVAX", "NEAR", "SUI", "ADA"] },
  TON: { name: "L1", peers: ["ETH", "SOL", "TON", "NEAR", "SUI"] },
  APT: { name: "L1", peers: ["APT", "SUI", "NEAR", "SOL"] },
  ARB: { name: "L2", peers: ["ARB", "OP"] },
  OP: { name: "L2", peers: ["ARB", "OP"] },
  DOGE: { name: "мемы", peers: ["DOGE", "PEPE", "WIF", "BONK", "SHIB"] },
  PEPE: { name: "мемы", peers: ["DOGE", "PEPE", "WIF", "BONK", "SHIB"] },
  WIF: { name: "мемы", peers: ["DOGE", "PEPE", "WIF", "BONK", "SHIB"] },
  BONK: { name: "мемы", peers: ["DOGE", "PEPE", "WIF", "BONK", "SHIB"] },
  SHIB: { name: "мемы", peers: ["DOGE", "PEPE", "WIF", "BONK", "SHIB"] },
  LINK: { name: "DeFi", peers: ["LINK", "AAVE", "UNI"] },
  AAVE: { name: "DeFi", peers: ["LINK", "AAVE", "UNI"] },
  UNI: { name: "DeFi", peers: ["LINK", "AAVE", "UNI"] },
};

const FOMC: { at: number; title: string }[] = [
  "2026-01-28",
  "2026-03-18",
  "2026-05-06",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-11-04",
  "2026-12-16",
].map((day) => ({
  at: Date.parse(`${day}T18:00:00Z`),
  title: `FOMC ${day}`,
}));

function lastFridayOfMonth(year: number, month: number): Date {
  const date = new Date(Date.UTC(year, month + 1, 0));
  const offset = (date.getUTCDay() + 2) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}

function formatWhen(at: number): string {
  const delta = at - Date.now();
  const hours = Math.round(delta / 3_600_000);
  if (hours < 24 && hours >= 0) return `через ${hours} ч`;
  if (hours < 0 && hours > -24) return "сегодня / прошло";
  const days = Math.round(hours / 24);
  if (days >= 0 && days < 14) return `через ${days} д`;
  return new Date(at).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

export function upcomingEvents(base: string): CalendarEvent[] {
  const now = Date.now();
  const horizon = now + 14 * 24 * 3600_000;
  const events: CalendarEvent[] = [];

  for (const row of FOMC) {
    if (row.at >= now - 12 * 3600_000 && row.at <= horizon) {
      events.push({
        title: row.title,
        when: formatWhen(row.at),
        kind: "macro",
        impact: "Волатильность по BTC и всему рынку. Не наращивать размер до решения.",
      });
    }
  }

  const cursor = new Date();
  for (let i = 0; i < 2; i++) {
    const expiry = lastFridayOfMonth(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + i,
    );
    expiry.setUTCHours(8, 0, 0, 0);
    const at = expiry.getTime();
    if (at >= now && at <= horizon && (base === "BTC" || base === "ETH")) {
      events.push({
        title: `Экспирация опционов ${base}`,
        when: formatWhen(at),
        kind: "options",
        impact: "Возможны ложные пробои вокруг страйков. Размер меньше обычного.",
      });
    }
  }

  if (!events.length) {
    events.push({
      title: "Крупных дат в календаре нет",
      when: "14 дней",
      kind: "other",
      impact: "Смотри свежую ленту — внезапные новости важнее календаря.",
    });
  }
  return events.slice(0, 3);
}

export function returnsOf(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]?.c ?? 0;
    const cur = candles[i]?.c ?? 0;
    if (prev > 0) out.push((cur - prev) / prev);
  }
  return out;
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 8) return 0;
  const xa = a.slice(-n);
  const xb = b.slice(-n);
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += xa[i] ?? 0;
    sumB += xb[i] ?? 0;
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = (xa[i] ?? 0) - meanA;
    const db = (xb[i] ?? 0) - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  if (!den) return 0;
  return Math.max(-1, Math.min(1, num / den));
}

export function scoreRisk(input: {
  volumeUsd: number;
  atrPct: number;
  capUsd?: number;
  change24h: number;
}): CoinRisk {
  let score = 35;
  if (input.capUsd) {
    if (input.capUsd < 200_000_000) score += 28;
    else if (input.capUsd < 2_000_000_000) score += 14;
    else if (input.capUsd > 50_000_000_000) score -= 12;
  } else {
    score += 8;
  }
  if (input.volumeUsd < 20_000_000) score += 18;
  else if (input.volumeUsd < 80_000_000) score += 8;
  else if (input.volumeUsd > 1_000_000_000) score -= 8;
  if (input.atrPct > 6) score += 16;
  else if (input.atrPct > 3) score += 8;
  if (Math.abs(input.change24h) > 12) score += 10;
  score = Math.max(8, Math.min(96, Math.round(score)));
  const label: CoinRisk["label"] =
    score >= 70 ? "high" : score >= 48 ? "medium" : "low";
  const note =
    label === "high"
      ? "Мелкая или очень волатильная монета — даже верный сигнал ломается ликвидациями."
      : label === "medium"
        ? "Обычный альт: сигнал можно брать меньшим размером, чем по BTC."
        : "Ликвидность нормальная, риск самой монеты не главный ограничитель.";
  return {
    score,
    label,
    capUsd: input.capUsd,
    volumeUsd: input.volumeUsd,
    atrPct: Number(input.atrPct.toFixed(2)),
    note,
  };
}

export function rankSector(
  base: string,
  rows: { base: string; change24h: number }[],
): SectorView | undefined {
  const sector = SECTORS[base] ?? { name: "рынок", peers: [base, "BTC", "ETH"] };
  const peers = rows
    .filter((row) => sector.peers.includes(row.base) || row.base === base)
    .sort((a, b) => b.change24h - a.change24h);
  if (!peers.length) return undefined;
  const self = peers.find((row) => row.base === base);
  const rank = self ? peers.findIndex((row) => row.base === base) + 1 : peers.length;
  return {
    name: sector.name,
    rank,
    of: peers.length,
    change24h: self?.change24h ?? 0,
    peers: peers.slice(0, 5),
  };
}
