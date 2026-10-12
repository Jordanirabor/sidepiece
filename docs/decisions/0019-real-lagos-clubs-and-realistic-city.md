# 0019: Real Lagos clubs on the map, and the first realistic city and venue kits (amends 0007, implements 0018)

**Context.** On 2026-10-12 the owner reviewed the city again: "the graphics are too far from real", "there are too
few clubs", "the texture is unrealistic", and asked for a curated list of popular Lagos nightclub locations. They
authorised installing whatever tools that needs (Blender, ImageMagick). Two decisions were theirs:
- **Real club names** instead of invented ones. ADR 0007 said "use invented venue names, not real businesses". The owner
  chose real names over inspired or generic names when asked.
- **City and clubs first**, characters (MPFB2) next.

**Decision.**
- **Clubs.** 14 real venues at their real streets, from the curated list in `product/lagos-clubs.md`:
  - **Victoria Island:** Quilox, Vaniti, Escape, Sky Garden, ZAZA, The Pulse, Club DNA, Alba.
  - **Ikoyi:** Club 57, The Loft, Stage Lagos.
  - **Lekki Phase 1 and Oniru:** Bay Lounge, Bayrock, Moist Beach Club.
  - **Mainland (Ikeja):** these clubs are listed but not on the map yet. There is no mainland district.
  - Adult-entertainment venues (strip clubs) are left out on purpose.
- **One catalog.** Kinds, names, areas, streets, styles and capacities live in `crates/common/src/venues.rs`, mirrored
  in `web/src/venues.ts`, with colours and lots in `web/src/city.ts`.
  - The API validates `preferred_room` against the catalog, and life actions expand `nightlife` to every club.
  - The legacy kinds stay so saved rooms, NPCs, dates and feed posts keep working: `neon_lounge` is now Club 57 and
    `rooftop_party` is Sky Garden.
- **Streets.** Grid streets carry real names (Adeola Odeku, Ozumba Mbadiwe, Awolowo Road, Admiralty Way...) on Lagos-green
  junction signs. Each club fronts its real street.
- **Travel.** In the Go-out sheet, clubs are grouped by area, each with **Walk** and **Ride there** (a direct trip; fast
  travel from the roadmap). Leaving a club puts you at its door, not back at the plaza.
- **Art: the Blender pipeline from 0018, city half.**
  - `scripts/blender/build_city.py` generates `world/lagos.glb` and `world/venues.glb` from code and Poly Haven CC0 PBR
    textures and props.
  - **Lagos typologies:**
    - Lekki duplexes behind compound walls with gates, water tanks on stands and tile roofs;
    - apartment blocks with balconies, AC units and rooftop tanks;
    - shophouses with roller shutters;
    - VI curtain-wall towers;
    - four club fronts.
  - **Streets and greenery:** streets with cracked asphalt, markings, kerbs and herringbone paving; palms with bark and
    frond cut-outs; hedge bushes.
  - **Club interiors:** walnut, marble, leather and terrazzo, with Poly Haven furniture.
  - **Night windows:** a share of the glass shows lit rooms (curtains, blinds, TV glow).
  - **Kenney:** only cars, traffic lights and beach parasols remain from Kenney.

**Consequences.**
- **Trademark and permission risk.** Real businesses appear in an 18+ dating game without their permission. Mitigations:
  - venues are only places: no staff, owners or endorsements are depicted;
  - NPCs are fictional regulars;
  - any name changes in one line of each catalog.
  - **Before public launch, get legal review or the venues' permission.**
- **Download.** About 7.5 MB (city kit) and 4 MB (venue kit) more, in WebP and quantized. They're prefetched during sign-in.
  Measure on a real phone.
- Ten of the new clubs have no NPCs yet. Ambient crowds and NPC hosts per club are the next content step.

**Revisit when.**
- A venue objects, or legal review says otherwise: rename in the catalogs.
- The owner wants mainland clubs: add an Ikeja district across the Third Mainland Bridge.
- Phones can't hold 30 fps in the city: add LODs and drop the texture size on the `low` tier.
