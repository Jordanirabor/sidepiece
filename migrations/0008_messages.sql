-- M5 (spec 09/09A/17): persisted player-to-player direct messages and conversation controls.
create table if not exists dm_messages (
  id uuid primary key,
  sender_id uuid not null references players(id) on delete cascade,
  recipient_id uuid not null references players(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 400),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists dm_messages_thread_idx on dm_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);
create index if not exists dm_messages_unread_idx on dm_messages (recipient_id, sender_id) where read_at is null;

-- Per-player state for a conversation. End/mute are local controls; block/report remain global safety actions.
create table if not exists conversation_state (
  player_id uuid not null references players(id) on delete cascade,
  target_id text not null,
  muted_until timestamptz,
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (player_id, target_id)
);
