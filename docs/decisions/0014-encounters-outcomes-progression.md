# 0014: Private encounters, one-time outcomes, and how progression is derived

**Context.** Spec Screens 13, 14, 15 and 15A ask for:

- a private encounter where both people confirm, with a non-graphic scene, a visible Skip/Leave and a clear
  transition to the outcome;
- an outcome screen with ₦ earned, relationship and reputation changes, and optional feedback;
- a profile and detailed stats: body count (unique partners), total encounters, cash, reputation, achievements,
  rating history, level progress, and control over which stats are public.

The spec doesn't say:

- how a private room becomes an encounter;
- what the numbers are;
- how reputation is calculated;
- how to stop rewards being replayed;
- what's public by default.

ADR 0003 already requires body count to be computed server-side and never required for progression.

**Decision.**

- **Encounters live in private rooms.** Every accepted private room gets one encounter (`encounters` table),
  whether it came from a "Somewhere private" invitation (ADR 0013) or from the Nearby invite.
  - Accepting the room is not agreeing to the moment. Inside, **both people confirm again** ("I'm ready").
  - An NPC partner's consent was given when it accepted at **Friend** tier, so the NPC side starts confirmed. The
    world-level NPC private room now enforces the same Friend bar. Before this, it didn't check at all.
  - Lifecycle: `waiting` → (both confirm) `playing` → `completed`, or `left` by either side at any point, with no
    penalty.
  - "Not tonight" and Leave are always visible. Skip jumps the scene to the outcome.
- **The scene is non-graphic**, about 14 seconds:
  - the avatars stand apart, then drift together and turn in;
  - the camera eases closer and the light warms;
  - three hand-written captions, then a fade to black ("Later that night…").
  - Both clients play it from the server's "seconds since both agreed". The first client to reach the end (or
    skip) completes it, and a partner who's still watching finishes their own playback first.
- **One ledger for outcomes.** Every finished date or encounter writes one `activity_rewards` row per participant.
  - The primary key `(activity, player)` makes every grant happen at most once, however often the request is
    replayed. Only the request that flips the state (date's last beat, encounter's `playing → completed`) can
    write it.
  - The row stores what the outcome screen shows: label, ₦, XP, affinity, reputation change and unlocked
    achievements.
- **Rewards (placeholders, need client input):**

  | Activity | ₦ | XP | Affinity |
  |---|---|---|---|
  | Date, "Sparks flew" | 5,000 | 35 | +8 |
  | Date, "A good night" | 3,000 | 20 | +4 |
  | Date, "Just friends tonight" | 1,500 | 10 | +1 |
  | Encounter | 5,000 | 40 | +6 |

  A repeat encounter with the same partner within **24 hours** still counts in stats but pays nothing. The free
  Nearby private room would otherwise be a cash farm. Dates are already paid for by the sender.
- **Feedback is optional and positive-only:** Great vibe, Respectful, Funny, Good listener, Would meet again.
  - Pick 1–3, once per activity. Skip sends nothing.
  - It **never changes rewards** (spec 14). It feeds the partner's reputation and "Good company".
  - NPCs leave feedback automatically: warm when the night went well, "Respectful" otherwise.
- **Stats are derived, never sent by the client:**
  - **Body count** = distinct partners over the player's encounter rows.
  - **Total encounters** = all encounter rows. Three with the same person count as 1 and 3, matching the spec's
    own example.
  - Lifetime ₦ earned and spent is counted in `life::apply`.
- **Reputation (0–10)** = 5.0 plus three capped parts:
  - +0.2 per finished date or encounter, up to 2.0;
  - +0.3 per feedback received, up to 2.5;
  - +0.1 per Friend-tier connection, up to 0.5.

  **Nothing lowers it.** Leaving, declining and skipping are never punished (ADR 0003). The detail screen shows
  the breakdown.
- **Level titles:** New in town (1), Regular (3), Rising Star (6, so level 8 is "Rising Star" as in the spec),
  Socialite (10), Scene Setter (15), Lagos Legend (20).
- **Achievements:** First spark, First date, Sparks flew, Night owl, After hours, Good company, Inner circle,
  Rising Star.
  - Each pays a one-time ₦ reward, enforced by an insert-once primary key.
  - **None is about body count**, and only "After hours" needs an encounter, so a player who only dates and
    socialises can earn the other seven.
- **Visibility (spec 15A):** `player_settings.stat_visibility` is kept apart from the avatar, so creator saves
  can't reset it.
  - Public by default: level and title, reputation, achievement count.
  - **Private by default: body count and total encounters.**
  - Cash is never public.
  - Other players see only public fields: Discover profile detail, DM profile sheet, and the Nearby rating, which
    is hidden when reputation is private.
- **Presence:** taking a turn (choose, confirm, complete) now counts as being present, as polling does. Before this,
  a partner who acted without polling could be shown as "dropped off".

**Consequences.**

- Migration `0010`: `encounters`, `activity_rewards`, `activity_feedback`, `achievements`, `player_settings`, and
  `player_life.cash_earned/cash_spent`.
- Endpoints:
  - `GET /v1/encounters/{id}`
  - `POST /v1/encounters/{id}/confirm`, `…/complete` and `…/leave`
  - `POST /v1/outcomes/{id}/feedback`
  - `GET /v1/player/{id}/stats`
  - `POST /v1/player/{id}/stats/visibility`
- `DateView.outcome` is now the shared `ActivityOutcome`.
- `PrivateRoomResult` and `InvitationView` carry `encounter_id`.
- `DiscoverableProfile` and `DmThreadResponse` carry `stats` (public stats only).
- Events for the Feed (M8): `encounter.*`, `achievement.unlocked`, `feedback.given`.

**Revisit when.**

- The client sets real reward amounts, the cooldown or achievement values.
- The client wants body count public by default. That needs explicit sign-off (ADR 0003).
- Reports or moderation should feed reputation. That needs verified outcomes first, so a report can't be a weapon.
- Realtime push lands (ADR 0011). Encounter sync could then move to the room server.
