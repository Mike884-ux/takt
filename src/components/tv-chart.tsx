import { useEffect, useRef } from "react";
import { tvWidgetInterval } from "@/lib/types";

export function TvChart({
  symbol,
  interval,
}: {
  symbol: string;
  interval: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.innerHTML = "";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "240px";
    widget.style.width = "100%";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: false,
      width: "100%",
      height: 240,
      symbol,
      interval: tvWidgetInterval(interval),
      timezone: "Etc/UTC",
      theme: "dark",
      backgroundColor: "#101418",
      style: "1",
      locale: "ru",
      hide_top_toolbar: true,
      hide_legend: true,
      hide_side_toolbar: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      withdateranges: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
    });

    node.appendChild(widget);
    node.appendChild(script);

    return () => {
      node.innerHTML = "";
    };
  }, [symbol, interval]);

  const href = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;

  return (
    <div className="overflow-hidden rounded-md bg-bg shadow-[var(--shadow-border)]">
      <div
        ref={ref}
        className="tradingview-widget-container w-full"
        style={{ height: 240 }}
      />
      <p className="px-3 py-1.5 text-[11px] text-faint">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-muted"
        >
          {symbol} · TradingView
        </a>
      </p>
    </div>
  );
}
