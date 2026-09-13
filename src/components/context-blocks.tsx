import type { AnalysisOk } from "@/lib/types";
import { cn, formatCompact, formatPct } from "@/lib/utils";

const TREND = {
  up: "вверх",
  down: "вниз",
  range: "боковик",
} as const;

export function ContextBlocks({
  data,
  compact = false,
}: {
  data: AnalysisOk;
  compact?: boolean;
}) {
  const oi = data.derivatives;
  const mtf = data.higherTf ?? [];
  const events = (data.events ?? []).slice(0, compact ? 1 : 3);

  return (
    <div className="mt-3 grid grid-cols-1 gap-1.5">
      {oi ? (
        <div className="rounded-md bg-bg px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-faint">
            OI и ликвидации
          </p>
          <p className="mt-1 text-xs leading-relaxed text-pretty text-fg">
            {oi.note}
          </p>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-muted">
            лонги {oi.longPct}% · шорты {oi.shortPct}%
            {oi.fundingPct !== undefined
              ? ` · funding ${oi.fundingPct}%`
              : data.funding
                ? ` · funding ${(data.funding.rate * 100).toFixed(4)}%`
                : ""}
          </p>
        </div>
      ) : data.funding ? (
        <div className="rounded-md bg-bg px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-faint">Funding</p>
          <p className="mt-1 font-mono text-xs tabular-nums text-fg">
            {(data.funding.rate * 100).toFixed(4)}% · {data.funding.inst}
          </p>
        </div>
      ) : null}

      {mtf.length ? (
        <p className="text-xs leading-relaxed text-muted">
          <span className="text-faint">Старшие ТФ. </span>
          {mtf
            .map((row) => `${row.label} ${TREND[row.trend]} RSI ${row.rsi}`)
            .join(" · ")}
        </p>
      ) : null}

      {data.correlation ? (
        <p className="text-xs leading-relaxed text-muted">
          <span className="text-faint">vs BTC {data.correlation.value.toFixed(2)}. </span>
          {data.correlation.note}
        </p>
      ) : null}

      {data.sector ? (
        <p className="text-xs leading-relaxed text-muted">
          <span className="text-faint">
            Сектор {data.sector.name} {data.sector.rank}/{data.sector.of}.{" "}
          </span>
          {data.sector.peers
            .map((peer) => `${peer.base} ${formatPct(peer.change24h)}`)
            .join(" · ")}
        </p>
      ) : null}

      {data.vol ? (
        <div className="rounded-md bg-bg px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-faint">
            Волатильность
          </p>
          <p className="mt-1 text-xs leading-relaxed text-fg">
            {data.vol.label} · ATR {data.vol.atrPct}% · ход свечи{" "}
            {data.vol.realizedPct}% · диапазон {data.vol.rangePct}%
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {data.vol.hint} {data.vol.stopHint}
          </p>
        </div>
      ) : null}

      {data.risk ? (
        <p className="text-xs leading-relaxed text-muted">
          <span
            className={cn(
              "text-faint",
              data.risk.label === "high" && "text-short",
            )}
          >
            Риск монеты {data.risk.score}/100.{" "}
          </span>
          {compact ? data.risk.note : data.risk.note}
          {data.risk.capUsd
            ? ` · кап ${formatCompact(data.risk.capUsd)}`
            : ""}
        </p>
      ) : null}

      {data.stats ? (
        <p className="text-xs leading-relaxed text-muted">
          <span className="text-faint">Точность. </span>
          {data.stats.sample
            ? `${data.stats.hitRate}% по ${data.stats.sample} закрытым · ${data.stats.lastNote}`
            : data.stats.lastNote}
        </p>
      ) : null}

      {events.map((item) => (
        <p key={item.title} className="text-xs leading-relaxed text-muted">
          <span className="text-faint">{item.when}. </span>
          {item.title}
          {compact ? "" : ` — ${item.impact}`}
        </p>
      ))}
    </div>
  );
}
