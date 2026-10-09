# Source analysis

What each client source says, how they fit together, and where they conflict. Read this before changing
product behaviour. It records *why* the game is shaped the way it is.

## Source A: WhatsApp media (client, highest authority)

Location: `docs/references/whatsapp/` (3 images, 2 videos, zoomed crops, video contact sheets).

| Finding | Evidence | Status |
|---|---|---|
| Brand: "Side piece" logo, "Same People. New Options.", "Better Choices, Bigger Stories" | Poster | Used in UI copy |
| **The phone and apartment are central** (texting, home base) | Poster: woman on her phone in bed, wall of couple photos | ⏳ Not built (Messages inbox + apartment) |
| **Four-step creator**: Profile → Build → Outfit → Identity Complete → "Enter the City" | Mockup + both videos | ✅ `web/src/Creator.tsx` |
| Gender: Male / Female / Non-Binary | Mockup | ✅ |
| **"Likes in a partner"** tags: Adventurous, Career-Focused, Caring, Humorous, Reserved | Mockup, videos | ✅ drives compatibility |
| Hair length + colour palette, skin tone gradient, 2 facial-structure pads, body type, "Randomize unique look" | Mockup | ✅ |
| Outfit carousels: Top / Bottom / Accessories / Style (Streetwear, Classic, Glam) | Mockup | ✅ |
| Identity summary card + unique match code + ✔ Looks ✔ Outfit ✔ Name | Mockup | ✅ |
| "Enter the City": a neon street | Mockup | ✅ City hub with venue doors |
| **Free-text NPC chat with per-message scores** "(−3)", "(0)" | Gameplay screenshot | ✅ `apps/api/src/chat.rs` |
| Relationship meter ☹️—😊, tier label ("Best Friend"), "6/7" | Screenshot | ✅ 7 tiers |
| "…" typing bubble over the NPC | Screenshot | ✅ |
| HUD: coins, stars/XP, level · energy, hunger, mood, (red need), love · clock + date + night icon | Screenshot | ✅ `web/src/Hud.tsx`, `apps/api/src/life.rs` |
| Third-person over-the-shoulder camera, populated neon lounge | Screenshot | ✅ (venue still sparse) |
| Realistic-ish human characters | Creator videos | ⚠️ Superseded by "stylized 3D" (Source C) |

## Source B: ChatGPT "core game" chat

Verbatim: `docs/product/sources/chatgpt-core-game.md` · images: `docs/references/core-game-chat/`.

- Reframes Side Piece as an **adult social dating game**: attraction, hookups, multiple partners, money, reputation.
- Journey: create character → enter world → meet & attract → date/hook up/explore → earn, rate, progress (body count).
- Character creation includes **appearance, lifestyle, relationship style, interests, intent**.
- Spawn into a lively location; **mutual compatibility** matters more than proximity.
- Simple interaction loop: approach → build attraction → mutual interest → date/private location → outcome.
- Economy: earn game currency from activities, ratings and achievements. Spend it on outfits, dates, gifts and venue access.
  Body count must **not** be the only earnings driver.
- Multiple partners and cheating are allowed, with consequences when expectations conflict.
- Recommends real player-to-player encounters, with NPCs to keep the world lively.

## Source C: ChatGPT "UI flow & screen spec" chat

Verbatim: `docs/product/sources/chatgpt-ui-spec.md` · images: `docs/references/ui-spec-chat/`.
Screen-by-screen status: `docs/product/screen-map.md`.

- **Mobile-first web game.** One continuous social world rather than disconnected screens.
- **Lagos-inspired** world. Locations like *Victoria Island Rooftop*. Cash in **₦**.
- **Stylized 3D**, premium and playful nightlife look. Design system: deep plum/charcoal, violet primary, coral
  secondary, muted green success, 8-point spacing (see `design-system.md`).
- **Persistent shell:** identity (avatar, name, level) + status (₦, progress) + content + **bottom nav
  World / Messages / Feed / Profile**. It hides during full-screen dates, but Exit always stays visible.
- 18 screens: Welcome, Account, Character builder, **Preferences & intent (incl. boundaries)**, **Profile preview**,
  World hub, Location details, **Discover (Like/Pass)**, Profile detail, **Match**, **Chat (player↔player)**,
  Conversation controls, **Suggest activity**, **Invitation pending (in-chat card)**, **Date / shared scene with
  2–3 dialogue choices**, **Private encounter (both confirm, fade-to-black)**, **Outcome**, **Profile & stats
  (body count = unique partners; total encounters)**, Detailed stats, **Feed**, **Messages inbox**, **Settings & privacy**.
- **Universal screen states:** default / loading / empty / error / success / disabled / offline.
- Currency, body count and encounters are **validated server-side**.
- Recommended build order: foundation → onboarding → world → discovery/matching → chat → shared activities →
  progression → polish.

## Conflicts & resolutions

| Conflict | Resolution | Decision record |
|---|---|---|
| Realistic humans (WhatsApp videos, inZOI refs) vs "stylized 3D" (spec, Synty/Paralives refs) | **Stylized 3D.** inZOI shows how the creator *works*, not how it looks. | `docs/decisions/0004-stylized-3d-art.md` |
| Creator shows only "Likes in a partner"; spec adds intent, relationship style, boundaries | Keep the mockup's 4 creator panels exactly; add a **separate Preferences step** after them (spec Screen 04), then Profile preview. | `0006-onboarding-shape.md` |
| NPC chat free-text (screenshot) vs date scenes with 2–3 dialogue choices (spec) | **Both.** Free-text scored chat for conversations; short choice-driven beats inside date scenes. | `0005-npc-conversation.md` |
| Generic "city" + `$` (current build) vs Lagos + `₦` (spec) | Move to **Lagos naming and ₦**. | `0007-lagos-setting.md` |
| Desktop sidebar layout (current build) vs mobile-first shell (spec) | Rebuild the client shell **mobile-first** with bottom nav and sheets; desktop is a wider version of the same. | `0008-mobile-first-shell.md` |
| "Hookups / body count" (Source B) vs content safety | Allowed as **non-graphic** scenes with mutual confirmation; body count = unique partners, computed server-side; never required for progression. | `0003-consent-and-content.md` |
