import type {
  AnalysisVerdict,
  Candle,
  CoinRisk,
  Correlation,
  Derivatives,
  Flow,
  NewsBias,
  NewsItem,
  Signal,
  Technicals,
  TfBias,
  TradePlan,
  VolPack,
  VolumePack,
} from "./types";

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    const value = values[i] ?? 0;
    prev = i === 0 ? value : value * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function last(values: number[], fallback = 0): number {
  return values[values.length - 1] ?? fallback;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    if (delta >= 0) avgGain += delta;
    else avgLoss -= delta;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const delta = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i]!;
    const prev = candles[i - 1]!;
    trs.push(
      Math.max(
        cur.h - cur.l,
        Math.abs(cur.h - prev.c),
        Math.abs(cur.l - prev.c),
      ),
    );
  }
  const slice = trs.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

export function computeVolatility(candles: Candle[], price: number): VolPack {
  const atrAbs = atr(candles, 14);
  const px = price > 0 ? price : candles.at(-1)?.c ?? 0;
  const atrPct = px > 0 ? (atrAbs / px) * 100 : 0;
  const closes = candles.map((c) => c.c);
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1] ?? 0;
    if (prev > 0) rets.push(((closes[i] ?? 0) - prev) / prev);
  }
  const sample = rets.slice(-20);
  const n = sample.length;
  const mean = n ? sample.reduce((sum, v) => sum + v, 0) / n : 0;
  const variance =
    n > 1
      ? sample.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / (n - 1)
      : 0;
  const realizedPct = Math.sqrt(Math.max(0, variance)) * 100;
  const window = candles.slice(-20);
  const hi = window.reduce((m, c) => Math.max(m, c.h), 0);
  const lo = window.reduce((m, c) => (m === 0 ? c.l : Math.min(m, c.l)), 0);
  const rangePct = px > 0 && hi > lo ? ((hi - lo) / px) * 100 : 0;

  let regime: VolPack["regime"] = "normal";
  if (atrPct >= 6 || realizedPct >= 4.5) regime = "extreme";
  else if (atrPct >= 3 || realizedPct >= 2.2) regime = "hot";
  else if (atrPct < 1.1 && realizedPct < 0.85) regime = "quiet";

  const labels = {
    quiet: "Тихо",
    normal: "Обычно",
    hot: "Горячо",
    extreme: "Шторм",
  } as const;
  const hints = {
    quiet:
      "Узкий ход. Стоп можно ближе, но ложных пробоев больше — не ставить вплотную.",
    normal: "Рабочая волатильность. Стоп 1.6 ATR, размер как обычно.",
    hot: "Широкий ход. Резать размер вдвое. Не усреднять.",
    extreme: "Слишком дёргается. Не наращивать. Ждать сжатие ATR.",
  } as const;
  const stop = atrAbs * 1.6;
  const stopPct = px > 0 ? (stop / px) * 100 : 0;

  return {
    atr: Number(atrAbs.toPrecision(6)),
    atrPct: Number(atrPct.toFixed(2)),
    realizedPct: Number(realizedPct.toFixed(2)),
    rangePct: Number(rangePct.toFixed(2)),
    regime,
    label: labels[regime],
    hint: hints[regime],
    stopHint: `Стоп ~${stopPct.toFixed(1)}% по 1.6 ATR`,
  };
}

export function computeTechnicals(candles: Candle[]): Technicals {
  const closes = candles.map((c) => c.c);
  const volumes = candles.map((c) => c.v);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, Math.min(50, Math.max(5, closes.length)));
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((value, i) => value - (ema26[i] ?? value));
  const macdSignal = ema(macdLine, 9);

  const e9 = last(ema9, last(closes));
  const e21 = last(ema21, last(closes));
  const e50 = last(ema50, last(closes));
  const price = last(closes);

  let trend: Technicals["trend"] = "range";
  if (e9 > e21 && e21 > e50 && price >= e21) trend = "up";
  else if (e9 < e21 && e21 < e50 && price <= e21) trend = "down";

  const volSma =
    volumes.slice(-20).reduce((sum, value) => sum + value, 0) /
    Math.max(1, Math.min(20, volumes.length));
  const volumeRatio = volSma === 0 ? 1 : last(volumes) / volSma;

  return {
    rsi: Number(rsi(closes).toFixed(1)),
    ema9: e9,
    ema21: e21,
    ema50: e50,
    macd: last(macdLine),
    macdSignal: last(macdSignal),
    atr: atr(candles),
    trend,
    volumeRatio: Number(volumeRatio.toFixed(2)),
  };
}

export function computeFlow(candles: Candle[]): Flow | undefined {
  const usable = candles.filter(
    (c) => typeof c.buyV === "number" && c.v > 0 && c.buyV >= 0 && c.buyV <= c.v,
  );
  if (usable.length < 4) return undefined;
  const window = usable.slice(-20);
  const useQuote = window.every(
    (c) => typeof c.buyQuote === "number" && typeof c.quoteV === "number" && (c.quoteV ?? 0) > 0,
  );
  let buy = 0;
  let vol = 0;
  for (const candle of window) {
    if (useQuote) {
      buy += candle.buyQuote ?? 0;
      vol += candle.quoteV ?? 0;
    } else {
      buy += candle.buyV ?? 0;
      vol += candle.v;
    }
  }
  if (vol <= 0) return undefined;
  const buyPct = Math.round((buy / vol) * 100);
  const lastCandle = usable[usable.length - 1]!;
  const lastBuy = useQuote ? (lastCandle.buyQuote ?? 0) : (lastCandle.buyV ?? 0);
  const lastVol = useQuote ? (lastCandle.quoteV ?? lastCandle.v) : lastCandle.v;
  const lastBuyPct = lastVol > 0 ? Math.round((lastBuy / lastVol) * 100) : buyPct;
  const bias: Flow["bias"] =
    buyPct >= 55 ? "buyers" : buyPct <= 45 ? "sellers" : "even";
  return {
    buyPct,
    sellPct: 100 - buyPct,
    lastBuyPct,
    bias,
    buyVol: buy,
    sellVol: vol - buy,
    lastBuyVol: lastBuy,
    lastSellVol: lastVol - lastBuy,
    unit: useQuote ? "quote" : "base",
  };
}

function typical(candle: Candle): number {
  return (candle.h + candle.l + candle.c) / 3;
}

function mfi(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 50;
  let pos = 0;
  let neg = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const cur = candles[i]!;
    const prev = candles[i - 1]!;
    const flow = typical(cur) * cur.v;
    if (typical(cur) > typical(prev)) pos += flow;
    else if (typical(cur) < typical(prev)) neg += flow;
  }
  if (neg === 0) return 100;
  const ratio = pos / neg;
  return Number((100 - 100 / (1 + ratio)).toFixed(1));
}

export function computeVolume(candles: Candle[]): VolumePack | undefined {
  if (candles.length < 8) return undefined;
  const window = candles.slice(-80);
  let pv = 0;
  let vol = 0;
  for (const candle of window) {
    pv += typical(candle) * candle.v;
    vol += candle.v;
  }
  if (vol <= 0) return undefined;
  const vwap = pv / vol;
  const price = window[window.length - 1]!.c;
  const vsVwapPct = Number((((price - vwap) / vwap) * 100).toFixed(2));

  const useQuote = window.some(
    (c) => typeof c.buyQuote === "number" && typeof c.quoteV === "number",
  );
  let cvd = 0;
  const deltas: number[] = [];
  for (const candle of window) {
    const buy = useQuote ? (candle.buyQuote ?? 0) : (candle.buyV ?? 0);
    const total = useQuote ? (candle.quoteV ?? candle.v) : candle.v;
    const delta = buy - (total - buy);
    cvd += delta;
    deltas.push(delta);
  }
  const lastDelta = deltas[deltas.length - 1] ?? 0;
  const lastTotal = useQuote
    ? (window[window.length - 1]!.quoteV ?? window[window.length - 1]!.v)
    : window[window.length - 1]!.v;
  const deltaPct =
    lastTotal > 0 ? Math.round((lastDelta / lastTotal) * 100) : 0;
  const volumes = window.map((c) => c.v);
  const sma =
    volumes.slice(-20).reduce((sum, value) => sum + value, 0) /
    Math.max(1, Math.min(20, volumes.length));
  const relVol = sma > 0 ? Number((volumes[volumes.length - 1]! / sma).toFixed(2)) : 1;

  return {
    vwap,
    vsVwapPct,
    vwapSide: price >= vwap ? "above" : "below",
    delta: lastDelta,
    deltaPct,
    cvd,
    cvdBias: cvd > 0 ? "buyers" : cvd < 0 ? "sellers" : "even",
    relVol,
    spike: relVol >= 1.8,
    mfi: mfi(window),
  };
}

const TF_LABEL: Record<string, string> = {
  "5m": "5 минут",
  "15m": "15 минут",
  "30m": "30 минут",
  "1h": "1 час",
  "4h": "4 часа",
  "12h": "12 часов",
  "1d": "1 день",
  "2d": "2 дня",
  "2h": "2 часа",
  "3d": "3 дня",
  "10d": "10 дней",
  "1w": "1 неделя",
  "1M": "1 месяц",
  none: "не входить",
};

export function computeTradePlan(input: {
  price: number;
  atr: number;
  signal: Signal;
  interval: string;
  higherTf?: TfBias[];
  volume?: VolumePack;
  tfWhy?: string;
  control?: string;
}): TradePlan {
  const atr = input.atr > 0 ? input.atr : input.price * 0.01;
  const long = input.signal !== "SHORT";
  const side: Signal =
    input.signal === "WAIT" ? "WAIT" : input.signal;
  const stopPrice =
    side === "SHORT" || (side === "WAIT" && !long)
      ? input.price + atr * 1.6
      : input.price - atr * 1.6;
  const targetPrice =
    side === "SHORT"
      ? input.price - atr * 2.4
      : input.price + atr * 2.4;
  const riskPct = Number(
    ((Math.abs(input.price - stopPrice) / input.price) * 100).toFixed(2),
  );
  const rewardPct = Number(
    ((Math.abs(targetPrice - input.price) / input.price) * 100).toFixed(2),
  );
  const rr = riskPct > 0 ? Number((rewardPct / riskPct).toFixed(2)) : 0;

  const day = input.higherTf?.find((row) => row.interval === "1d");
  const h4 = input.higherTf?.find((row) => row.interval === "4h");
  let entryTf = input.interval;
  let entryTfWhy = input.tfWhy ?? "";

  if (side === "WAIT") {
    entryTf = "none";
    if (!entryTfWhy) {
      entryTfWhy =
        "Сейчас не входить ни на одном ТФ. Ждать закрытие 4ч в сторону идеи — младшие таймфреймы только шумят.";
    }
  } else if (
    day &&
    ((side === "LONG" && day.trend === "down") ||
      (side === "SHORT" && day.trend === "up"))
  ) {
    entryTf = "none";
    if (!entryTfWhy) {
      entryTfWhy = `Дневка ${day.trend === "up" ? "вверх" : "вниз"} против сигнала. На ${TF_LABEL[input.interval] ?? input.interval} не заходить — это работа против старшего ТФ.`;
    }
  } else if (
    h4 &&
    ((side === "LONG" && h4.trend === "up") ||
      (side === "SHORT" && h4.trend === "down"))
  ) {
    entryTf = input.interval === "5m" || input.interval === "15m" || input.interval === "30m" ? "1h" : input.interval;
    if (!entryTfWhy) {
      entryTfWhy =
        input.interval === "5m" || input.interval === "15m" || input.interval === "30m"
          ? "4ч за идею, но 5–30м слишком шумные. Входить на часовике, стоп за локальный экстремум."
          : `Старшие ТФ с идеей. Рабочий вход — ${TF_LABEL[entryTf] ?? entryTf}, не перескакивать на младший шум.`;
    }
  } else if (h4 && h4.trend === "range") {
    entryTf = "4h";
    if (!entryTfWhy) {
      entryTfWhy =
        "4ч в боковике. Не ловить 15м-импульс внутри диапазона — ждать выход на 4ч.";
    }
  } else if (!entryTfWhy) {
    entryTfWhy = `Рабочий таймфрейм — ${TF_LABEL[entryTf] ?? entryTf}. Не дробить вход на более мелком, пока этот не даст структуру.`;
  }

  if (input.volume?.relVol && input.volume.relVol < 0.85 && entryTf !== "none" && !input.tfWhy) {
    entryTfWhy += " Объём слабый — размер меньше обычного.";
  }

  const control =
    input.control ??
    (side === "WAIT"
      ? "Деньги остаются в кэше. Не усреднять то, чего ещё нет. Если позиция уже открыта — стоп обязателен, цель не двигать дальше."
      : rr < 1.2
        ? "Соотношение плюса к риску слабое. Либо ближе вход, либо не брать. Риск на сделку не больше 1% капитала, без усреднения."
        : "Риск на сделку 1% капитала. Стоп сразу, без усреднения. Часть с цели 1, остаток вести за ценой. Если стоп — выходим, идея закрыта.");

  return {
    side,
    entryTf,
    entryTfLabel: TF_LABEL[entryTf] ?? entryTf,
    entryTfWhy,
    stopPrice,
    targetPrice,
    riskPct,
    rewardPct,
    rr,
    loseOn1k: Number(((1000 * riskPct) / 100).toFixed(2)),
    winOn1k: Number(((1000 * rewardPct) / 100).toFixed(2)),
    sizeRule:
      entryTf === "none"
        ? "Размер: 0. Не открывать."
        : "На $1000 номинала. Свой капитал: риск 1%, размер = риск / стоп%.",
    control,
  };
}

function fmt(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(5);
  return price.toPrecision(4);
}

export function heuristicVerdict(
  price: number,
  tech: Technicals,
): AnalysisVerdict {
  const macdUp = tech.macd > tech.macdSignal;
  let signal: Signal = "WAIT";
  let confidence = 48;
  let headline = "Рынок без ясного перевеса";
  let thesis =
    "Индикаторы смешанные. Лучше дождаться более чистой структуры, чем входить в шум.";
  let whyNot = "Лонг и шорт сейчас оба грязные — нет края по тренду и RSI.";
  let ifLong = "Лонг имеет смысл только от поддержки, не вдогонку.";
  let ifShort =
    "Шорт имеет смысл только от сопротивления, не из середины диапазона.";

  if (tech.trend === "up" && tech.rsi < 68 && macdUp && tech.rsi > 42) {
    signal = "LONG";
    confidence = tech.rsi > 60 ? 62 : 70;
    headline = "Бычий контекст, можно искать лонг";
    thesis =
      "Цена выше средних, MACD в плюсе. Имеет смысл рассматривать покупку от поддержки, а не догонять импульс.";
    whyNot = "Шорт против тренда: EMA выстроены вверх, MACD не даёт короткой идеи.";
    ifLong = "Искать вход ближе к EMA21, не на пике свечи.";
    ifShort = "Шорт только если сломается EMA21 и RSI уйдёт ниже 45.";
  } else if (tech.trend === "down" && tech.rsi > 32 && !macdUp && tech.rsi < 58) {
    signal = "SHORT";
    confidence = tech.rsi < 40 ? 62 : 70;
    headline = "Медвежий контекст, ближе шорт";
    thesis =
      "Цена ниже средних, импульс вниз. Шорт имеет смысл от сопротивления, не из середины свечи.";
    whyNot =
      "Лонг против тренда: средние смотрят вниз, MACD не подтверждает отскок.";
    ifLong = "Лонг только после возврата выше EMA21 и разворота MACD.";
    ifShort = "Шорт от отката к сопротивлению, со стопом выше локального хая.";
  } else if (tech.rsi >= 72 && tech.trend !== "up") {
    signal = "SHORT";
    confidence = 58;
    headline = "Перекупленность без сильного тренда";
    thesis =
      "RSI высокий, тренд не подтверждает продолжение. Осторожный шорт или ожидание разворота.";
    whyNot = "Лонг здесь догоняет растянутый ход без трендовой поддержки.";
    ifLong = "Лонг откладываем, пока RSI не остынет.";
    ifShort = "Короткий шорт на сбросе перекупленности, стоп плотный.";
  } else if (tech.rsi <= 28 && tech.trend !== "down") {
    signal = "LONG";
    confidence = 58;
    headline = "Перепроданность, возможен отскок";
    thesis =
      "RSI низкий. Это не гарантия дна, но лонг от зоны имеет лучшее матожидание, чем шорт.";
    whyNot = "Шорт в перепроданности часто ловит нож.";
    ifLong = "Лонг от зоны, маленьким объёмом, стоп за локальный лой.";
    ifShort = "Шорт не приоритет, пока RSI не вернётся к середине.";
  }

  const buffer = tech.atr > 0 ? tech.atr : price * 0.01;
  const longEntry = `${fmt(price - buffer * 0.4)} – ${fmt(price + buffer * 0.15)}`;
  const shortEntry = `${fmt(price - buffer * 0.15)} – ${fmt(price + buffer * 0.4)}`;
  const longStop = fmt(price - buffer * 1.6);
  const shortStop = fmt(price + buffer * 1.6);
  const longTp = [fmt(price + buffer * 1.8), fmt(price + buffer * 3.2)];
  const shortTp = [fmt(price - buffer * 1.8), fmt(price - buffer * 3.2)];

  return {
    signal,
    confidence,
    headline,
    thesis,
    entryZone: signal === "SHORT" ? shortEntry : longEntry,
    stop: signal === "SHORT" ? shortStop : longStop,
    targets: signal === "SHORT" ? shortTp : longTp,
    exit:
      signal === "WAIT"
        ? `Если уже в сделке — стоп ${longStop} для лонга и ${shortStop} для шорта. Новый вход не открывать.`
        : signal === "LONG"
          ? `Частично закрывать у ${longTp[0]}, полный выход ниже ${longStop}.`
          : `Частично закрывать у ${shortTp[0]}, полный выход выше ${shortStop}.`,
    happened: "Крупных заголовков за сутки не видно.",
    reasons: [
      `RSI ${tech.rsi}`,
      `Тренд: ${tech.trend === "up" ? "вверх" : tech.trend === "down" ? "вниз" : "боковик"}`,
      `MACD ${macdUp ? "выше сигнала" : "ниже сигнала"}`,
      `Объём к средней: ${tech.volumeRatio}x`,
    ],
    risks: [
      "Эвристика по свечам, без полного ИИ-разбора.",
      "Новость или ликвидация может сломать локальную структуру за одну свечу.",
    ],
    newsImpact: "По открытой ленте тихо — опираемся на технику и объём.",
    newsTone: "quiet",
    whyNot,
    invalidation:
      signal === "WAIT"
        ? "Ждать отменяется, когда тренд, RSI и поток покупок/продаж смотрят в одну сторону."
        : signal === "LONG"
          ? `Лонг ломается ниже ${longStop}.`
          : `Шорт ломается выше ${shortStop}.`,
    ifLong,
    ifShort,
    confidenceDrags: [],
    source: "technicals",
  };
}

export function confidenceDrags(input: {
  tech: Technicals;
  flow?: Flow;
  volume?: VolumePack;
  newsTone: NewsBias;
  signal: Signal;
  higherTf?: TfBias[];
  correlation?: Correlation;
  derivatives?: Derivatives;
  funding?: { rate: number };
  risk?: CoinRisk;
}): string[] {
  const drags: string[] = [];
  if ((input.volume?.relVol ?? input.tech.volumeRatio) < 0.85) {
    drags.push("объём слабее средней");
  }
  if (input.volume?.cvdBias === "sellers" && input.signal === "LONG") {
    drags.push("CVD против лонга");
  }
  if (input.volume?.cvdBias === "buyers" && input.signal === "SHORT") {
    drags.push("CVD против шорта");
  }
  if (input.volume?.vwapSide === "below" && input.signal === "LONG") {
    drags.push("цена ниже VWAP");
  }
  if (input.volume?.vwapSide === "above" && input.signal === "SHORT") {
    drags.push("цена выше VWAP");
  }
  if (input.newsTone === "mixed" || input.newsTone === "quiet") {
    drags.push(
      input.newsTone === "quiet"
        ? "новости не дают края"
        : "новости смешанные",
    );
  }
  if (input.flow?.bias === "even") drags.push("покупки и продажи почти равны");
  const senior = input.higherTf?.[input.higherTf.length - 1];
  if (
    senior &&
    ((input.signal === "LONG" && senior.trend === "down") ||
      (input.signal === "SHORT" && senior.trend === "up"))
  ) {
    drags.push(`старший ТФ (${senior.label}) против сигнала`);
  }
  if (input.correlation && Math.abs(input.correlation.value) >= 0.75) {
    drags.push("монета тащится за BTC");
  }
  if (input.funding && input.funding.rate > 0.0003 && input.signal === "LONG") {
    drags.push("funding высокий — лонги перегреты");
  }
  if (input.funding && input.funding.rate < -0.0003 && input.signal === "SHORT") {
    drags.push("funding отрицательный — шорты перегреты");
  }
  if (
    input.derivatives?.squeeze === "long-squeeze" &&
    input.signal === "LONG"
  ) {
    drags.push("OI и лонги раздуты — риск сквиза");
  }
  if (input.risk?.label === "high") drags.push("сама монета рискованная");
  if (input.tech.trend === "range" && input.signal !== "WAIT") {
    drags.push("локальный сигнал в боковике");
  }
  return drags.slice(0, 3);
}

export function enrichVerdict(
  verdict: AnalysisVerdict,
  news: NewsItem[],
  flow?: Flow,
): AnalysisVerdict {
  const next = { ...verdict, reasons: [...verdict.reasons] };
  if (flow) {
    const flowLine =
      flow.bias === "buyers"
        ? `Поток: покупают агрессивнее (${flow.buyPct}% / ${flow.sellPct}%)`
        : flow.bias === "sellers"
          ? `Поток: продают агрессивнее (${flow.buyPct}% / ${flow.sellPct}%)`
          : `Поток почти равный: покупки ${flow.buyPct}%, продажи ${flow.sellPct}%`;
    next.reasons = [
      ...next.reasons.filter((line) => !line.startsWith("Поток")),
      flowLine,
    ];
  }

  if (!news.length) return next;

  const bulls = news.filter((item) => item.tone === "bull").length;
  const bears = news.filter((item) => item.tone === "bear").length;
  let newsTone: NewsBias = "mixed";
  if (bulls && !bears) newsTone = "bullish";
  else if (bears && !bulls) newsTone = "bearish";

  const top = news[0]!;
  if (
    !next.happened ||
    next.source === "technicals" ||
    /не видно|не разобран|лента пуст/i.test(next.happened)
  ) {
    next.happened = top.title;
  }
  if (next.source === "technicals") next.newsTone = newsTone;
  if (
    /не разобран|лента пуст|тихо/i.test(next.newsImpact) ||
    next.source === "technicals"
  ) {
    next.newsImpact = `Свежее: «${top.title}».`;
  }
  return next;
}
