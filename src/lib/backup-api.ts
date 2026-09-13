import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { DEFAULT_RISK, type RiskSettings } from "@/lib/spot-risk";
import type { CloudBook } from "@/lib/book-api";
import type { CloudHistory } from "@/lib/history-api";

export type BackupKind = "auto" | "manual";

export type BackupPayload = {
  book: Omit<CloudBook, "empty">;
  history: Omit<CloudHistory, "empty">;
};

export type BackupRow = {
  id: number;
  kind: BackupKind;
  createdAt: number;
  holdings: number;
  fills: number;
  messages: number;
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

function asKind(value: string): BackupKind {
  return value === "manual" ? "manual" : "auto";
}

async function snapshot(userId: string): Promise<BackupPayload> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const books = await sql<{
    cash: number;
    holdings: unknown;
    fills: unknown;
    risk: unknown;
    last_daily: string;
  }>`
    select cash, holdings, fills, risk, last_daily
    from user_books
    where user_id = ${userId}
    limit 1
  `;
  const histories = await sql<{
    interval: string;
    messages: unknown;
    last: unknown;
  }>`
    select interval, messages, last
    from user_history
    where user_id = ${userId}
    limit 1
  `;
  const book = books[0];
  const history = histories[0];
  return {
    book: {
      cash: Number(book?.cash) || 0,
      holdings: asJson(book?.holdings, []),
      fills: asJson(book?.fills, []),
      risk: { ...DEFAULT_RISK, ...asJson<Partial<RiskSettings>>(book?.risk, {}) },
      lastDaily: book?.last_daily ?? "",
    },
    history: {
      interval: history?.interval || "1h",
      messages: asJson(history?.messages, []),
      last: asJson(history?.last, null),
    },
  };
}

async function writeBackup(userId: string, kind: BackupKind) {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const payload = await snapshot(userId);
  const body = JSON.stringify(payload);
  const rows = await sql<{ id: number; created_at: string }>`
    insert into user_backups (user_id, kind, payload)
    values (${userId}, ${kind}, ${body}::jsonb)
    returning id, created_at
  `;
  if (kind === "auto") {
    await sql`
      delete from user_backups
      where user_id = ${userId}
        and kind = 'auto'
        and id not in (
          select id from user_backups
          where user_id = ${userId} and kind = 'auto'
          order by created_at desc
          limit 7
        )
    `;
  } else {
    await sql`
      delete from user_backups
      where user_id = ${userId}
        and kind = 'manual'
        and id not in (
          select id from user_backups
          where user_id = ${userId} and kind = 'manual'
          order by created_at desc
          limit 12
        )
    `;
  }
  return { id: rows[0]?.id ?? 0, payload };
}

export const listBackups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BackupRow[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      kind: string;
      created_at: string;
      payload: unknown;
    }>`
      select id, kind, created_at, payload
      from user_backups
      where user_id = ${context.userId}
      order by created_at desc
      limit 20
    `;
    return rows.map((row) => {
      const payload = asJson<BackupPayload>(row.payload, {
        book: {
          cash: 0,
          holdings: [],
          fills: [],
          risk: DEFAULT_RISK,
          lastDaily: "",
        },
        history: { interval: "1h", messages: [], last: null },
      });
      return {
        id: Number(row.id),
        kind: asKind(row.kind),
        createdAt: new Date(row.created_at).getTime() || Date.now(),
        holdings: payload.book.holdings.length,
        fills: payload.book.fills.length,
        messages: payload.history.messages.length,
      };
    });
  });

export const createBackup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind?: string } | undefined) => ({
    kind: asKind(String(input?.kind ?? "manual")),
  }))
  .handler(async ({ context, data }) => {
    const made = await writeBackup(context.userId, data.kind);
    return { ok: true as const, id: made.id };
  });

export const maybeAutoBackup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const recent = await sql<{ created_at: string }>`
      select created_at
      from user_backups
      where user_id = ${context.userId} and kind = 'auto'
      order by created_at desc
      limit 1
    `;
    const last = recent[0]?.created_at
      ? new Date(recent[0].created_at).getTime()
      : 0;
    if (Date.now() - last < 20 * 3600_000) {
      return { ok: true as const, skipped: true };
    }
    await writeBackup(context.userId, "auto");
    return { ok: true as const, skipped: false };
  });

export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number }) => ({ id: Number(input.id) || 0 }))
  .handler(async ({ context, data }): Promise<BackupPayload> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ payload: unknown }>`
      select payload from user_backups
      where id = ${data.id} and user_id = ${context.userId}
      limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Копия не найдена");
    const payload = asJson<BackupPayload>(row.payload, {
      book: {
        cash: 0,
        holdings: [],
        fills: [],
        risk: DEFAULT_RISK,
        lastDaily: "",
      },
      history: { interval: "1h", messages: [], last: null },
    });
    const holdings = JSON.stringify(payload.book.holdings ?? []);
    const fills = JSON.stringify(payload.book.fills ?? []);
    const risk = JSON.stringify(payload.book.risk ?? DEFAULT_RISK);
    const messages = JSON.stringify(payload.history.messages ?? []);
    const last = JSON.stringify(payload.history.last ?? null);
    await sql`
      insert into user_books (user_id, cash, holdings, fills, risk, last_daily, updated_at)
      values (
        ${context.userId},
        ${payload.book.cash},
        ${holdings}::jsonb,
        ${fills}::jsonb,
        ${risk}::jsonb,
        ${payload.book.lastDaily},
        now()
      )
      on conflict (user_id) do update set
        cash = excluded.cash,
        holdings = excluded.holdings,
        fills = excluded.fills,
        risk = excluded.risk,
        last_daily = excluded.last_daily,
        updated_at = now()
    `;
    await sql`
      insert into user_history (user_id, interval, messages, last, updated_at)
      values (
        ${context.userId},
        ${payload.history.interval || "1h"},
        ${messages}::jsonb,
        ${last}::jsonb,
        now()
      )
      on conflict (user_id) do update set
        interval = excluded.interval,
        messages = excluded.messages,
        last = excluded.last,
        updated_at = now()
    `;
    return payload;
  });

export const getBackup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number }) => ({ id: Number(input.id) || 0 }))
  .handler(async ({ context, data }): Promise<BackupPayload> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ payload: unknown }>`
      select payload from user_backups
      where id = ${data.id} and user_id = ${context.userId}
      limit 1
    `;
    if (!rows[0]) throw new Error("Копия не найдена");
    return asJson<BackupPayload>(rows[0].payload, {
      book: {
        cash: 0,
        holdings: [],
        fills: [],
        risk: DEFAULT_RISK,
        lastDaily: "",
      },
      history: { interval: "1h", messages: [], last: null },
    });
  });
