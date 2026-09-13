create table if not exists signals (
  id serial primary key,
  symbol text not null,
  pair text not null,
  interval text not null,
  signal text not null,
  confidence integer not null,
  price numeric not null,
  created_at timestamptz not null default now(),
  check_after timestamptz not null,
  checked_at timestamptz,
  result_price numeric,
  outcome text
);

create index if not exists signals_due_idx on signals (check_after)
  where checked_at is null;
create index if not exists signals_symbol_idx on signals (symbol, created_at desc);
