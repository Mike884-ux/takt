// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  computeFlow,
  computeTechnicals,
  computeTradePlan,
  computeVolatility,
  computeVolume,
  confidenceDrags,
  enrichVerdict,
  heuristicVerdict,
} from "./indicators";
import { upcomingEvents, pearson, returnsOf, scoreRisk } from "./market-context";
import { detectBaseInText, parseQuery } from "./parse-query";
import { assetOf } from "./markets";
import type {
  AnalysisResult,
  AnalysisVerdict,
  AnalystContext,
  BookAdvice,
  MarketBrief,
  NewsDesk,
  NewsEvent,
  NewsItem,
  NewsPlay,
  NewsTrade,
  Signal,
  SpotIdeaDesk,
  TfBias,
  TraderPlan,
} from "./types";
import { asBookTf, klineOf } from "./types";
import { asLlm } from "./llm";

const analysisCache = /* @__PURE__ */ new Map();
const followCache = /* @__PURE__ */ new Map();
const briefCache = /* @__PURE__ */ new Map();
const newsCache = /* @__PURE__ */ new Map();
const strategyCache = /* @__PURE__ */ new Map();
const spotCache = /* @__PURE__ */ new Map();
const ANALYSIS_TTL = 9e4;
const FOLLOW_TTL = 45e3;
const BRIEF_TTL = 18e4;
const NEWS_TTL = 180000;
function cacheKey(symbol, interval) {
	return `vol:${symbol}:${interval}`;
}
function asSignal(value) {
	if (value === "LONG" || value === "SHORT" || value === "WAIT") return value;
	return "WAIT";
}
function num(value, fallback) {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : fallback;
}
function str(value, fallback = "") {
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function strList(value, fallback) {
	if (!Array.isArray(value)) return fallback;
	const items = value.map((item) => str(item)).filter(Boolean);
	return items.length ? items.slice(0, 4) : fallback;
}
function asNewsTone(value) {
	if (value === "bull" || value === "bear" || value === "neutral") return value;
}
function asNewsBias(value, fallback) {
	if (value === "bullish" || value === "bearish" || value === "mixed" || value === "quiet") return value;
	return fallback;
}
function asMarketBias(value) {
	if (value === "risk-on" || value === "risk-off" || value === "mixed") return value;
	return "mixed";
}
function parseVerdict(raw, fallback) {
	const start = raw.indexOf("{");
	const end = raw.lastIndexOf("}");
	if (start < 0 || end <= start) return fallback;
	try {
		const json = JSON.parse(raw.slice(start, end + 1));
		const confidence = Math.max(1, Math.min(82, Math.round(num(json.confidence, fallback.confidence))));
		return {
			signal: asSignal(json.signal),
			confidence,
			headline: str(json.headline, fallback.headline),
			thesis: str(json.thesis, fallback.thesis),
			entryZone: str(json.entryZone, fallback.entryZone),
			stop: str(json.stop, fallback.stop),
			targets: strList(json.targets, fallback.targets),
			exit: str(json.exit, fallback.exit),
			happened: str(json.happened, fallback.happened),
			reasons: strList(json.reasons, fallback.reasons),
			risks: strList(json.risks, fallback.risks),
			newsImpact: str(json.newsImpact, fallback.newsImpact),
			newsTone: asNewsBias(json.newsTone, fallback.newsTone),
			whyNot: str(json.whyNot, fallback.whyNot),
			invalidation: str(json.invalidation, fallback.invalidation),
			ifLong: str(json.ifLong, fallback.ifLong),
			ifShort: str(json.ifShort, fallback.ifShort),
			confidenceDrags: strList(json.confidenceDrags, fallback.confidenceDrags),
			entryTf: str(json.entryTf, ""),
			entryTfWhy: str(json.entryTfWhy, ""),
			control: str(json.control, ""),
			source: "ai"
		};
	} catch {
		return fallback;
	}
}
function tagNews(news, raw) {
	const start = raw.indexOf("{");
	const end = raw.lastIndexOf("}");
	if (start < 0 || end <= start) return news;
	try {
		const json = JSON.parse(raw.slice(start, end + 1));
		const tags = Array.isArray(json.newsTags) ? json.newsTags : [];
		return news.map((item, index) => ({
			...item,
			tone: asNewsTone(tags[index]) ?? item.tone
		}));
	} catch {
		return news;
	}
}
const TRADER_SYSTEM = "Ты аналитик Takt. Деньги клиента — как свои. Сначала факты: режим рынка, объём, новости, риск, портфель. Потом одно действие: купить, продать или ждать. Только спот: без плеча и без шорта в книгу. Не усреднять убыток. Риск ≤1% капитала на идею. Против старшего ТФ не входить. Если грязно — ждать. Русский, коротко, без воды. Это не инвестрекомендация.";
async function grok(options) {
	const { completeGrok } = await import("./grok.server");
	return completeGrok({
		...options,
		llm: asLlm(options.llm)
	});
}
function llmOf(input) {
	return { llm: String(input?.llm ?? "") === "grok45" ? "grok45" : "grok46" };
}
export const runAnalysis = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({
	text: String(input.text ?? "").slice(0, 400),
	interval: input.interval ? String(input.interval) : undefined,
	...llmOf(input)
})).handler(async ({ data }) => {
	const parsed = parseQuery(data.text, data.interval ?? "1h");
	if (!parsed) return {
		ok: false,
		error: "Не вижу пару.",
		hint: "Напиши, например: DOGE/USDT 15m, анализ BTC 4h или SOL час."
	};
	const key = `${data.llm}:${cacheKey(parsed.symbol, parsed.interval)}`;
	const hit = analysisCache.get(key);
	if (hit && Date.now() - hit.at < ANALYSIS_TTL) return hit.value;
	try {
		const marketMod = await import("./market.server");
		const extra = Boolean(assetOf(parsed.base)?.yahoo);
		const tvMod = extra ? await import("./tradingview.server") : null;
		const extraTf = extra ? [] : ["4h", "1d"].filter((id) => id !== parsed.interval);
		const [market, news, fearGreed, funding, tradingView, derivatives, depth, tfCandles, btcKlines, sector, geckoCap] = await Promise.all([
			marketMod.fetchMarket(parsed.base, parsed.quote, parsed.interval),
			marketMod.fetchNews(parsed.base).catch(() => []),
			extra ? Promise.resolve(undefined) : marketMod.fetchFearGreed(),
			extra ? Promise.resolve(undefined) : marketMod.fetchFunding(parsed.base, parsed.quote),
			tvMod ? tvMod.fetchTradingView(parsed.base, parsed.quote, parsed.interval).catch(() => undefined) : Promise.resolve(undefined),
			extra ? Promise.resolve(undefined) : marketMod.fetchDerivatives(parsed.symbol).catch(() => undefined),
			extra ? Promise.resolve(undefined) : marketMod.fetchDepth(parsed.symbol).catch(() => undefined),
			Promise.all(extraTf.map(async (id) => ({
				id,
				candles: await marketMod.fetchKlines(parsed.symbol, id, 80)
			}))),
			extra || parsed.symbol === "BTCUSDT" ? Promise.resolve([]) : marketMod.fetchKlines("BTCUSDT", parsed.interval, 80),
			extra ? Promise.resolve(undefined) : marketMod.fetchSector(parsed.base).catch(() => undefined),
			extra ? Promise.resolve(undefined) : marketMod.fetchMarketCap(parsed.base).catch(() => undefined)
		]);
		if (!market.candles.length || !market.price) return {
			ok: false,
			error: `Не нашёл рынок ${parsed.base}/${parsed.quote}.`,
			hint: "Проверь тикер. Обычно это BTC, ETH, DOGE, SOL и другие пары к USDT."
		};
		const technicals = computeTechnicals(market.candles);
		let flow = computeFlow(market.candles);
		if (flow && depth) flow = {
			...flow,
			bookBidPct: depth.bidPct,
			bookAskPct: depth.askPct
		};
		const volume = computeVolume(market.candles);
		const correlation = parsed.symbol === "BTCUSDT" || btcKlines.length < 12 || market.candles.length < 12 ? undefined : (() => {
			const value = pearson(returnsOf(market.candles), returnsOf(btcKlines));
			const abs = Math.abs(value);
			const note = abs >= .75 ? "Почти тащится за BTC — отдельный сигнал по альту слабее" : abs >= .4 ? "Частично следует за BTC" : "Живёт своей жизнью относительно BTC";
			return {
				vs: "BTC",
				value: Number(value.toFixed(2)),
				note
			};
		})();
		const atrPct = market.price > 0 ? technicals.atr / market.price * 100 : 0;
		const vol = computeVolatility(market.candles, market.price);
		const risk = scoreRisk({
			volumeUsd: market.volume,
			atrPct,
			capUsd: geckoCap,
			change24h: market.change24h
		});
		const higherTf = tfCandles.flatMap((row) => {
			if (row.candles.length < 20) return [];
			const tech = computeTechnicals(row.candles);
			return [{
				interval: row.id,
				label: row.id === "4h" ? "4ч" : "1д",
				trend: tech.trend,
				rsi: tech.rsi
			}];
		});
		const events = upcomingEvents(parsed.base);
		const fallback = enrichVerdict(heuristicVerdict(market.price, technicals), news, flow);
		const spark = market.candles.slice(-8).map((c) => c.c);
		const prompt = [
			`Пара: ${parsed.base}/${parsed.quote}`,
			`Таймфрейм: ${parsed.intervalLabel} (${parsed.interval})`,
			`Цена: ${market.price}`,
			`Изменение 24ч: ${market.change24h.toFixed(2)}%`,
			`High/Low 24ч: ${market.high24h} / ${market.low24h}`,
			`Объём котировки 24ч: ${market.volume}`,
			`RSI14: ${technicals.rsi}`,
			`EMA9/21/50: ${technicals.ema9} / ${technicals.ema21} / ${technicals.ema50}`,
			`MACD / signal: ${technicals.macd} / ${technicals.macdSignal}`,
			`ATR: ${technicals.atr} (${vol.atrPct}% · ${vol.label})`,
			`Волатильность: ход свечи ${vol.realizedPct}%, диапазон 20 баров ${vol.rangePct}%. ${vol.hint} ${vol.stopHint}`,
			`Тренд: ${technicals.trend}`,
			`Объём последней свечи к средней: ${technicals.volumeRatio}x`,
			flow ? `Поток: покупки ${flow.buyPct}% (${flow.buyVol.toFixed(0)}) / продажи ${flow.sellPct}% (${flow.sellVol.toFixed(0)}). Последняя свеча: покупки ${flow.lastBuyPct}% ${flow.lastBuyVol.toFixed(0)} / продажи ${flow.lastSellVol.toFixed(0)}. Стакан bid ${flow.bookBidPct ?? "—"}% / ask ${flow.bookAskPct ?? "—"}%` : "Поток покупок/продаж: нет",
			volume ? `Индикаторы объёма: VWAP ${volume.vwap} (цена ${volume.vwapSide} на ${volume.vsVwapPct}%), дельта свечи ${volume.delta.toFixed(0)} (${volume.deltaPct}%), CVD ${volume.cvd.toFixed(0)} (${volume.cvdBias}), RelVol ${volume.relVol}x${volume.spike ? " всплеск" : ""}, MFI ${volume.mfi}` : "Индикаторы объёма: нет",
			`Последние закрытия: ${spark.join(", ")}`,
			fearGreed ? `Fear & Greed: ${fearGreed.value} (${fearGreed.label})` : "Fear & Greed: нет",
			funding ? `Funding ${funding.inst}: ${(funding.rate * 100).toFixed(4)}%` : "Funding: нет",
			derivatives ? `Деривативы: ${derivatives.note}` : "OI/ликвидации: нет данных фьючерсов",
			higherTf.length ? `Старшие ТФ: ${higherTf.map((row) => `${row.label} ${row.trend === "up" ? "вверх" : row.trend === "down" ? "вниз" : "боковик"} RSI ${row.rsi}`).join("; ")}` : "Старшие ТФ: нет",
			correlation ? `Корреляция с ${correlation.vs}: ${correlation.value} (${correlation.note})` : "Корреляция с BTC: нет",
			sector ? `Сектор ${sector.name}: ${parsed.base} ${sector.rank}/${sector.of} за сутки (${sector.change24h.toFixed(2)}%)` : "",
			`Риск монеты: ${risk.label} ${risk.score}/100. ${risk.note}`,
			events.length ? `Календарь: ${events.map((item) => `${item.title} (${item.when})`).join("; ")}` : "",
			tradingView ? [
				`TradingView ${tradingView.symbol}:`,
				`  Сводка: ${tradingView.summary.toFixed(2)} (${tradingView.summaryLabel})`,
				`  Осцилляторы: ${tradingView.oscillators.toFixed(2)} (${tradingView.oscillatorsLabel})`,
				`  Скользящие: ${tradingView.movingAverages.toFixed(2)} (${tradingView.movingAveragesLabel})`,
				tradingView.rsi !== undefined ? `  RSI TV: ${tradingView.rsi.toFixed(1)}` : ""
			].filter(Boolean).join("\n") : "TradingView: нет данных по символу",
			news.length ? `Новости (пронумерованы, разметь каждую в newsTags):\n${news.map((item, i) => `${i + 1}. ${item.title} (${item.source})`).join("\n")}` : "Новости: лента пуста",
			"",
			"Верни JSON строго такой формы:",
			JSON.stringify({
				signal: "LONG|SHORT|WAIT",
				confidence: 0,
				headline: "короткий заголовок",
				thesis: "2-3 предложения: заходить сейчас, ждать из-за конкретной проблемы, или шортить",
				entryZone: "зона входа",
				stop: "стоп-лосс числом",
				targets: ["tp1", "tp2"],
				exit: "когда выходить, даже если сейчас WAIT",
				happened: "одно предложение: что случилось по свежим новостям",
				reasons: ["причина 1", "причина 2"],
				risks: ["риск 1"],
				newsImpact: "как новости влияют на вход, конкретно",
				newsTone: "bullish|bearish|mixed|quiet",
				newsTags: [
					"bull",
					"bear",
					"neutral"
				],
				whyNot: "почему не противоположный сигнал",
				invalidation: "когда идея ломается",
				ifLong: "сценарий лонга одной фразой",
				ifShort: "сценарий шорта одной фразой",
				confidenceDrags: ["что снижает уверенность 1"],
				entryTf: "5m|15m|30m|1h|4h|1d|none",
				entryTfWhy: "на каком ТФ входить и почему, одной-двумя фразами",
				control: "как вести позицию как свои деньги: размер, когда забрать плюс, когда резать, без усреднения"
			}),
			"Правила: WAIT если нет края. Даже при WAIT заполни stop, targets, exit, entryTf и control. happened = конкретный заголовок. Учитывай объём, OI, funding, старшие ТФ. Деньги считай своими: лучше пропустить, чем потерять. entryTf = none если входить нельзя. Не раздувай уверенность выше 82. Это не инвестрекомендация."
		].join("\n");
		let analysis = fallback;
		let taggedNews = news;
		if (!extra) {
		try {
			const raw = await grok({
				system: "Ты аналитик Takt. Деньги клиента — как свои. Сначала факты: режим рынка, объём, новости, риск, портфель. Потом одно действие: купить, продать или ждать. Только спот: без плеча и без шорта в книгу. Не усреднять убыток. Риск ≤1% капитала на идею. Против старшего ТФ не входить. Если грязно — ждать. Русский, коротко, без воды. Это не инвестрекомендация. Если картина грязная — WAIT. Поля ответа на русском. Отвечай только JSON.",
				user: prompt,
				json: true,
				maxTokens: 1300,
				temperature: .25,
				llm: data.llm
			});
			if (raw) {
				analysis = enrichVerdict(parseVerdict(raw, fallback), news, flow);
				taggedNews = tagNews(news, raw);
				if (taggedNews.every((item) => !item.tone)) taggedNews = news;
			}
		} catch {
			analysis = fallback;
		}
		}
		const drags = confidenceDrags({
			tech: technicals,
			flow,
			volume,
			newsTone: analysis.newsTone,
			signal: analysis.signal,
			higherTf,
			correlation,
			derivatives,
			funding,
			risk
		});
		analysis = {
			...analysis,
			confidenceDrags: analysis.confidenceDrags.length ? analysis.confidenceDrags.slice(0, 3) : drags
		};
		if (!analysis.confidenceDrags.length) analysis.confidenceDrags = drags;
		let plan = computeTradePlan({
			price: market.price,
			atr: technicals.atr,
			signal: analysis.signal,
			interval: parsed.interval,
			higherTf,
			volume,
			tfWhy: analysis.entryTfWhy,
			control: analysis.control
		});
		if ([
			"5m",
			"15m",
			"30m",
			"1h",
			"4h",
			"1d",
			"none"
		].includes(analysis.entryTf ?? "") && analysis.entryTf) {
			const labels = {
				"5m": "5 минут",
				"15m": "15 минут",
				"30m": "30 минут",
				"1h": "1 час",
				"4h": "4 часа",
				"1d": "1 день",
				none: "не входить"
			};
			plan = {
				...plan,
				entryTf: analysis.entryTf,
				entryTfLabel: labels[analysis.entryTf] ?? analysis.entryTf
			};
		}
		(async () => {
			const history = await import("./signals.server");
			await history.settleDue(parsed.symbol, market.price);
			await history.recordSignal({
				symbol: parsed.symbol,
				pair: `${parsed.base}/${parsed.quote}`,
				interval: parsed.interval,
				signal: analysis.signal,
				confidence: analysis.confidence,
				price: market.price
			});
			return history.signalStats(parsed.symbol);
		})().catch(() => undefined);
		const stats = {
			sample: 0,
			hitRate: 0,
			lastNote: "История догоняет — статистика появится на следующем разборе"
		};
		if (derivatives && funding) derivatives.fundingPct = Number((funding.rate * 100).toFixed(4));
		const result = {
			ok: true,
			parsed,
			market: {
				price: market.price,
				change24h: market.change24h,
				high24h: market.high24h,
				low24h: market.low24h,
				volume: market.volume,
				source: market.source
			},
			technicals,
			candles: market.candles.slice(-80).map((c) => ({
				t: c.t,
				o: c.o,
				h: c.h,
				l: c.l,
				c: c.c,
				v: c.v,
				buyV: c.buyV,
				quoteV: c.quoteV,
				buyQuote: c.buyQuote
			})),
			news: taggedNews,
			flow,
			volume,
			fearGreed,
			funding,
			tradingView,
			derivatives,
			higherTf,
			correlation,
			sector,
			risk,
			vol,
			events,
			stats,
			plan,
			analysis
		};
		analysisCache.set(key, {
			at: Date.now(),
			value: result
		});
		return result;
	} catch {
		return {
			ok: false,
			error: "Рынок сейчас не отвечает.",
			hint: "Попробуй ещё раз через несколько секунд — котировки или новости не дошли."
		};
	}
});
export const runSnapshot = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({
	text: String(input.text ?? "").slice(0, 400),
	interval: input.interval ? String(input.interval) : undefined
})).handler(async ({ data }) => {
	const parsed = parseQuery(data.text, data.interval ?? "1h");
	if (!parsed) return { ok: false };
	try {
		const marketMod = await import("./market.server");
		const extra = Boolean(assetOf(parsed.base)?.yahoo);
		const [market, funding, derivatives, depth] = await Promise.all([
			marketMod.fetchMarket(parsed.base, parsed.quote, parsed.interval),
			extra ? Promise.resolve(undefined) : marketMod.fetchFunding(parsed.base, parsed.quote),
			extra ? Promise.resolve(undefined) : marketMod.fetchDerivatives(parsed.symbol).catch(() => undefined),
			extra ? Promise.resolve(undefined) : marketMod.fetchDepth(parsed.symbol).catch(() => undefined)
		]);
		if (!market.candles.length || !market.price) return { ok: false };
		let flow = computeFlow(market.candles);
		if (flow && depth) flow = {
			...flow,
			bookBidPct: depth.bidPct,
			bookAskPct: depth.askPct
		};
		const technicals = computeTechnicals(market.candles);
		return {
			ok: true,
			parsed,
			market: {
				price: market.price,
				change24h: market.change24h,
				high24h: market.high24h,
				low24h: market.low24h,
				volume: market.volume,
				source: market.source
			},
			technicals,
			candles: market.candles.slice(-80),
			flow,
			volume: computeVolume(market.candles),
			funding,
			derivatives,
			vol: computeVolatility(market.candles, market.price)
		};
	} catch {
		return { ok: false };
	}
});
export const listTickers = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({ symbols: (input.symbols ?? []).slice(0, 16).map((s) => String(s)) })).handler(async ({ data }) => {
	return (await import("./market.server")).fetchTickers(data.symbols);
});
function thin(points, max) {
	if (points.length <= max) return points;
	const bucket = points.length / max;
	const out = [];
	for (let i = 0; i < max; i++) {
		const start = Math.floor(i * bucket);
		const end = Math.max(start + 1, Math.floor((i + 1) * bucket));
		const slice = points.slice(start, end);
		const first = slice[0];
		if (!first) continue;
		let pick = first;
		for (const p of slice) if (Math.abs(p.v - first.v) > Math.abs(pick.v - first.v)) pick = p;
		out.push(pick);
	}
	const last = points.at(-1);
	if (last) out[out.length - 1] = last;
	return out;
}
export const spotCurve = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({
	lots: (input.lots ?? []).slice(0, 8).map((row) => ({
		symbol: String(row.symbol),
		qty: Number(row.qty) || 0
	})),
	cash: Number(input.cash) || 0,
	range: input.range === "2d" || input.range === "3d" || input.range === "7d" || input.range === "10d" || input.range === "30d" || input.range === "all" ? input.range : "24h"
})).handler(async ({ data }) => {
	const spec = data.range === "2d" ? {
		interval: "15m",
		limit: 192
	} : data.range === "3d" ? {
		interval: "30m",
		limit: 144
	} : data.range === "7d" ? {
		interval: "1h",
		limit: 168
	} : data.range === "10d" ? {
		interval: "1h",
		limit: 240
	} : data.range === "30d" ? {
		interval: "4h",
		limit: 180
	} : data.range === "all" ? {
		interval: "1d",
		limit: 180
	} : {
		interval: "5m",
		limit: 288
	};
	if (!data.lots.length) return {
		points: [],
		sparks: {},
		delta: 0,
		pct: 0
	};
	const marketMod = await import("./market.server");
	const series = await Promise.all(data.lots.map(async (lot) => ({
		symbol: lot.symbol,
		qty: lot.qty,
		candles: await marketMod.fetchKlines(lot.symbol, spec.interval, spec.limit)
	})));
	const points = thin(series.reduce((best, row) => row.candles.length > best.length ? row.candles : best, []).map((candle, i) => {
		let equity = data.cash;
		for (const row of series) {
			const close = row.candles[i]?.c ?? row.candles.at(-1)?.c;
			if (close) equity += row.qty * close;
		}
		return {
			t: candle.t,
			v: equity
		};
	}), 96);
	const sparks = {};
	for (const row of series) sparks[row.symbol] = thin(row.candles.map((c) => ({
		t: c.t,
		v: c.c
	})), 48);
	const first = points[0]?.v ?? 0;
	const delta = (points.at(-1)?.v ?? first) - first;
	return {
		points,
		sparks,
		delta,
		pct: first > 0 ? delta / first * 100 : 0
	};
});
function compactContext(ctx) {
	return [
		`Пара: ${ctx.pair}`,
		`Таймфрейм: ${ctx.interval}`,
		`Цена: ${ctx.price} (${ctx.change24h.toFixed(2)}%)`,
		`Сигнал: ${ctx.signal} ${ctx.confidence}%`,
		`Заголовок: ${ctx.headline}`,
		`Тезис: ${ctx.thesis}`,
		`Вход: ${ctx.entryZone}; стоп: ${ctx.stop}; цели: ${ctx.targets.join(", ")}`,
		`RSI: ${ctx.rsi}; тренд: ${ctx.trend}`,
		ctx.tvSummary ? `TradingView: ${ctx.tvSummary}` : null,
		ctx.flow ? `Поток: ${ctx.flow}` : null,
		ctx.volume ? `Объём: ${ctx.volume}` : null,
		ctx.funding ? `Funding: ${ctx.funding}` : null,
		ctx.oi ? `OI: ${ctx.oi}` : null,
		ctx.mtf ? `Старшие ТФ: ${ctx.mtf}` : null,
		ctx.correlation ? `Корреляция: ${ctx.correlation}` : null,
		ctx.risk ? `Риск монеты: ${ctx.risk}` : null,
		ctx.plan ? `План: ${ctx.plan}` : null,
		ctx.happened ? `Что случилось: ${ctx.happened}` : null,
		ctx.exit ? `Выход: ${ctx.exit}` : null,
		`Новости (${ctx.newsTone}): ${ctx.newsImpact}`,
		ctx.news.length ? `Лента: ${ctx.news.join("; ")}` : "Лента пуста",
		`Почему не другой сигнал: ${ctx.whyNot}`,
		`Инвалидация: ${ctx.invalidation}`
	].filter(Boolean).join("\n");
}
export const askAnalyst = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({
	question: String(input.question ?? "").slice(0, 400),
	context: input.context ?? null,
	history: (input.history ?? []).slice(-8).map((turn) => ({
		role: turn.role === "user" ? "user" : "assistant",
		text: String(turn.text ?? "").slice(0, 600)
	})),
	...llmOf(input)
})).handler(async ({ data }) => {
	const question = data.question.trim();
	if (!question) return {
		ok: false,
		error: "Пустой вопрос."
	};
	const key = `${data.llm}:${data.context?.pair ?? "none"}:${question.toLowerCase()}`;
	const hit = followCache.get(key);
	if (hit && Date.now() - hit.at < FOLLOW_TTL) return {
		ok: true,
		text: hit.value
	};
	const historyBlock = data.history.map((turn) => `${turn.role === "user" ? "Трейдер" : "Takt"}: ${turn.text}`).join("\n");
	const raw = await grok({
		system: TRADER_SYSTEM,
		user: [
			data.context ? `Контекст последнего разбора:\n${compactContext(data.context)}` : "Контекста сделки нет — пользователь ещё не разбирал пару. Ответь как крипто-аналитик и предложи указать пару и таймфрейм, если вопрос про вход.",
			historyBlock ? `\nНедавний диалог:\n${historyBlock}` : "",
			`\nВопрос: ${question}`,
			"",
			"Ответь кратко, 2–6 предложений, на русском. Деньги пользователя считай своими: риск, стоп, таймфрейм входа, когда резать. Без гарантий."
		].join("\n"),
		maxTokens: 700,
		temperature: .4,
		llm: data.llm
	});
	if (!raw) return {
		ok: false,
		error: "ИИ сейчас не ответил.",
		hint: data.context ? "Разбор пары на экране остаётся. Спроси ещё раз через секунду." : "Напиши пару вроде DOGE/USDT 15m — разберём без диалога."
	};
	followCache.set(key, {
		at: Date.now(),
		value: raw
	});
	return {
		ok: true,
		text: raw
	};
});
export const reviewBook = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({
	capital: Number(input.capital) || 0,
	interval: asBookTf(input.interval),
	flags: (input.flags ?? []).slice(0, 8).map((item) => String(item)),
	riskScore: Number(input.riskScore) || 0,
	riskGrade: String(input.riskGrade ?? "medium"),
	riskNotes: (input.riskNotes ?? []).slice(0, 6).map((item) => String(item)),
	...llmOf(input),
	positions: (input.positions ?? []).slice(0, 12).map((row) => ({
		pair: String(row.pair),
		symbol: String(row.symbol ?? row.pair.replace("/", "")),
		entry: Number(row.entry),
		qty: Number(row.qty),
		price: Number(row.price),
		target: row.target !== undefined ? Number(row.target) : undefined,
		stop: row.stop !== undefined ? Number(row.stop) : undefined,
		weight: row.weight !== undefined ? Number(row.weight) : undefined,
		change24h: row.change24h !== undefined ? Number(row.change24h) : undefined
	}))
})).handler(async ({ data }) => {
	const fallbackItems = data.positions.map((row) => {
		const pnl = (row.price - row.entry) * row.qty;
		const pct = row.entry * row.qty > 0 ? pnl / (row.entry * row.qty) * 100 : 0;
		const stopHit = row.stop !== undefined && row.price <= row.stop;
		const takeHit = row.target !== undefined && row.price >= row.target;
		let action = "hold";
		let why = `Спот ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%. Держим, без докупки в минус.`;
		if (stopHit) {
			action = "cut";
			why = "Спот: цена на стопе. Продаём. Не усредняем.";
		} else if (takeHit) {
			action = "take";
			why = "Цель спота здесь. Продаём часть или всё — не жадничаем.";
		} else if (pct <= -10) {
			action = "cut";
			why = "Минус ≥10%. На споте это уже сломанная идея. Продаём, кэш важнее.";
		} else if (pct >= 18) {
			action = "trim";
			why = "Плюс жирный. Продать часть, стоп подтянуть выше входа.";
		} else if ((row.weight ?? 0) > .4) {
			action = "trim";
			why = "Слишком большой вес в одной монете. Урезать до правила риска.";
		}
		return {
			pair: row.pair,
			action,
			why
		};
	});
	const fallback = {
		headline: data.positions.length ? `Разбор спота · ${data.interval}` : "Спотовый портфель пуст",
		overall: data.riskNotes.length ? data.riskNotes.join(" ") : "Сначала риск портфеля, потом сделки. В минус не докупаем.",
		items: fallbackItems,
		flags: data.flags,
		interval: data.interval,
		riskScore: data.riskScore,
		riskGrade: data.riskGrade === "low" || data.riskGrade === "high" || data.riskGrade === "extreme" ? data.riskGrade : "medium",
		riskWhy: data.riskNotes[0],
		source: "fallback"
	};
	if (!data.positions.length) return fallback;
	const lines = data.positions.map((row) => {
		const pnl = (row.price - row.entry) * row.qty;
		return `${row.pair} спот вход ${row.entry} сейчас ${row.price} кол-во ${row.qty} P/L $${pnl.toFixed(2)} вес ${((row.weight ?? 0) * 100).toFixed(0)}% сутки ${row.change24h?.toFixed(1) ?? "—"}% стоп ${row.stop ?? "—"}`;
	});
	let pulse = "";
	try {
		const marketMod = await import("./market.server");
		pulse = (await Promise.all(data.positions.slice(0, 6).map(async (row) => {
			const candles = await marketMod.fetchKlines(row.symbol, klineOf(data.interval), 48);
			if (candles.length < 4) return `${row.pair}: мало свечей`;
			const tech = computeTechnicals(candles);
			const from = candles[0].c;
			const to = candles[candles.length - 1].c;
			const move = from > 0 ? (to - from) / from * 100 : 0;
			const trend = tech.trend === "up" ? "тренд вверх" : tech.trend === "down" ? "тренд вниз" : "боковик";
			return `${row.pair} на ${data.interval}: ${move >= 0 ? "+" : ""}${move.toFixed(1)}% · RSI ${tech.rsi} · ${trend}`;
		}))).join("; ");
	} catch {
		pulse = "";
	}
	try {
		const raw = await grok({
			system: "Ты старший спотовый трейдер Takt. Анализ риска портфеля. Деньги как свои. Без фьючерсов и шортов. Не усреднять. JSON only.",
			user: [
				`Оценка портфеля: $${data.capital}`,
				`Таймфрейм анализа: ${data.interval}`,
				`Риск-скор (выше = спокойнее): ${data.riskScore} (${data.riskGrade})`,
				data.riskNotes.length ? `Заметки риска: ${data.riskNotes.join("; ")}` : "",
				data.flags.length ? `Флаги: ${data.flags.join("; ")}` : "",
				pulse ? `Движение на ТФ: ${pulse}` : "",
				"Позиции:",
				...lines,
				"",
				"Верни JSON — риск и что делать на этом таймфрейме:",
				JSON.stringify({
					headline: "короткий заголовок риска",
					overall: "2 предложения: главный риск и что делать",
					riskWhy: "почему риск такой, одной фразой",
					items: [{
						pair: "BTC/USDT",
						action: "hold|take|cut|wait|trim|add",
						why: "что делать на этом ТФ"
					}]
				})
			].join("\n"),
			json: true,
			maxTokens: 1e3,
			temperature: .25,
			llm: data.llm
		});
		if (!raw) return fallback;
		const start = raw.indexOf("{");
		const end = raw.lastIndexOf("}");
		if (start < 0 || end <= start) return fallback;
		const json = JSON.parse(raw.slice(start, end + 1));
		const allowed = [
			"hold",
			"take",
			"cut",
			"wait",
			"trim",
			"add"
		];
		const items = Array.isArray(json.items) ? json.items.slice(0, 12).map((item, i) => {
			const row = item ?? {};
			const action = allowed.includes(row.action) ? row.action : "hold";
			return {
				pair: str(row.pair, data.positions[i]?.pair ?? ""),
				action,
				why: str(row.why, fallbackItems[i]?.why ?? "")
			};
		}) : fallbackItems;
		return {
			headline: str(json.headline, fallback.headline),
			overall: str(json.overall, fallback.overall),
			items,
			flags: data.flags,
			interval: data.interval,
			riskScore: data.riskScore,
			riskGrade: fallback.riskGrade,
			riskWhy: str(json.riskWhy, fallback.riskWhy ?? ""),
			source: "ai"
		};
	} catch {
		return fallback;
	}
});
export const scanSpotBuys = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => llmOf(input)).handler(async ({ data }) => {
	const hit = spotCache.get(`spot-buys:${data.llm}`);
	if (hit && Date.now() - hit.at < NEWS_TTL) return hit.value;
	const marketMod = await import("./market.server");
	const { SPOT_UNIVERSE } = await import("./spot-risk");
	const [tickers, fearGreed, news] = await Promise.all([
		marketMod.fetchTickers([...SPOT_UNIVERSE]),
		marketMod.fetchFearGreed(),
		marketMod.fetchNews("BTC").catch(() => [])
	]);
	const fallbackPicks = tickers.slice(0, 8).map((row) => {
		const pair = `${row.symbol.replace("USDT", "")}/USDT`;
		const pumped = row.change24h >= 8;
		const dumped = row.change24h <= -8;
		const core = row.symbol === "BTCUSDT" || row.symbol === "ETHUSDT";
		let action = "wait";
		let risk = core ? "low" : "medium";
		let why = `За сутки ${row.change24h.toFixed(1)}%. На споте не гонимся за движением.`;
		let sizePct = 0;
		if (pumped) {
			action = "avoid";
			risk = "high";
			why = `Уже +${row.change24h.toFixed(1)}% за день. Спот не покупаем на хае.`;
		} else if (dumped && core) {
			action = "buy";
			sizePct = 12;
			why = `Просадка ${row.change24h.toFixed(1)}% по ядру. Можно набирать спот маленькой долей, стоп −10%.`;
		} else if (core && Math.abs(row.change24h) < 3) {
			action = "buy";
			sizePct = 10;
			why = "Ядро спокойное. Спот в BTC/ETH — база портфеля, не ставка.";
		}
		if (row.symbol === "DOGEUSDT" || row.symbol.includes("PEPE")) {
			action = "avoid";
			risk = "high";
			why = "Мем на споте — только если кэш лишний. Риск потерять пачку высокий.";
			sizePct = 0;
		}
		return {
			pair,
			symbol: row.symbol,
			action,
			sizePct,
			risk,
			why,
			stopPct: 10
		};
	});
	const fallback = {
		headline: "Спот: что можно купить сейчас",
		cashRule: "Кэш ≥10%. Одна альт ≤18%. BTC/ETH до 40%. Без плеча и без шорта.",
		picks: fallbackPicks,
		source: "fallback"
	};
	const lines = tickers.map((row) => `${row.symbol.replace("USDT", "")} ${row.price} (${row.change24h.toFixed(2)}%)`);
	try {
		const raw = await grok({
			system: TRADER_SYSTEM + " Спотовый бай-лист. JSON only.",
			user: [
				`Котировки: ${lines.join("; ")}`,
				fearGreed ? `Fear & Greed: ${fearGreed.value} (${fearGreed.label})` : "",
				news.length ? `Новости:\n${news.slice(0, 6).map((item) => item.title).join("\n")}` : "",
				"",
				"Верни JSON — 5-8 монет из списка, какие купить на споте сейчас и какой риск:",
				JSON.stringify({
					headline: "что купить на споте сегодня",
					cashRule: "правило кэша одной фразой",
					picks: [{
						pair: "BTC/USDT",
						symbol: "BTCUSDT",
						action: "buy|wait|avoid",
						sizePct: 10,
						risk: "low|medium|high",
						why: "почему купить или нет, риск конкретно",
						stopPct: 10
					}]
				})
			].join("\n"),
			json: true,
			maxTokens: 1100,
			temperature: .25,
			llm: data.llm
		});
		if (!raw) {
			spotCache.set(`spot-buys:${data.llm}`, {
				at: Date.now(),
				value: fallback
			});
			return fallback;
		}
		const start = raw.indexOf("{");
		const end = raw.lastIndexOf("}");
		if (start < 0 || end <= start) return fallback;
		const json = JSON.parse(raw.slice(start, end + 1));
		const picks = Array.isArray(json.picks) ? json.picks.slice(0, 8).map((item) => {
			const row = item ?? {};
			const action = row.action === "buy" || row.action === "avoid" ? row.action : "wait";
			const risk = row.risk === "low" || row.risk === "high" ? row.risk : "medium";
			const pair = str(row.pair, "BTC/USDT").toUpperCase();
			return {
				pair,
				symbol: str(row.symbol, pair.replace("/", "")),
				action,
				sizePct: Math.max(0, Math.min(40, num(row.sizePct, 0))),
				risk,
				why: str(row.why, "Нет края."),
				stopPct: Math.max(4, Math.min(20, num(row.stopPct, 10)))
			};
		}) : fallbackPicks;
		const desk = {
			headline: str(json.headline, fallback.headline),
			cashRule: str(json.cashRule, fallback.cashRule),
			picks,
			source: "ai"
		};
		spotCache.set(`spot-buys:${data.llm}`, {
			at: Date.now(),
			value: desk
		});
		return desk;
	} catch {
		return fallback;
	}
});
export const briefMarket = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => llmOf(input)).handler(async ({ data }) => {
	const hit = briefCache.get(`market:${data.llm}`);
	if (hit && Date.now() - hit.at < BRIEF_TTL) return hit.value;
	const marketMod = await import("./market.server");
	const [tickers, fearGreed, news] = await Promise.all([
		marketMod.fetchTickers([
			"BTCUSDT",
			"ETHUSDT",
			"SOLUSDT",
			"DOGEUSDT"
		]),
		marketMod.fetchFearGreed(),
		marketMod.fetchNews("BTC").catch(() => [])
	]);
	const snapshot = [
		tickers.map((row) => `${row.symbol.replace("USDT", "")} ${row.price} (${row.change24h.toFixed(2)}%)`).join("; "),
		fearGreed ? `Fear & Greed: ${fearGreed.value} (${fearGreed.label})` : "",
		news.length ? `Новости:\n${news.slice(0, 5).map((item, i) => `${i + 1}. ${item.title}`).join("\n")}` : ""
	].filter(Boolean).join("\n");
	const fallback = {
		headline: "Снимок рынка без ИИ-комментария",
		bias: "mixed",
		body: snapshot || "Котировки не дошли. Попробуй ещё раз.",
		watch: tickers.slice(0, 3).map((row) => `${row.symbol.replace("USDT", "")}: ${row.change24h.toFixed(2)}% за сутки`),
		source: "fallback"
	};
	const raw = await grok({
		system: TRADER_SYSTEM + " Только JSON. Без гарантий.",
		user: [
			snapshot,
			"",
			"Верни JSON:",
			JSON.stringify({
				headline: "одна строка",
				bias: "risk-on|risk-off|mixed",
				body: "3-5 предложений: что происходит и стоит ли сейчас искать вход в альты",
				watch: ["на что смотреть 1", "на что смотреть 2"]
			})
		].join("\n"),
		json: true,
		maxTokens: 700,
		temperature: .35,
		llm: data.llm
	});
	if (!raw) {
		briefCache.set(`market:${data.llm}`, {
			at: Date.now(),
			value: fallback
		});
		return fallback;
	}
	try {
		const start = raw.indexOf("{");
		const end = raw.lastIndexOf("}");
		const json = JSON.parse(raw.slice(start, end + 1));
		const brief = {
			headline: str(json.headline, fallback.headline),
			bias: asMarketBias(json.bias),
			body: str(json.body, fallback.body),
			watch: strList(json.watch, fallback.watch),
			source: "ai"
		};
		briefCache.set(`market:${data.llm}`, {
			at: Date.now(),
			value: brief
		});
		return brief;
	} catch {
		briefCache.set(`market:${data.llm}`, {
			at: Date.now(),
			value: fallback
		});
		return fallback;
	}
});
function asStance(value) {
	if (value === "attack" || value === "hold" || value === "defend") return value;
	return "hold";
}
export const scanStrategy = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({
	interval: asBookTf(input.interval),
	capital: Number(input.capital) || 0,
	riskScore: Number(input.riskScore) || 0,
	flags: (input.flags ?? []).slice(0, 8).map((item) => String(item)),
	...llmOf(input),
	positions: (input.positions ?? []).slice(0, 12).map((row) => ({
		pair: String(row.pair),
		entry: Number(row.entry),
		qty: Number(row.qty),
		price: Number(row.price),
		weight: Number(row.weight) || 0,
		stop: row.stop !== undefined ? Number(row.stop) : undefined,
		target: row.target !== undefined ? Number(row.target) : undefined
	}))
})).handler(async ({ data }) => {
	const key = `stg:${data.llm}:${data.interval}:${data.positions.map((p) => p.pair).join(",")}`;
	const hit = strategyCache.get(key);
	if (hit && Date.now() - hit.at < 45e3) return hit.value;
	const marketMod = await import("./market.server");
	const [tickers, fearGreed, news, btc4h] = await Promise.all([
		marketMod.fetchTickers([
			"BTCUSDT",
			"ETHUSDT",
			"BNBUSDT",
			"SOLUSDT",
			"XRPUSDT",
			"DOGEUSDT"
		]),
		marketMod.fetchFearGreed(),
		marketMod.fetchNews("BTC").catch(() => []),
		marketMod.fetchKlines("BTCUSDT", klineOf(data.interval), 48)
	]);
	const tech = btc4h.length >= 8 ? computeTechnicals(btc4h) : null;
	const btc = tickers.find((row) => row.symbol === "BTCUSDT");
	const chg = btc?.change24h ?? 0;
	const stance = chg <= -2.5 || tech && tech.trend === "down" ? "defend" : chg >= 2.5 && tech?.trend === "up" ? "attack" : "hold";
	const quotes = tickers.map((row) => `${row.symbol.replace("USDT", "")} ${row.price} (${row.change24h.toFixed(2)}%)`).join("; ");
	const bookLines = data.positions.map((row) => {
		const pnl = (row.price - row.entry) * row.qty;
		return `${row.pair} вход ${row.entry} сейчас ${row.price} вес ${(row.weight * 100).toFixed(0)}% P/L $${pnl.toFixed(2)} стоп ${row.stop ?? "—"}`;
	});
	const fallback = {
		headline: stance === "defend" ? "Режим защиты: не докупать в минус" : stance === "attack" ? "Рынок даёт — размер маленький, стоп обязателен" : "Нет края: держать ядро, новые альты не гонять",
		stance,
		now: stance === "defend" ? "Не открывать новые альты. Если стоп близко — резать. Кэш важнее FOMO." : stance === "attack" ? "Можно набирать ядро спотом. Альт — только если вес в правиле риска." : "Сидеть. План важнее сделки. Ждать свой уровень, не чужой памп.",
		why: [
			btc ? `BTC ${chg >= 0 ? "+" : ""}${chg.toFixed(1)}% за сутки` : "BTC без котировки",
			tech ? `тренд ${tech.trend}, RSI ${tech.rsi}` : "",
			fearGreed ? `Fear & Greed ${fearGreed.value}` : ""
		].filter(Boolean).join(" · "),
		steps: [
			{
				title: "Режим",
				body: stance === "defend" ? "Капитал. Не геройствовать." : stance === "attack" ? "Атака только по правилам размера." : "Нейтраль: ядро держать, мусор не трогать."
			},
			{
				title: "Портфель",
				body: data.positions.length ? "Сначала стопы и вес, потом новые идеи." : "Портфель пуст — если покупать, начинать с BTC/ETH, не с мема."
			},
			{
				title: "Сегодня",
				body: "Одна мысль: либо защищаемся, либо ждём свой вход. Не и то и другое."
			}
		],
		book: data.positions.map((row) => ({
			pair: row.pair,
			do: row.stop && row.price <= row.stop ? "резать по стопу" : "держать, не усреднять"
		})),
		avoid: [
			"усреднять минус",
			"шорт в спот-портфель",
			"мем больше 15%"
		],
		watch: tickers.slice(0, 3).map((row) => `${row.symbol.replace("USDT", "")} ${row.change24h.toFixed(1)}%`),
		source: "fallback"
	};
	try {
		const raw = await grok({
			system: TRADER_SYSTEM + " Отвечай только JSON.",
			user: [
				`Таймфрейм стратегии: ${data.interval}`,
				`Котировки: ${quotes}`,
				tech ? `BTC на ${data.interval}: тренд ${tech.trend}, RSI ${tech.rsi}, MACD ${tech.macd.toFixed(2)}` : "",
				fearGreed ? `Fear & Greed: ${fearGreed.value} (${fearGreed.label})` : "",
				news.length ? `Новости:\n${news.slice(0, 6).map((item) => item.title).join("\n")}` : "",
				data.capital ? `Портфель: $${data.capital}, риск-скор ${data.riskScore}` : "Портфель пуст",
				data.flags.length ? `Флаги: ${data.flags.join("; ")}` : "",
				bookLines.length ? `Позиции:\n${bookLines.join("\n")}` : "",
				"",
				"Собери СТРАТЕГИЮ на сегодня: режим, что делать сейчас, шаги, что с позициями, чего не делать. Без воды.",
				JSON.stringify({
					headline: "одна жёсткая строка",
					stance: "attack|hold|defend",
					now: "что делать в ближайшие часы",
					why: "почему такой режим, одна фраза",
					steps: [
						{
							title: "коротко",
							body: "действие"
						},
						{
							title: "коротко",
							body: "действие"
						},
						{
							title: "коротко",
							body: "действие"
						}
					],
					book: [{
						pair: "BNB/USDT",
						do: "что делать с позицией"
					}],
					avoid: ["чего не делать 1"],
					watch: ["за чем следить"]
				})
			].join("\n"),
			json: true,
			maxTokens: 1200,
			temperature: .28,
			llm: data.llm
		});
		if (!raw) {
			strategyCache.set(key, {
				at: Date.now(),
				value: fallback
			});
			return fallback;
		}
		const start = raw.indexOf("{");
		const end = raw.lastIndexOf("}");
		if (start < 0 || end <= start) return fallback;
		const json = JSON.parse(raw.slice(start, end + 1));
		const steps = Array.isArray(json.steps) ? json.steps.slice(0, 5).map((item) => {
			const row = item ?? {};
			return {
				title: str(row.title, "Шаг"),
				body: str(row.body, "")
			};
		}) : fallback.steps;
		const book = Array.isArray(json.book) ? json.book.slice(0, 8).map((item) => {
			const row = item ?? {};
			return {
				pair: str(row.pair, ""),
				do: str(row.do, "")
			};
		}).filter((row) => row.pair) : fallback.book;
		const plan = {
			headline: str(json.headline, fallback.headline),
			stance: asStance(json.stance) || fallback.stance,
			now: str(json.now, fallback.now),
			why: str(json.why, fallback.why),
			steps: steps.filter((s) => s.body),
			book,
			avoid: strList(json.avoid, fallback.avoid).slice(0, 5),
			watch: strList(json.watch, fallback.watch).slice(0, 5),
			source: "ai"
		};
		strategyCache.set(key, {
			at: Date.now(),
			value: plan
		});
		return plan;
	} catch {
		strategyCache.set(key, {
			at: Date.now(),
			value: fallback
		});
		return fallback;
	}
});
function asEvent(value) {
	if (value === "hack" || value === "etf" || value === "listing" || value === "regulation" || value === "macro" || value === "whale" || value === "other") return value;
	return "other";
}
function asPlay(value) {
	if (value === "follow" || value === "fade" || value === "wait") return value;
	return "wait";
}
function guessEvent(title) {
	if (/hack|взлом|exploit|украд|rug/i.test(title)) return "hack";
	if (/\betf\b|outflow|inflow/i.test(title)) return "etf";
	if (/list(ing)?|листинг|листер/i.test(title)) return "listing";
	if (/sec\b|регулятор|запрет|lawsuit|штраф/i.test(title)) return "regulation";
	if (/fed|cpi|ставк|макро|dollar|инфляц/i.test(title)) return "macro";
	if (/whale|кит|накопил/i.test(title)) return "whale";
	return "other";
}
function finalizeTrades(trades) {
	const ranked = [...trades].sort((a, b) => Number(a.play === "wait") - Number(b.play === "wait"));
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const trade of ranked) {
		if (seen.has(trade.base)) continue;
		seen.add(trade.base);
		out.push(trade);
		if (out.length >= 5) break;
	}
	return out;
}
function heuristicTrades(news) {
	const trades = [];
	const seen = /* @__PURE__ */ new Set();
	for (const item of news) {
		let base = detectBaseInText(item.title);
		if (!base && guessEvent(item.title) === "macro") base = "BTC";
		if (!base) continue;
		if (seen.has(base)) continue;
		seen.add(base);
		const event = guessEvent(item.title);
		const bear = item.tone === "bear" || event === "hack";
		const bull = item.tone === "bull" || event === "listing";
		const signal = bear ? "SHORT" : bull ? "LONG" : "WAIT";
		const play = event === "hack" ? "follow" : signal === "WAIT" ? "wait" : "follow";
		trades.push({
			pair: `${base}/USDT`,
			base,
			signal,
			event,
			play,
			title: item.title,
			why: signal === "WAIT" ? "Заголовок шумный — сначала дождаться реакции цены." : bear ? "Негатив по монете: если цена ещё не учла, ближе шорт." : "Позитив по монете: играть только если импульс подтверждается объёмом.",
			url: item.url,
			source: item.source
		});
		if (trades.length >= 6) break;
	}
	return finalizeTrades(trades);
}
export const scanNewsDesk = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => llmOf(input)).handler(async () => {
	const hit = newsCache.get("desk-fast");
	if (hit && Date.now() - hit.at < NEWS_TTL) return hit.value;
	const news = await (await import("./market.server")).fetchHeadlineTape().catch(() => []);
	const desk = {
		trades: heuristicTrades(news),
		source: "headlines"
	};
	newsCache.set("desk-fast", { at: Date.now(), value: desk });
	return desk;
});
export const listSignalHistory = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async () => {
	try {
		return (await import("./signals.server")).listSignals(50);
	} catch {
		return [];
	}
});
export const scanVolatility = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({
	interval: asBookTf(input.interval),
	positions: (input.positions ?? []).slice(0, 12).map((row) => ({
		pair: String(row.pair),
		symbol: String(row.symbol),
		qty: Number(row.qty) || 0,
		entry: Number(row.entry) || 0
	}))
})).handler(async ({ data }) => {
	const marketMod = await import("./market.server");
	const { klineOf } = await import("./types");
	if (!data.positions.length) {
		return {
			headline: "Портфель пуст — нечего мерить",
			regime: "quiet",
			portfolioPct: 0,
			rows: [],
			note: "Добавь покупку, потом спроси волатильность."
		};
	}
	const equity = data.positions.reduce((sum, row) => sum + row.qty * row.entry, 0) || 1;
	const rows = [];
	for (const pos of data.positions) {
		try {
			const candles = await marketMod.fetchKlines(pos.symbol, klineOf(data.interval), 64);
			const last = candles.at(-1);
			const price = last && last.c > 0 ? last.c : pos.entry;
			const pack = computeVolatility(candles, price);
			const weightPct = Number(((pos.qty * price) / equity * 100).toFixed(1));
			rows.push({
				pair: pos.pair,
				symbol: pos.symbol,
				atrPct: pack.atrPct,
				realizedPct: pack.realizedPct,
				rangePct: pack.rangePct,
				regime: pack.regime,
				label: pack.label,
				weightPct,
				hint: pack.stopHint
			});
		} catch {
			rows.push({
				pair: pos.pair,
				symbol: pos.symbol,
				atrPct: 0,
				realizedPct: 0,
				rangePct: 0,
				regime: "normal",
				label: "Нет данных",
				weightPct: Number(((pos.qty * pos.entry) / equity * 100).toFixed(1)),
				hint: "Котировки не дошли"
			});
		}
	}
	rows.sort((a, b) => b.atrPct - a.atrPct);
	const portfolioPct = Number(rows.reduce((sum, row) => sum + row.atrPct * (row.weightPct / 100), 0).toFixed(2));
	let regime = "normal";
	if (portfolioPct >= 5) regime = "extreme";
	else if (portfolioPct >= 2.8) regime = "hot";
	else if (portfolioPct < 1.1) regime = "quiet";
	const hot = rows[0];
	const note = hot && hot.atrPct >= 3
		? `${hot.pair} самый нервный (${hot.atrPct}% ATR). Режь размер этой ноги.`
		: "По ногам ход рабочий. Стопы по ATR, не по круглой цене.";
	const labels = {
		quiet: "Портфель спокойный",
		normal: "Волатильность рабочая",
		hot: "Портфель дёргается",
		extreme: "Слишком широкий ход"
	};
	return {
		headline: labels[regime] ?? "Волатильность",
		regime,
		portfolioPct,
		rows,
		note
	};
});

