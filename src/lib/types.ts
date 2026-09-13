export type Signal = "LONG" | "SHORT" | "WAIT";
export type NewsTone = "bull" | "bear" | "neutral";
export type NewsBias = "bullish" | "bearish" | "mixed" | "quiet";
export type MarketBias = "risk-on" | "risk-off" | "mixed";
export type TvAction =
  | "strong_buy"
  | "buy"
  | "neutral"
  | "sell"
  | "strong_sell";

export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  buyV?: number;
  quoteV?: number;
  buyQuote?: number;
};

export type NewsItem = {
  title: string;
  source: string;
  url: string;
  published: string;
  tone?: NewsTone;
};

export type Technicals = {
  rsi: number;
  ema9: number;
  ema21: number;
  ema50: number;
  macd: number;
  macdSignal: number;
  atr: number;
  trend: "up" | "down" | "range";
  volumeRatio: number;
};

export type VolumePack = {
  vwap: number;
  vsVwapPct: number;
  vwapSide: "above" | "below";
  delta: number;
  deltaPct: number;
  cvd: number;
  cvdBias: "buyers" | "sellers" | "even";
  relVol: number;
  spike: boolean;
  mfi: number;
};

export type TvSnapshot = {
  symbol: string;
  summary: number;
  oscillators: number;
  movingAverages: number;
  summaryLabel: TvAction;
  oscillatorsLabel: TvAction;
  movingAveragesLabel: TvAction;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
};

export type Flow = {
  buyPct: number;
  sellPct: number;
  lastBuyPct: number;
  bias: "buyers" | "sellers" | "even";
  buyVol: number;
  sellVol: number;
  lastBuyVol: number;
  lastSellVol: number;
  unit: "quote" | "base";
  bookBidPct?: number;
  bookAskPct?: number;
};

export type SqueezeBias = "long-squeeze" | "short-squeeze" | "flushed" | "balanced";

export type Derivatives = {
  oi: number;
  oiChangePct: number;
  longPct: number;
  shortPct: number;
  fundingPct?: number;
  squeeze: SqueezeBias;
  note: string;
};

export type TfBias = {
  interval: string;
  label: string;
  trend: "up" | "down" | "range";
  rsi: number;
};

export type Correlation = {
  vs: string;
  value: number;
  note: string;
};

export type SectorPeer = {
  base: string;
  change24h: number;
};

export type SectorView = {
  name: string;
  rank: number;
  of: number;
  change24h: number;
  peers: SectorPeer[];
};

export type CoinRisk = {
  score: number;
  label: "low" | "medium" | "high";
  capUsd?: number;
  volumeUsd: number;
  atrPct: number;
  note: string;
};

export type VolRegime = "quiet" | "normal" | "hot" | "extreme";

export type VolPack = {
  atr: number;
  atrPct: number;
  realizedPct: number;
  rangePct: number;
  regime: VolRegime;
  label: string;
  hint: string;
  stopHint: string;
};

export type VolRow = {
  pair: string;
  symbol: string;
  atrPct: number;
  realizedPct: number;
  rangePct: number;
  regime: VolRegime;
  label: string;
  weightPct: number;
  hint: string;
};

export type VolDesk = {
  headline: string;
  regime: VolRegime;
  portfolioPct: number;
  rows: VolRow[];
  note: string;
};

export type TradePlan = {
  side: Signal;
  entryTf: string;
  entryTfLabel: string;
  entryTfWhy: string;
  stopPrice: number;
  targetPrice: number;
  riskPct: number;
  rewardPct: number;
  rr: number;
  loseOn1k: number;
  winOn1k: number;
  sizeRule: string;
  control: string;
};

export type BookAction = "hold" | "take" | "cut" | "wait" | "trim" | "add";

export type BookAdvice = {
  headline: string;
  overall: string;
  items: { pair: string; action: BookAction; why: string }[];
  flags?: string[];
  interval?: string;
  riskScore?: number;
  riskGrade?: "low" | "medium" | "high" | "extreme";
  riskWhy?: string;
  source: "ai" | "fallback";
};

export type SpotPick = {
  pair: string;
  symbol: string;
  action: "buy" | "wait" | "avoid";
  sizePct: number;
  risk: "low" | "medium" | "high";
  why: string;
  stopPct: number;
};

export type SpotIdeaDesk = {
  headline: string;
  cashRule: string;
  picks: SpotPick[];
  source: "ai" | "fallback";
};

export type CalendarEvent = {
  title: string;
  when: string;
  kind: "macro" | "unlock" | "options" | "other";
  impact: string;
};

export type SignalStats = {
  sample: number;
  hitRate: number;
  lastNote: string;
};

export type AnalysisVerdict = {
  signal: Signal;
  confidence: number;
  headline: string;
  thesis: string;
  entryZone: string;
  stop: string;
  targets: string[];
  exit: string;
  happened: string;
  reasons: string[];
  risks: string[];
  newsImpact: string;
  newsTone: NewsBias;
  whyNot: string;
  invalidation: string;
  ifLong: string;
  ifShort: string;
  confidenceDrags: string[];
  entryTf?: string;
  entryTfWhy?: string;
  control?: string;
  source: "ai" | "technicals";
};

export type ParsedPair = {
  symbol: string;
  base: string;
  quote: string;
  interval: string;
  intervalLabel: string;
};

export type MarketQuote = {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume: number;
  source: string;
};

export type MarketSnapshot = {
  parsed: ParsedPair;
  market: MarketQuote;
  technicals: Technicals;
  candles: Candle[];
  flow?: Flow;
  volume?: VolumePack;
  funding?: { rate: number; inst: string };
  derivatives?: Derivatives;
  vol?: VolPack;
};

export type AnalysisOk = {
  ok: true;
  parsed: ParsedPair;
  market: MarketQuote;
  technicals: Technicals;
  candles: Candle[];
  news: NewsItem[];
  flow?: Flow;
  volume?: VolumePack;
  fearGreed?: { value: number; label: string };
  funding?: { rate: number; inst: string };
  tradingView?: TvSnapshot;
  derivatives?: Derivatives;
  higherTf?: TfBias[];
  correlation?: Correlation;
  sector?: SectorView;
  risk?: CoinRisk;
  vol?: VolPack;
  events?: CalendarEvent[];
  stats?: SignalStats;
  plan?: TradePlan;
  analysis: AnalysisVerdict;
};

export type AnalysisErr = {
  ok: false;
  error: string;
  hint?: string;
};

export type AnalysisResult = AnalysisOk | AnalysisErr;

export type AnalystContext = {
  pair: string;
  interval: string;
  price: number;
  change24h: number;
  signal: Signal;
  confidence: number;
  headline: string;
  thesis: string;
  entryZone: string;
  stop: string;
  targets: string[];
  exit?: string;
  happened?: string;
  rsi: number;
  trend: string;
  newsImpact: string;
  newsTone: NewsBias;
  whyNot: string;
  invalidation: string;
  news: string[];
  tvSummary?: string;
  flow?: string;
  volume?: string;
  funding?: string;
  oi?: string;
  mtf?: string;
  correlation?: string;
  risk?: string;
  vol?: string;
  plan?: string;
};

export type TraderStance = "attack" | "hold" | "defend";

export type TraderPlan = {
  headline: string;
  stance: TraderStance;
  now: string;
  why: string;
  steps: { title: string; body: string }[];
  book: { pair: string; do: string }[];
  avoid: string[];
  watch: string[];
  source: "ai" | "fallback";
};

export type MarketBrief = {
  headline: string;
  bias: MarketBias;
  body: string;
  watch: string[];
  source: "ai" | "fallback";
};

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
};

export type NewsEvent =
  | "hack"
  | "etf"
  | "listing"
  | "regulation"
  | "macro"
  | "whale"
  | "other";

export type NewsPlay = "follow" | "fade" | "wait";

export type NewsTrade = {
  pair: string;
  base: string;
  signal: Signal;
  event: NewsEvent;
  play: NewsPlay;
  title: string;
  why: string;
  url: string;
  source: string;
};

export type NewsDesk = {
  trades: NewsTrade[];
  source: "ai" | "headlines";
};

export type ChatMessage = {
  id: string;
  role: "user" | "bot";
  text?: string;
  analysis?: AnalysisOk;
  snapshot?: MarketSnapshot;
  briefing?: MarketBrief;
  newsDesk?: NewsDesk;
  book?: BookAdvice;
  spotDesk?: SpotIdeaDesk;
  strategy?: TraderPlan;
  volDesk?: VolDesk;
  error?: string;
  hint?: string;
  createdAt: number;
};

export const INTERVALS = [
  { id: "5m", label: "5м", full: "5 минут" },
  { id: "15m", label: "15м", full: "15 минут" },
  { id: "30m", label: "30м", full: "30 минут" },
  { id: "1h", label: "1ч", full: "1 час" },
  { id: "4h", label: "4ч", full: "4 часа" },
  { id: "1d", label: "1д", full: "1 день" },
] as const;

export const BOOK_TFS = [
  { id: "5m", label: "5м", kline: "5m", full: "5 минут" },
  { id: "15m", label: "15м", kline: "15m", full: "15 минут" },
  { id: "30m", label: "30м", kline: "30m", full: "30 минут" },
  { id: "1h", label: "1ч", kline: "1h", full: "1 час" },
  { id: "4h", label: "4ч", kline: "4h", full: "4 часа" },
  { id: "12h", label: "12ч", kline: "12h", full: "12 часов" },
  { id: "1d", label: "1д", kline: "1d", full: "1 день" },
  { id: "2d", label: "2д", kline: "2h", full: "2 дня" },
  { id: "3d", label: "3д", kline: "3d", full: "3 дня" },
  { id: "10d", label: "10д", kline: "12h", full: "10 дней" },
  { id: "1w", label: "1н", kline: "1w", full: "1 неделя" },
  { id: "1M", label: "1мес", kline: "1M", full: "1 месяц" },
] as const;

export const CURVE_RANGES = [
  { id: "24h", label: "24ч" },
  { id: "2d", label: "2д" },
  { id: "3d", label: "3д" },
  { id: "7d", label: "7д" },
  { id: "10d", label: "10д" },
  { id: "30d", label: "1мес" },
  { id: "all", label: "Всё" },
] as const;

export type CurveRange = (typeof CURVE_RANGES)[number]["id"];

const BOOK_TF_IDS: ReadonlySet<string> = new Set(BOOK_TFS.map((item) => item.id));

export function asBookTf(value?: string): string {
  return value && BOOK_TF_IDS.has(value) ? value : "1d";
}

const NATIVE_KLINES = new Set([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
]);

export function klineOf(tf: string): string {
  const mapped = BOOK_TFS.find((item) => item.id === tf)?.kline;
  if (mapped) return mapped;
  if (NATIVE_KLINES.has(tf)) return tf;
  return "1d";
}

export function bookTfLabel(tf: string): string {
  return BOOK_TFS.find((item) => item.id === tf)?.label ?? tf;
}

export const QUICK_PAIRS = [
  "BTC/USDT",
  "ETH/USDT",
  "GOLD/USD",
  "AAPL/USD",
  "NVDA/USD",
  "TSLA/USD",
  "DOGE/USDT",
  "SOL/USDT",
] as const;

export const FOLLOWUP_PROMPTS: Record<Signal, string[]> = {
  LONG: [
    "На каком таймфрейме входить?",
    "Сколько риск и плюс?",
    "Как вести позицию?",
  ],
  SHORT: [
    "На каком таймфрейме шортить?",
    "Сколько риск и плюс?",
    "Когда резать убыток?",
  ],
  WAIT: [
    "Почему не входить сейчас?",
    "Какой ТФ ждать?",
    "Если уже купил — что делать?",
  ],
};

export const TV_ACTION_COPY: Record<
  TvAction,
  { ru: string; tone: "long" | "short" | "wait" }
> = {
  strong_buy: { ru: "Сильная покупка", tone: "long" },
  buy: { ru: "Покупка", tone: "long" },
  neutral: { ru: "Нейтрально", tone: "wait" },
  sell: { ru: "Продажа", tone: "short" },
  strong_sell: { ru: "Сильная продажа", tone: "short" },
};

export function tvActionFromScore(value: number): TvAction {
  if (value >= 0.5) return "strong_buy";
  if (value >= 0.1) return "buy";
  if (value <= -0.5) return "strong_sell";
  if (value <= -0.1) return "sell";
  return "neutral";
}

export function tvWidgetInterval(id: string): string {
  switch (id) {
    case "1m":
      return "1";
    case "5m":
      return "5";
    case "15m":
      return "15";
    case "30m":
      return "30";
    case "1h":
      return "60";
    case "4h":
      return "240";
    case "1d":
      return "D";
    case "2d":
    case "2h":
      return "120";
    case "3d":
      return "3D";
    case "12h":
    case "10d":
      return "720";
    case "1w":
      return "W";
    case "1M":
      return "M";
    default:
      return "60";
  }
}

export function toAnalystContext(result: AnalysisOk): AnalystContext {
  const tv = result.tradingView;
  return {
    pair: `${result.parsed.base}/${result.parsed.quote}`,
    interval: result.parsed.intervalLabel,
    price: result.market.price,
    change24h: result.market.change24h,
    signal: result.analysis.signal,
    confidence: result.analysis.confidence,
    headline: result.analysis.headline,
    thesis: result.analysis.thesis,
    entryZone: result.analysis.entryZone,
    stop: result.analysis.stop,
    targets: result.analysis.targets,
    exit: result.analysis.exit,
    happened: result.analysis.happened,
    rsi: result.technicals.rsi,
    trend: result.technicals.trend,
    newsImpact: result.analysis.newsImpact,
    newsTone: result.analysis.newsTone,
    whyNot: result.analysis.whyNot,
    invalidation: result.analysis.invalidation,
    news: result.news.slice(0, 5).map((item) => item.title),
    tvSummary: tv
      ? `${tv.symbol} сводка ${TV_ACTION_COPY[tv.summaryLabel].ru} (${tv.summary.toFixed(2)}), осцилляторы ${TV_ACTION_COPY[tv.oscillatorsLabel].ru}, MA ${TV_ACTION_COPY[tv.movingAveragesLabel].ru}`
      : undefined,
    flow: result.flow
      ? `покупки ${result.flow.buyPct}% / продажи ${result.flow.sellPct}%, последняя свеча ${result.flow.lastBuyPct}% покупок (${result.flow.lastBuyVol.toFixed(0)} vs ${result.flow.lastSellVol.toFixed(0)})`
      : undefined,
    volume: result.volume
      ? `VWAP ${result.volume.vwap.toFixed(4)} (${result.volume.vwapSide} ${result.volume.vsVwapPct}%), CVD ${result.volume.cvdBias}, RelVol ${result.volume.relVol}x, MFI ${result.volume.mfi}`
      : undefined,
    funding: result.funding
      ? `${(result.funding.rate * 100).toFixed(4)}% ${result.funding.inst}`
      : undefined,
    oi: result.derivatives?.note,
    mtf: result.higherTf
      ?.map((row) => `${row.label} ${row.trend === "up" ? "вверх" : row.trend === "down" ? "вниз" : "боковик"} RSI ${row.rsi}`)
      .join("; "),
    correlation: result.correlation
      ? `${result.correlation.vs} ${result.correlation.value.toFixed(2)}`
      : undefined,
    risk: result.risk
      ? `${result.risk.label} ${result.risk.score}`
      : undefined,
    vol: result.vol
      ? `${result.vol.label} ATR ${result.vol.atrPct}% ход ${result.vol.realizedPct}%`
      : undefined,
    plan: result.plan
      ? `ТФ ${result.plan.entryTfLabel}. Риск ${result.plan.riskPct}% (−$${result.plan.loseOn1k} на $1000) / плюс ${result.plan.rewardPct}% (+$${result.plan.winOn1k}). R:R 1:${result.plan.rr}. ${result.plan.control}`
      : undefined,
  };
}
