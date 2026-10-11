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

## Typography (v2, 2026-10-11; display face softened from Unbounded to Bricolage Grotesque at the owner's request)

Fonts are self-hosted from `@fontsource-variable/*` (SIL OFL), imported in `web/src/main.tsx`. No font CDN.

| Token | Family | Use |
|---|---|---|
| `--font-display` | **Bricolage Grotesque** (variable 200–800; weights 700–800) | Logo, screen titles, sheet/dialog titles, card names, CTAs (`button.hero`, creator nav), badges with numbers |
| `--font-body` | **Plus Jakarta Sans** (variable) | Everything else: body, inputs, buttons, labels |
| `--font-hand` | **Caveat** | Sparingly, for the poster's hand-written voice: tagline, creator subtitles, match-moment line |

Scale: `--fs-xs` 11 · `--fs-sm` 13 · `--fs-md` 15 · `--fs-lg` 18 · `--fs-xl` 22 · `--fs-2xl` 28 · `--fs-3xl` 38 · `--fs-hero` 60.
Weights: body 500/600/750, display 700/800/900. Micro-labels are uppercase 11px with 0.1–0.12em tracking.

- Brand mark (`BrandLogo` in `ui.tsx`), after the poster: heavy white "Side", hot-pink skewed "piece" with a swoosh
  underline and a small heart. The tagline is set in Caveat, rotated slightly.
- Creator (v2.4, owner's request 2026-10-11): it now uses the guest-pass language instead of the mockup's blue panels.
  - **Page:** a full-height skyline backdrop.
  - **Card:** plum glass, with a tilted `--brand-grad` card behind it.
  - **Step bar:** labelled You / Look / Outfit / Vibe / Ready at the top; tap a step to jump to it.
  - **Titles:** sentence case, with the Caveat subtitle in gold.
  - **Step 1:** a live 3D face replaces the placeholder badge.
  - **Navigation:** the Back/Next bar sticks to the bottom of the screen.
  - **Buttons:** the mockup's `[ NEXT ]` brackets are gone; buttons are pills with lucide arrows.

## Form fields (v2.3, 2026-10-11)

- **`Field`** (`ui.tsx`): one rounded box with a 40px icon bubble and a floating label. On focus the bubble turns
  `--cta-grad` and the border turns `--hot-pink`. Once valid, the bubble flips to a `--success` check (pop animation). An
  optional live hint sits underneath: neutral, `good` (success) or `bad` (danger). Used on auth and the creator alias.
- **Auth card = guest pass:** a tilted `--brand-grad` card behind, and a notched dashed tear line with an "Admit one · 18+"
  stub holding consent and the CTA. Register shows a 5-dot "Guest pass" meter. The password has a show/hide toggle
  and a 3-bar strength meter. The date of birth shows the age (or the 18+ error) live.
- **Consent card** replaces bare checkboxes: a tappable card with a heart that fills in.
- **Legal pop-up** (`LegalPopup` in `Welcome.tsx`): Terms, Privacy and Rules open as a centred card. It springs in
  with a tilt and animates out on close. A sliding-pill tab bar switches between the three docs. Each doc has its own
  icon badge (pop-in), and the points stagger in. Reduced motion turns the animations off.

## Depth, glass and icons (v2)

- **Glass surface** = `--glass` background + `--glass-border` + `--glass-hi` inner highlight + `--shadow-lg`, with a
  20px backdrop blur. Used for cards, sheets, dialogs, top-bar chips, toasts, NPC chat and room chat.
- **CTA** = `--cta-grad` (hot pink → coral) with `--glow-pink`. Creator CTAs keep `--primary-grad` with `--glow-violet`.
- **Brand gradient** `--brand-grad` (pink → violet): selected chips, active nav pill, outgoing chat bubbles.
- **Icons:** `lucide-react` (ISC), stroke 2–2.5, 13–20px. UI chrome uses icons; emoji stay only in playful
  content (empty-state halos, item swatches).
- Radii tokens: `--r-sm` 14 · `--r-md` 18 · `--r-lg` 22 · `--r-xl` 26 · `--r-pill`.

## Spacing, shape, motion

- **8-point grid:** 4 (tight), 8, 12, 16, 24, 32.
- Radii: inputs/buttons 14px · cards 18–22px · sheets 24–26px · pills 999px.
- Button heights: 44px default (thumb-friendly), 32px compact, 52px hero CTA.
- Motion: 120–200ms `--ease-out`; presses and pops use `--ease-spring` (buttons squash to 0.97 on press, the
  like button heart-beats, nav badges pop, toasts drop in). Entrance "rise" 16px. Everything respects
  `prefers-reduced-motion`. No long cutscenes; match animation must be skippable.

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

Below 600px the top bar is exactly the two rows above (identity + ₦, then needs + time-only clock) and
`--topbar-h` grows so badges/panels sit under it. Bottom of the world on phones: joystick bottom-left,
quick-action dock bottom-right, interaction prompt centred above both.

## Universal screen states

Every screen and component handles: **default, loading, empty, error, success, disabled, offline**.
Empty states always offer a next step (e.g. Discover empty → "Broaden preferences" / "Change location").

## Reusable components (build once, use everywhere)

`AvatarPortrait` · `ProfileCard` · `InvitationCard` (draft/pending/accepted/declined/expired/cancelled) ·
`NeedBar` · `ScoreDelta` · `TierMeter` · `Sheet` · `ConfirmDialog` · `Toast` · `EmptyState` · `ErrorState` ·
`BottomNav` · `TopBar`.
