import type { VolDesk, VolRegime } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE: Record<VolRegime, string> = {
  quiet: "text-long",
  normal: "text-muted",
  hot: "text-wait",
  extreme: "text-short",
};

export function VolCard({ data }: { data: VolDesk }) {
  return (
    <article className="w-full rounded-xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]">
      <p className="text-[10px] uppercase tracking-[0.18em] text-faint">
        Волатильность
      </p>
      <h3 className="mt-1 font-display text-lg font-semibold text-fg">
        {data.headline}
      </h3>
      <p className="mt-1 font-mono text-xs tabular-nums text-muted">
        Взвешенный ATR {data.portfolioPct}%
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{data.note}</p>
      <ul className="mt-3 space-y-2">
        {data.rows.map((row) => (
          <li
            key={row.symbol}
            className="flex items-start justify-between gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0"
          >
            <div>
              <p className="font-mono text-sm text-fg">{row.pair}</p>
              <p className="mt-0.5 text-xs text-muted">{row.hint}</p>
            </div>
            <div className="text-right">
              <p className={cn("font-mono text-sm tabular-nums", TONE[row.regime])}>
                {row.atrPct}% · {row.label}
              </p>
              <p className="font-mono text-[11px] text-faint">
                ход {row.realizedPct}% · {row.weightPct}% портфеля
              </p>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
