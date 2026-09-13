import type { MarketBrief } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const BIAS: Record<MarketBrief["bias"], { label: string; className: string }> = {
  "risk-on": { label: "риск-он", className: "bg-long-dim text-long" },
  "risk-off": { label: "риск-офф", className: "bg-short-dim text-short" },
  mixed: { label: "смешанно", className: "bg-wait-dim text-wait" },
};

export function BriefCard({ data }: { data: MarketBrief }) {
  const bias = BIAS[data.bias];
  return (
    <article className="w-full max-w-sm min-w-0 overflow-hidden rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <header className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-faint">Обзор рынка</p>
        <Badge className={cn("uppercase", bias.className)}>{bias.label}</Badge>
      </header>
      <h3 className="mt-2 font-display text-lg font-semibold leading-snug text-balance text-fg">
        {data.headline}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-pretty text-fg/90">{data.body}</p>
      {data.watch.length ? (
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          {data.watch.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-fg/50" />
              <span className="text-pretty">{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-4 text-[11px] leading-relaxed text-faint">
        Не финансовая рекомендация
        {data.source === "ai" ? " · анализ" : " · снимок рынка"}
      </p>
    </article>
  );
}
