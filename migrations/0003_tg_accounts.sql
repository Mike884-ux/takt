create table if not exists tg_accounts (
  tg_id text primary key,
  username text,
  first_name text,
  interval text not null default '1h',
  last_pair text,
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);

create table if not exists tg_lots (
  id text primary key,
  tg_id text not null,
  symbol text not null,
  pair text not null,
  qty double precision not null,
  entry double precision not null,
  stop double precision,
  target double precision
);

create table if not exists tg_fills (
  id text primary key,
  tg_id text not null,
  side text not null,
  symbol text not null,
  pair text not null,
  qty double precision not null,
  price double precision not null,
  usd double precision not null,
  pnl double precision,
  at timestamptz not null default now()
);

create index if not exists tg_lots_user_idx on tg_lots (tg_id);
create index if not exists tg_fills_user_idx on tg_fills (tg_id, at desc);
