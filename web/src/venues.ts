/**
 * Lagos nightlife venues (ADR 0019). Mirrors `crates/common/src/venues.rs`: same kinds, names and styles.
 * Where each one stands on the map lives in `city.ts` (`VENUE_LOTS`). Colours come from the venue neon palette in
 * `docs/product/design-system.md`.
 */
export type VenueStyle = 'club' | 'lounge' | 'rooftop' | 'beach';

export type Club = {
  kind: string;
  name: string;
  area: string;
  street: string;
  style: VenueStyle;
  /** Neon colour of its sign, beacon and interior accents. */
  color: string;
  /** Second interior accent. */
  accent: string;
  vibe: string;
};

export const CLUBS: Club[] = [
  { kind: 'quilox', name: 'Quilox', area: 'Victoria Island', street: 'Ozumba Mbadiwe Avenue', style: 'club', color: '#f5c542', accent: '#ff2f91', vibe: 'The big one. Celebrity tables, a wall of LEDs, Afrobeats till dawn.' },
  { kind: 'vaniti', name: 'Vaniti Lagos', area: 'Victoria Island', street: 'Adeola Odeku Street', style: 'club', color: '#ff2f91', accent: '#a855f7', vibe: 'Upscale and loud. Bottle parades and the island crowd.' },
  { kind: 'escape', name: 'Escape Nightlife', area: 'Victoria Island', street: 'Adeola Odeku Street', style: 'club', color: '#22d3ee', accent: '#ff2f91', vibe: 'Late-night dance floor, amapiano Fridays.' },
  { kind: 'rooftop_party', name: 'Sky Garden', area: 'Victoria Island', street: 'Adeola Odeku Street', style: 'rooftop', color: '#ffb02e', accent: '#22d3ee', vibe: 'Rooftop over VI. Skyline views, a DJ and the late crowd.' },
  { kind: 'zaza', name: 'ZAZA Lagos', area: 'Victoria Island', street: 'Agoro Odiyan Street', style: 'lounge', color: '#a855f7', accent: '#f5c542', vibe: 'Luxury lounge. Velvet booths and big spenders.' },
  { kind: 'the_pulse', name: 'The Pulse', area: 'Victoria Island', street: 'Idejo Street', style: 'club', color: '#ff4d5e', accent: '#22d3ee', vibe: 'Packed, sweaty, everyone knows the words.' },
  { kind: 'club_dna', name: 'Club DNA', area: 'Victoria Island', street: 'Adetokunbo Ademola Street', style: 'club', color: '#3a7bd5', accent: '#ff2f91', vibe: 'Hip-hop and Afrobeats, a younger crowd.' },
  { kind: 'alba', name: 'Alba Lounge', area: 'Victoria Island', street: 'Anifowoshe Street', style: 'lounge', color: '#ff5c7a', accent: '#ffb02e', vibe: 'Relaxed lounge with a touch of luxury. Good for talking.' },
  { kind: 'neon_lounge', name: 'Club 57', area: 'Ikoyi', street: 'Awolowo Road', style: 'lounge', color: '#ff2f91', accent: '#22d3ee', vibe: 'Friendly crowd, themed nights, booths for two.' },
  { kind: 'the_loft', name: 'The Loft', area: 'Ikoyi', street: 'Falomo, Awolowo Road', style: 'lounge', color: '#ffb02e', accent: '#a855f7', vibe: 'Restaurant by day, lounge by night.' },
  { kind: 'stage_lagos', name: 'Stage Lagos', area: 'Ikoyi', street: 'Glover Road', style: 'club', color: '#4cbf8a', accent: '#f5c542', vibe: 'Dancers and drummers on stage. A proper show.' },
  { kind: 'bay_lounge', name: 'Bay Lounge', area: 'Lekki Phase 1', street: 'Admiralty Road', style: 'lounge', color: '#22d3ee', accent: '#ffb02e', vibe: 'On the lagoon. Live band at weekends, a breeze off the water.' },
  { kind: 'bayrock', name: 'Bayrock', area: 'Lekki Phase 1', street: 'Adebayo Doherty Road', style: 'club', color: '#a855f7', accent: '#22d3ee', vibe: "Themed parties for Lekki's high-end crowd." },
  { kind: 'moist_beach', name: 'Moist Beach Club', area: 'Oniru', street: 'Oniru Beach', style: 'beach', color: '#ffb02e', accent: '#ff2f91', vibe: 'Cabanas, a pool on the sand and parties after sunset.' },
];

export const clubOf = (kind: string) => CLUBS.find((c) => c.kind === kind);
