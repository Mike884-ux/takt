import { Area, Bar, Cell, ComposedChart, ResponsiveContainer, YAxis } from "recharts";
import type { Candle } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PriceChart({
  candles,
  tone,
  compact = false,
}: {
  candles: Candle[];
  tone: "long" | "short" | "wait";
  compact?: boolean;
}) {
  const data = candles
    .filter((c) => Number.isFinite(c.c) && c.c > 0)
    .map((c) => {
    const buy = c.buyV ?? 0;
    const buyish = c.v > 0 ? buy / c.v >= 0.5 : c.c >= c.o;
    return { t: c.t, c: c.c, vol: c.v, buyish };
  });
  const stroke =
    tone === "long"
      ? "var(--color-long)"
      : tone === "short"
        ? "var(--color-short)"
        : "var(--color-muted)";
  const fill =
    tone === "long"
      ? "var(--color-long)"
      : tone === "short"
        ? "var(--color-short)"
        : "var(--color-fg)";

  if (data.length < 2) {
    return <div className={cn("rounded-md bg-surface-2", compact ? "h-28" : "h-40")} />;
  }

  return (
    <div className={cn("w-full", compact ? "h-28" : "h-40")}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="taktPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fill} stopOpacity={0.22} />
              <stop offset="100%" stopColor={fill} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis yAxisId="price" domain={["dataMin", "dataMax"]} hide />
          <YAxis
            yAxisId="vol"
            domain={[0, (max: number) => (max || 1) * 3.2]}
            hide
          />
          <Bar yAxisId="vol" dataKey="vol" maxBarSize={5} isAnimationActive={false}>
            {data.map((row) => (
              <Cell
                key={row.t}
                fill={row.buyish ? "var(--color-long)" : "var(--color-short)"}
                fillOpacity={0.55}
              />
            ))}
          </Bar>
          <Area
            yAxisId="price"
            type="monotone"
            dataKey="c"
            stroke={stroke}
            strokeWidth={1.5}
            fill="url(#taktPrice)"
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
