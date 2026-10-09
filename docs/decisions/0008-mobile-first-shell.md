# 0008: Mobile-first persistent shell

**Context.** The spec is a "mobile-first web game" with a persistent shell: a top bar (avatar, name, level, ₦) and bottom nav (World / Messages / Feed / Profile). The current client is a desktop sidebar plus a 3D stage.

**Decision.**
- Restructure the client into a full-bleed 3D world with:
  - a **TopBar**: identity + ₦ + compact needs/clock
  - a **BottomNav**
  - **sheets** for Discover, Profile, Messages, Feed and Settings
- Full-screen scenes (dates, encounters) hide the top bar and nav but keep **Exit** visible.
- Desktop is the same shell, wider. Sheets dock to the side.
- Touch controls (virtual joystick, tap-to-interact) replace keyboard-only movement on mobile.

**Consequences.**
- `web/src/main.tsx` is split into routes/screens plus a component library (see `design-system.md`).
- `scripts/ui-check.mjs` should screenshot both a phone viewport (390×844) and desktop.

**Revisit when.** Native clients exist and need a different navigation model.
