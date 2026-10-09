# 0007: Lagos setting and ₦ currency

**Context.** The spec is explicitly Lagos-inspired ("Victoria Island Rooftop", ₦85,000), and the reference images include Lekki estates, VI rooftop events, Quilox and Afrobeats nightlife. The current build uses a generic "The City" and `$`.

**Decision.**
- Rename the hub and venues to Lagos locations, e.g. *Lekki Phase 1 street*, *Victoria Island Rooftop*, *Ikoyi lounge*. Use invented venue names, not real businesses.
- Currency becomes **₦**, rebalanced to naira scale (e.g. drink ₦3,500, shift +₦18,000).
- Add a Lagos skyline and Lekki-Ikoyi-bridge silhouette to backdrops.

**Consequences.**
- Server-side economy values change in `apps/api/src/life.rs` (`ACTIONS`, starting money). Display formatting is `₦` with thousands separators.
- Don't use real venue trademarks.

**Revisit when.** The client wants multiple cities.
