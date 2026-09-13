create table if not exists user_history (
  user_id text primary key,
  interval text not null default '1h',
  messages jsonb not null default '[]',
  last jsonb,
  updated_at timestamptz not null default now()
);
