create table if not exists game_event_audit (
  id bigserial primary key,
  event_type text not null,
  player_id uuid,
  target_id text,
  room_id text,
  payload jsonb not null default '{}'::jsonb,
  event_timestamp timestamptz not null,
  received_at timestamptz not null default now()
);

create index if not exists game_event_audit_event_type_idx on game_event_audit(event_type);
create index if not exists game_event_audit_player_id_idx on game_event_audit(player_id);
create index if not exists game_event_audit_room_id_idx on game_event_audit(room_id);
create index if not exists game_event_audit_received_at_idx on game_event_audit(received_at);
