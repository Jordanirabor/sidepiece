# 0007: Lagos setting and ₦ currency

**Context.** The spec is explicitly Lagos-inspired ("Victoria Island Rooftop", ₦85,000), and the reference images include Lekki estates, VI rooftop events, Quilox and Afrobeats nightlife. The current build uses a generic "The City" and `$`.

**Decision.**
- Rename the hub and venues to Lagos locations, e.g. *Lekki Phase 1 street*, *Victoria Island Rooftop*, *Ikoyi lounge*. Use invented venue names, not real businesses.
- Currency becomes **₦**, rebalanced to naira scale (e.g. drink ₦3,500, shift +₦18,000).
- Add a Lagos skyline and Lekki-Ikoyi-bridge silhouette to backdrops.

**Consequences.**
- Server-side economy values change in `apps/api/src/life.rs` (`ACTIONS`, starting money). Display formatting is `₦` with thousands separators.
- Don't use real venue trademarks.

**Implemented (M2).**
- Names shown to players: `city` → *Lekki Phase 1*, `neon_lounge` → *Ikoyi Lounge*, `rooftop_party` → *Victoria Island Rooftop*. Internal kinds are unchanged on purpose: they're in room ids, Redis keys, NPC placement and saved data.
- Values: start ₦50,000 (`life::STARTING_MONEY`, inserted explicitly by the API), drink ₦3,500, food ₦5,000, shift +₦18,000. Migration `0006_naira_economy.sql` rescales old balances ×250. **Provisional:** tune with the client once spending (outfits, dates, gifts, venue entry) exists.

**Revisit when.** The client wants multiple cities.
