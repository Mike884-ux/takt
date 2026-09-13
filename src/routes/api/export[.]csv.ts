import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/export.csv")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { requireApiSession, unauthorizedResponse } = await import(
            "@/lib/api-guard.server"
          );
          try {
            await requireApiSession();
          } catch {
            return unauthorizedResponse();
          }
          const { listSignals } = await import("@/lib/signals.server");
          const rows = await listSignals(200);
          const header =
            "id,pair,interval,signal,confidence,price,createdAt,outcome,resultPrice";
          const body = rows
            .map((row) =>
              [
                row.id,
                row.pair,
                row.interval,
                row.signal,
                row.confidence,
                row.price,
                row.createdAt,
                row.outcome ?? "",
                row.resultPrice ?? "",
              ].join(","),
            )
            .join("\n");
          return new Response(`${header}\n${body}\n`, {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": "attachment; filename=takt-signals.csv",
            },
          });
        } catch {
          return new Response("id,pair\n", {
            status: 503,
            headers: { "Content-Type": "text/csv" },
          });
        }
      },
    },
  },
});
