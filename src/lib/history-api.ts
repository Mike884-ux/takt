import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { AnalysisOk, ChatMessage } from "@/lib/types";

export type CloudHistory = {
  interval: string;
  messages: ChatMessage[];
  last: AnalysisOk | null;
  empty: boolean;
};

function asJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export const loadHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CloudHistory> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      interval: string;
      messages: unknown;
      last: unknown;
    }>`
      select interval, messages, last
      from user_history
      where user_id = ${context.userId}
      limit 1
    `;
    const row = rows[0];
    if (!row) {
      return { interval: "1h", messages: [], last: null, empty: true };
    }
    const messages = asJson<ChatMessage[]>(row.messages, []);
    return {
      interval: row.interval || "1h",
      messages: Array.isArray(messages) ? messages.slice(-40) : [],
      last: asJson<AnalysisOk | null>(row.last, null),
      empty: !messages.length,
    };
  });

export const saveHistory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Omit<CloudHistory, "empty">) => ({
    interval: String(input.interval || "1h").slice(0, 8),
    messages: (input.messages ?? []).slice(-40),
    last: input.last ?? null,
  }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const messages = JSON.stringify(data.messages);
    const last = JSON.stringify(data.last);
    await sql`
      insert into user_history (user_id, interval, messages, last, updated_at)
      values (${context.userId}, ${data.interval}, ${messages}::jsonb, ${last}::jsonb, now())
      on conflict (user_id) do update set
        interval = excluded.interval,
        messages = excluded.messages,
        last = excluded.last,
        updated_at = now()
    `;
    return { ok: true as const };
  });
