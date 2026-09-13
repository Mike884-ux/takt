import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { telegramSecretOk } = await import("@/lib/api-guard.server");
          const { TOKEN, handleTelegramUpdate } = await import(
            "@/lib/telegram.server"
          );
          if (!telegramSecretOk(request, TOKEN)) {
            return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
          }
          const update = (await request.json()) as { update_id?: number };
          if (!update || typeof update.update_id !== "number") {
            return Response.json({ ok: false }, { status: 400 });
          }
          const work = handleTelegramUpdate(update as { update_id: number });
          const timeout = new Promise((resolve) => setTimeout(resolve, 12_000));
          await Promise.race([work, timeout]);
          return Response.json({ ok: true });
        } catch (error) {
          return Response.json(
            {
              ok: false,
              error: error instanceof Error ? error.message : "telegram",
            },
            { status: 200 },
          );
        }
      },
      GET: async ({ request }) => {
        const { telegramSecretOk } = await import("@/lib/api-guard.server");
        const { TOKEN, telegramReady } = await import("@/lib/telegram.server");
        if (!telegramSecretOk(request, TOKEN)) {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }
        const ready = await telegramReady();
        return Response.json(ready);
      },
    },
  },
});
