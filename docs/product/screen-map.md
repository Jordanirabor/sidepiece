# Screen map: spec → status → code

Every screen from the UI spec (`sources/chatgpt-ui-spec.md`), plus the client mockups, with current status.
**Update this table in the same change that moves a screen forward.** It is the main drift check.

Legend: ✅ done · 🟡 partial / deviates (see notes) · ⏳ not started

| # | Screen | Status | Where | Notes / gaps vs spec | References |
|---|---|---|---|---|---|
| 01 | Welcome | 🟡 | `web/src/main.tsx` (auth step) | Brand card + auth form share one screen. Needs a separate welcome with nightlife backdrop, Create Account / Sign In and Terms/Privacy links. | `whatsapp/01-key-art-poster.jpg` |
| 02 | Account creation | ✅ | `apps/api/src/auth.rs`, `main.tsx` | Email + password + DOB (18+) + terms. Rate limited. Missing: inline field errors, keep input on network failure. | spec §3 |
| 02A | Sign in | ✅ | same | Session restores on reload. | |
| 03 | Character builder | ✅ | `web/src/Creator.tsx`, `look.ts`, `venue.ts::makeHumanoid` | Follows the client's 4-panel mockup. Avatars are primitive placeholders; target is stylized 3D (ADR 0004). | `whatsapp/02`, `04`, `05`; `ui-spec-chat/27–38`, `31` |
| 04 | Preferences & intent | ⏳ | n/a | Relationship style, interests, intent, **boundaries**, discovery settings, public/private toggles. (Backend still has `intent` on `AvatarConfig`.) | spec §3 |
| 05 | Profile preview | 🟡 | `Creator.tsx` step 4 | "Identity Complete" card exists. Needs bio, public interests, discoverability toggle, Edit Character / Edit Preferences. | `whatsapp/02` panel 4 |
| 06 | World / social hub | 🟡 | `web/src/SceneView.tsx`, `venue.ts` | City street + Neon Lounge + Rooftop + Private room, NPCs, real players, name tags, portals. **Gaps:** desktop sidebar instead of mobile shell; generic names instead of Lagos; venues sparsely populated. | `whatsapp/03`; `ui-spec-chat/20,23,24,43`; Lagos refs |
| 06A | Location details | ⏳ | n/a | Venue panel: art, vibe, activity type, players present, entry cost, Enter. Currently you walk into doors directly. | |
| 07 | Discover | 🟡 | `main.tsx` "Nearby" list; `GET /v1/discovery` | List of nearby NPCs/players with compatibility. Needs card-based **Like / Pass**, separate from the world, plus empty-state fallbacks. | `ui-spec-chat/14,16,17` |
| 07A | Profile detail | ⏳ | n/a | Larger avatar, bio, shared interests, compatibility, Express Interest. | `ui-spec-chat/12` |
| 08 | Match confirmation | ⏳ | n/a | `player_interests` exists; needs mutual detection + match moment (Start Chat / Keep Exploring). | |
| 09 | Chat (player↔player) | ⏳ | n/a | Only NPC chat (`chat.rs`, `Hud.tsx::NpcChat`) and room-wide chat exist. Needs DMs, header (presence, profile, more menu), quick actions. | `whatsapp/03` (chat look) |
| 09A | Conversation controls | 🟡 | block/report endpoints | Mute and End conversation missing; needs a sheet with explanations + confirmations. | |
| 10 | Suggest activity | 🟡 | private-room request | Only "private room". Needs public date / venue visit / private location sheet with costs. | |
| 11 | Invitation pending | 🟡 | consent toast, `private_rooms` | Works as a toast. Needs an **in-chat InvitationCard** with pending/accepted/declined/expired/cancelled + expiry. | |
| 12 | Date / shared scene | 🟡 | `buildPrivateRoom` | Private room scene exists. Needs date scenes (rooftop dinner, lounge booth) with 2–3 dialogue choices, objectives, Leave. | `ui-spec-chat/05,06,09,10` |
| 13 | Private encounter | ⏳ | n/a | Both confirm → non-graphic scene / fade-to-black → Skip/Leave always visible. | ADR 0003 |
| 14 | Encounter outcome | ⏳ | n/a | ₦ earned, reputation change, optional feedback, Continue. Server-validated. | |
| 15 | Profile & stats | 🟡 | sidebar identity + relationships | Needs a proper profile: level title, reputation, **body count (unique partners)**, total encounters, ₦, achievements. | |
| 15A | Detailed stats | ⏳ | n/a | | |
| 16 | Feed | ⏳ | n/a | Matches, invitations, achievements, venue/event news. Game events already flow through NATS → `game_event_audit`. | `ui-spec-chat/41,42` |
| 17 | Messages inbox | ⏳ | n/a | Also covers the poster's "phone" fantasy. NPC threads already persist (`npc_messages`). | `whatsapp/01` |
| 18 | Settings & privacy | ⏳ | n/a | Account, visibility, discovery prefs, notifications, **blocked players list**, sign out, delete account. | |
| — | Top HUD (needs, ₦, XP, clock) | 🟡 | `web/src/Hud.tsx::TopHud` | Matches the client screenshot. Uses `$` → switch to `₦`; merge into the mobile top bar. | `whatsapp/07` |
| — | NPC chat panel | ✅ | `Hud.tsx::NpcChat`, `apps/api/src/chat.rs` | Matches the client screenshot (scores, meter, tier, typing). | `whatsapp/03, 08` |
| — | Life actions | ✅ | `apps/api/src/life.rs` | Drink/eat/dance/work/rest per venue. | |
