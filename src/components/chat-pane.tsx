import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Briefcase, Send, Trash2 } from "lucide-react";
import { scanNewsDesk } from "@/lib/analyze";
import type { BookAdvice, ChatMessage, Signal, SpotIdeaDesk, TraderPlan } from "@/lib/types";
import { FOLLOWUP_PROMPTS, INTERVALS, QUICK_PAIRS } from "@/lib/types";
import { type LlmId } from "@/lib/llm";
import { cn } from "@/lib/utils";
import { BriefCard } from "@/components/brief-card";
import { NewsDeskCard } from "@/components/news-desk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mark } from "@/components/mark";
import { UserButton } from "@/lib/auth/gates";
import { SignalCard, SnapshotCard } from "@/components/signal-card";
import { VolCard } from "@/components/vol-desk";

function Welcome({
  onPrompt,
  live,
}: {
  onPrompt: (text: string) => void;
  live?: boolean;
}) {
  const desk = useQuery({
    queryKey: ["news-desk"],
    queryFn: () => scanNewsDesk({ data: {} }),
    staleTime: 180_000,
    refetchOnWindowFocus: false,
    enabled: Boolean(live),
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-start gap-4 px-1 py-6">
      <Mark className="size-10 text-muted" />
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">
          Аналитик
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Takt разбирает крипту, золото и акции — и говорит:
          купить, продать или ждать.
        </p>
      </div>
      {desk.data?.trades?.length ? (
        <NewsDeskCard data={desk.data} onTrade={onPrompt} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => onPrompt("Стратег")}>
          Стратег
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onPrompt("Анализ портфеля 4h")}
        >
          Анализ портфеля
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onPrompt("Что купить на споте")}
        >
          Что купить
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onPrompt("Волатильность портфеля")}
        >
          Волатильность
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {["GOLD/USD", "SILVER/USD", "AAPL/USD", "NVDA/USD", "TSLA/USD", "SBER/RUB"].map(
          (pair) => (
            <Button
              key={pair}
              type="button"
              variant="secondary"
              size="chip"
              onClick={() => onPrompt(pair)}
            >
              {pair.replace("/USD", "").replace("/RUB", "")}
            </Button>
          ),
        )}
      </div>
    </div>
  );
}

function BookCard({
  data,
  onAnalyze,
}: {
  data: BookAdvice;
  onAnalyze?: () => void;
}) {
  const ACTION: Record<string, string> = {
    hold: "держать",
    take: "продать",
    cut: "продать",
    wait: "ждать",
    trim: "урезать",
    add: "докупить",
  };
  return (
    <article className="w-full max-w-md rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs uppercase tracking-wide text-faint">
        Спот · риск
        {data.interval ? ` · ${data.interval}` : ""}
      </p>
      <h3 className="mt-1 font-display text-lg font-semibold text-fg">
        {data.headline}
      </h3>
      {data.riskGrade ? (
        <p
          className={`mt-2 text-sm ${
            data.riskGrade === "low"
              ? "text-long"
              : data.riskGrade === "medium"
                ? "text-wait"
                : "text-short"
          }`}
        >
          {data.riskGrade === "low"
            ? "Риск низкий"
            : data.riskGrade === "medium"
              ? "Риск средний"
              : data.riskGrade === "high"
                ? "Риск высокий"
                : "Риск очень высокий"}
          {data.riskScore ? ` · ${data.riskScore}` : ""}
          {data.riskWhy ? ` · ${data.riskWhy}` : ""}
        </p>
      ) : null}
      <p className="mt-2 text-sm leading-relaxed text-muted">{data.overall}</p>
      {data.flags?.length ? (
        <ul className="mt-2 space-y-1">
          {data.flags.map((flag) => (
            <li key={flag} className="text-xs leading-relaxed text-wait">
              {flag}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="mt-3 space-y-2">
        {data.items.map((item) => (
          <li key={item.pair} className="text-sm leading-relaxed text-fg">
            <span className="font-mono text-muted">{item.pair}</span>
            {" · "}
            {ACTION[item.action] ?? item.action}
            {". "}
            <span className="text-muted">{item.why}</span>
          </li>
        ))}
      </ul>
      {onAnalyze ? (
        <Button type="button" className="mt-3 w-full" onClick={onAnalyze}>
          Анализ ещё раз
        </Button>
      ) : null}
    </article>
  );
}

function StrategyCard({
  data,
  onAct,
}: {
  data: TraderPlan;
  onAct?: (text: string) => void;
}) {
  const stance =
    data.stance === "attack"
      ? "атака"
      : data.stance === "defend"
        ? "защита"
        : "ждать";
  const tone =
    data.stance === "attack"
      ? "text-long"
      : data.stance === "defend"
        ? "text-short"
        : "text-wait";
  return (
    <article className="w-full max-w-md rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs uppercase tracking-wide text-faint">Стратег</p>
      <h3 className="mt-1 font-display text-lg font-semibold text-fg">
        {data.headline}
      </h3>
      <p className={`mt-2 text-sm ${tone}`}>Режим: {stance}</p>
      <p className="mt-2 text-sm leading-relaxed text-fg">{data.now}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{data.why}</p>
      <ol className="mt-3 space-y-2">
        {data.steps.map((step) => (
          <li key={step.title} className="text-sm leading-relaxed">
            <span className="text-fg">{step.title}.</span>{" "}
            <span className="text-muted">{step.body}</span>
          </li>
        ))}
      </ol>
      {data.book.length ? (
        <ul className="mt-3 space-y-1">
          {data.book.map((row) => (
            <li key={row.pair} className="text-sm leading-relaxed">
              <span className="font-mono text-fg">{row.pair}</span>
              <span className="text-muted"> · {row.do}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {data.avoid.length ? (
        <p className="mt-3 text-xs leading-relaxed text-wait">
          Не делать: {data.avoid.join(" · ")}
        </p>
      ) : null}
      {data.watch.length ? (
        <p className="mt-2 text-xs leading-relaxed text-faint">
          Смотреть: {data.watch.join(" · ")}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => onAct?.("Анализ портфеля 4h")}>
          Портфель
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onAct?.("Что купить на споте")}
        >
          Что купить
        </Button>
      </div>
    </article>
  );
}

function SpotCard({
  data,
  onBuy,
}: {
  data: SpotIdeaDesk;
  onBuy?: (text: string) => void;
}) {
  return (
    <article className="w-full max-w-md rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs uppercase tracking-wide text-faint">Спот · купить</p>
      <h3 className="mt-1 font-display text-lg font-semibold text-fg">
        {data.headline}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{data.cashRule}</p>
      <ul className="mt-3 space-y-2">
        {data.picks.map((pick) => (
          <li key={pick.symbol} className="text-sm leading-relaxed">
            <span className="font-mono text-fg">{pick.pair}</span>
            <span
              className={
                pick.action === "buy"
                  ? "text-long"
                  : pick.action === "avoid"
                    ? "text-short"
                    : "text-wait"
              }
            >
              {" · "}
              {pick.action === "buy"
                ? "купить"
                : pick.action === "avoid"
                  ? "не брать"
                  : "ждать"}
            </span>
            <span className="text-muted">
              {" · "}
              {pick.risk === "low"
                ? "риск низкий"
                : pick.risk === "high"
                  ? "риск высокий"
                  : "риск средний"}
              {". "}
              {pick.why}
            </span>
          </li>
        ))}
      </ul>
      {onBuy ? (
        <Button
          type="button"
          size="sm"
          className="mt-3"
          onClick={() => onBuy("Что купить на споте")}
        >
          Обновить идеи
        </Button>
      ) : null}
    </article>
  );
}

function Bubble({
  message,
  onTrade,
  analyzing,
  onAnalyze,
}: {
  message: ChatMessage;
  onTrade?: (text: string) => void;
  analyzing?: boolean;
  onAnalyze?: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex min-w-0 justify-end">
        <div className="max-w-sm rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-fg">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.analysis) {
    return (
      <div className="flex min-w-0 max-w-md justify-start">
        <SignalCard data={message.analysis} compact />
      </div>
    );
  }

  if (message.snapshot) {
    return (
      <div className="flex min-w-0 max-w-md justify-start">
        <SnapshotCard data={message.snapshot} pendingAi={analyzing} />
      </div>
    );
  }

  if (message.briefing) {
    return (
      <div className="flex min-w-0 max-w-sm justify-start">
        <BriefCard data={message.briefing} />
      </div>
    );
  }

  if (message.newsDesk) {
    return (
      <div className="flex min-w-0 max-w-md justify-start">
        <NewsDeskCard data={message.newsDesk} onTrade={onTrade} />
      </div>
    );
  }

  if (message.book) {
    return (
      <div className="flex min-w-0 max-w-md justify-start">
        <BookCard data={message.book} onAnalyze={onAnalyze} />
      </div>
    );
  }

  if (message.spotDesk) {
    return (
      <div className="flex min-w-0 max-w-md justify-start">
        <SpotCard data={message.spotDesk} onBuy={onTrade} />
      </div>
    );
  }

  if (message.strategy) {
    return (
      <div className="flex min-w-0 max-w-md justify-start">
        <StrategyCard data={message.strategy} onAct={onTrade} />
      </div>
    );
  }

  if (message.volDesk) {
    return (
      <div className="flex min-w-0 max-w-md justify-start">
        <VolCard data={message.volDesk} />
      </div>
    );
  }

  if (message.text) {
    return (
      <div className="flex min-w-0 max-w-sm justify-start">
        <div className="min-w-0 rounded-2xl rounded-bl-sm bg-surface-2 px-3.5 py-2.5">
          <p className="text-xs uppercase tracking-wide text-faint">Takt</p>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-fg">
            {message.text}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-sm rounded-2xl rounded-bl-sm bg-surface-2 px-3.5 py-2.5 text-sm leading-relaxed text-fg">
        <p>{message.error ?? "Не получилось ответить."}</p>
        {message.hint ? (
          <p className="mt-1.5 text-xs text-muted">{message.hint}</p>
        ) : null}
      </div>
    </div>
  );
}

const TYPING: Record<string, string> = {
  tape: "Снимаем стакан и объём",
  analyze: "Читаю свечи и новости",
  followup: "Отвечаю",
  brief: "Собираю обзор рынка",
  news: "Разбираю ленту",
  book: "Считаю спотовый портфель",
  spot: "Выбираю, что купить",
  strategy: "Стратег собирает план",
  vol: "Меряю ход по ногам",
  chat: "Думаю",
};

function Typing({ kind }: { kind: string }) {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-3">
        <p className="shimmer-text text-sm text-muted">
          {TYPING[kind] ?? "Думаю"}
        </p>
      </div>
    </div>
  );
}

function FollowChips({
  signal,
  disabled,
  onPick,
}: {
  signal: Signal;
  disabled: boolean;
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {FOLLOWUP_PROMPTS[signal].map((prompt) => (
        <button
          key={prompt}
          type="button"
          disabled={disabled}
          onClick={() => onPick(prompt)}
          className="h-8 max-w-full shrink-0 rounded-sm bg-surface-2 px-2.5 text-xs text-muted hover:text-fg disabled:opacity-40"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

export function ChatPane({
  messages,
  pending,
  pendingKind,
  interval,
  llm,
  draft,
  lastSignal,
  onDraft,
  onInterval,
  onLlm,
  onSend,
  onClear,
  onAlerts,
  analyzing,
  onBook,
  onAnalyze,
  onStrategy,
  live,
}: {
  messages: ChatMessage[];
  pending: boolean;
  pendingKind: string | null;
  interval: string;
  llm: LlmId;
  draft: string;
  lastSignal: Signal | null;
  onDraft: (value: string) => void;
  onInterval: (value: string) => void;
  onLlm: (value: LlmId) => void;
  onSend: (text: string) => void;
  onClear: () => void;
  onAlerts?: () => void;
  analyzing?: boolean;
  onBook?: () => void;
  onAnalyze?: () => void;
  onStrategy?: () => void;
  live?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const showFollow =
    !pending &&
    Boolean(lastSignal) &&
    messages.some((message) => message.analysis);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  function submit(text: string) {
    const next = text.trim();
    if (!next || pending) return;
    onSend(next);
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Mark className="size-7" />
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold tracking-tight text-fg">
              Takt
            </p>
            <p className="text-xs text-muted">Аналитик · спот</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onStrategy ? (
            <Button
              type="button"
              size="sm"
              onClick={onStrategy}
              disabled={pending}
              aria-label="Стратег"
            >
              Стратег
            </Button>
          ) : null}
          {onAnalyze ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onAnalyze}
              disabled={pending}
              aria-label="Анализ портфеля"
            >
              Анализ
            </Button>
          ) : null}
          {onBook ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 text-muted"
              onClick={onBook}
              aria-label="Спот"
            >
              <Briefcase className="size-4" />
            </Button>
          ) : null}
          {onAlerts ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 text-muted"
              onClick={onAlerts}
              aria-label="Алерты"
            >
              <Bell className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 text-muted"
            onClick={onClear}
            aria-label="Очистить переписку"
          >
            <Trash2 className="size-4" />
          </Button>
          <UserButton />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4">
        {messages.length === 0 && !pending ? (
          <Welcome onPrompt={submit} live={live} />
        ) : null}
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <Bubble
              key={message.id}
              message={message}
              onTrade={submit}
              analyzing={analyzing}
              onAnalyze={onAnalyze}
            />
          ))}
          {showFollow && lastSignal ? (
            <FollowChips
              signal={lastSignal}
              disabled={pending}
              onPick={submit}
            />
          ) : null}
          {pending && pendingKind ? <Typing kind={pendingKind} /> : null}
          <div ref={endRef} />
        </div>
      </div>

      <form
        className="shrink-0 border-t border-border px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <div className="mb-2 flex flex-wrap gap-1.5">
          {INTERVALS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onInterval(item.id)}
              className={cn(
                "h-8 rounded-sm px-2.5 font-mono text-xs",
                interval === item.id
                  ? "bg-primary text-primary-fg"
                  : "bg-surface-2 text-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_PAIRS.map((pair) => (
            <button
              key={pair}
              type="button"
              onClick={() => submit(pair)}
              className="h-8 rounded-sm bg-surface-2 px-2.5 font-mono text-xs text-muted hover:text-fg"
            >
              {pair}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            placeholder="Спроси стратега"
            disabled={pending}
            aria-label="Спроси стратега"
          />
          {onStrategy ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={onStrategy}
            >
              Стратег
            </Button>
          ) : onAnalyze ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={onAnalyze}
            >
              Анализ
            </Button>
          ) : null}
          <Button type="submit" size="icon" disabled={pending || !draft.trim()}>
            <Send className="size-4" />
            <span className="sr-only">Отправить</span>
          </Button>
        </div>
      </form>
    </section>
  );
}
