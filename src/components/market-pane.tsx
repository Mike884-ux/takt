import type { AnalysisOk, MarketSnapshot } from "@/lib/types";
import { formatCompact, formatPct, formatPrice } from "@/lib/utils";
import { NEWS_TONE, SignalCard, SnapshotCard, TechStrip } from "@/components/signal-card";
import { TvChart } from "@/components/tv-chart";
import { TvRating } from "@/components/tv-rating";

export function MarketPane({
  last,
  preview,
  onAsk,
}: {
  last: AnalysisOk | null;
  preview?: MarketSnapshot | null;
  onAsk?: (text: string) => void;
}) {
  if (!last && preview) {
    return (
      <aside className="hidden min-h-0 w-80 min-w-0 shrink-0 flex-col overflow-hidden border-l border-border bg-surface md:flex lg:w-96">
        <div className="flex h-14 items-center justify-between border-b border-border px-5">
          <p className="font-mono text-sm text-fg">
            {preview.parsed.base}/{preview.parsed.quote}
          </p>
          <p className="text-xs text-muted">{preview.market.source}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SnapshotCard data={preview} pendingAi />
        </div>
      </aside>
    );
  }

  if (!last) {
    return (
      <aside className="hidden min-h-0 w-80 min-w-0 shrink-0 flex-col overflow-hidden border-l border-border bg-surface md:flex lg:w-96">
        <div className="flex h-14 items-center border-b border-border px-5">
          <p className="text-sm text-muted">Стакан и график</p>
        </div>
        <div className="flex flex-1 flex-col justify-center px-6">
          <p className="font-display text-xl font-semibold leading-snug text-fg">
            Выбери пару — сразу объём покупок и продаж
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Стакан приходит за секунды. Сигнал догоняет.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden min-h-0 w-80 min-w-0 shrink-0 flex-col overflow-hidden border-l border-border bg-surface md:flex lg:w-96">
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <p className="font-mono text-sm text-fg">
          {last.parsed.base}/{last.parsed.quote}
        </p>
        <p className="text-xs text-muted">
          {last.tradingView ? "TradingView" : last.market.source}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {last.tradingView ? (
          <TvChart
            symbol={last.tradingView.symbol}
            interval={last.parsed.interval}
          />
        ) : null}
        {last.tradingView ? (
          <div className="mt-3">
            <TvRating data={last.tradingView} />
          </div>
        ) : null}
        <div className={last.tradingView ? "mt-4" : undefined}>
          <SignalCard data={last} />
        </div>
        <div className="mt-4">
          <TechStrip data={last} />
        </div>
        {last.analysis.ifLong || last.analysis.ifShort ? (
          <div className="mt-5 grid gap-2 text-sm">
            <div className="rounded-md bg-bg px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-faint">
                Если лонг
              </p>
              <p className="mt-1 leading-relaxed text-pretty text-muted">
                {last.analysis.ifLong}
              </p>
            </div>
            <div className="rounded-md bg-bg px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-faint">
                Если шорт
              </p>
              <p className="mt-1 leading-relaxed text-pretty text-muted">
                {last.analysis.ifShort}
              </p>
            </div>
          </div>
        ) : null}
        {onAsk ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {[
              "Объясни простыми словами",
              "Что говорит TradingView?",
              "Главный риск?",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onAsk(prompt)}
                className="h-9 rounded-full bg-surface-2 px-3 text-xs text-muted transition-colors duration-[var(--motion-quick)] hover:text-fg"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
        {last.news.length ? (
          <div className="mt-5">
            <p className="text-xs uppercase tracking-wide text-faint">
              Лента · ИИ-тон
            </p>
            <ul className="mt-2 space-y-2">
              {last.news.slice(0, 5).map((item) => (
                <li key={item.url + item.title}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-md px-1 py-1 text-sm leading-snug text-pretty text-muted transition-colors hover:text-fg"
                  >
                    {item.title}
                    <span className="mt-0.5 block text-[11px] text-faint">
                      {item.source}
                      {item.tone ? (
                        <>
                          {" · "}
                          <span className={NEWS_TONE[item.tone].className}>
                            {NEWS_TONE[item.tone].label}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <dl className="mt-5 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-bg px-3 py-2">
            <dt className="text-faint">24ч high</dt>
            <dd className="mt-0.5 font-mono tabular-nums text-fg">
              {formatPrice(last.market.high24h)}
            </dd>
          </div>
          <div className="rounded-md bg-bg px-3 py-2">
            <dt className="text-faint">24ч low</dt>
            <dd className="mt-0.5 font-mono tabular-nums text-fg">
              {formatPrice(last.market.low24h)}
            </dd>
          </div>
          <div className="col-span-2 rounded-md bg-bg px-3 py-2">
            <dt className="text-faint">Оборот 24ч</dt>
            <dd className="mt-0.5 font-mono tabular-nums text-fg">
              {formatCompact(last.market.volume)} · {formatPct(last.market.change24h)}
            </dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
