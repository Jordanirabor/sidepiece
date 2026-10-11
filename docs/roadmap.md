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
- `web/scripts/ui-check.mjs`: headless browser walkthrough with screenshots.

---

## M1: Foundation: design system + mobile-first shell  *(ADR 0008, design-system.md)* — ✅ done
- [x] CSS tokens from `design-system.md`. Restyled existing UI to plum/violet/coral/green (`web/src/style.css` `:root`; legacy var names kept as aliases).
- [x] Component library in `web/src/ui.tsx`: `TopBar`, `BottomNav` (World/Messages/Feed/Profile), `Sheet`, `ProfileCard`, `InvitationCard` (minimal — full lifecycle in M6), `EmptyState`, `ErrorState`, `ConfirmDialog`, `ToastView`, `NeedBar`, `ScoreDelta`, `TierMeter`, `AvatarPortrait`.
- [x] Full-bleed 3D world. Sidebar content moved into bottom-nav tabs + slide-up sheets (Nearby, Things to do). Block/report now use `ConfirmDialog` instead of `window.confirm`/`prompt`.
- [x] Touch controls: virtual joystick + tap-to-interact (`SceneView.tsx`); WASD/E kept for desktop and tests.
- [x] `ui-check.mjs` captures phone (390×844) and desktop (1440×900) viewports.
- [x] HUD `$` → `₦` (small M2 touch, spec-correct).

**Accept:** ✅ every flow works at 390×844 with **0px horizontal overflow** (both viewports, no JS errors). Screenshots of world, NPC chat, creator, nearby sheet and profile captured and compared to `docs/references/` (brand logo ≈ `whatsapp/01`; NPC chat ≈ `whatsapp/03`; bottom nav ≈ `ui-spec-chat/42`).

> Carry-overs into later milestones: InvitationCard full lifecycle (M6), room-chat mobile treatment, DM inbox / feed contents (M5/M8).

## M2: Lagos setting + ₦  *(ADR 0007)* — ✅ done
- [x] Hub renamed **Lekki Phase 1**. Venues: **Ikoyi Lounge**, **Victoria Island Rooftop** (place names, no real businesses). Internal room kinds (`city`, `neon_lounge`, `rooftop_party`) are unchanged so room ids, NPC placement and saved data keep working.
- [x] ₦ economy rebalanced server-side (`life.rs`): start ₦50,000 (`STARTING_MONEY`), drink ₦3,500, food ₦5,000, shift +₦18,000. Migration `0006` rescales existing balances ×250. Formatting `₦85,000` on both sides (`life::naira`, `ui.tsx::naira`).
- [x] Lagos waterfront backdrop (`venue.ts::addLagosSkyline`): lagoon, skyline with aviation beacons, cable-stayed link bridge. At the end of the Lekki street and around the VI rooftop.
- [x] NPC personas, greetings, taglines and skin tones rooted in Lagos (ids and names unchanged; Maya is in the client's screenshot). LLM prompt sets the scene in Lagos.

**Accept:** ✅ no `$` in UI or server (enforced by `action_labels_match_naira_deltas`). Smoke test asserts start ₦50,000, drink ₦3,500, ₦ labels and Lagos room names. 22 Rust tests pass.

> Also fixed while verifying: portrait phones use a fixed horizontal FOV (the world was a 22° slit), the default camera is closer to level (matches `whatsapp/03`), and the world dock hides while NPC chat is open (it covered "Somewhere private").

## M3: Onboarding completion  *(ADR 0006 → 0009, spec 01/04/05)* — ✅ done
- [x] Welcome screen: logo, animated procedural Lagos skyline backdrop, Create Account / Sign In, Terms · Privacy · Community rules (**draft copy, needs client/legal**). Inline auth errors.
- [x] Preferences step: intent, relationship style, interests, **boundaries**, show me, discoverable, public/private toggles. Server validates everything (`validate_avatar`).
- [x] Profile preview ("how others see you") with bio, inside the mockup's "Identity complete" panel (ADR 0009), then Enter the City.
- [x] Compatibility (`player_compatibility`) uses likes + intent + relationship style + interests. Discovery is mutual on "show me" and respects discoverable. Boundaries block private invites server-side (403) and hide the Invite button.

**Accept:** ✅ 5 screens after the account step (Profile, Build, Outfit, Preferences, Identity complete). ✅ Editable from Profile (Edit character / Edit preferences / Preview profile, with Cancel). Smoke covers public-vs-private fields, invalid values (400) and boundaries (403). 26 Rust tests (20 api + 6 common).

> **M1 correction found here:** `web/index.html` had no viewport meta, so earlier phone screenshots were a scaled 980px layout. Fixed, guarded by ui-check, and the phone shell re-laid out (two-row top bar per design-system diagram, joystick/dock/prompt no longer collide).

## M4: Discover → Match  *(spec 07, 07A, 08; ADR 0010)* — ✅ done
- [x] Discover deck with **Like / Pass** cards (players first, NPCs as fallback), 3D portraits, swipe/keys, plus a profile detail view.
- [x] Mutual-like detection server-side (`matching.rs`, `matches` table), then a skippable Match moment (Start Chat / Keep Exploring). The other side gets it once via polling. NPCs match back from Friendly.
- [x] Empty states: broaden preferences / change location / meet a local.
- [x] Messages tab lists matches (new badge, where they are, Meet there / Chat).

**Accept:** ✅ smoke covers one-sided like → no match, mutual → match, unseen-once, matched/passed excluded from the deck, NPC needs Friendly, self-like 400, block → 404 and hides the match. ✅ Pass hides for 24h server-side (survives reload). ui-check drives deck → detail → like/pass → like-back match moment → Messages. 29 Rust tests.

## M5: Messages  *(spec 09, 09A, 17. Also the poster's "phone"; ADR 0011)* — ✅ done
- [x] Player↔player DMs between matched players, persisted (`dm_messages`), plus an inbox (`messages.rs`, `Messages.tsx`). Delivery is **polling** (thread 3 s, inbox 5 s), not push. See ADR 0011.
- [x] Chat header with presence, a profile shortcut (3D avatar sheet + "Meet at <venue>") and a ⋯ menu: mute / end / block / report, each explained, destructive ones confirmed.
- [x] NPC threads appear in the same inbox and open the NPC chat.

**Accept:** ✅ messages survive reload (server-side history). ✅ Unmatched → 403, blocked → 404. ✅ Smoke covers send, unread/read, mute (stays out of the badge, survives End), end then reopen on a new message, unmatched, blocked. ui-check drives match → thread → send → controls → inbox at both viewports. 31 Rust tests (25 api + 6 common).

> Carry-overs: realtime push for DMs (ADR 0011 "revisit when"), quick reactions/emoji (optional in spec), 3D avatars in inbox rows, "Suggest date/venue" → M6.

## M6: Invitations & date scenes  *(spec 10, 11, 12; ADR 0013)* — ✅ done
- [x] "Suggest activity" sheet: keep chatting / public date (Rooftop date) / venue visit (Lounge night) / private location, with ₦ costs (placeholders, need client input). From DM threads and NPC chat.
- [x] In-chat **InvitationCard** with pending/accepted/declined/expired/cancelled, a 10-minute expiry, and cancel. Sender pays on accept only. One pending per pair plus a 30-min cooldown after a decline (no nagging).
- [x] Date scenes (rooftop date, lounge booth) in the real venue with both avatars: 3 beats × 3 choices, a shared chemistry objective, Leave (confirmed, no penalty), partner drop-off recovery, and a one-time XP + affinity reward.
- [x] NPCs answer invitations from the relationship (dates from Friendly, private from Friend) and play the date with you.

**Accept:** ✅ smoke covers decline (free, cooldown, chat continues), cancel, expiry (dev-only short TTL), leave, double-accept, wrong side answering, outsiders (404), boundaries (403), blocks (404), hidden picks until both choose, rewards granted exactly once, private room on accept, and NPC consent. ✅ A declined invite never blocks the chat. ui-check drives suggest → invite → accept → 3 beats → outcome → incoming invite → accept → Leave, at both viewports. 38 Rust tests (32 api + 6 common).

> Also fixed: the M5 thread poll refetched immediately after every response (it depended on the thread object), causing a request storm and flaky status updates. It now keys on the thread id.

> Carry-overs: seated pose for date avatars; more scene scripts; ₦ rewards + partner feedback on the outcome (M7, Screen 14); private-room encounter content (M7, Screen 13); realtime push for beat sync (ADR 0011/0013 "revisit when").

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

- **Art pipeline** (ADR 0012, decided 2026-10-10: semi-realistic, open-licence assets):
  - [x] Phase 1 rendering: filmic post-processing, key shadows + contact shadows, wet-floor reflections, procedural textured surfaces with normal maps, low/high quality tiers (`web/src/render.ts`).
  - [x] Phase 2 characters (interim): 9 Microsoft Rocketbox (MIT) base models → glTF (`web/src/avatar3d.ts`, `scripts/avatars/`), nearest base by gender/skin/outfit + hair tint, body scale, head-bone accessories; idle/walk blending; 512px variants for phones/portraits; primitive humanoid as fallback. Outfit/clothing colour don't visibly change the model yet.
  - [ ] **Pinned (owner, 2026-10-11): fully parametric creator** (one base body with morphs, continuous skin tone, swappable hair/clothes). Recommended route: MakeHuman/MPFB2 (CC0) authored in Blender, which the owner will install. Rocketbox stays until then.
  - [ ] Phase 3 props: CC0 furniture and venue dressing (e.g. Poly Haven).
- **Interface refresh v2** (design-system.md, 2026-10-11): Bricolage Grotesque + Plus Jakarta Sans + Caveat accents, lucide icons, glass surfaces, aurora backgrounds, poster-style welcome (floating notifications, sticky note, ticker) and auth, profile hero/tiles with "Meet someone new" first, story row in Messages, full-bleed Discover cards, floating capsule nav with a raised Discover button (compact and centred on desktop).
- **Language-model provider** (ADR 0005): choose a provider and model, then set `LLM_*` in Dokploy.
- **Age verification** before public launch (ADR 0003).
- **Email provider** for verification and password reset.
