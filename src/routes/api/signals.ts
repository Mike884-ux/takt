import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/signals")({
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
          const rows = await listSignals(80);
          return Response.json({
            ok: true,
            count: rows.length,
            signals: rows,
          });
        } catch (error) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "db" },
            { status: 503 },
          );
        }
      },
    },
  },
});
