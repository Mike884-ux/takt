import type { NewsDesk, NewsEvent, NewsPlay, NewsTrade, Signal } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const EVENT_COPY: Record<NewsEvent, string> = {
  hack: "взлом",
  etf: "ETF",
  listing: "листинг",
  regulation: "регулятор",
  macro: "макро",
  whale: "кит",
  other: "событие",
};

const PLAY_COPY: Record<NewsPlay, string> = {
  follow: "Играть новость",
  fade: "Фадить импульс",
  wait: "Не торговать это",
};

const SIGNAL_VARIANT: Record<Signal, "long" | "short" | "wait"> = {
  LONG: "long",
  SHORT: "short",
  WAIT: "wait",
};

const SIGNAL_LABEL: Record<Signal, string> = {
  LONG: "Лонг",
  SHORT: "Шорт",
  WAIT: "Ждать",
};

function TradeRow({
  trade,
  onTrade,
}: {
  trade: NewsTrade;
  onTrade?: (text: string) => void;
}) {
  return (
    <li className="border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-xs text-fg">{trade.pair}</span>
        <Badge variant={SIGNAL_VARIANT[trade.signal]} className="uppercase">
          {SIGNAL_LABEL[trade.signal]}
        </Badge>
        <span className="text-[11px] uppercase tracking-wide text-faint">
          {EVENT_COPY[trade.event]}
        </span>
      </div>
      {trade.url ? (
        <a
          href={trade.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 block text-sm leading-snug text-fg transition-colors hover:text-muted"
        >
          {trade.title}
        </a>
      ) : (
        <p className="mt-1.5 text-sm leading-snug text-fg">{trade.title}</p>
      )}
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        {PLAY_COPY[trade.play]}. {trade.why}
      </p>
      {onTrade ? (
        <button
          type="button"
          onClick={() =>
            onTrade(`${trade.pair} 15m. Новость: ${trade.title}`)
          }
          className="mt-2 h-9 rounded-full bg-surface-2 px-3 text-xs text-muted transition-colors duration-[var(--motion-quick)] hover:text-fg"
        >
          Разобрать пару
        </button>
      ) : null}
    </li>
  );
}

export function NewsDeskCard({
  data,
  onTrade,
}: {
  data: NewsDesk;
  onTrade?: (text: string) => void;
}) {
  return (
    <article className="w-full max-w-md min-w-0 overflow-hidden rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <header className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-faint">
          Торговля на новостях
        </p>
        <span className="text-[11px] text-faint">
          {data.source === "ai" ? "анализ" : "лента"}
        </span>
      </header>
      {data.trades.length ? (
        <ul className={cn("mt-3")}>
          {data.trades.map((trade) => (
            <TradeRow
              key={trade.url + trade.title}
              trade={trade}
              onTrade={onTrade}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          За сутки нет заголовка, который стоит торговать. Подожди следующую ленту.
        </p>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-faint">
        Не финансовая рекомендация · новость живёт минуты
      </p>
    </article>
  );
}

export function NewsDeskSkeleton() {
  return (
    <div className="w-full max-w-md rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs uppercase tracking-wide text-faint">
        Торговля на новостях
      </p>
      <div className="mt-3 space-y-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="space-y-2">
            <div className="h-3 w-24 rounded-sm bg-surface-2" />
            <div className="h-4 w-full rounded-sm bg-surface-2" />
            <div className="h-3 w-3/4 rounded-sm bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
