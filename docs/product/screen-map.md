# Screen map: spec → status → code

Every screen from the UI spec (`sources/chatgpt-ui-spec.md`), plus the client mockups, with current status.
**Update this table in the same change that moves a screen forward.** It is the main drift check.

Legend: ✅ done · 🟡 partial / deviates (see notes) · ⏳ not started

**Shell (M1):** mobile-first shell is live — `web/src/ui.tsx` holds the component library (`TopBar`, `BottomNav`,
`Sheet`, `ProfileCard`, `TierMeter`, `NeedBar`, `ScoreDelta`, `EmptyState`, `ErrorState`, `ConfirmDialog`,
`ToastView`, `InvitationCard`). The 3D world is full-bleed; the old desktop sidebar content now lives in the
bottom-nav tabs (World / Messages / Feed / Profile) and in slide-up sheets (Nearby, Things to do). Design-system
tokens are wired in `web/src/style.css`. Virtual joystick + tap-to-interact added for touch. Verified at
390×844 and 1440×900 (`web/scripts/ui-check.mjs`, both viewports, 0px horizontal overflow).
**Correction (M3):** until M3, `web/index.html` had no viewport meta, so "390×844" shots were really a 980px layout
scaled down. Fixed; ui-check now fails if the layout width ≠ the viewport width. Phone layout re-verified for real:
two-row top bar, joystick bottom-left, dock bottom-right.

| # | Screen | Status | Where | Notes / gaps vs spec | References |
|---|---|---|---|---|---|
| 01 | Welcome | ✅ | `web/src/Welcome.tsx` | Logo + tagline, animated 3D Lagos night skyline (procedural, reduced-motion aware, CSS fallback), one-line pitch, Create Account / Sign In, Terms · Privacy · Community rules sheets. **Legal copy is a marked draft: final Terms/Privacy need client input.** | `whatsapp/01-key-art-poster.jpg` |
| 02 | Account creation | ✅ | `apps/api/src/auth.rs`, `main.tsx` | Email + password + DOB (18+) + terms (linked). Rate limited. Inline error under the form; input is kept on failure; Back to Welcome. | spec §3 |
| 02A | Sign in | ✅ | same | Session restores on reload. | |
| 03 | Character builder | ✅ | `web/src/Creator.tsx`, `look.ts`, `venue.ts::makeHumanoid` | Follows the client's 4-panel mockup (panels 1–3 here, panel 4 = screen 05; ADR 0009). Avatars are primitive placeholders; target is stylized 3D (ADR 0004). | `whatsapp/02`, `04`, `05`; `ui-spec-chat/27–38`, `31` |
| 04 | Preferences & intent | ✅ | `Creator.tsx` step 4, `prefs.ts`; `crates/common` `Preferences`, `validate_avatar` | Intent, relationship style (+public toggle), up to 5 interests (+public toggle), boundaries (public date / venue visit / private location), show me (mutual), discoverable. Server validates against catalogs. Boundaries enforced server-side for private invites (the only invite type so far). | spec §3 |
| 05 | Profile preview | ✅ | `Creator.tsx` step 5 | Mockup "Identity complete" card + "How others see you": bio (≤160), public chips only, discoverability, Edit character / Edit preferences, Enter the City. | `whatsapp/02` panel 4 |
| 06 | World / social hub | 🟡 | `web/src/SceneView.tsx`, `venue.ts`, `ui.tsx` | Full-bleed Lekki Phase 1 street (ends at a lagoon with skyline + link bridge), Ikoyi Lounge, Victoria Island Rooftop, private room; NPCs, real players, name tags, portals, mobile shell, virtual joystick, portrait-aware camera FOV. **Gaps:** venues sparsely populated; room chat is still a legacy overlay; primitive avatars (ADR 0004). | `whatsapp/03`; `ui-spec-chat/20,23,24,43`; Lagos refs |
| 06A | Location details | ⏳ | n/a | Venue panel: art, vibe, activity type, players present, entry cost, Enter. Currently you walk into doors directly. | |
| 07 | Discover | ✅ | `web/src/Discover.tsx`; `apps/api/src/matching.rs` (`GET /v1/discover`, `POST /v1/social/pass`) | Like/Pass deck with 3D portraits, compatibility, bio, public interests (shared ones highlighted), online/location. Swipe, buttons or ←/→. Players first, NPC fallback; Pass hides 24h. Empty state: Broaden preferences / Change location / Meet a local. Opened from the world dock and Messages (ADR 0010). Nearby sheet still exists for who's in the room. | `ui-spec-chat/14,16,17` |
| 07A | Profile detail | ✅ | `Discover.tsx` (detail view) | Full-body avatar, bio, shared interests, public relationship style, "why you might click", Express interest / Pass / Back. Never shows boundaries or private fields. | `ui-spec-chat/12` |
| 08 | Match confirmation | ✅ | `Discover.tsx::MatchMoment`; `matching.rs` (`matches` table) | Mutual like → both faces + short pop animation (reduced-motion aware), Start chat / Keep exploring (Esc). The side that didn't act sees it once via polling. NPCs match back from Friendly. Player Start chat → Messages until DMs (M5). | |
| 09 | Chat (player↔player) | ⏳ | n/a | Only NPC chat (`chat.rs`, `Hud.tsx::NpcChat`) and room-wide chat exist. Needs DMs, header (presence, profile, more menu), quick actions. | `whatsapp/03` (chat look) |
| 09A | Conversation controls | 🟡 | block/report endpoints | Mute and End conversation missing; needs a sheet with explanations + confirmations. | |
| 10 | Suggest activity | 🟡 | private-room request | Only "private room". Needs public date / venue visit / private location sheet with costs. | |
| 11 | Invitation pending | 🟡 | consent toast, `private_rooms` | Works as a toast. Needs an **in-chat InvitationCard** with pending/accepted/declined/expired/cancelled + expiry. | |
| 12 | Date / shared scene | 🟡 | `buildPrivateRoom` | Private room scene exists. Needs date scenes (rooftop dinner, lounge booth) with 2–3 dialogue choices, objectives, Leave. | `ui-spec-chat/05,06,09,10` |
| 13 | Private encounter | ⏳ | n/a | Both confirm → non-graphic scene / fade-to-black → Skip/Leave always visible. | ADR 0003 |
| 14 | Encounter outcome | ⏳ | n/a | ₦ earned, reputation change, optional feedback, Continue. Server-validated. | |
| 15 | Profile & stats | 🟡 | `main.tsx` Profile tab (`ui.tsx::TierMeter`) | Profile tab shows avatar, bio, likes, match code, Lv/₦, preferences with public/private markers, Edit character / Edit preferences / Preview profile, sign out, relationships. Needs: level title, reputation, **body count (unique partners)**, total encounters, achievements, stat visibility toggles (M7). | |
| 15A | Detailed stats | ⏳ | n/a | | |
| 16 | Feed | 🟡 | `main.tsx` Feed tab (`ui.tsx::EmptyState`) | Tab shell with empty state. Needs real feed from `game_event_audit` (M8). | `ui-spec-chat/41,42` |
| 17 | Messages inbox | 🟡 | `main.tsx` Messages tab | Matches list (new badge, online/location, Meet there / Chat for locals) + Discover button; nav badge counts new matches + invites. Needs DM threads + NPC threads (M5). Also covers the poster's "phone" fantasy. | `whatsapp/01` |
| 18 | Settings & privacy | ⏳ | n/a | Account, visibility, discovery prefs, notifications, **blocked players list**, sign out, delete account. | |
| — | Top bar (needs, ₦, XP, clock) | ✅ | `web/src/ui.tsx::TopBar` | Mobile top bar: avatar + name + Lv + ₦, compact needs, clock. ₦ (not `$`). Legacy `Hud.tsx::TopHud` retained but unused. | `whatsapp/07` |
| — | NPC chat panel | ✅ | `Hud.tsx::NpcChat`, `apps/api/src/chat.rs` | Matches the client screenshot (scores, meter, tier, typing). | `whatsapp/03, 08` |
| — | Life actions | ✅ | `apps/api/src/life.rs` | Drink/eat/dance/work/rest per venue. | |
