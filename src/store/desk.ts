import { create } from "zustand";
import type { AnalysisOk, ChatMessage, MarketSnapshot } from "@/lib/types";
import { asLlm, type LlmId } from "@/lib/llm";

type DeskState = {
  interval: string;
  llm: LlmId;
  messages: ChatMessage[];
  last: AnalysisOk | null;
  preview: MarketSnapshot | null;
  hydrated: boolean;
  setInterval: (interval: string) => void;
  setLlm: (llm: LlmId) => void;
  push: (message: ChatMessage) => void;
  pushSnapshot: (snapshot: MarketSnapshot) => void;
  pushAnalysis: (analysis: AnalysisOk) => void;
  hydrate: (input: {
    interval?: string;
    messages: ChatMessage[];
    last: AnalysisOk | null;
  }) => void;
  clear: () => void;
};

const LLM_KEY = "takt-llm-v2";
const DESK_KEY = "takt-desk-v1";

function loadLlm(): LlmId {
  if (typeof window === "undefined") return "grok46";
  try {
    return asLlm(window.localStorage.getItem(LLM_KEY));
  } catch {
    return "grok46";
  }
}

function saveLlm(llm: LlmId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LLM_KEY, llm);
}

function slimMessage(message: ChatMessage): ChatMessage {
  if (message.analysis) {
    return {
      ...message,
      analysis: {
        ...message.analysis,
        candles: message.analysis.candles.slice(-24),
        news: message.analysis.news.slice(0, 6),
      },
    };
  }
  if (message.snapshot) {
    return {
      ...message,
      snapshot: {
        ...message.snapshot,
        candles: message.snapshot.candles.slice(-24),
      },
    };
  }
  return message;
}

function pack(state: {
  interval: string;
  messages: ChatMessage[];
  last: AnalysisOk | null;
}) {
  return {
    interval: state.interval,
    messages: state.messages.slice(-40).map(slimMessage),
    last: state.last
      ? { ...state.last, candles: state.last.candles.slice(-24) }
      : null,
  };
}

function loadDesk(): Pick<DeskState, "interval" | "messages" | "last"> {
  const empty = { interval: "1h", messages: [] as ChatMessage[], last: null };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(DESK_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<typeof empty>;
    return {
      interval: typeof parsed.interval === "string" ? parsed.interval : "1h",
      messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-40) : [],
      last: parsed.last ?? null,
    };
  } catch {
    return empty;
  }
}

function saveDesk(state: {
  interval: string;
  messages: ChatMessage[];
  last: AnalysisOk | null;
}) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DESK_KEY, JSON.stringify(pack(state)));
  } catch {
    /* quota */
  }
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const local = loadDesk();

export const useDesk = create<DeskState>()((set, get) => ({
  interval: "1h",
  llm: loadLlm(),
  messages: [],
  last: null,
  preview: null,
  hydrated: false,
  setInterval: (interval) => {
    set({ interval });
    const next = get();
    saveDesk(next);
  },
  setLlm: (llm) => {
    saveLlm(llm);
    set({ llm });
  },
  push: (message) => {
    set((state) => ({
      messages: [...state.messages, message].slice(-40),
    }));
    saveDesk(get());
  },
  pushSnapshot: (snapshot) => {
    set((state) => ({
      preview: snapshot,
      messages: [
        ...state.messages,
        {
          id: newId(),
          role: "bot" as const,
          snapshot,
          createdAt: Date.now(),
        },
      ].slice(-40),
    }));
    saveDesk(get());
  },
  pushAnalysis: (analysis) => {
    set((state) => {
      const messages = [...state.messages];
      let replaced = false;
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (
          message?.role === "bot" &&
          message.snapshot &&
          message.snapshot.parsed.symbol === analysis.parsed.symbol
        ) {
          messages[i] = { ...message, snapshot: undefined, analysis };
          replaced = true;
          break;
        }
      }
      return {
        last: analysis,
        preview: null,
        messages: replaced
          ? messages
          : [
              ...messages,
              {
                id: newId(),
                role: "bot" as const,
                analysis,
                createdAt: Date.now(),
              },
            ].slice(-40),
      };
    });
    saveDesk(get());
  },
  hydrate: (input) => {
    set({
      interval: input.interval || get().interval,
      messages: input.messages.slice(-40),
      last: input.last,
      hydrated: true,
    });
    saveDesk(get());
  },
  clear: () => {
    set({ messages: [], last: null, preview: null });
    saveDesk(get());
  },
}));

export function bootDeskFromLocal() {
  if (typeof window === "undefined") return;
  const local = loadDesk();
  if (!local.messages.length && !local.last) return;
  const now = useDesk.getState();
  if (now.messages.length) return;
  useDesk.setState({
    interval: local.interval,
    messages: local.messages,
    last: local.last,
  });
}
