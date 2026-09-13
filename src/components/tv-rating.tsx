import type { TvAction, TvSnapshot } from "@/lib/types";
import { TV_ACTION_COPY } from "@/lib/types";
import { cn } from "@/lib/utils";

function Meter({
  title,
  value,
  label,
}: {
  title: string;
  value: number;
  label: TvAction;
}) {
  const copy = TV_ACTION_COPY[label];
  const clamped = Math.max(-1, Math.min(1, value));
  const left = `${((clamped + 1) / 2) * 100}%`;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{title}</p>
        <p
          className={cn(
            "text-xs",
            copy.tone === "long"
              ? "text-long"
              : copy.tone === "short"
                ? "text-short"
                : "text-wait",
          )}
        >
          {copy.ru}
        </p>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="absolute inset-0 flex">
          <span className="h-full flex-1 bg-short/35" />
          <span className="h-full w-7 shrink-0 bg-wait/35" />
          <span className="h-full flex-1 bg-long/35" />
        </div>
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg"
          style={{ left }}
        />
      </div>
    </div>
  );
}

export function TvRating({ data }: { data: TvSnapshot }) {
  return (
    <section className="rounded-md bg-bg px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-faint">
        TradingView · {data.symbol}
      </p>
      <div className="mt-3 grid gap-3">
        <Meter title="Сводка" value={data.summary} label={data.summaryLabel} />
        <Meter
          title="Осцилляторы"
          value={data.oscillators}
          label={data.oscillatorsLabel}
        />
        <Meter
          title="Средние"
          value={data.movingAverages}
          label={data.movingAveragesLabel}
        />
      </div>
      {data.rsi !== undefined ? (
        <p className="mt-3 font-mono text-xs tabular-nums text-muted">
          RSI {data.rsi.toFixed(1)}
          {data.macd !== undefined ? `  ·  MACD ${data.macd.toFixed(5)}` : null}
        </p>
      ) : null}
    </section>
  );
}
