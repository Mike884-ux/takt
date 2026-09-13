import { create } from "zustand";
import type { Signal } from "@/lib/types";

export type PriceAlert = {
  id: string;
  kind: "price";
  pair: string;
  symbol: string;
  op: "above" | "below";
  price: number;
  fired: boolean;
};

export type SignalAlert = {
  id: string;
  kind: "signal";
  pair: string;
  symbol: string;
  last?: Signal;
};

export type DeskAlert = PriceAlert | SignalAlert;

export type FiredNote = {
  id: string;
  text: string;
  at: number;
};

type AlertsState = {
  items: DeskAlert[];
  fired: FiredNote[];
  addPrice: (input: Omit<PriceAlert, "id" | "kind" | "fired">) => void;
  addSignal: (input: Omit<SignalAlert, "id" | "kind">) => void;
  remove: (id: string) => void;
  markPriceFired: (id: string) => void;
  setSignalLast: (id: string, signal: Signal) => void;
  pushFired: (text: string) => void;
};

const KEY = "takt-alerts-v1";

function load(): Pick<AlertsState, "items" | "fired"> {
  if (typeof window === "undefined") return { items: [], fired: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { items: [], fired: [] };
    const parsed = JSON.parse(raw) as { items?: DeskAlert[]; fired?: FiredNote[] };
    return {
      items: Array.isArray(parsed.items) ? parsed.items.slice(0, 20) : [],
      fired: Array.isArray(parsed.fired) ? parsed.fired.slice(0, 12) : [],
    };
  } catch {
    return { items: [], fired: [] };
  }
}

function persist(state: Pick<AlertsState, "items" | "fired">) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ items: state.items, fired: state.fired.slice(0, 12) }),
  );
}

function nid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useAlerts = create<AlertsState>()((set) => ({
  ...load(),
  addPrice: (input) =>
    set((state) => {
      const next = {
        items: [
          ...state.items,
          { ...input, id: nid(), kind: "price" as const, fired: false },
        ].slice(-20),
        fired: state.fired,
      };
      persist(next);
      return next;
    }),
  addSignal: (input) =>
    set((state) => {
      const exists = state.items.some(
        (item) => item.kind === "signal" && item.symbol === input.symbol,
      );
      if (exists) return state;
      const next = {
        items: [...state.items, { ...input, id: nid(), kind: "signal" as const }].slice(
          -20,
        ),
        fired: state.fired,
      };
      persist(next);
      return next;
    }),
  remove: (id) =>
    set((state) => {
      const next = {
        items: state.items.filter((item) => item.id !== id),
        fired: state.fired,
      };
      persist(next);
      return next;
    }),
  markPriceFired: (id) =>
    set((state) => {
      const next = {
        items: state.items.map((item) =>
          item.id === id && item.kind === "price" ? { ...item, fired: true } : item,
        ),
        fired: state.fired,
      };
      persist(next);
      return next;
    }),
  setSignalLast: (id, signal) =>
    set((state) => {
      const next = {
        items: state.items.map((item) =>
          item.id === id && item.kind === "signal" ? { ...item, last: signal } : item,
        ),
        fired: state.fired,
      };
      persist(next);
      return next;
    }),
  pushFired: (text) =>
    set((state) => {
      const next = {
        items: state.items,
        fired: [{ id: nid(), text, at: Date.now() }, ...state.fired].slice(0, 12),
      };
      persist(next);
      return next;
    }),
}));

export function notifyBrowser(title: string, body: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, { body });
    } catch {
      /* ignore */
    }
  }
}

export async function ensureNotifyPermission() {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}
