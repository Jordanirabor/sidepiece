# Visual references

These images are the visual ground truth for Side Piece. Check here before designing or changing
anything visual. When something you build looks different from these, say so explicitly and make it a
deliberate choice.

> ⚠️ **Licensing:** Except for the WhatsApp files (from the client), every image here belongs to its
> original owner and is kept for **internal reference only**. Never ship, trace, or bundle them into the game.
> `docs/` is excluded from Docker builds.

## Priority order when sources disagree

1. **`whatsapp/`**: the client's own material. Highest authority on look, flow and tone.
2. **`ui-spec-chat/`**: images for the screen-by-screen UI spec (`docs/product/sources/chatgpt-ui-spec.md`).
3. **`core-game-chat/`**: images for the core game vision (`docs/product/sources/chatgpt-core-game.md`).

---

## 1. `whatsapp/`: client material (ground truth)

| File | What it shows | What to take from it |
|---|---|---|
| `01-key-art-poster.jpg` | Key art: woman on her phone in a bedroom, wall of couple photos, note "Better Choices, Bigger Stories", city at night. Logo "Side piece" with tagline "Same People. New Options." | Brand, logo treatment (white + hot-pink script, heart), tagline. **The phone is central**: messaging, home base/apartment. Warm purple/pink night palette. |
| `02-character-creator-4-panels.jpg` | Four-step creator: Create Profile → Build Character → Select Outfit → Identity Complete → "Enter the City". | **Structure of onboarding** (implemented in `web/src/Creator.tsx`). Alias, gender (M/F/Non-binary), *Likes in a partner* tags, hair/skin/face pads/body, top/bottom/accessories/style carousels, summary card with unique match code. Navy/violet glass panels with condensed uppercase headers and `[ BRACKET ]` buttons. |
| `03-gameplay-npc-chat-hud.jpg` | Real in-game screenshot: lounge, NPC Maya, chat box, top HUD. | **Core gameplay feel.** Third-person over-the-shoulder 3D, neon lounge. NPC chat is **free-text** ("Enter text…") with **per-message scores** "(-3)", "(0)"; sad→happy meter, tier label "Best Friend", "6/7"; "…" typing bubble over the NPC. |
| `06/07/08-*-zoom.jpg` | Upscaled crops of 03. | HUD: coins, stars/XP, level · energy ⚡, hunger 🍴, mood 🙂, a red-trending need, love/social ❤ · clock "02:32 🌙 11 May 2031". |
| `04/05-creator-video-*-frames.jpg` | Contact sheets of the two creator walkthrough videos. | Creator flow in motion: the cursor picks gender and likes, edits hair colour, steps through outfit, then "Enter the City". |
| `videos/*.mp4` | The original 10s walkthroughs. | Same as above. |

## 2. `ui-spec-chat/`: images for the UI specification

The spec asks for **"stylized 3D"** throughout, a premium playful nightlife game, mobile-first.

### Character creator (spec Screen 03)
| File | Takeaway |
|---|---|
| `27`–`30`, `32`–`38-inzoi-creator-*` | inZOI studio. Use it for **how the creator works**, not how it looks: big centred avatar, right-hand grid of item thumbnails, face presets, colour palettes, studio backgrounds and lighting. Photoreal, which is above our target fidelity. |
| `31-creator-body-clothing-identity-tabs` | Stylized creator with **Body / Clothing / Identity** tabs, category list and colour wheel. Closer to our art target. |

### Avatars & characters (consistent identity across screens)
| File | Takeaway |
|---|---|
| `11-stylized-character-promo`, `13-stylized-couple-portrait`, `15-stylized-couple-zepeto-like`, `40-…street-character`, `44-stylized-avatar-trio` | Range of **stylized adult avatars**: fashionable, expressive, not photoreal. Our target zone. |
| `12-dating-sim-character-card` | Character card with name, stars, short bio facts. Pattern for **profile cards**. |

### Venues & world (spec Screen 06 and 12)
| File | Takeaway |
|---|---|
| `24-synty-polygon-nightclubs-rooftop`, `43-synty-polygon-club-moon` | **Synty POLYGON Nightclubs**: low-poly stylized venues (rooftop with fire pit, string lights, club exterior). Strong candidate art pack (licence check needed for web). |
| `20-game-rooftop-party-crowd`, `23-sims4-bar-social`, `39-game-night-city-rooftop` | Crowded social venues. A lively, populated small space beats a huge empty map. |
| `02-luxury-lounge-green-velvet`, `08-luxury-condo-skyline`, `04-modern-apartment-interior`, `18-game-rooftop-sunset-lounge`, `25-inzoi-lounge-people` | Lounge and apartment interiors: warm accent lighting, skyline windows, velvet seating. |
| `01-inzoi-couple-apartment-balcony` | Apartment as a date / private scene. |

### Lagos setting
| File | Takeaway |
|---|---|
| `19-lagos-lekki-apartment-estate`, `26-lagos-vip-rooftop-event`, `45-lagos-rooftop-night-traffic` | **Lagos, Nigeria** is the setting: Lekki estates, VI rooftop events, Afrobeats nightlife over neon traffic. Use for naming (e.g. *Victoria Island Rooftop*), skyline and ₦ currency. |

### Dating & social UI (spec Screens 07–09, 15)
| File | Takeaway |
|---|---|
| `14-dating-game-ui-dark-plum`, `16-dating-game-ui-profile-picker` | **Dark plum UI** with coral/pink CTAs, portrait cards, stats, shop. Matches the spec palette. |
| `17-dating-app-ui-cards` | Profile grid and full-bleed portrait card with Like/Pass. Pattern for **Discover**. |
| `41-social-app-ui-purple`, `42-highrise-social-room-ui` | Social rooms and feed on mobile. Pattern for **bottom nav, rooms list, feed**. |

### Dates & shared scenes (spec Screen 12)
| File | Takeaway |
|---|---|
| `05-rooftop-valentine-dinner`, `10-rooftop-dinner-couple-city`, `03-rooftop-restaurant-sims` | Rooftop dinner date: candles, skyline, table for two. |
| `06-sims-couple-lounge-booth`, `09-stylized-couple-bar` | Lounge booth date with drinks, a stylized couple. |

## 3. `core-game-chat/`: images for the core game vision

| File | Takeaway |
|---|---|
| `08-lagos-afrobeats-nightlife`, `09-lagos-w-bar-lounge-rooftop`, `13-lagos-quilox-club`, `22-lagos-skyline-soiree-art` | **Real Lagos venues and vibe**: Quilox, W Bar Lounge, Afrobeats crowds. Inspiration for named venues and NPC styling. |
| `04-cyberpunk-rooftop-lounge`, `05-penthouse-lounge-skyline`, `12-rooftop-club-purple`, `07-rooftop-hot-tub-asset`, `02-stylized-futuristic-rooftop` | Rooftop and penthouse lounges: neon, skyline, private corners. |
| `10-club-booths-screens`, `11-luxury-condo-living-room` | Club interior with booths; luxury apartment (private scenes). |
| `21-synty-polygon-nightclubs-street` | Synty POLYGON Nightclubs street with a queue outside. Same art-pack candidate. |
| `14/15-stylized-avatar*`, `18-thirsty-suitors-stylized`, `19-paralives-stylized-characters`, `17-choices-visual-novel-characters` | **Stylized character range** from games that do romance and social well (Thirsty Suitors, Paralives, Choices). |
| `01-avatar-realistic-red-dress`, `16-gta6-realistic-character` | Realistic end of the spectrum. Shows the upper bound and is **not** the target. |

---

## Distilled art direction

- **Semi-realistic 3D, adult, fashionable, Black/African-forward cast, Lagos nightlife** (ADR 0012, superseding
  the earlier "stylized" target). Aim for the client's own gameplay screenshot (`whatsapp/06`) and Sims 4-level
  fidelity: real proportions, skinned characters, filmic night lighting. Not photoreal and not chibi. The stylized
  references below are still useful for layout, mood and UI, but not for fidelity.
- **Small, lively, populated spaces** (rooftop, lounge, club, apartment) beat a large empty open world.
- **Night palette:** deep plum and navy, violet primary, hot pink and coral accents, neon cyan highlights, warm amber practical lights.
- **One avatar everywhere:** the same character in creator, world, cards, chat headers and dates.
