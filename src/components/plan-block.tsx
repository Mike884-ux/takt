import type { TradePlan } from "@/lib/types";
import { bookStats, sizeForBuy } from "@/lib/spot-risk";
import { formatPrice } from "@/lib/utils";
import { useBook } from "@/store/portfolio";

export function PlanBlock({
  plan,
  pair,
  symbol,
  price,
}: {
  plan: TradePlan;
  pair: string;
  symbol: string;
  price: number;
}) {
  const cash = useBook((s) => s.cash);
  const holdings = useBook((s) => s.holdings);
  const risk = useBook((s) => s.risk);
  const marketBuy = useBook((s) => s.marketBuy);
  const stats = bookStats(holdings, new Map([[symbol, price]]), cash, risk);
  const usd = sizeForBuy(symbol, stats.equity, cash, Math.round(risk.clipPct * 100), risk);
  const spot = plan.side !== "SHORT";

  return (
    <div className="mt-4 rounded-md bg-bg px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-faint">Спот · рынок</p>
      <p className="mt-1.5 font-display text-base font-semibold leading-snug text-fg">
        {plan.entryTf === "none" || !spot
          ? "На споте не покупать"
          : `Покупка по рынку · ${plan.entryTfLabel}`}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        {!spot
          ? "Это шорт. В спот не кладём — только купить монету."
          : plan.entryTfWhy}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs text-faint">Стоп</p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-short">
            {formatPrice(price * (1 - risk.stopPct))}
          </p>
        </div>
        <div>
          <p className="text-xs text-faint">Цель</p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-long">
            {formatPrice(price * (1 + risk.targetPct))}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Ордер ≈ ${usd.toFixed(0)} из кэша ${cash.toFixed(0)}. Цену писать не нужно.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-fg/90">{plan.control}</p>
      {spot && usd >= 5 ? (
        <button
          type="button"
          onClick={() => marketBuy({ pair, symbol, price, usd })}
          className="mt-3 h-10 w-full rounded-sm bg-long text-sm text-primary-fg"
        >
          Купить по рынку · {formatPrice(price)}
        </button>
      ) : null}
    </div>
  );
}