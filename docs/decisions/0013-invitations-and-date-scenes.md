# 0013: Invitations and date scenes: who pays, expiry, anti-pressure, synchronous choices

**Context.** Spec Screens 10/11/12 ask for a compact "Suggest activity" sheet with costs, an in-chat invitation
card (Pending / Accepted / Declined / Expired / Cancelled), and a short date scene with 2–3 dialogue choices,
an objective and a visible Leave. The spec doesn't say who pays, how long an invitation lives, how to avoid
nagging, how two players pick choices together, or how NPCs answer. The existing private-room request
(`/v1/social/private-room`, ADR 0003) is world-level and works without a match.

**Decision.**
- **Activities** are the three boundary types from Screen 04, each with a fixed scene and a ₦ cost:
  - `public_date` = **Rooftop date** at Victoria Island Rooftop, ₦12,000
  - `venue_visit` = **Lounge night** at Ikoyi Lounge, ₦6,000
  - `private_location` = **Somewhere private**, a private room, ₦15,000

  "Keep chatting" is the sheet's first option and just closes it. **The prices are placeholders: they need
  client input** (economy).
- **Who can invite:** in-chat invitations need a match (like DMs, ADR 0011). Boundaries → 403. Blocks → 404 and
  never reveal themselves. The Nearby "Invite" (world-level private room) stays as it was for people in the
  same room.
- **Who pays:** the **sender**, and **only when the invitation is accepted**. Declines, cancels and expiries are
  free. Affordability is checked at send. If the sender can't cover it at accept time, the accept fails, the
  invitation stays pending, and the recipient never sees the sender's balance.
- **Lifecycle:**
  - Only the invited player accepts or declines. Only the sender cancels.
  - **Expiry is 10 minutes.** It is derived from `expires_at` while pending, with no background job.
  - Accepting twice, or accepting something resolved or expired, → 409.
- **No pressure** (vision.md):
  - One pending invitation per sender→recipient pair.
  - After a decline, the sender waits **30 minutes** before inviting that person again.
  - No toasts nag the recipient. They see a card in the thread, an inbox line and the nav badge.
  - The chat never locks.
- **Acceptance:** a date scene starts (the date id is the invitation id), or a private room is created
  already-accepted for the pair (Screen 13 encounter content comes in M7). The recipient goes straight in. The
  sender is taken in when their thread poll sees the acceptance, and can also use "Join the date" on the card.
- **Date scenes:** three beats with three choices each (a warm one, an okay one, a misstep).
  - Each side picks privately. The beat resolves when **both** have picked, and only then is the partner's line
    shown.
  - Choices add to a shared **chemistry** meter. The objective is to reach the scene's goal.
  - The 3D stage is the real venue with a candle-lit table for two. The avatars lean in as chemistry grows.
  - **Leave** is always visible, asks for confirmation, carries no penalty, and ends the date for both. The
    partner sees "X headed out. No hard feelings."
  - If the partner stops polling for 25 s, a neutral "Keep waiting / Back to chat" appears.
- **Rewards (M6 scope):** completion grants XP (10/20/35 by outcome tier), mood/social/love, and relationship
  affinity (+1/+4/+8) to both, **exactly once**: only the request that completes the final beat can grant them.
  Dates are a full progression path; a rough date still gives a little. ₦ earnings, partner feedback and the
  full outcome screen are M7 (Screen 14).
- **NPCs** answer at once. They agree to dates from **Friendly** (affinity ≥ 25) and to private from **Friend**
  (≥ 40), and otherwise decline with "keep talking". In a date they pick the warm line from Friend up, and the
  okay line before that. "Make plans" in NPC chat replaces the old "Somewhere private" button.

**Consequences.**
- Migration `0009`: `invitations`, `date_sessions`, `date_choices`.
- Endpoints:
  - `GET /v1/activities`
  - `POST /v1/invitations` and `POST /v1/invitations/{id}/respond`
  - `GET /v1/dates/{id}`, `POST /v1/dates/{id}/choose` and `POST /v1/dates/{id}/leave`
- The DM thread response carries `invitations` and the partner's `open_to`. The inbox carries `pending_invite`
  and `invite_count`.
- Delivery is polling, as in ADR 0011: the date every 2 s, the thread every 3 s.
- `ttl_seconds` on create is honoured only with dev login enabled, so smoke tests can see expiry.

**Revisit when.**
- The client sets real prices or wants split or recipient-pays.
- Playtests show 10 minutes is too short or too long.
- Dates need more beats or more scenes. Scripts live in `apps/api/src/dates.rs` (`SCENES`).
- Realtime push lands (ADR 0011). Then the date beat sync should move to the room server.
