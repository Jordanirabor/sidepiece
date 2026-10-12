-- M8 (spec 18): in-app alert preferences live next to the other per-player settings.
alter table player_settings add column if not exists notifications jsonb not null default '{}'::jsonb;
-- The blocked list in Settings is read newest first.
create index if not exists player_blocks_blocker_idx on player_blocks (blocker_id, created_at desc);
