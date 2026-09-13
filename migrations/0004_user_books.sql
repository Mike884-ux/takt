create table if not exists user_books (
  user_id text primary key,
  cash double precision not null default 0,
  holdings jsonb not null default '[]',
  fills jsonb not null default '[]',
  risk jsonb not null default '{}',
  last_daily text not null default '',
  updated_at timestamptz not null default now()
);
