# 0009: Preferences sit inside the mockup flow; "Identity complete" is the profile preview

Refines [0006](0006-onboarding-shape.md).

**Context.** ADR 0006 said: the 4 mockup creator panels, *then* Preferences (spec 04), *then* Profile
preview (spec 05). That is 6 screens after the account step, but the M3 acceptance criterion is "a new player
reaches the city in ≤ 5 screens after the account step". The mockup's 4th panel, "Identity complete · Final
review", already *is* a profile preview (avatar, alias, likes, style, match code, "Enter the City").

**Decision.**
- Flow: **Create profile → Build character → Select outfit → Preferences → Identity complete → Enter the City** (5 screens, counter `(n/5)`).
- "Identity complete" keeps the mockup layout and gains the spec 05 parts underneath: optional bio, public
  interests/relationship style (only if toggled public), discoverability line, and Edit character / Edit preferences.
- Panel 3's button becomes `[ NEXT ]`; Preferences ends with `[ REVIEW ]` (the mockup's bracket style).
- Everything is editable later from Profile, which reopens the same creator at panel 1, 4 or 5 in an
  "edit" mode (Cancel + `[ SAVE CHANGES → ]`).

**Consequences.** All 4 mockup panels survive unchanged in look and order; the step counter reads `/5`, not
`/4`. Intent and boundaries are always private; relationship style is private by default; interests are
public by default.

**Revisit when.** Onboarding analytics show drop-off at Preferences (then make it skippable, not removed).
