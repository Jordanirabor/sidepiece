# 0011: Player messages: delivery by polling, match-gated, local conversation controls

**Context.** Spec Screens 09/09A/17 ask for player↔player chat, an inbox, and mute/block/report/end controls.
The roadmap said "realtime via room server or a dedicated channel". The room server only knows players who
are connected to a room, and DMs must also reach players who are offline or still in the creator. The spec
doesn't say who may message whom, or what "End conversation" and "Mute" mean in practice.

**Decision.**
- **Who can message:** only matched players (`matches` row, ADR 0010). Unmatched → 403 "match first to message".
  A block either way → 404 "conversation not available", which never reveals the block.
- **Storage:** the server owns history (`dm_messages`, 400 chars, last 80 per thread), unread counts and read
  receipts. Messages survive reload and reach offline players when they return.
- **Delivery (M5):** clients **poll**: the open thread every 3 s and the inbox every 5 s. This replaces the
  roadmap's "realtime" wording for now. Realtime push (NATS → room server → the recipient's socket) is
  deferred, and the API and tables don't need to change when it lands.
- **NPC threads** appear in the same inbox (from `npc_messages`) and open the existing NPC chat.
- **Controls (09A)** are per-player and private; the other side is never told:
  - **Mute** pauses unread alerts for 8 hours. The thread keeps its own unread count, but it doesn't add to the
    nav badge.
  - **End conversation** (confirmed first) hides the thread until a new message arrives from either side. The
    match stays. Ending doesn't change the mute state.
  - **Block** and **Report** reuse the global moderation actions, each with its own confirmation.
- The header's **profile shortcut** opens a sheet with the same 3D avatar, presence, and "Meet at <venue>"
  (jumps to their venue when they're online in a public room).

**Consequences.** New tables `dm_messages` and `conversation_state` (migration `0008`). Endpoints:
`GET /v1/messages/inbox`, `GET /v1/messages/thread`, `POST /v1/messages/send`, `/read` and `/control`.
Polling costs about one request every 3–5 s per player who is in the world.

**Revisit when.** Many players are online at once (polling load), or a 3 s delay feels slow in playtests.
Then add realtime push through the room server's NATS connection and keep polling as the fallback.
