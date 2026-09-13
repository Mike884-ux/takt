import { getSql } from "./db";
import { pairOf } from "./spot-risk";

export type TgLot = {
  id: string;
  symbol: string;
  pair: string;
  qty: number;
  entry: number;
  stop?: number;
  target?: number;
};

export type TgAccount = {
  tgId: string;
  username?: string;
  firstName?: string;
  interval: string;
  lastPair?: string;
  lots: TgLot[];
};

function nid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function num(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function accountCode(tgId: string) {
  const tail = tgId.replace(/\D/g, "").slice(-4);
  return tail || tgId.slice(-4);
}

export async function touchAccount(input: {
  tgId: string;
  username?: string;
  firstName?: string;
}): Promise<TgAccount> {
  const sql = await getSql();
  const id = String(input.tgId);
  await sql`
    insert into tg_accounts (tg_id, username, first_name, seen_at)
    values (${id}, ${input.username ?? null}, ${input.firstName ?? null}, now())
    on conflict (tg_id) do update set
      username = coalesce(excluded.username, tg_accounts.username),
      first_name = coalesce(excluded.first_name, tg_accounts.first_name),
      seen_at = now()
  `;
  const rows = await sql<{
    tg_id: string;
    username: string | null;
    first_name: string | null;
    interval: string;
    last_pair: string | null;
  }>`
    select tg_id, username, first_name, interval, last_pair
    from tg_accounts
    where tg_id = ${id}
    limit 1
  `;
  const row = rows[0];
  const lots = await sql<{
    id: string;
    symbol: string;
    pair: string;
    qty: number;
    entry: number;
    stop: number | null;
    target: number | null;
  }>`
    select id, symbol, pair, qty, entry, stop, target
    from tg_lots
    where tg_id = ${id}
    order by qty * entry desc
  `;
  return {
    tgId: id,
    username: row?.username ?? input.username,
    firstName: row?.first_name ?? input.firstName,
    interval: row?.interval || "1h",
    lastPair: row?.last_pair ?? undefined,
    lots: lots.map((lot) => ({
      id: lot.id,
      symbol: lot.symbol,
      pair: lot.pair,
      qty: num(lot.qty),
      entry: num(lot.entry),
      stop: lot.stop != null ? num(lot.stop) : undefined,
      target: lot.target != null ? num(lot.target) : undefined,
    })),
  };
}

export async function savePrefs(tgId: string, patch: { interval?: string; lastPair?: string }) {
  const sql = await getSql();
  if (patch.interval) {
    await sql`update tg_accounts set interval = ${patch.interval}, seen_at = now() where tg_id = ${tgId}`;
  }
  if (patch.lastPair) {
    await sql`update tg_accounts set last_pair = ${patch.lastPair}, seen_at = now() where tg_id = ${tgId}`;
  }
}

export async function recordBuy(input: {
  tgId: string;
  symbol: string;
  qty: number;
  price: number;
}): Promise<{ pair: string; qty: number; entry: number }> {
  const sql = await getSql();
  const pair = pairOf(input.symbol);
  const existing = await sql<{
    id: string;
    qty: number;
    entry: number;
  }>`
    select id, qty, entry from tg_lots
    where tg_id = ${input.tgId} and symbol = ${input.symbol}
    limit 1
  `;
  const prev = existing[0];
  const qty = prev ? num(prev.qty) + input.qty : input.qty;
  const cost = prev ? num(prev.qty) * num(prev.entry) + input.qty * input.price : input.qty * input.price;
  const entry = qty > 0 ? cost / qty : input.price;
  if (prev) {
    await sql`
      update tg_lots set qty = ${qty}, entry = ${entry}
      where id = ${prev.id}
    `;
  } else {
    await sql`
      insert into tg_lots (id, tg_id, symbol, pair, qty, entry)
      values (${nid()}, ${input.tgId}, ${input.symbol}, ${pair}, ${input.qty}, ${input.price})
    `;
  }
  await sql`
    insert into tg_fills (id, tg_id, side, symbol, pair, qty, price, usd)
    values (${nid()}, ${input.tgId}, 'buy', ${input.symbol}, ${pair}, ${input.qty}, ${input.price}, ${input.qty * input.price})
  `;
  return { pair, qty, entry };
}

export async function recordSell(input: {
  tgId: string;
  symbol: string;
  qty: number;
  price: number;
}): Promise<{ pair: string; qty: number; pnl: number } | { error: string }> {
  const sql = await getSql();
  const pair = pairOf(input.symbol);
  const existing = await sql<{
    id: string;
    qty: number;
    entry: number;
  }>`
    select id, qty, entry from tg_lots
    where tg_id = ${input.tgId} and symbol = ${input.symbol}
    limit 1
  `;
  const prev = existing[0];
  if (!prev || num(prev.qty) <= 0) {
    return { error: `На счёте нет ${pair}. Сначала: купил 10 doge по 0.08` };
  }
  const have = num(prev.qty);
  const qty = Math.min(input.qty, have);
  const left = have - qty;
  const pnl = (input.price - num(prev.entry)) * qty;
  if (left <= 1e-12) {
    await sql`delete from tg_lots where id = ${prev.id}`;
  } else {
    await sql`update tg_lots set qty = ${left} where id = ${prev.id}`;
  }
  await sql`
    insert into tg_fills (id, tg_id, side, symbol, pair, qty, price, usd, pnl)
    values (${nid()}, ${input.tgId}, 'sell', ${input.symbol}, ${pair}, ${qty}, ${input.price}, ${qty * input.price}, ${pnl})
  `;
  return { pair, qty: left, pnl };
}
