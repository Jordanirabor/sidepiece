# Lagos nightlife: curated venue list (2026-10-12)

The owner asked for popular Lagos nightclubs and their locations (ADR 0019). This list was compiled from 2025–2026
guides and listings, cross-checked where sources agreed. Nightlife moves fast: **re-verify addresses and opening status
before launch** (Google Maps or each venue's Instagram).

**In game** = on the map now (kind in `crates/common/src/venues.rs`). Interior styles: club, lounge, rooftop, beach.

| Venue | Area | Street / address | Known for | In game |
|---|---|---|---|---|
| Quilox | Victoria Island | 873 Ozumba Mbadiwe Ave | Lagos's best-known superclub: celebrity tables, DJs, Afrobeats/amapiano | `quilox` (club) |
| Vaniti Lagos | Victoria Island | 17 Adeola Odeku St | Upscale island club, celebrity crowd | `vaniti` (club) |
| Escape Nightlife | Victoria Island | Adeola Odeku St (234B/254B, sources differ) | Late-night dance club | `escape` (club) |
| Sky Garden | Victoria Island | 1089b Adeola Odeku St | Rooftop lounge (opened 2023) | `rooftop_party` (rooftop) |
| ZAZA Lagos | Victoria Island | 19 Agoro Odiyan St | Ultra-luxury lounge, big spenders | `zaza` (lounge) |
| The Pulse | Victoria Island | Idejo St | Busy club, 4.2★ from 1,200+ reviews | `the_pulse` (club) |
| Club DNA | Victoria Island | 76 Adetokunbo Ademola St | Hip-hop/Afrobeats club | `club_dna` (club) |
| Alba Lounge | Victoria Island | 1 Anifowoshe St | Relaxed lounge with some luxury | `alba` (lounge) |
| Club 57 | Ikoyi | 57 Awolowo Rd (formerly Bacchus) | Friendly crowd, themed nights | `neon_lounge` (lounge) |
| The Loft | Ikoyi | Falomo Square Mall | Restaurant by day, lounge by night | `the_loft` (lounge) |
| Stage Lagos | Ikoyi | Golden Gate, 1 Glover Rd | Performance club: dancers and drummers | `stage_lagos` (club) |
| Bay Lounge | Lekki Phase 1 | Admiralty Road (lagoon front) | Waterfront, daily DJs, live band at weekends | `bay_lounge` (lounge) |
| Bayrock | Lekki Phase 1 | 7b Adebayo Doherty Rd | Themed parties, high-end Lekki crowd | `bayrock` (club) |
| Moist Beach Club | Oniru | Oniru Beach | Beach club with infinity pool and cabanas, parties after sunset | `moist_beach` (beach) |
| Cubana Lagos | Ikeja (Mainland) | Ikeja GRA | Obi Cubana's club, luxury drinks and big sound | not yet (no mainland district) |
| Rumours | Ikeja (Mainland) | 15A Oduduwa Way, Ikeja GRA (also Festac) | 2Baba's club, mainland prices | not yet |
| Rhapsody's | Ikeja (Mainland) | Rooftop of Ikeja City Mall | Mall-top bar and nightspot | not yet |
| Club Vegas | Ikeja (Mainland) | 6 Sheraton Link Rd, Opebi | Mainland club | not yet |
| Carlsbad Lounge | Ikeja (Mainland) | 79 Adeniyi Jones, Oba Akran | Late-night spot for mainland professionals | not yet |
| Vertigo Lagos | Victoria Island | 23B2 Idejo St | Hotel lounge | candidate |
| Shiro | Victoria Island / Landmark | Landmark area, Oniru | Pan-Asian restaurant and lounge by the beach | candidate |

**Left out on purpose:** adult-entertainment venues (e.g. Silverfox, Secrets Palace). They don't fit the game's content
rules (`vision.md`), which keep intimacy consent-gated and non-graphic.

**How they're placed.** The map is a compressed Lagos (ADR 0017): VI and Ikoyi west of the lagoon, Lekki Phase 1 east
of it over the Link Bridge, and the Atlantic beach in the south. Grid streets carry real names (`STREET_NAMES` in
`web/src/city.ts`), and each club stands on its real street, so Quilox fronts Ozumba Mbadiwe by the water and Sky Garden,
Vaniti and Escape line Adeola Odeku.

## Sources

- Wheatbaker Lagos, *Lagos Nightlife 2026: A First-Timer's Guide*: https://thewheatbakerlagos.com/lagos-nightlife-guide/
- Business Connect, *15 Best Nightclubs in Nigeria (2026)*: https://businessconnect.com.ng/best-nightclubs-in-nigeria/
- Mypricespot, *Best Nightclubs in Lagos and Their Location (2026)*: https://mypricespot.com.ng/nightclubs-in-lagos/
- Nigerian Informer, *Top 10 Best Nightclubs in Lagos (2026)*: https://nigerianinformer.com/top-best-nightclubs-in-lagos/
- Evendo, *Best nightclubs near Victoria Island (2026)*: https://evendo.com/locations/nigeria/lagos/victoria-island/landmark/victoria-island-lagos/best-nightclubs
- Wanderlog, *Best nightlife in Lagos*: https://wanderlog.com/list/geoCategory/1710233/best-nightlife-in-lagos
- Brand Times, *Sky Garden rooftop lounge opens in Lagos*: https://www.brandtimes.com.ng/exquisite-rooftop-lounge-sky-garden-opens-in-lagos/
- Culture Trip, *10 of Lagos' top nightclubs*: https://theculturetrip.com/africa/nigeria/articles/10-of-lagos-top-nightclubs
