import type { Flow } from "@/lib/types";
import { cn, formatCompact } from "@/lib/utils";

function money(value: number, unit: Flow["unit"]) {
  const n = formatCompact(value);
  return unit === "quote" ? `$${n}` : n;
}

export function FlowTape({ flow }: { flow: Flow }) {
  const nowBuy = flow.lastBuyPct;
  const nowSell = 100 - nowBuy;
  const nowLine =
    nowBuy >= 58
      ? "Сейчас покупают агрессивнее"
      : nowSell >= 58
        ? "Сейчас продают агрессивнее"
        : "Сейчас силы почти равны";
  const book =
    flow.bookBidPct !== undefined && flow.bookAskPct !== undefined
      ? `Стакан: заявки на покупку ${flow.bookBidPct}% · на продажу ${flow.bookAskPct}%`
      : null;

  return (
    <div className="rounded-md bg-bg px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-long">
          Покупки
        </p>
        <p className="text-xs font-medium uppercase tracking-wide text-short">
          Продажи
        </p>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3 font-mono tabular-nums">
        <span className="text-lg text-long">{money(flow.lastBuyVol, flow.unit)}</span>
        <span className="text-xs text-faint">последняя свеча</span>
        <span className="text-lg text-short">{money(flow.lastSellVol, flow.unit)}</span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-2">
        <span className="h-full bg-long" style={{ width: `${nowBuy}%` }} />
        <span className="h-full bg-short" style={{ width: `${nowSell}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-xs tabular-nums">
        <span className="text-long">{nowBuy}%</span>
        <span className="text-short">{nowSell}%</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{nowLine}</p>
      <p className="mt-1 text-xs leading-relaxed text-faint">
        20 свечей: {money(flow.buyVol, flow.unit)} покупок ·{" "}
        {money(flow.sellVol, flow.unit)} продаж
        {flow.bias === "buyers"
          ? " · перевес покупателей"
          : flow.bias === "sellers"
            ? " · перевес продавцов"
            : " · паритет"}
      </p>
      {book ? <p className="mt-1 text-xs leading-relaxed text-faint">{book}</p> : null}
    </div>
  );
}

export function FlowMini({ flow }: { flow: Flow }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
        <span className="h-full bg-long" style={{ width: `${flow.lastBuyPct}%` }} />
        <span
          className="h-full bg-short"
          style={{ width: `${100 - flow.lastBuyPct}%` }}
        />
      </div>
      <span
        className={cn(
          "font-mono text-xs tabular-nums",
          flow.lastBuyPct >= 55
            ? "text-long"
            : flow.lastBuyPct <= 45
              ? "text-short"
              : "text-muted",
        )}
      >
        {flow.lastBuyPct}/{100 - flow.lastBuyPct}
      </span>
    </div>
  );
}
