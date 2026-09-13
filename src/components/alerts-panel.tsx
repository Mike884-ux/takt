import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSignalHistory } from "@/lib/analyze";
import { formatPrice } from "@/lib/utils";
import {
  ensureNotifyPermission,
  useAlerts,
  type DeskAlert,
} from "@/store/alerts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function AlertLine({
  item,
  onRemove,
}: {
  item: DeskAlert;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="font-mono text-xs text-fg">{item.pair}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {item.kind === "price"
            ? `${item.op === "above" ? "выше" : "ниже"} ${formatPrice(item.price)}${
                item.fired ? " · сработало" : ""
              }`
            : `смена сигнала${item.last ? ` · сейчас ${item.last}` : ""}`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="h-9 shrink-0 rounded-full px-3 text-xs text-muted hover:text-fg"
      >
        Убрать
      </button>
    </li>
  );
}

export function AlertsPanel({ onClose }: { onClose: () => void }) {
  const items = useAlerts((s) => s.items);
  const fired = useAlerts((s) => s.fired);
  const addPrice = useAlerts((s) => s.addPrice);
  const addSignal = useAlerts((s) => s.addSignal);
  const remove = useAlerts((s) => s.remove);
  const [pair, setPair] = useState("BTC/USDT");
  const [price, setPrice] = useState("");
  const [op, setOp] = useState<"above" | "below">("above");

  const history = useQuery({
    queryKey: ["signal-history"],
    queryFn: () => listSignalHistory(),
    staleTime: 30_000,
  });

  function symbolOf(value: string) {
    return value.replace("/", "").replace("-", "").toUpperCase();
  }

  async function submitPrice() {
    const n = Number(price.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;
    await ensureNotifyPermission();
    addPrice({
      pair: pair.toUpperCase(),
      symbol: symbolOf(pair),
      op,
      price: n,
    });
    setPrice("");
  }

  async function submitSignal() {
    await ensureNotifyPermission();
    addSignal({ pair: pair.toUpperCase(), symbol: symbolOf(pair) });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-bg/70">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Закрыть алерты"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface px-5 py-5 shadow-[var(--shadow-border)]">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-faint">Алерты</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-fg">
              Цена и смена сигнала
            </h2>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </header>

        <div className="mt-5 space-y-3">
          <Input
            value={pair}
            onChange={(event) => setPair(event.target.value)}
            placeholder="BTC/USDT"
            aria-label="Пара для алерта"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOp("above")}
              className={`h-11 flex-1 rounded-md text-sm ${
                op === "above" ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted"
              }`}
            >
              Выше
            </button>
            <button
              type="button"
              onClick={() => setOp("below")}
              className={`h-11 flex-1 rounded-md text-sm ${
                op === "below" ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted"
              }`}
            >
              Ниже
            </button>
          </div>
          <Input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="Цена, например 70000"
            inputMode="decimal"
            aria-label="Цена алерта"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={submitPrice} disabled={!price.trim()}>
              Алерт по цене
            </Button>
            <Button type="button" variant="ghost" onClick={submitSignal}>
              Смена сигнала
            </Button>
          </div>
        </div>

        <ul className="mt-6">
          {items.length ? (
            items.map((item) => (
              <AlertLine key={item.id} item={item} onRemove={remove} />
            ))
          ) : (
            <p className="text-sm text-muted">Пока пусто. Задай цену или следи за сигналом.</p>
          )}
        </ul>

        {fired.length ? (
          <div className="mt-6">
            <p className="text-xs uppercase tracking-wide text-faint">Сработало</p>
            <ul className="mt-2 space-y-2">
              {fired.map((note) => (
                <li key={note.id} className="text-sm leading-relaxed text-muted">
                  {note.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-8 border-t border-border pt-4">
          <p className="text-xs uppercase tracking-wide text-faint">История и API</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Сигналы пишутся в историю и проверяются через несколько часов. Можно
            скачать CSV или забрать JSON.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="/api/export.csv"
              className="inline-flex h-11 items-center rounded-md bg-surface-2 px-4 text-sm text-fg"
            >
              Скачать CSV
            </a>
            <a
              href="/api/signals"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center rounded-md px-4 text-sm text-muted hover:text-fg"
            >
              JSON API
            </a>
          </div>
          {history.data?.length ? (
            <ul className="mt-4 space-y-2">
              {history.data.slice(0, 8).map((row) => (
                <li key={row.id} className="text-xs text-muted">
                  <span className="font-mono text-fg">
                    {row.pair} {row.signal}
                  </span>
                  {" · "}
                  {row.outcome ?? "ждёт проверки"}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
