# 0015: The Feed is personal, built from the event audit

**Context.** Spec Screen 16 describes the Feed as "a lightweight view of game-world activity". It lists new
matches, invitations, achievements, updates from fictional characters, completed activity summaries and venue
announcements, and says each item links to its screen. The spec doesn't say whose activity a player sees. Showing
other players' dates, encounters or achievements would leak exactly what ADR 0014 keeps private (body count and
encounters are private by default).

**Decision.**

- **Personal items only:** a player sees only events they took part in. Each item links to where it happened.

  | Item | Links to |
  |---|---|
  | A match | Chat |
  | An invitation you received; your invitation accepted or declined; an NPC saying yes | Chat |
  | A finished date (with its outcome) | Chat |
  | A private night | Stats |
  | Achievement unlocked | Stats |
  | Level-up (with its title) | Stats |
  | Feedback received | Stats |

  Your own sent invitations and NPC refusals aren't shown. Blocked people disappear from the feed.
- **World posts:** two authored posts per game day (one real hour) rotate from a small list. They are NPC updates,
  which link to that NPC's chat, and venue announcements, which link to going there. They are the "fictional
  characters" and "venue announcements" from the spec, and contain no player data.
- **Source:** `game_event_audit`, written asynchronously by the event worker from NATS. New items appear within
  moments. Without NATS (some test setups) the feed shows world posts only.
- **Badge:** `player_settings.feed_seen_at`. Personal items newer than it count toward the nav badge; world posts
  never do. Opening the Feed tab marks it seen, and the "New" section stays for that visit. The client polls every
  15 s, like the other badges (ADR 0011).

**Consequences.**

- Endpoints:
  - `GET /v1/feed?player_id&limit` (default 40, max 100)
  - `POST /v1/feed/seen`
- Migration `0011`: an index on `game_event_audit(target_id)` and `player_settings.feed_seen_at`.
- New event types need a line in `feed.rs::describe` to show up. Anything unmapped is ignored, which is the safe
  default.

**Revisit when.**

- The client wants social or public activity (e.g. friends' public achievements). That needs an opt-in per player
  and a new record.
- Venue events become real scheduled content (Screen 06A, location details).
- Realtime push lands (ADR 0011).
