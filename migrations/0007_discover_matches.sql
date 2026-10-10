-- M4 (spec 07/08): Like/Pass deck and mutual matches.
-- A pass hides a profile from the deck for a while (24h, enforced in the API), never forever.
create table if not exists player_passes (
  player_id uuid not null references players(id) on delete cascade,
  target_id text not null,
  created_at timestamptz not null default now(),
  primary key (player_id, target_id)
);

-- One row per side of a match (player<->player gets two rows; player<->npc one).
-- seen_at is null until that side has seen the match moment.
create table if not exists matches (
  player_id uuid not null references players(id) on delete cascade,
  target_id text not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (player_id, target_id)
);
create index if not exists matches_unseen on matches (player_id) where seen_at is null;
