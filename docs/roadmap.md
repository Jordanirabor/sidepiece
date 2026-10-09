# Roadmap

Ordered by the UI spec's recommended build order (`product/sources/chatgpt-ui-spec.md` §14), adjusted for what
already exists. Work top to bottom. A milestone is done only when its **acceptance criteria** pass and
`product/screen-map.md` is updated.

**North star (spec):** prove one complete loop. Create a character → enter a lively location → find someone
compatible → match → chat → agree on an activity → experience the scene → receive a reward → return to the world.

---

## ✅ Done and verified

**Platform**
- Rust API, room server and event worker.
- Postgres, Redis and NATS.
- Hot-reload dev stack.
- Hardened production compose for Dokploy.

**Accounts**
- Email/password with Argon2id, an 18+ DOB gate and terms acceptance.
- Login rate limits and session restore.
- Dev login only outside production.

**Creator**
- The client's 4-panel creator: profile + likes in a partner → build → outfit → identity complete.
- "Enter the City".

**World**
- City street with Neon Lounge and Rooftop Party doors, plus a private room.
- Third-person camera-relative movement and name tags.
- Real players with synced looks.
- Instanced rooms, fill-first matchmaking and one-time join tickets.

**NPCs**
- Maya, Dre, Zara and Kai.
- Free-text chat scored −5..+5 that drives 7 relationship tiers.
- Typing indicator and saved history.
- Works with any OpenAI-compatible model, with an offline fallback.

**Life sim**
- Money, XP/level, five needs decaying in real time, and a world clock (1 real hour = 1 game day).
- Venue-specific actions.

**Social & safety**
- Interest and private-room requests.
- Only the target can accept; the requester can cancel.
- Block hides both ways; report is available.
- Events are audited to Postgres.

**Verification**
- 18 Rust tests.
- `scripts/smoke.mjs`: two-player API flow.
- `scripts/ui-check.mjs`: headless browser walkthrough with screenshots.

---

## M1: Foundation: design system + mobile-first shell  *(ADR 0008, design-system.md)*
- [ ] CSS tokens from `design-system.md`. Restyle existing UI to plum/violet/coral/green.
- [ ] Component library: `TopBar`, `BottomNav` (World/Messages/Feed/Profile), `Sheet`, `ProfileCard`, `InvitationCard`, `EmptyState`, `ErrorState`, `ConfirmDialog`, `Toast`, `NeedBar`, `ScoreDelta`, `TierMeter`.
- [ ] Full-bleed 3D world. The sidebar content moves into sheets.
- [ ] Touch controls: virtual joystick + tap-to-interact.
- [ ] `ui-check.mjs` captures phone (390×844) and desktop viewports.

**Accept:** every existing flow works at 390×844 with no horizontal scroll. Screenshots of world, NPC chat and creator are reviewed against `docs/references/`.

## M2: Lagos setting + ₦  *(ADR 0007)*
- [ ] Hub renamed (e.g. *Lekki Phase 1*). Venues: *Victoria Island Rooftop*, *Ikoyi lounge* (invented names).
- [ ] ₦ economy rebalanced server-side. Formatting is `₦85,000`.
- [ ] Lagos skyline / bridge backdrop. NPC personas and looks rooted in Lagos.

**Accept:** no `$` anywhere. Smoke test passes with the new values.

## M3: Onboarding completion  *(ADR 0006, spec 01/04/05)*
- [ ] Welcome screen (key art, Create Account / Sign In, Terms/Privacy).
- [ ] Preferences step: relationship style, interests, intent, **boundaries**, discovery settings, public/private toggles.
- [ ] Profile preview ("how others see you") with bio, then Enter the City.
- [ ] Compatibility uses likes + intent + relationship style. Boundaries exclude invitation types.

**Accept:** a new player reaches the city in ≤ 5 screens after the account step. All of it is editable from Profile.

## M4: Discover → Match  *(spec 07, 07A, 08)*
- [ ] Discover sheet with **Like / Pass** cards (players first, NPCs as fallback), plus a profile detail view.
- [ ] Mutual-like detection server-side, then a skippable Match moment (Start Chat / Keep Exploring).
- [ ] Empty states: broaden preferences / change location / meet an NPC.

**Accept:** two-player smoke test covers like → mutual match. Pass never re-shows the same profile in a session.

## M5: Messages  *(spec 09, 09A, 17. Also the poster's "phone")*
- [ ] Player↔player DMs (persisted, realtime via room server or a dedicated channel), plus an inbox.
- [ ] Chat header with presence, profile shortcut and a more menu (mute / block / report / end) with confirmations.
- [ ] NPC threads appear in the same inbox.

**Accept:** messages survive reload. Blocked players can't message. Smoke test covers it.

## M6: Invitations & date scenes  *(spec 10, 11, 12)*
- [ ] "Suggest activity" sheet: public date / venue visit / private location, with ₦ costs.
- [ ] In-chat **InvitationCard** with pending/accepted/declined/expired/cancelled and an expiry.
- [ ] Date scenes (rooftop dinner, lounge booth) with 2–3 dialogue choices per beat, an objective, and Leave.

**Accept:**
- Decline, cancel, expiry and leave are all tested.
- A declined invite never blocks the chat.

## M7: Encounters, outcomes & progression  *(spec 13, 14, 15, 15A. ADR 0003)*
- [ ] Private encounter: both confirm → non-graphic scene / fade-to-black. Skip/Leave is always visible.
- [ ] Outcome screen: ₦ earned, reputation, optional feedback.
- [ ] Server-side **body count (unique partners)**, total encounters, achievements, reputation.
- [ ] Profile & stats screen, with public/private stat toggles.

**Accept:**
- Rewards can't be duplicated by replaying requests (idempotent).
- Stats match the spec's definitions (e.g. 3 encounters with 1 partner = body count 1, total 3).

## M8: Polish & breadth  *(spec 16, 18, 06A)*
- [ ] Feed built from `game_event_audit`.
- [ ] Settings & privacy, including the blocked list, account deletion and notifications.
- [ ] Location details panel.
- [ ] More NPCs; venues feel populated (ambient NPCs).
- [ ] Universal screen states audit (loading/empty/error/offline everywhere).

## Parallel tracks (need client decisions)

- **Art pipeline** (ADR 0004): pick a stylized asset source (Synty POLYGON? commissioned?), check the web licence, build glTF avatars driven by `AvatarLook`.
- **Language-model provider** (ADR 0005): choose a provider and model, then set `LLM_*` in Dokploy.
- **Age verification** before public launch (ADR 0003).
- **Email provider** for verification and password reset.
