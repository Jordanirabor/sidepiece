-- M6 (spec 10/11/12, ADR 0013): activity invitations with a full lifecycle, and short choice-driven date scenes.
create table if not exists invitations (
  id uuid primary key,
  from_player uuid not null references players(id) on delete cascade,
  -- 'player:<uuid>' or 'npc:<id>'
  target_id text not null,
  activity text not null,
  cost integer not null default 0,
  -- pending | accepted | declined | cancelled (expired is derived from expires_at while pending)
  status text not null default 'pending',
  expires_at timestamptz not null,
  room_id text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invitations_pair_idx on invitations (from_player, target_id, created_at desc);
create index if not exists invitations_target_idx on invitations (target_id, status);

create table if not exists date_sessions (
  id uuid primary key references invitations(id) on delete cascade,
  scene text not null,
  host_id uuid not null references players(id) on delete cascade,
  guest_id text not null,
  beat integer not null default 0,
  chemistry integer not null default 0,
  -- active | completed | left
  status text not null default 'active',
  left_by text,
  host_seen_at timestamptz not null default now(),
  guest_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists date_choices (
  date_id uuid not null references date_sessions(id) on delete cascade,
  -- 'player:<uuid>' or 'npc:<id>'
  actor text not null,
  beat integer not null,
  choice integer not null,
  delta integer not null,
  created_at timestamptz not null default now(),
  primary key (date_id, actor, beat)
);
