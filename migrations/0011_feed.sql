-- M8 (spec 16): the personal feed reads game_event_audit by actor and by target.
create index if not exists game_event_audit_target_id_idx on game_event_audit(target_id);
-- When this player last opened the feed (drives the nav badge).
alter table player_settings add column if not exists feed_seen_at timestamptz;
