# 0006: Onboarding = mockup creator + preferences + profile preview

**Context.** The client mockup defines a 4-panel creator with only "Likes in a partner" for matching. The spec adds a Preferences screen (relationship style, interests, intent, boundaries, discovery settings) and a Profile preview.

**Decision.** Keep the **4 creator panels exactly as in the mockup**, then add **Preferences** (spec 04), then **Profile preview** (spec 05), then "Enter the City". Returning players skip onboarding and land in the city. Everything stays editable from Profile.

**Consequences.** `AvatarConfig` gains preference fields (`#[serde(default)]` for old rows). Compatibility moves from likes-only to likes + intent + relationship style, and boundaries exclude invitation types.

**Revisit when.** Analytics show onboarding drop-off. Then trim, but never below the mockup's panels.
