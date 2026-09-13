import { create } from "zustand";
import {
  bookStats,
  DEFAULT_RISK,
  levelsOf,
  sizeForBuy,
  type RiskSettings,
} from "@/lib/spot-risk";

export type Holding = {
  id: string;
  pair: string;
  symbol: string;
  entry: number;
  qty: number;
  target?: number;
  stop?: number;
};

export type Fill = {
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

type BookState = {
  cash: number;
  holdings: Holding[];
  fills: Fill[];
  risk: RiskSettings;
  lastDaily: string;
  lastError: string;
  hydrated: boolean;
  setCash: (value: number) => void;
  setRisk: (patch: Partial<RiskSettings>) => void;
  applyStops: () => void;
  hydrateCloud: (book: {
    cash: number;
    holdings: Holding[];
    fills: Fill[];
    risk: RiskSettings;
    lastDaily: string;
  }) => void;
  marketBuy: (input: {
    pair: string;
    symbol: string;
    price: number;
    usd: number;
  }) => { ok: true; fill: Fill } | { ok: false; error: string };
  marketSell: (input: {
    symbol: string;
    price: number;
    qty?: number;
  }) => { ok: true; fill: Fill } | { ok: false; error: string };
  recordTx: (input: {
    side: "buy" | "sell";
    pair: string;
    symbol: string;
    qty: number;
    price: number;
    fee?: number;
    at?: number;
    spendCash?: boolean;
  }) => { ok: true; fill: Fill } | { ok: false; error: string };
  clearError: () => void;
  markDaily: (day: string) => void;
};

const KEY = "takt-spot-v3";

function nid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function clampRisk(risk: Partial<RiskSettings>): RiskSettings {
  const n = (v: number | undefined, d: number, min: number, max: number) => {
    const x = typeof v === "number" && Number.isFinite(v) ? v : d;
    return Math.min(max, Math.max(min, x));
  };
  return {
    cashMin: n(risk.cashMin, DEFAULT_RISK.cashMin, 0.05, 0.4),
    maxCore: n(risk.maxCore, DEFAULT_RISK.maxCore, 0.1, 0.8),
    maxAlt: n(risk.maxAlt, DEFAULT_RISK.maxAlt, 0.05, 0.4),
    stopPct: n(risk.stopPct, DEFAULT_RISK.stopPct, 0.03, 0.25),
    targetPct: n(risk.targetPct, DEFAULT_RISK.targetPct, 0.05, 0.5),
    clipPct: n(risk.clipPct, DEFAULT_RISK.clipPct, 0.05, 0.4),
    riskPerTrade: n(risk.riskPerTrade, DEFAULT_RISK.riskPerTrade, 0.003, 0.03),
    maxMeme: n(risk.maxMeme, DEFAULT_RISK.maxMeme, 0.05, 0.4),
  };
}

function load(): Pick<BookState, "cash" | "holdings" | "fills" | "risk" | "lastDaily"> {
  const empty = {
    cash: 0,
    holdings: [] as Holding[],
    fills: [] as Fill[],
    risk: DEFAULT_RISK,
    lastDaily: "",
  };
  if (typeof window === "undefined") return empty;
  try {
    const fromNew = window.localStorage.getItem(KEY);
    const raw =
      fromNew ??
      window.localStorage.getItem("takt-spot-v2") ??
      window.localStorage.getItem("takt-spot-v1");
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as {
      cash?: number;
      capital?: number;
      holdings?: Holding[];
      fills?: Fill[];
      risk?: Partial<RiskSettings>;
      lastDaily?: string;
    };
    const holdings = Array.isArray(parsed.holdings)
      ? parsed.holdings.filter((row) => row && row.qty > 0 && row.entry > 0).slice(0, 20)
      : [];
    const state = {
      cash:
        fromNew && typeof parsed.cash === "number" && parsed.cash >= 0
          ? parsed.cash
          : 0,
      holdings,
      fills: Array.isArray(parsed.fills) ? parsed.fills.slice(0, 80) : [],
      risk: clampRisk(parsed.risk ?? {}),
      lastDaily: typeof parsed.lastDaily === "string" ? parsed.lastDaily : "",
    };
    if (!fromNew) {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    }
    return state;
  } catch {
    return empty;
  }
}

let hydrating = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist(
  state: Pick<BookState, "cash" | "holdings" | "fills" | "risk" | "lastDaily">,
  immediate = false,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(state));
  if (hydrating) return;
  const flush = () => {
    void import("@/lib/book-api")
      .then((mod) =>
        mod.saveBook({
          data: {
            cash: state.cash,
            holdings: state.holdings,
            fills: state.fills,
            risk: state.risk,
            lastDaily: state.lastDaily,
          },
        }),
      )
      .catch(() => undefined);
  };
  window.clearTimeout(saveTimer);
  if (immediate) {
    flush();
    return;
  }
  saveTimer = setTimeout(flush, 400);
}

export const useBook = create<BookState>()((set, get) => ({
  ...load(),
  lastError: "",
  hydrated: false,
  hydrateCloud: (book) =>
    set((state) => {
      hydrating = true;
      const next = {
        ...state,
        cash: book.cash,
        holdings: book.holdings,
        fills: book.fills,
        risk: book.risk,
        lastDaily: book.lastDaily,
        lastError: "",
        hydrated: true,
      };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(KEY, JSON.stringify({
          cash: next.cash,
          holdings: next.holdings,
          fills: next.fills,
          risk: next.risk,
          lastDaily: next.lastDaily,
        }));
      }
      hydrating = false;
      return next;
    }),
  setCash: (value) =>
    set((state) => {
      const next = { ...state, cash: Math.max(0, value), lastError: "" };
      persist(next);
      return next;
    }),
  setRisk: (patch) =>
    set((state) => {
      const next = { ...state, risk: clampRisk({ ...state.risk, ...patch }) };
      persist(next);
      return next;
    }),
  applyStops: () =>
    set((state) => {
      const holdings = state.holdings.map((row) => {
        const auto = levelsOf(row.entry, state.risk);
        return {
          ...row,
          stop: auto.stop,
          target: auto.target,
        };
      });
      const next = { ...state, holdings, lastError: "" };
      persist(next);
      return next;
    }),
  clearError: () => set({ lastError: "" }),
  marketBuy: (input) => {
    const state = get();
    if (!(input.price > 0) || !(input.usd > 0)) {
      const error = "Нет цены рынка.";
      set({ lastError: error });
      return { ok: false as const, error };
    }
    const prices = new Map(state.holdings.map((row) => [row.symbol, row.entry]));
    prices.set(input.symbol, input.price);
    const stats = bookStats(state.holdings, prices, state.cash, state.risk);
    const allowed = sizeForBuy(
      input.symbol,
      stats.equity,
      state.cash,
      (input.usd / stats.equity) * 100,
      state.risk,
    );
    const usd = Math.min(input.usd, allowed, state.cash);
    if (usd < 5) {
      const error =
        "Рынок не пускает: мало кэша или сделка больше лимита риска. Открой вкладку Риск.";
      set({ lastError: error });
      return { ok: false as const, error };
    }
    const qty = usd / input.price;
    const exists = state.holdings.find((row) => row.symbol === input.symbol);
    let holdings: Holding[];
    if (exists) {
      const nextQty = exists.qty + qty;
      const entry = (exists.entry * exists.qty + input.price * qty) / nextQty;
      holdings = state.holdings.map((row) =>
        row.symbol === input.symbol
          ? {
              ...row,
              qty: nextQty,
              entry,
              stop: input.price * (1 - state.risk.stopPct),
              target: input.price * (1 + state.risk.targetPct),
            }
          : row,
      );
    } else {
      holdings = [
        ...state.holdings,
        {
          id: nid(),
          pair: input.pair,
          symbol: input.symbol,
          entry: input.price,
          qty,
          stop: input.price * (1 - state.risk.stopPct),
          target: input.price * (1 + state.risk.targetPct),
        },
      ].slice(-12);
    }
    const fill: Fill = {
      id: nid(),
      side: "buy",
      pair: input.pair,
      symbol: input.symbol,
      price: input.price,
      qty,
      usd,
      at: Date.now(),
    };
    const next = {
      ...state,
      cash: state.cash - usd,
      holdings,
      fills: [fill, ...state.fills].slice(0, 40),
      lastError: "",
    };
    persist(next, true);
    set(next);
    return { ok: true as const, fill };
  },
  marketSell: (input) => {
    const state = get();
    const row = state.holdings.find((item) => item.symbol === input.symbol);
    if (!row) {
      const error = "Этой монеты нет в портфеле.";
      set({ lastError: error });
      return { ok: false as const, error };
    }
    if (!(input.price > 0)) {
      const error = "Нет цены рынка.";
      set({ lastError: error });
      return { ok: false as const, error };
    }
    const qty = Math.min(input.qty && input.qty > 0 ? input.qty : row.qty, row.qty);
    const usd = qty * input.price;
    const pnl = (input.price - row.entry) * qty;
    const holdings =
      qty >= row.qty - 1e-12
        ? state.holdings.filter((item) => item.symbol !== input.symbol)
        : state.holdings.map((item) =>
            item.symbol === input.symbol ? { ...item, qty: item.qty - qty } : item,
          );
    const fill: Fill = {
      id: nid(),
      side: "sell",
      pair: row.pair,
      symbol: row.symbol,
      price: input.price,
      qty,
      usd,
      pnl,
      at: Date.now(),
    };
    const next = {
      ...state,
      cash: state.cash + usd,
      holdings,
      fills: [fill, ...state.fills].slice(0, 40),
      lastError: "",
    };
    persist(next, true);
    set(next);
    return { ok: true as const, fill };
  },
  recordTx: (input) => {
    const state = get();
    if (!(input.price > 0) || !(input.qty > 0)) {
      const error = "Нужны количество и цена.";
      set({ lastError: error });
      return { ok: false as const, error };
    }
    const usd = input.qty * input.price;
    const fee = Math.max(0, input.fee ?? 0);
    const at = input.at && input.at > 0 ? input.at : Date.now();
    if (input.side === "buy") {
      if (input.spendCash && state.cash + 1e-9 < usd + fee) {
        const error = `Не хватает USDT. Нужно $${(usd + fee).toFixed(2)}, есть $${state.cash.toFixed(2)}.`;
        set({ lastError: error });
        return { ok: false as const, error };
      }
      const exists = state.holdings.find((row) => row.symbol === input.symbol);
      let holdings: Holding[];
      if (exists) {
        const nextQty = exists.qty + input.qty;
        const entry = (exists.entry * exists.qty + input.price * input.qty) / nextQty;
        const auto = levelsOf(entry, state.risk);
        holdings = state.holdings.map((row) =>
          row.symbol === input.symbol
            ? {
                ...row,
                qty: nextQty,
                entry,
                stop: exists.stop && exists.stop > 0 ? Math.max(exists.stop, auto.stop) : auto.stop,
                target: auto.target,
              }
            : row,
        );
      } else {
        const auto = levelsOf(input.price, state.risk);
        holdings = [
          ...state.holdings,
          {
            id: nid(),
            pair: input.pair,
            symbol: input.symbol,
            entry: input.price,
            qty: input.qty,
            stop: auto.stop,
            target: auto.target,
          },
        ].slice(-20);
      }
      const fill: Fill = {
        id: nid(),
        side: "buy",
        pair: input.pair,
        symbol: input.symbol,
        price: input.price,
        qty: input.qty,
        usd,
        at,
      };
      const next = {
        ...state,
        cash: input.spendCash ? state.cash - usd - fee : state.cash,
        holdings,
        fills: [fill, ...state.fills].slice(0, 80),
        lastError: "",
      };
      persist(next, true);
      set(next);
      return { ok: true as const, fill };
    }
    const row = state.holdings.find((item) => item.symbol === input.symbol);
    if (!row || row.qty + 1e-12 < input.qty) {
      const error = "Продаёшь больше, чем есть в портфеле.";
      set({ lastError: error });
      return { ok: false as const, error };
    }
    const pnl = (input.price - row.entry) * input.qty;
    const holdings =
      input.qty >= row.qty - 1e-12
        ? state.holdings.filter((item) => item.symbol !== input.symbol)
        : state.holdings.map((item) =>
            item.symbol === input.symbol ? { ...item, qty: item.qty - input.qty } : item,
          );
    const fill: Fill = {
      id: nid(),
      side: "sell",
      pair: row.pair,
      symbol: row.symbol,
      price: input.price,
      qty: input.qty,
      usd,
      pnl,
      at,
    };
    const next = {
      ...state,
      cash: state.cash + usd - fee,
      holdings,
      fills: [fill, ...state.fills].slice(0, 80),
      lastError: "",
    };
    persist(next, true);
    set(next);
    return { ok: true as const, fill };
  },
  markDaily: (day) =>
    set((state) => {
      const next = { ...state, lastDaily: day };
      persist(next);
      return next;
    }),
}));

if (typeof window !== "undefined") {
  const saved = load();
  useBook.setState({ ...saved, lastError: "" });
}

export function holdingPnl(row: Holding, price: number) {
  const notional = row.entry * row.qty;
  const pnl = (price - row.entry) * row.qty;
  const pct = notional > 0 ? (pnl / notional) * 100 : 0;
  return { pnl, pct, notional };
}

export function todayStamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
