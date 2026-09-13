import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBackup,
  getBackup,
  listBackups,
  restoreBackup,
} from "@/lib/backup-api";
import { useBook } from "@/store/portfolio";
import { useDesk } from "@/store/desk";
import { Button } from "@/components/ui/button";

function when(at: number) {
  try {
    return new Date(at).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function BackupPanel({ onBack }: { onBack: () => void }) {
  const client = useQueryClient();
  const hydrateCloud = useBook((s) => s.hydrateCloud);
  const hydrateDesk = useDesk((s) => s.hydrate);
  const [note, setNote] = useState("");
  const list = useQuery({
    queryKey: ["backups"],
    queryFn: () => listBackups(),
    staleTime: 15_000,
  });

  const make = useMutation({
    mutationFn: () => createBackup({ data: { kind: "manual" } }),
    onSuccess: () => {
      setNote("Копия записана.");
      void client.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: () => setNote("Не записалось. Войди и попробуй ещё раз."),
  });

  const restore = useMutation({
    mutationFn: (id: number) => restoreBackup({ data: { id } }),
    onSuccess: (payload) => {
      hydrateCloud(payload.book);
      hydrateDesk(payload.history);
      setNote("Восстановил портфель и историю.");
      void client.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: () => setNote("Эту копию не удалось открыть."),
  });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-faint">
            База
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-fg">
            Резервные копии
          </h2>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          Назад
        </Button>
      </header>

      <p className="text-sm leading-relaxed text-muted">
        Раз в сутки копия пишется сама. Можно сделать ещё вручную и откатиться
        к любой точке.
      </p>

      <Button
        type="button"
        className="h-10"
        disabled={make.isPending}
        onClick={() => make.mutate()}
      >
        {make.isPending ? "Пишу…" : "Сделать копию сейчас"}
      </Button>

      {note ? <p className="text-sm text-muted">{note}</p> : null}

      <ul className="space-y-2">
        {(list.data ?? []).map((row) => (
          <li
            key={row.id}
            className="rounded-sm bg-bg px-3 py-3 shadow-[var(--shadow-border)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-fg">{when(row.createdAt)}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {row.kind === "auto" ? "Авто" : "Вручную"} · {row.holdings}{" "}
                  монет · {row.fills} сделок · {row.messages} сообщений
                </p>
              </div>
            </div>
            <div className="mt-2 flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={restore.isPending}
                onClick={() => restore.mutate(row.id)}
              >
                Восстановить
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  void getBackup({ data: { id: row.id } }).then((payload) =>
                    downloadJson(
                      `takt-${new Date(row.createdAt).toISOString().slice(0, 10)}.json`,
                      payload,
                    ),
                  );
                }}
              >
                Скачать
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {!list.isLoading && !(list.data ?? []).length ? (
        <p className="text-sm text-muted">Пока пусто — нажми «Сделать копию».</p>
      ) : null}
    </div>
  );
}
