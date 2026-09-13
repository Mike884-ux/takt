import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUsd } from "@/lib/utils";

type Pt = { t: number; v: number };

function padDomain(points: Pt[]) {
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = span > 0 ? span * 0.16 : Math.max(Math.abs(max) * 0.01, 0.01);
  return [min - pad, max + pad] as [number, number];
}

function when(t: number) {
  const d = new Date(t);
  const sameDay = Date.now() - t < 36 * 60 * 60 * 1000;
  return sameDay
    ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function EquityChart({
  points,
  up,
  cost,
}: {
  points: Pt[];
  up: boolean;
  cost?: number;
}) {
  const gid = useId().replace(/:/g, "");
  const stroke = up ? "var(--color-long)" : "var(--color-short)";
  if (points.length < 2) {
    return <div className="h-48 rounded-sm bg-bg" />;
  }
  const domain = padDomain(points);
  const last = points[points.length - 1]!;
  const hi = points.reduce((a, b) => (a.v > b.v ? a : b));
  const lo = points.reduce((a, b) => (a.v < b.v ? a : b));
  const marked = points.map((p, i) => ({
    ...p,
    last: i === points.length - 1 ? p.v : undefined,
    basis: cost,
  }));

  return (
    <div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={marked} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.34} />
                <stop offset="70%" stopColor={stroke} stopOpacity={0.05} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="var(--color-border)"
              strokeOpacity={0.7}
            />
            <XAxis dataKey="t" hide />
            <YAxis domain={domain} hide />
            <Tooltip
              cursor={{ stroke: "var(--color-faint)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as Pt | undefined;
                if (!active || !row) return null;
                return (
                  <div className="rounded-sm bg-surface px-2 py-1.5 text-xs shadow-[var(--shadow-border)]">
                    <p className="font-mono tabular-nums text-fg">${formatUsd(row.v)}</p>
                    <p className="mt-0.5 text-faint">{when(row.t)}</p>
                  </div>
                );
              }}
            />
            <Area
              type="linear"
              dataKey="v"
              stroke={stroke}
              strokeWidth={2}
              fill={`url(#${gid})`}
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 0, fill: stroke }}
            />
            {cost && cost > 0 ? (
              <Line
                type="linear"
                dataKey="basis"
                stroke="var(--color-faint)"
                strokeWidth={1}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
                legendType="none"
              />
            ) : null}
            <Line
              type="linear"
              dataKey="last"
              stroke={stroke}
              strokeWidth={0}
              dot={{ r: 3.5, fill: stroke, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-faint">
        <span>мин ${formatUsd(lo.v)}</span>
        <span>сейчас ${formatUsd(last.v)}</span>
        <span>макс ${formatUsd(hi.v)}</span>
      </div>
    </div>
  );
}

export function Spark({
  points,
  up,
}: {
  points: Pt[];
  up: boolean;
}) {
  const gid = useId().replace(/:/g, "");
  const stroke = up ? "var(--color-long)" : "var(--color-short)";
  if (points.length < 2) return <div className="h-8 w-16" />;
  const domain = padDomain(points);
  return (
    <div className="h-8 w-16 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={domain} hide />
          <Area
            type="linear"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.4}
            fill={`url(#${gid})`}
            isAnimationActive={false}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
