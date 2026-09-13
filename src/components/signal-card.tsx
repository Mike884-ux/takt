import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type {
  AnalysisOk,
  MarketSnapshot,
  NewsBias,
  NewsTone,
  Signal,
} from "@/lib/types";
import { cn, formatPct, formatPrice } from "@/lib/utils";
import { ContextBlocks } from "@/components/context-blocks";
import { FlowTape } from "@/components/flow-tape";
import { PlanBlock } from "@/components/plan-block";
import { PriceChart } from "@/components/price-chart";
import { VolumeStrip } from "@/components/volume-strip";
import { Badge } from "@/components/ui/badge";
import { holdingPnl, useBook } from "@/store/portfolio";

const SIGNAL_COPY: Record<
  Signal,
  { label: string; verb: string; variant: "long" | "short" | "wait" }
> = {
  LONG: { label: "Лонг", verb: "Заходить вверх", variant: "long" },
  SHORT: { label: "Шорт", verb: "Продавать / шортить", variant: "short" },
  WAIT: { label: "Ждать", verb: "Не входить сейчас", variant: "wait" },
};

const NEWS_BIAS: Record<NewsBias, string> = {
  bullish: "Новости скорее бычьи",
  bearish: "Новости скорее медвежьи",
  mixed: "Новости смешанные",
  quiet: "По новостям тихо",
};

export const NEWS_TONE: Record<NewsTone, { label: string; className: string }> = {
  bull: { label: "бычье", className: "text-long" },
  bear: { label: "медвежье", className: "text-short" },
  neutral: { label: "нейтр.", className: "text-faint" },
};

function SignalIcon({ signal }: { signal: Signal }) {
  const cls = "size-4";
  if (signal === "LONG") return <ArrowUpRight className={cls} />;
  if (signal === "SHORT") return <ArrowDownRight className={cls} />;
  return <Minus className={cls} />;
}

function PairHead({
  data,
  badge,
}: {
  data: AnalysisOk | MarketSnapshot;
  badge: ReactNode;
}) {
  const changeUp = data.market.change24h >= 0;
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <p className="font-mono text-xs tracking-wide text-muted">
          {data.parsed.base}/{data.parsed.quote} · {data.parsed.intervalLabel}
        </p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-mono text-xl tabular-nums text-fg">
            {formatPrice(data.market.price)}
          </span>
          <span
            className={cn(
              "font-mono text-xs tabular-nums",
              changeUp ? "text-long" : "text-short",
            )}
          >
            {formatPct(data.market.change24h)}
          </span>
        </div>
      </div>
      {badge}
    </header>
  );
}

export function SnapshotCard({
  data,
  pendingAi = false,
}: {
  data: MarketSnapshot;
  pendingAi?: boolean;
}) {
  return (
    <article className="w-full max-w-md min-w-0 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <PairHead
        data={data}
        badge={
          <Badge variant="wait" className="uppercase">
            {pendingAi ? "считаем вход" : "стакан"}
          </Badge>
        }
      />
      {data.candles.length > 2 ? (
        <div className="mt-3">
          <PriceChart candles={data.candles} tone="wait" compact />
        </div>
      ) : null}
      {data.volume ? (
        <div className="mt-3">
          <VolumeStrip volume={data.volume} />
        </div>
      ) : null}
      {data.flow ? (
        <div className="mt-3">
          <FlowTape flow={data.flow} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          {data.market.source === "Yahoo"
            ? "Стакан биржи для золота и акций недоступен — смотри график и VWAP."
            : "Объём покупок/продаж ещё не пришёл."}
        </p>
      )}
      {data.vol ? (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Волатильность {data.vol.label} · ATR {data.vol.atrPct}% · {data.vol.stopHint}
        </p>
      ) : null}
      {pendingAi ? (
        <p className="shimmer-text mt-3 text-sm text-muted">
          Стакан уже здесь · сигнал догоняет
        </p>
      ) : null}
    </article>
  );
}

export function SignalCard({
  data,
  compact = false,
}: {
  data: AnalysisOk;
  compact?: boolean;
}) {
  const copy = SIGNAL_COPY[data.analysis.signal];
  const tone = copy.variant;
  const headlines = data.news.slice(0, compact ? 2 : 3);
  const holding = useBook((s) =>
    s.holdings.find((row) => row.symbol === data.parsed.symbol),
  );
  const bag = holding
    ? holdingPnl(holding, data.market.price)
    : null;

  return (
    <article
      className={cn(
        "min-w-0 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]",
        compact ? "w-full max-w-md" : "w-full",
      )}
    >
      <PairHead
        data={data}
        badge={
          <Badge variant={tone} className="gap-1 uppercase">
            <SignalIcon signal={data.analysis.signal} />
            {copy.label}
          </Badge>
        }
      />

      <div className="mt-3">
        <PriceChart candles={data.candles} tone={tone} compact={compact} />
      </div>

      {data.volume ? (
        <div className="mt-3">
          <VolumeStrip volume={data.volume} />
        </div>
      ) : null}

      {data.flow ? (
        <div className="mt-3">
          <FlowTape flow={data.flow} />
        </div>
      ) : null}

      {bag && holding ? (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          В портфеле {holding.pair}: вход {holding.entry} × {holding.qty} · сейчас{" "}
          <span className={bag.pnl >= 0 ? "text-long" : "text-short"}>
            {bag.pnl >= 0 ? "+" : ""}${bag.pnl.toFixed(2)} ({formatPct(bag.pct)})
          </span>
          {holding.target ? ` · продать по ${holding.target}` : ""}
        </p>
      ) : null}

      {data.plan ? (
        <PlanBlock
          plan={data.plan}
          pair={`${data.parsed.base}/${data.parsed.quote}`}
          symbol={data.parsed.symbol}
          price={data.market.price}
        />
      ) : null}

      <div className="mt-4">
        <p className="font-display text-lg font-semibold leading-snug text-fg">
          {copy.verb}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-pretty text-muted">
          {data.analysis.headline}
        </p>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-faint">
          <span>Уверенность</span>
          <span className="font-mono tabular-nums text-muted">
            {data.analysis.confidence}%
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn(
              "h-full rounded-full",
              tone === "long" ? "bg-long" : tone === "short" ? "bg-short" : "bg-wait",
            )}
            style={{ width: `${data.analysis.confidence}%` }}
          />
        </div>
        {data.analysis.confidenceDrags.length ? (
          <p className="mt-1.5 text-xs leading-relaxed text-faint">
            Почему не выше: {data.analysis.confidenceDrags.join(" · ")}
          </p>
        ) : null}
      </div>

      {!compact ? (
        <p className="mt-4 text-sm leading-relaxed text-pretty text-fg/90">
          {data.analysis.thesis}
        </p>
      ) : null}

      {data.analysis.happened ? (
        <p className="mt-3 text-sm leading-relaxed text-pretty text-muted">
          <span className="text-faint">Что случилось. </span>
          {data.analysis.happened}
        </p>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-bg px-3 py-2">
          <dt className="text-faint">
            {data.analysis.signal === "WAIT" ? "Стоп внутри" : "Стоп"}
          </dt>
          <dd className="mt-0.5 font-mono tabular-nums text-fg">
            {data.analysis.stop}
          </dd>
        </div>
        <div className="rounded-md bg-bg px-3 py-2">
          <dt className="text-faint">Вход</dt>
          <dd className="mt-0.5 font-mono tabular-nums text-fg">
            {data.analysis.entryZone}
          </dd>
        </div>
        <div className="col-span-2 rounded-md bg-bg px-3 py-2">
          <dt className="text-faint">Выход</dt>
          <dd className="mt-0.5 leading-relaxed text-pretty text-fg">
            {data.analysis.exit}
          </dd>
        </div>
        <div className="col-span-2 rounded-md bg-bg px-3 py-2">
          <dt className="text-faint">Цели</dt>
          <dd className="mt-0.5 font-mono tabular-nums text-fg">
            {data.analysis.targets.join("  ·  ")}
          </dd>
        </div>
      </dl>

      <ContextBlocks data={data} compact={compact} />

      {data.analysis.newsImpact && !compact ? (
        <p className="mt-3 text-sm leading-relaxed text-pretty text-muted">
          <span className="text-faint">{NEWS_BIAS[data.analysis.newsTone]}. </span>
          {data.analysis.newsImpact}
        </p>
      ) : null}

      {headlines.length ? (
        <ul className="mt-3 space-y-1.5">
          {headlines.map((item) => (
            <li key={item.url + item.title}>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="block text-xs leading-snug text-pretty text-muted transition-colors hover:text-fg"
              >
                {item.title}
                {item.tone && item.tone !== "neutral" ? (
                  <span className={NEWS_TONE[item.tone].className}>
                    {" · "}
                    {NEWS_TONE[item.tone].label}
                  </span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {!compact && data.analysis.whyNot ? (
        <p className="mt-4 text-sm leading-relaxed text-pretty text-muted">
          <span className="text-faint">Почему не наоборот. </span>
          {data.analysis.whyNot}
        </p>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-faint">
        Не финансовая рекомендация
        {data.analysis.source === "technicals" ? " · техника" : " · анализ"}
      </p>
    </article>
  );
}

export function TechStrip({ data }: { data: AnalysisOk }) {
  const items = [
    { k: "RSI", v: data.technicals.rsi.toFixed(1) },
    {
      k: "Тренд",
      v:
        data.technicals.trend === "up"
          ? "вверх"
          : data.technicals.trend === "down"
            ? "вниз"
            : "боковик",
    },
    { k: "Vol", v: `${data.technicals.volumeRatio}x` },
    data.volume
      ? {
          k: "VWAP",
          v: data.volume.vwapSide === "above" ? "выше" : "ниже",
        }
      : null,
    data.volume
      ? {
          k: "CVD",
          v: data.volume.cvdBias === "buyers" ? "покупки" : data.volume.cvdBias === "sellers" ? "продажи" : "ровно",
        }
      : data.flow
        ? {
            k: "Сейчас",
            v: `${data.flow.lastBuyPct}/${100 - data.flow.lastBuyPct}`,
          }
        : null,
    data.funding
      ? {
          k: "Funding",
          v: `${(data.funding.rate * 100).toFixed(3)}%`,
        }
      : null,
    data.derivatives
      ? {
          k: "OI",
          v: `${data.derivatives.longPct.toFixed(0)}/${data.derivatives.shortPct.toFixed(0)}`,
        }
      : null,
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.k} className="rounded-md bg-surface-2 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-faint">{item.k}</p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-fg">{item.v}</p>
        </div>
      ))}
    </div>
  );
}
