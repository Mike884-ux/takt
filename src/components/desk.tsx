import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { askAnalyst, briefMarket, listTickers, reviewBook, runAnalysis, runSnapshot, scanNewsDesk, scanSpotBuys, scanStrategy, scanVolatility } from "@/lib/analyze";
import { routeIntent } from "@/lib/parse-query";
import type { BookAdvice, ChatMessage, ChatTurn, VolDesk } from "@/lib/types";
import { BOOK_TFS, toAnalystContext } from "@/lib/types";
import { manageRisk, portfolioRisk } from "@/lib/spot-risk";
import { cn, formatPct, formatPrice } from "@/lib/utils";
import { AlertsPanel } from "@/components/alerts-panel";
import { BookSync } from "@/components/book-sync";
import { HistorySync } from "@/components/history-sync";
import { ChatPane } from "@/components/chat-pane";
import { MarketPane } from "@/components/market-pane";
import { notifyBrowser, useAlerts } from "@/store/alerts";
import { useDesk } from "@/store/desk";
import { todayStamp, useBook } from "@/store/portfolio";

const BookPanel = lazy(() =>
  import("@/components/book-panel").then((mod) => ({ default: mod.BookPanel })),
);

function pickTf(text: string, fallback: string) {
  const raw = text.toLowerCase();
  const ordered = [...BOOK_TFS].sort((a, b) => b.id.length - a.id.length);
  for (const item of ordered) {
    const idRe = new RegExp(`(^|[^a-z0-9])${item.id}([^a-z0-9]|$)`, "i");
    if (idRe.test(raw)) return item.id;
    if (raw.includes(item.full.toLowerCase())) return item.id;
    if (raw.includes(item.label.toLowerCase())) return item.id;
  }
  return fallback;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toHistory(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const message of messages.slice(-8)) {
    if (message.role === "user" && message.text) {
      turns.push({ role: "user", text: message.text });
      continue;
    }
    if (message.role === "bot" && message.text) {
      turns.push({ role: "assistant", text: message.text });
      continue;
    }
    if (message.role === "bot" && message.analysis) {
      const a = message.analysis.analysis;
      turns.push({
        role: "assistant",
        text: `${a.signal}: ${a.headline}. ${a.thesis}`,
      });
      continue;
    }
    if (message.role === "bot" && message.newsDesk) {
      turns.push({
        role: "assistant",
        text: message.newsDesk.trades
          .map((t) => `${t.pair} ${t.signal}: ${t.title}`)
          .join("; "),
      });
      continue;
    }
    if (message.role === "bot" && message.briefing) {
      turns.push({
        role: "assistant",
        text: `${message.briefing.headline}. ${message.briefing.body}`,
      });
    }
  }
  return turns;
}

export function Desk({ ready = true }: { ready?: boolean }) {
  const interval = useDesk((s) => s.interval);
  const llm = useDesk((s) => s.llm);
  const messages = useDesk((s) => s.messages);
  const last = useDesk((s) => s.last);
  const preview = useDesk((s) => s.preview);
  const setInterval = useDesk((s) => s.setInterval);
  const setLlm = useDesk((s) => s.setLlm);
  const push = useDesk((s) => s.push);
  const pushSnapshot = useDesk((s) => s.pushSnapshot);
  const pushAnalysis = useDesk((s) => s.pushAnalysis);
  const clear = useDesk((s) => s.clear);
  const [draft, setDraft] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const alertItems = useAlerts((s) => s.items);
  const markPriceFired = useAlerts((s) => s.markPriceFired);
  const setSignalLast = useAlerts((s) => s.setSignalLast);
  const pushFired = useAlerts((s) => s.pushFired);
  const holdings = useBook((s) => s.holdings);
  const cash = useBook((s) => s.cash);
  const risk = useBook((s) => s.risk);
  const lastDaily = useBook((s) => s.lastDaily);
  const markDaily = useBook((s) => s.markDaily);
  const noted = useRef(new Set<string>());
  const dailyStarted = useRef(false);

  const symbols = useMemo(() => {
    const tape = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT"];
    const held = holdings.map((row) => row.symbol);
    return [...new Set([...tape, ...held])];
  }, [holdings]);

  const tickers = useQuery({
    queryKey: ["tickers", symbols.join(",")],
    queryFn: () => listTickers({ data: { symbols } }),
    staleTime: 30_000,
    refetchInterval: ready ? 45_000 : false,
    enabled: ready,
  });

  useEffect(() => {
    const rows = tickers.data ?? [];
    if (!rows.length) return;
    const prices = new Map(rows.map((row) => [row.symbol, row.price]));
    for (const item of alertItems) {
      if (item.kind !== "price" || item.fired) continue;
      const px = prices.get(item.symbol);
      if (px === undefined) continue;
      const hit = item.op === "above" ? px >= item.price : px <= item.price;
      if (!hit) continue;
      const text = `${item.pair} ${item.op === "above" ? "выше" : "ниже"} ${item.price}`;
      markPriceFired(item.id);
      pushFired(text);
      notifyBrowser("Takt · цена", text);
    }
    for (const row of holdings) {
      const px = prices.get(row.symbol);
      if (px === undefined) continue;
      if (row.target) {
        const hit = px >= row.target;
        const key = `${row.id}-target`;
        if (hit && !noted.current.has(key)) {
          noted.current.add(key);
          const text = `${row.pair}: цель ${row.target} — продавать спот`;
          pushFired(text);
          notifyBrowser("Takt · спот", text);
        }
      }
      if (row.stop) {
        const hit = px <= row.stop;
        const key = `${row.id}-stop`;
        if (hit && !noted.current.has(key)) {
          noted.current.add(key);
          const text = `${row.pair}: стоп ${row.stop} — продавать, не докупать`;
          pushFired(text);
          notifyBrowser("Takt · спот", text);
        }
      }
    }
  }, [tickers.data, alertItems, holdings, markPriceFired, pushFired]);

  useEffect(() => {
    if (!last) return;
    for (const item of alertItems) {
      if (item.kind !== "signal") continue;
      if (item.symbol !== last.parsed.symbol) continue;
      if (item.last && item.last !== last.analysis.signal) {
        const text = `${item.pair}: ${item.last} → ${last.analysis.signal}`;
        pushFired(text);
        notifyBrowser("Takt · сигнал", text);
      }
      if (item.last !== last.analysis.signal) {
        setSignalLast(item.id, last.analysis.signal);
      }
    }
  }, [last, alertItems, pushFired, setSignalLast]);

  const snapshotMut = useMutation({
    mutationFn: (text: string) => runSnapshot({ data: { text, interval } }),
    onSuccess: (result) => {
      if (result.ok) pushSnapshot(result);
    },
  });

  const analysisMut = useMutation({
    mutationFn: (text: string) => runAnalysis({ data: { text, interval, llm } }),
    onSuccess: (result) => {
      if (result.ok) {
        pushAnalysis(result);
        return;
      }
      push({
        id: newId(),
        role: "bot",
        error: result.error,
        hint: result.hint,
        createdAt: Date.now(),
      });
    },
    onError: () => {
      push({
        id: newId(),
        role: "bot",
        error: "Не удалось разобрать сделку.",
        hint: "Сеть или модель не ответили. Попробуй ещё раз.",
        createdAt: Date.now(),
      });
    },
  });

  const followMut = useMutation({
    mutationFn: (payload: { question: string; history: ChatTurn[] }) =>
      askAnalyst({
        data: {
          question: payload.question,
          context: last ? toAnalystContext(last) : null,
          history: payload.history,
          llm,
        },
      }),
    onSuccess: (result) => {
      if (result.ok) {
        push({
          id: newId(),
          role: "bot",
          text: result.text,
          createdAt: Date.now(),
        });
        return;
      }
      push({
        id: newId(),
        role: "bot",
        error: result.error,
        hint: result.hint,
        createdAt: Date.now(),
      });
    },
    onError: () => {
      push({
        id: newId(),
        role: "bot",
        error: "ИИ не ответил.",
        hint: "Спроси ещё раз или напиши пару заново.",
        createdAt: Date.now(),
      });
    },
  });

  const briefMut = useMutation({
    mutationFn: () => briefMarket({ data: { llm } }),
    onSuccess: (briefing) => {
      push({
        id: newId(),
        role: "bot",
        briefing,
        createdAt: Date.now(),
      });
    },
    onError: () => {
      push({
        id: newId(),
        role: "bot",
        error: "Обзор рынка не собрался.",
        hint: "Попробуй ещё раз или разбери конкретную пару.",
        createdAt: Date.now(),
      });
    },
  });

  const bookMut = useMutation({
    mutationFn: async (tf: string) => {
      const symbols = [
        ...new Set(holdings.map((row) => row.symbol)),
      ];
      const quotes =
        tickers.data?.length &&
        symbols.every((symbol) =>
          (tickers.data ?? []).some((row) => row.symbol === symbol),
        )
          ? tickers.data
          : await listTickers({ data: { symbols } });
      const prices = new Map(quotes.map((row) => [row.symbol, row.price]));
      const changes = new Map(quotes.map((row) => [row.symbol, row.change24h]));
      const scored = portfolioRisk(holdings, prices, changes, cash, risk);
      const managed = manageRisk(holdings, prices, changes, cash, risk);
      const positions = scored.stats.rows.map((item) => ({
        pair: item.row.pair,
        symbol: item.row.symbol,
        entry: item.row.entry,
        qty: item.row.qty,
        price: item.price,
        target: item.row.target,
        stop: item.row.stop,
        weight: item.weight,
        change24h: changes.get(item.row.symbol),
      }));
      return reviewBook({
        data: {
          capital: scored.stats.equity,
          interval: tf,
          flags: [...scored.stats.flags, ...managed.actions].slice(0, 8),
          riskScore: scored.score,
          riskGrade: scored.grade,
          riskNotes: [
            `В огне $${managed.moneyAtRisk.toFixed(0)} (${(managed.openPct * 100).toFixed(1)}%)`,
            `Стресс −20%: ${managed.crashPct.toFixed(0)}% → $${managed.crashValue.toFixed(0)}`,
            `Ядро ${(managed.buckets.core * 100).toFixed(0)}% · рост ${(managed.buckets.growth * 100).toFixed(0)}% · мемы ${(managed.buckets.spec * 100).toFixed(0)}%`,
            ...scored.notes,
          ].slice(0, 6),
          llm,
          positions,
        },
      });
    },
    onSuccess: (book) => {
      markDaily(todayStamp());
      push({
        id: newId(),
        role: "bot",
        book: book as BookAdvice,
        createdAt: Date.now(),
      });
    },
    onError: () => {
      push({
        id: newId(),
        role: "bot",
        error: "Не смог проверить портфель.",
        hint: "Открой портфель и добавь позиции, затем спроси ещё раз.",
        createdAt: Date.now(),
      });
    },
  });

  const newsMut = useMutation({
    mutationFn: () => scanNewsDesk({ data: { llm } }),
    onSuccess: (newsDesk) => {
      push({
        id: newId(),
        role: "bot",
        newsDesk,
        createdAt: Date.now(),
      });
    },
    onError: () => {
      push({
        id: newId(),
        role: "bot",
        error: "Лента новостей не собралась.",
        hint: "Попробуй ещё раз через несколько секунд.",
        createdAt: Date.now(),
      });
    },
  });

  const spotMut = useMutation({
    mutationFn: () => scanSpotBuys({ data: { llm } }),
    onSuccess: (spotDesk) => {
      push({
        id: newId(),
        role: "bot",
        spotDesk,
        createdAt: Date.now(),
      });
    },
    onError: () => {
      push({
        id: newId(),
        role: "bot",
        error: "Спот-идеи не собрались.",
        hint: "Открой вкладку Купить или спроси ещё раз.",
        createdAt: Date.now(),
      });
    },
  });

  const strategyMut = useMutation({
    mutationFn: async () => {
      if (!holdings.length) {
        return scanStrategy({ data: { interval, llm } });
      }
      const symbols = [...new Set(holdings.map((row) => row.symbol))];
      const quotes =
        tickers.data?.length &&
        symbols.every((symbol) =>
          (tickers.data ?? []).some((row) => row.symbol === symbol),
        )
          ? tickers.data
          : await listTickers({ data: { symbols } });
      const prices = new Map(quotes.map((row) => [row.symbol, row.price]));
      const changes = new Map(quotes.map((row) => [row.symbol, row.change24h]));
      const managed = manageRisk(holdings, prices, changes, cash, risk);
      return scanStrategy({
        data: {
          interval,
          capital: managed.stats.equity,
          riskScore: managed.scored.score,
          flags: [...managed.stats.flags, ...managed.actions].slice(0, 8),
          llm,
          positions: managed.rows.map((item) => ({
            pair: item.row.pair,
            entry: item.row.entry,
            qty: item.row.qty,
            price: item.price,
            weight: item.weight,
            stop: item.stop,
            target: item.target,
          })),
        },
      });
    },
    onSuccess: (strategy) => {
      push({
        id: newId(),
        role: "bot",
        strategy,
        createdAt: Date.now(),
      });
    },
    onError: () => {
      push({
        id: newId(),
        role: "bot",
        error: "Стратег не собрал план.",
        hint: "Попробуй ещё раз через несколько секунд.",
        createdAt: Date.now(),
      });
    },
  });

  const volMut = useMutation({
    mutationFn: () =>
      scanVolatility({
        data: {
          interval,
          positions: holdings.map((row) => ({
            pair: row.pair,
            symbol: row.symbol,
            qty: row.qty,
            entry: row.entry,
          })),
        },
      }),
    onSuccess: (volDesk) => {
      push({
        id: newId(),
        role: "bot",
        volDesk: volDesk as VolDesk,
        createdAt: Date.now(),
      });
    },
    onError: () => {
      push({
        id: newId(),
        role: "bot",
        error: "Волатильность не посчиталась.",
        hint: "Добавь монеты в портфель и спроси ещё раз.",
        createdAt: Date.now(),
      });
    },
  });

  const pending =
    analysisMut.isPending ||
    snapshotMut.isPending ||
    followMut.isPending ||
    briefMut.isPending ||
    newsMut.isPending ||
    bookMut.isPending ||
    spotMut.isPending ||
    strategyMut.isPending ||
    volMut.isPending;
  const pendingKind = snapshotMut.isPending && !preview
    ? "tape"
    : analysisMut.isPending && !preview
      ? "analyze"
      : newsMut.isPending
        ? "news"
        : briefMut.isPending
          ? "brief"
          : bookMut.isPending
            ? "book"
            : spotMut.isPending
              ? "spot"
              : strategyMut.isPending
                ? "strategy"
              : volMut.isPending
                ? "vol"
              : followMut.isPending
                ? last
                  ? "followup"
                  : "chat"
                : null;

  function send(text: string) {
    if (!ready || pending) return;
    push({
      id: newId(),
      role: "user",
      text,
      createdAt: Date.now(),
    });
    setDraft("");
    const intent = routeIntent(text, interval, last?.parsed.symbol);
    if (intent.kind === "analyze") {
      snapshotMut.mutate(text);
      analysisMut.mutate(text);
      return;
    }
    if (intent.kind === "brief") {
      briefMut.mutate();
      return;
    }
    if (intent.kind === "news") {
      newsMut.mutate();
      return;
    }
    if (intent.kind === "book") {
      if (!holdings.length) {
        setBookOpen(true);
        push({
          id: newId(),
          role: "bot",
          text: "Спотовый портфель пуст. На вкладке «Купить» аналитик скажет, какие монеты брать.",
          createdAt: Date.now(),
        });
        return;
      }
      bookMut.mutate(pickTf(text, interval));
      return;
    }
    if (intent.kind === "spot") {
      spotMut.mutate();
      return;
    }
    if (intent.kind === "strategy") {
      strategyMut.mutate();
      return;
    }
    if (intent.kind === "vol") {
      if (!holdings.length) {
        setBookOpen(true);
        push({
          id: newId(),
          role: "bot",
          text: "Сначала запиши покупки в спот — потом посчитаю, какие ноги дёргаются.",
          createdAt: Date.now(),
        });
        return;
      }
      volMut.mutate();
      return;
    }
    followMut.mutate({
      question: text,
      history: [...toHistory(messages), { role: "user", text }],
    });
  }

  useEffect(() => {
    if (!holdings.length || !tickers.data?.length) return;
    const day = todayStamp();
    if (lastDaily === day || dailyStarted.current) return;
    dailyStarted.current = true;
    bookMut.mutate(interval || "4h");
  }, [holdings.length, tickers.data, lastDaily, bookMut, interval]);

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-bg text-fg">
      {ready ? <BookSync /> : null}
      {ready ? <HistorySync /> : null}
      <div className="flex h-10 shrink-0 items-center gap-4 overflow-x-auto border-b border-border px-4">
        <span className="font-display text-xs font-semibold tracking-[0.18em] text-muted">
          TAKT
        </span>
        {(tickers.data ?? []).length
          ? (tickers.data ?? []).map((row) => {
              const up = row.change24h >= 0;
              const base = row.symbol.replace("USDT", "").replace("USD", "");
              if (!base) return null;
              return (
                <button
                  key={row.symbol}
                  type="button"
                  className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums text-muted transition-colors hover:text-fg"
                  onClick={() => send(`${base}/USDT ${interval}`)}
                >
                  <span>{base}</span>
                  <span>{formatPrice(row.price)}</span>
                  <span className={cn(up ? "text-long" : "text-short")}>
                    {formatPct(row.change24h)}
                  </span>
                </button>
              );
            })
          : ["BTC", "ETH", "SOL", "DOGE"].map((name) => (
              <span key={name} className="font-mono text-xs text-faint">
                {name}
              </span>
            ))}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1">
        <ChatPane
          messages={messages}
          pending={pending}
          pendingKind={pendingKind}
          interval={interval}
          llm={llm}
          draft={draft}
          lastSignal={last?.analysis.signal ?? null}
          onDraft={setDraft}
          onInterval={setInterval}
          onLlm={setLlm}
          onSend={send}
          onClear={clear}
          onAlerts={() => setAlertsOpen(true)}
          onBook={() => setBookOpen(true)}
          onAnalyze={() => send(`Анализ портфеля ${interval}`)}
          onStrategy={() => send("Стратег")}
          analyzing={analysisMut.isPending}
          live={ready}
        />
        <MarketPane last={last} preview={preview} onAsk={send} />
      </div>
      {alertsOpen ? <AlertsPanel onClose={() => setAlertsOpen(false)} /> : null}
      {bookOpen ? (
        <Suspense fallback={null}>
          <BookPanel
            onClose={() => setBookOpen(false)}
            onReview={(tf) => {
              setBookOpen(false);
              send(`Анализ портфеля ${tf}`);
            }}
            onIdeas={() => {
              setBookOpen(false);
              send("Что купить на споте");
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
