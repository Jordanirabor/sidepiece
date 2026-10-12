-- M7 (spec 13/14/15/15A, ADR 0014): private encounters, one-time outcome rewards, feedback, achievements, stats.

-- One encounter per accepted private room. Both sides confirm before the scene plays; either can leave.
create table if not exists encounters (
  id uuid primary key,
  room_id text not null unique references private_rooms(id) on delete cascade,
  host_id uuid not null references players(id) on delete cascade,
  -- 'player:<uuid>' or 'npc:<id>'
  guest_id text not null,
  host_confirmed boolean not null default false,
  guest_confirmed boolean not null default false,
  -- waiting | playing | completed | left
  status text not null default 'waiting',
  left_by text,
  host_seen_at timestamptz not null default now(),
  guest_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists encounters_host_idx on encounters (host_id, status);
create index if not exists encounters_guest_idx on encounters (guest_id, status);

-- Rewards granted for a finished date or encounter. The primary key makes every grant happen at most once.
create table if not exists activity_rewards (
  source_id uuid not null,
  player_id uuid not null references players(id) on delete cascade,
  -- date | encounter
  kind text not null,
  partner_id text not null,
  label text not null,
  summary text not null,
  money integer not null default 0,
  xp integer not null default 0,
  affinity integer not null default 0,
  reputation_delta real not null default 0,
  objective_met boolean not null default false,
  -- true when a repeat inside the cooldown counted for stats but paid nothing
  repeat boolean not null default false,
  achievements text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (source_id, player_id)
);
create index if not exists activity_rewards_player_idx on activity_rewards (player_id, created_at desc);

-- Optional, positive-only feedback after an activity. Never changes rewards (spec 14).
create table if not exists activity_feedback (
  source_id uuid not null,
  -- 'player:<uuid>' or 'npc:<id>'
  from_actor text not null,
  to_actor text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (source_id, from_actor)
);
create index if not exists activity_feedback_to_idx on activity_feedback (to_actor, created_at desc);

create table if not exists achievements (
  player_id uuid not null references players(id) on delete cascade,
  achievement text not null,
  unlocked_at timestamptz not null default now(),
  primary key (player_id, achievement)
);

-- Which stats other players may see (spec 15A). Kept apart from the avatar so creator saves can't reset it.
create table if not exists player_settings (
  player_id uuid primary key references players(id) on delete cascade,
  stat_visibility jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Lifetime cash flow for detailed stats.
alter table player_life add column if not exists cash_earned bigint not null default 0;
alter table player_life add column if not exists cash_spent bigint not null default 0;
