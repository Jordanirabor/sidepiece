# Design system

Source: UI spec §2 (`sources/chatgpt-ui-spec.md`) + client mockups (`docs/references/whatsapp/`).
Every new screen and component must use these tokens. Don't introduce new colours, radii or spacing ad hoc.
Add the token here first.

## Colour tokens

| Token | Value | Use |
|---|---|---|
| `--bg-world` | `#0b0716` (deep plum-black) | World, shared scenes, dark sheets |
| `--bg-panel` | `rgba(24, 16, 44, 0.86)` | Cards and sheets over the 3D world |
| `--bg-calm` | `#14111f` (charcoal) | Settings, stats, account (quieter screens) |
| `--primary` | `#8b5cf6` (violet) | Primary actions, selection, focus |
| `--primary-grad` | `linear-gradient(135deg, #3a7bd5, #b934ff)` | Creator CTAs (matches client mockup) |
| `--accent` | `#ff5c7a` (coral pink) | Secondary emphasis, romance, likes, hearts |
| `--hot-pink` | `#ff2f91` | Brand logo pink, neon accents |
| `--success` | `#4cbf8a` (muted green) | Success, positive score deltas, healthy needs |
| `--warning` | `#e8b021` | Mid needs, XP |
| `--danger` | `#ff4d5e` | Negative deltas, low needs, block/report |
| `--neon-cyan` | `#8defff` | Other players, system info, highlights |
| `--text` | `#ffffff` | Primary text |
| `--text-muted` | `#b9b0dc` | Secondary text |
| `--line` | `rgba(255,255,255,0.12)` | Borders, dividers |

Name-tag colour language in 3D: **you = pink `#ffc0df`**, **other players = cyan `#8defff`**, **NPCs = gold `#ffe08a`**.

## Typography

- One sans-serif family (Inter / system UI). Weights 500 / 650 / 800 / 900.
- Creator panel titles: condensed, uppercase, 900, as in the mockup ("CREATE YOUR PROFILE").
- Buttons in the creator use the mockup's bracket style: `[ NEXT ]`, `[ BACK ]`, `[ ENTER THE CITY → ]`.

## Spacing, shape, motion

- **8-point grid:** 4 (tight), 8, 12, 16, 24, 32.
- Radii: inputs/buttons 14px · cards 18–22px · sheets 24–26px · pills 999px.
- Button heights: 44px default (thumb-friendly), 32px compact, 52px hero CTA.
- Motion: 120–200ms ease-out; entrance "rise" 16px. No long cutscenes; match animation must be skippable.

## Persistent shell (mobile-first)

```
┌──────────────────────────────┐
│ ◉ avatar  Name  Lv 8   ₦85,000│  ← identity + status (hide in full-screen scenes)
│ ⚡ 🍴 🙂 💬 💗      🌙 21:24  │  ← needs + clock (compact)
├──────────────────────────────┤
│                              │
│        main content          │  ← 3D world / profile / chat / activity
│                              │
├──────────────────────────────┤
│ World  Messages  Feed  Profile│  ← bottom nav (hide in full-screen scenes; Exit stays)
└──────────────────────────────┘
```

Desktop is the same shell with more room. Sheets slide in from the side instead of up from the bottom.

## Universal screen states

Every screen and component handles: **default, loading, empty, error, success, disabled, offline**.
Empty states always offer a next step (e.g. Discover empty → "Broaden preferences" / "Change location").

## Reusable components (build once, use everywhere)

`AvatarPortrait` · `ProfileCard` · `InvitationCard` (draft/pending/accepted/declined/expired/cancelled) ·
`NeedBar` · `ScoreDelta` · `TierMeter` · `Sheet` · `ConfirmDialog` · `Toast` · `EmptyState` · `ErrorState` ·
`BottomNav` · `TopBar`.
