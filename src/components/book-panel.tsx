import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listTickers, spotCurve } from "@/lib/analyze";
import { bookStats, coinOf, manageRisk, pairOf, RISK_PRESETS, SPOT_COINS, SPOT_UNIVERSE } from "@/lib/spot-risk";
import { BOOK_TFS, CURVE_RANGES, type CurveRange } from "@/lib/types";
import { cn, formatPct, formatPrice, formatQty, formatUsd } from "@/lib/utils";
import { holdingPnl, useBook } from "@/store/portfolio";
import { EquityChart, Spark } from "@/components/equity-chart";
import { BackupPanel } from "@/components/backup-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

type Screen = "home" | "pick" | "tx" | "risk" | "backup";

function Mark({ symbol }: { symbol: string }) {
  const coin = coinOf(symbol);
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold text-bg"
      style={{ background: coin.tone }}
    >
      {coin.base.length > 4 ? coin.base.slice(0, 3) : coin.base}
    </span>
  );
}

function pad(raw: string, key: string) {
  if (key === "⌫") {
    return raw.length <= 1 ? "0" : raw.slice(0, -1);
  }
  if (key === ".") {
    if (raw.includes(".")) return raw;
    return raw === "" ? "0." : `${raw}.`;
  }
  if (raw === "0") return key;
  if (raw.replace(".", "").length >= 12) return raw;
  return `${raw}${key}`;
}

function numOf(raw: string) {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function BookPanel({
  onClose,
  onReview,
}: {
  onClose: () => void;
  onReview: (interval: string) => void;
  onIdeas?: () => void;
}) {
  const cash = useBook((s) => s.cash);
  const holdings = useBook((s) => s.holdings);
  const fills = useBook((s) => s.fills);
  const risk = useBook((s) => s.risk);
  const lastError = useBook((s) => s.lastError);
  const setCash = useBook((s) => s.setCash);
  const setRisk = useBook((s) => s.setRisk);
  const applyStops = useBook((s) => s.applyStops);
  const recordTx = useBook((s) => s.recordTx);
  const [screen, setScreen] = useState<Screen>("home");
  const [tab, setTab] = useState<"assets" | "alloc" | "fills">("assets");
  const [range, setRange] = useState<CurveRange>("24h");
  const [analyzeTf, setAnalyzeTf] = useState("1d");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [unit, setUnit] = useState<"coin" | "usd">("coin");
  const [amount, setAmount] = useState("0");
  const [priceRaw, setPriceRaw] = useState("");
  const [feeRaw, setFeeRaw] = useState("0");
  const [spendCash, setSpendCash] = useState(false);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [editPrice, setEditPrice] = useState(false);

  const watch = useMemo(
    () => [...new Set([...SPOT_UNIVERSE, ...holdings.map((row) => row.symbol)])],
    [holdings],
  );
  const tickers = useQuery({
    queryKey: ["spot-tickers", watch.join(",")],
    queryFn: () => listTickers({ data: { symbols: watch } }),
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
  const priceOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of tickers.data ?? []) map.set(row.symbol, row.price);
    return map;
  }, [tickers.data]);
  const changeOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of tickers.data ?? []) map.set(row.symbol, row.change24h);
    return map;
  }, [tickers.data]);

  const stats = bookStats(holdings, priceOf, cash, risk);
  const managed = manageRisk(holdings, priceOf, changeOf, cash, risk);
  const scored = managed.scored;
  const cost = holdings.reduce((sum, row) => sum + row.entry * row.qty, 0);
  const earned = stats.deployed - cost;
  const realized = fills.reduce((sum, fill) => sum + (fill.pnl ?? 0), 0);

  const curve = useQuery({
    queryKey: [
      "spot-curve",
      range,
      cash,
      holdings.map((row) => `${row.symbol}:${row.qty}`).join("|"),
    ],
    queryFn: () =>
      spotCurve({
        data: {
          cash,
          range,
          lots: holdings.map((row) => ({ symbol: row.symbol, qty: row.qty })),
        },
      }),
    enabled: holdings.length > 0,
    staleTime: 60_000,
  });

  const delta = curve.data?.delta ?? 0;
  const deltaPct = curve.data?.pct ?? 0;
  const up = (curve.data ? delta : earned) >= 0;
  const live = priceOf.get(symbol);
  const px = editPrice ? numOf(priceRaw) : (live ?? numOf(priceRaw));
  const qty =
    unit === "usd" && px > 0 ? numOf(amount) / px : numOf(amount);
  const usd = qty * (px || 0);
  const have = holdings.find((row) => row.symbol === symbol);
  const coin = coinOf(symbol);
  const filtered = SPOT_COINS.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      item.base.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
    );
  });

  function openTx(next: string, nextSide: "buy" | "sell" = "buy") {
    setSymbol(next);
    setSide(nextSide);
    setAmount("0");
    setFeeRaw("0");
    setEditPrice(false);
    setPriceRaw("");
    setNote("");
    setScreen("tx");
  }

  function submitTx() {
    if (!(qty > 0) || !(px > 0)) {
      setNote("Введи количество. Цена подставится с рынка, можно поправить.");
      return;
    }
    const result = recordTx({
      side,
      pair: pairOf(symbol),
      symbol,
      qty,
      price: px,
      fee: numOf(feeRaw),
      spendCash: side === "buy" ? spendCash : false,
    });
    if (result.ok) {
      setNote(
        side === "buy"
          ? `Записал покупку ${formatQty(qty)} ${coin.base} по ${formatPrice(px)}`
          : `Записал продажу ${formatQty(qty)} ${coin.base} по ${formatPrice(px)}`,
      );
      setAmount("0");
      setScreen("home");
    } else {
      setNote(result.error);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-bg/70">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Закрыть спот"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface px-5 py-5 shadow-[var(--shadow-border)]">
        {screen === "home" ? (
          <>
            <header className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-faint">Спот</p>
                <h2 className="mt-1 font-display text-xl font-semibold text-fg">
                  Портфель
                </h2>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setScreen("backup")}>
                  Копии
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setScreen("risk")}>
                  Риск
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={onClose}
                  aria-label="Закрыть"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </header>

            <p className="mt-6 font-display text-[40px] font-semibold leading-none tabular-nums tracking-tight text-fg">
              {holdings.length ? `$${formatUsd(stats.equity)}` : "$0.00"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p
                className={`text-sm ${
                  holdings.length ? (up ? "text-long" : "text-short") : "text-muted"
                }`}
              >
                {holdings.length && curve.data
                  ? `${delta >= 0 ? "+" : ""}${formatUsd(delta)} $ · ${formatPct(deltaPct)}`
                  : holdings.length
                    ? "Считаю график…"
                    : "Добавь сделку — появится баланс"}
              </p>
              {holdings.length ? (
                <span
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 text-[11px]",
                    scored.grade === "low"
                      ? "bg-long-dim text-long"
                      : scored.grade === "medium"
                        ? "bg-wait-dim text-wait"
                        : "bg-short-dim text-short",
                  )}
                >
                  {scored.label} · {scored.score}
                </span>
              ) : null}
            </div>
            {holdings.length ? (
              <p className="mt-1 text-xs text-muted">
                От входа {earned >= 0 ? "+" : ""}${formatUsd(earned)}
                {realized ? ` · с продаж ${realized >= 0 ? "+" : ""}$${formatUsd(realized)}` : ""}
                {scored.notes[0] ? ` · ${scored.notes[0]}` : ""}
              </p>
            ) : null}

            {fills[0] ? (
              <p className="mt-1 text-xs text-muted">
                В портфеле: {fills[0].side === "buy" ? "купил" : "продал"}{" "}
                {formatQty(fills[0].qty)} {coinOf(fills[0].symbol).base} по{" "}
                {formatPrice(fills[0].price)}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-1">
              {CURVE_RANGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRange(item.id)}
                  className={cn(
                    "h-7 rounded-sm px-2.5 text-[11px]",
                    range === item.id ? "bg-bg text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-1">
              <EquityChart
                points={curve.data?.points ?? []}
                up={up}
                cost={holdings.length ? cost + cash : undefined}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                className="h-10"
                onClick={() => onReview(analyzeTf)}
                disabled={!holdings.length}
              >
                Анализ · {BOOK_TFS.find((item) => item.id === analyzeTf)?.label ?? analyzeTf}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => setScreen("pick")}
              >
                + Сделка
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {BOOK_TFS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAnalyzeTf(item.id)}
                  className={cn(
                    "h-7 rounded-sm px-2 font-mono text-[11px]",
                    analyzeTf === item.id
                      ? "bg-primary text-primary-fg"
                      : "bg-bg text-muted hover:text-fg",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-1 rounded-sm bg-bg p-1">
              {(
                [
                  ["assets", "Активы"],
                  ["alloc", "Доли"],
                  ["fills", "Сделки"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "h-8 rounded-sm text-xs",
                    tab === id ? "bg-surface text-fg" : "text-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "assets" ? (
              <ul className="mt-2">
                {holdings.length ? (
                  holdings
                    .slice()
                    .sort((a, b) => {
                      const va = (priceOf.get(a.symbol) ?? a.entry) * a.qty;
                      const vb = (priceOf.get(b.symbol) ?? b.entry) * b.qty;
                      return vb - va;
                    })
                    .map((row) => {
                      const price = priceOf.get(row.symbol);
                      const chg = changeOf.get(row.symbol);
                      const value = (price ?? row.entry) * row.qty;
                      const pnl = price !== undefined ? holdingPnl(row, price) : null;
                      const meta = coinOf(row.symbol);
                      const riskRow = managed.rows.find((item) => item.row.symbol === row.symbol);
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            onClick={() => openTx(row.symbol)}
                            className="flex w-full items-center gap-3 border-t border-border py-3 text-left first:border-t-0"
                          >
                            <Mark symbol={row.symbol} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-fg">{meta.base}</p>
                              <p className="mt-0.5 font-mono text-xs text-muted">
                                {price ? formatPrice(price) : "—"}{" "}
                                {chg !== undefined ? (
                                  <span className={chg >= 0 ? "text-long" : "text-short"}>
                                    {formatPct(chg)}
                                  </span>
                                ) : null}
                              </p>
                              {riskRow ? (
                                <p
                                  className={cn(
                                    "mt-0.5 text-[11px]",
                                    riskRow.stopHit
                                      ? "text-short"
                                      : riskRow.nearStop
                                        ? "text-wait"
                                        : "text-faint",
                                  )}
                                >
                                  {riskRow.stopHit
                                    ? "стоп — продавать"
                                    : `стоп ${formatPrice(riskRow.stop)} · ${riskRow.toStop.toFixed(0)}%`}
                                  {` · цель ${formatPrice(riskRow.target)}`}
                                </p>
                              ) : null}
                            </div>
                            <Spark
                              points={
                                ((curve.data?.sparks as Record<string, unknown> | undefined)?.[
                                  row.symbol
                                ] as never) ?? []
                              }
                              up={(chg ?? 0) >= 0}
                            />
                            <div className="text-right">
                              <p className="font-mono text-sm tabular-nums text-fg">
                                ${formatUsd(value)}
                              </p>
                              <p className="mt-0.5 font-mono text-xs text-muted">
                                {formatQty(row.qty)} {meta.base}
                              </p>
                              {pnl ? (
                                <p
                                  className={`mt-0.5 font-mono text-xs ${
                                    pnl.pnl >= 0 ? "text-long" : "text-short"
                                  }`}
                                >
                                  {pnl.pnl >= 0 ? "+" : ""}${formatUsd(pnl.pnl)}
                                </p>
                              ) : null}
                            </div>
                          </button>
                        </li>
                      );
                    })
                ) : (
                  <p className="mt-4 text-sm leading-relaxed text-muted">
                    Пусто. Добавь сделку: монета, сколько купил, цена. После этого
                    здесь будет баланс, график и кнопка «Анализировать».
                  </p>
                )}
              </ul>
            ) : null}

            {tab === "alloc" ? (
              <ul className="mt-4 space-y-3">
                {stats.rows.length ? (
                  stats.rows
                    .slice()
                    .sort((a, b) => b.weight - a.weight)
                    .map((item) => (
                      <li key={item.row.symbol}>
                        <div className="flex justify-between text-xs">
                          <span className="text-fg">{coinOf(item.row.symbol).base}</span>
                          <span className="font-mono text-muted">
                            {(item.weight * 100).toFixed(1)}% · ${formatUsd(item.value)}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${Math.min(100, item.weight * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))
                ) : (
                  <p className="text-sm text-muted">Сначала добавь монеты.</p>
                )}
                <p className="text-xs text-faint">
                  USDT {(stats.cashPct * 100).toFixed(0)}% · ${formatUsd(cash)}
                </p>
              </ul>
            ) : null}

            {tab === "fills" ? (
              <ul className="mt-3">
                {fills.length ? (
                  fills.slice(0, 20).map((fill) => (
                    <li
                      key={fill.id}
                      className="border-t border-border py-3 font-mono text-xs first:border-t-0 first:pt-0"
                    >
                      <span className={fill.side === "buy" ? "text-long" : "text-short"}>
                        {fill.side === "buy" ? "Покупка" : "Продажа"}
                      </span>{" "}
                      <span className="text-fg">{coinOf(fill.symbol).base}</span>
                      <span className="text-muted">
                        {" · "}
                        {formatQty(fill.qty)} × {formatPrice(fill.price)} · $
                        {formatUsd(fill.usd)}
                        {fill.pnl !== undefined
                          ? ` · ${fill.pnl >= 0 ? "+" : ""}${formatUsd(fill.pnl)}`
                          : ""}
                      </span>
                    </li>
                  ))
                ) : (
                  <p className="mt-3 text-sm text-muted">Сделок ещё нет.</p>
                )}
              </ul>
            ) : null}
          </>
        ) : null}

        {screen === "pick" ? (
          <>
            <header className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-fg">
                Добавить сделку
              </h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setScreen("home")}>
                Назад
              </Button>
            </header>
            <Input
              className="mt-4"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти монету"
              aria-label="Поиск монеты"
            />
            <p className="mt-3 text-xs text-faint">Из списка</p>
            <ul className="mt-1">
              {filtered.map((item) => (
                <li key={item.symbol}>
                  <button
                    type="button"
                    onClick={() => openTx(item.symbol)}
                    className="flex w-full items-center gap-3 border-t border-border py-3 text-left first:border-t-0"
                  >
                    <Mark symbol={item.symbol} />
                    <div className="min-w-0">
                      <p className="text-sm text-fg">
                        {item.base}{" "}
                        <span className="text-muted">{item.name}</span>
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-muted">
                        {priceOf.get(item.symbol)
                          ? `${formatPrice(priceOf.get(item.symbol)!)} $`
                          : "—"}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {screen === "tx" ? (
          <>
            <header className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => setScreen("pick")}
              >
                ← {coin.name}
              </button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setScreen("home")}>
                Закрыть
              </Button>
            </header>

            <div className="mt-4 grid grid-cols-2 gap-1 rounded-sm bg-bg p-1">
              <button
                type="button"
                onClick={() => setSide("buy")}
                className={cn(
                  "h-9 rounded-sm text-sm",
                  side === "buy" ? "bg-surface text-long" : "text-muted",
                )}
              >
                Купить
              </button>
              <button
                type="button"
                onClick={() => setSide("sell")}
                className={cn(
                  "h-9 rounded-sm text-sm",
                  side === "sell" ? "bg-surface text-short" : "text-muted",
                )}
              >
                Продать
              </button>
            </div>

            <div className="mt-8 text-center">
              <p className="font-display text-5xl font-semibold tabular-nums text-fg">
                {amount}
                <span className="ml-2 text-lg text-muted">
                  {unit === "coin" ? coin.base : "USD"}
                </span>
              </p>
              <p className="mt-2 text-sm text-muted">
                {unit === "coin"
                  ? `${formatUsd(usd)} $`
                  : `${formatQty(qty)} ${coin.base}`}
                {live ? ` · ${formatPrice(live)} $ за монету` : ""}
              </p>
              {have ? (
                <p className="mt-1 text-xs text-faint">
                  В портфеле {formatQty(have.qty)} {coin.base} · вход{" "}
                  {formatPrice(have.entry)}
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setUnit(unit === "coin" ? "usd" : "coin")}
                className="h-8 rounded-sm bg-bg px-2.5 text-xs text-muted"
              >
                {unit === "coin" ? "В USD" : `В ${coin.base}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditPrice(true);
                  setPriceRaw(live ? String(live) : priceRaw);
                }}
                className="h-8 rounded-sm bg-bg px-2.5 text-xs text-muted"
              >
                Цена за монету
              </button>
              {have && side === "sell" ? (
                <button
                  type="button"
                  onClick={() => {
                    setUnit("coin");
                    setAmount(String(have.qty));
                  }}
                  className="h-8 rounded-sm bg-bg px-2.5 text-xs text-muted"
                >
                  Всё
                </button>
              ) : null}
            </div>

            {editPrice ? (
              <label className="mt-3 block text-xs text-faint">
                Купил / продал по цене
                <Input
                  className="mt-1.5"
                  value={priceRaw}
                  inputMode="decimal"
                  onChange={(event) => setPriceRaw(event.target.value)}
                />
              </label>
            ) : null}

            {side === "buy" ? (
              <label className="mt-3 flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={spendCash}
                  onChange={(event) => setSpendCash(event.target.checked)}
                />
                Списать USDT с баланса Takt
              </label>
            ) : null}

            <label className="mt-3 block text-xs text-faint">
              Комиссия, $
              <Input
                className="mt-1.5"
                value={feeRaw}
                inputMode="decimal"
                onChange={(event) => setFeeRaw(event.target.value)}
              />
            </label>

            {(note || lastError) ? (
              <p className="mt-3 text-sm leading-relaxed text-wait">
                {note || lastError}
              </p>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-faint">
                Если уже купил на Binance — просто введи сколько монет. Цена с
                рынка, можно поставить свою (по какой реально брал).
              </p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map(
                (key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAmount((raw) => pad(raw, key))}
                    className="h-12 rounded-sm bg-bg font-mono text-lg text-fg"
                  >
                    {key}
                  </button>
                ),
              )}
            </div>
            <Button type="button" className="mt-3 h-12 w-full" onClick={submitTx}>
              {side === "buy" ? "Добавить покупку" : "Добавить продажу"}
            </Button>
          </>
        ) : null}

        {screen === "risk" ? (
          <div>
            <header className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-fg">
                Управление риском
              </h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setScreen("home")}>
                Назад
              </Button>
            </header>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Сначала сколько можно потерять, потом размер сделки. В минус не
              докупаем.
            </p>

            {holdings.length ? (
              <div className="mt-4 space-y-2 rounded-sm bg-bg px-3 py-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Если все стопы</span>
                  <span className="font-mono text-short">
                    −${formatUsd(managed.moneyAtRisk)} ·{" "}
                    {(managed.openPct * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Бюджет на сделку</span>
                  <span className="font-mono text-fg">
                    ${formatUsd(managed.budget)} ·{" "}
                    {Math.round(risk.riskPerTrade * 1000) / 10}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Рынок −20% (альты сильнее)</span>
                  <span className="font-mono text-short">
                    ${formatUsd(managed.crashValue)} · {managed.crashPct.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  {(
                    [
                      ["Ядро", managed.buckets.core],
                      ["Рост", managed.buckets.growth],
                      ["Мемы", managed.buckets.spec],
                    ] as const
                  ).map(([label, w]) => (
                    <div key={label} className="rounded-sm bg-surface px-1 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-faint">
                        {label}
                      </p>
                      <p className="mt-1 font-mono text-sm text-fg">
                        {(w * 100).toFixed(0)}%
                      </p>
                    </div>
                  ))}
                </div>
                {managed.actions.length ? (
                  <ul className="mt-2 space-y-1">
                    {managed.actions.map((item) => (
                      <li key={item} className="text-xs leading-relaxed text-wait">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-long">Правила держатся.</p>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">
                Добавь сделку — посчитаем, сколько капитала в огне.
              </p>
            )}

            <p className="mt-5 text-[10px] uppercase tracking-[0.16em] text-faint">
              Профиль
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {(Object.keys(RISK_PRESETS) as Array<keyof typeof RISK_PRESETS>).map(
                (id) => {
                  const preset = RISK_PRESETS[id];
                  const on =
                    Math.abs(risk.stopPct - preset.risk.stopPct) < 0.001 &&
                    Math.abs(risk.riskPerTrade - preset.risk.riskPerTrade) < 0.0001;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setRisk(preset.risk)}
                      className={cn(
                        "h-10 rounded-sm text-xs",
                        on ? "bg-primary text-primary-fg" : "bg-bg text-muted",
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                },
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-faint">
              {
                Object.values(RISK_PRESETS).find(
                  (preset) =>
                    Math.abs(risk.stopPct - preset.risk.stopPct) < 0.001 &&
                    Math.abs(risk.riskPerTrade - preset.risk.riskPerTrade) < 0.0001,
                )?.hint ?? "Свой набор правил"
              }
            </p>

            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full"
              disabled={!holdings.length}
              onClick={() => applyStops()}
            >
              Проставить стопы и цели
            </Button>

            {managed.rows.length ? (
              <ul className="mt-4">
                {managed.rows.map((row) => (
                  <li
                    key={row.row.symbol}
                    className="border-t border-border py-3 first:border-t-0 first:pt-0"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="text-fg">{coinOf(row.row.symbol).base}</span>
                      <span className="font-mono text-muted">
                        риск ${formatUsd(row.atRisk)} · R:R 1:{row.rr.toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-faint">
                      стоп {formatPrice(row.stop)} ({row.toStop.toFixed(1)}%) · цель{" "}
                      {formatPrice(row.target)} ({row.toTarget.toFixed(1)}%)
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}

            <label className="mt-5 block text-xs text-faint">
              USDT на балансе (необязательно)
              <Input
                className="mt-1.5"
                value={String(cash)}
                inputMode="decimal"
                onChange={(event) => {
                  const n = Number(event.target.value.replace(",", "."));
                  if (Number.isFinite(n) && n >= 0) setCash(n);
                }}
              />
            </label>
            {(
              [
                ["riskPerTrade", "Риск на сделку, %", 0.3, 3, 100],
                ["cashMin", "Кэш минимум, %", 5, 40, 100],
                ["clipPct", "Макс. ордер, %", 5, 40, 100],
                ["maxCore", "Потолок BTC/ETH, %", 10, 80, 100],
                ["maxAlt", "Потолок альта, %", 5, 40, 100],
                ["maxMeme", "Потолок мемов, %", 5, 40, 100],
                ["stopPct", "Стоп после покупки, %", 3, 25, 100],
                ["targetPct", "Цель после покупки, %", 5, 50, 100],
              ] as const
            ).map(([key, label, min, max, scale]) => (
              <label key={key} className="mt-4 block text-xs text-faint">
                {label}: {(risk[key] * scale).toFixed(key === "riskPerTrade" ? 1 : 0)}
                {key === "riskPerTrade" ? "%" : "%"}
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={key === "riskPerTrade" ? 0.1 : 1}
                  value={risk[key] * scale}
                  onChange={(event) =>
                    setRisk({ [key]: Number(event.target.value) / scale })
                  }
                  className="mt-2 w-full accent-primary"
                />
              </label>
            ))}
          </div>
        ) : null}

        {screen === "backup" ? (
          <BackupPanel onBack={() => setScreen("home")} />
        ) : null}
      </aside>
    </div>
  );
}
