import type { VolumePack } from "@/lib/types";
import { cn, formatCompact, formatPct, formatPrice } from "@/lib/utils";

export function VolumeStrip({ volume }: { volume: VolumePack }) {
  const items = [
    {
      k: "VWAP",
      v: formatPrice(volume.vwap),
      sub: `${volume.vwapSide === "above" ? "цена выше" : "цена ниже"} ${formatPct(volume.vsVwapPct)}`,
      tone: volume.vwapSide === "above" ? "text-long" : "text-short",
    },
    {
      k: "Дельта",
      v: `${volume.delta >= 0 ? "+" : ""}${formatCompact(volume.delta)}`,
      sub: `свеча ${volume.deltaPct >= 0 ? "+" : ""}${volume.deltaPct}%`,
      tone: volume.delta >= 0 ? "text-long" : "text-short",
    },
    {
      k: "CVD",
      v: `${volume.cvd >= 0 ? "+" : ""}${formatCompact(volume.cvd)}`,
      sub:
        volume.cvdBias === "buyers"
          ? "накопление покупок"
          : volume.cvdBias === "sellers"
            ? "накопление продаж"
            : "без края",
      tone:
        volume.cvdBias === "buyers"
          ? "text-long"
          : volume.cvdBias === "sellers"
            ? "text-short"
            : "text-muted",
    },
    {
      k: "RelVol",
      v: `${volume.relVol}x`,
      sub: volume.spike ? "всплеск объёма" : volume.relVol < 0.85 ? "объём слабый" : "к средней 20",
      tone: volume.spike ? "text-wait" : "text-muted",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item.k} className="rounded-md bg-bg px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-faint">{item.k}</p>
          <p className={cn("mt-0.5 font-mono text-sm tabular-nums", item.tone)}>
            {item.v}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-faint">{item.sub}</p>
        </div>
      ))}
    </div>
  );
}
