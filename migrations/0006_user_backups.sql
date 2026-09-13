create table if not exists user_backups (
  id serial primary key,
  user_id text not null,
  kind text not null default 'auto',
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists user_backups_user_idx
  on user_backups (user_id, created_at desc);
