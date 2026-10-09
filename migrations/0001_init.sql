create table if not exists players (
  id uuid primary key,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists avatars (
  player_id uuid primary key references players(id) on delete cascade,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists relationship_state (
  player_id uuid not null references players(id) on delete cascade,
  target_id text not null,
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, target_id)
);

create table if not exists room_assignments (
  player_id uuid primary key references players(id) on delete cascade,
  room_id text not null,
  updated_at timestamptz not null default now()
);
