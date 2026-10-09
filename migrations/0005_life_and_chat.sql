-- Life-sim state: needs decay lazily based on elapsed time since updated_at.
create table if not exists player_life (
  player_id uuid primary key references players(id) on delete cascade,
  money integer not null default 150,
  xp integer not null default 0,
  energy real not null default 85,
  hunger real not null default 75,
  mood real not null default 70,
  social real not null default 60,
  love real not null default 40,
  updated_at timestamptz not null default now()
);

-- Free-text NPC conversation history.
create table if not exists npc_messages (
  id bigserial primary key,
  player_id uuid not null references players(id) on delete cascade,
  npc_id text not null,
  role text not null check (role in ('player', 'npc')),
  content text not null,
  score_delta integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists npc_messages_thread_idx on npc_messages (player_id, npc_id, id desc);
