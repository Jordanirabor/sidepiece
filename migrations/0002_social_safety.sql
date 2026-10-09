create table if not exists player_interests (
  id uuid primary key,
  player_id uuid not null references players(id) on delete cascade,
  target_id text not null,
  intent text not null,
  created_at timestamptz not null default now(),
  unique (player_id, target_id)
);

create table if not exists private_rooms (
  id text primary key,
  created_by uuid not null references players(id) on delete cascade,
  target_id text not null,
  consent_state text not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists moderation_reports (
  id uuid primary key,
  reporter_id uuid not null references players(id) on delete cascade,
  target_id text not null,
  reason text not null,
  details text,
  created_at timestamptz not null default now()
);

create table if not exists player_blocks (
  blocker_id uuid not null references players(id) on delete cascade,
  target_id text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, target_id)
);
