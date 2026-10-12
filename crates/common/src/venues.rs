//! Lagos nightlife venues (ADR 0019): the clubs you can walk into from the open city.
//!
//! Real Lagos clubs at their real streets, chosen by the owner (docs/product/lagos-clubs.md has the sources).
//! Names live only here and in the TS mirror (`web/src/venues.ts`), so renaming a venue is a one-line change.
//! Kinds are room-id prefixes (`quilox-001`), so they must never contain `-`. `neon_lounge` and `rooftop_party`
//! keep their old kinds on purpose: they're in saved rooms, NPC placement, dates and feed posts.

use serde::Serialize;

/// Which interior a venue uses. Several clubs share a style; each still gets its own name, colour and sign.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VenueStyle {
    /// Dance floor, DJ booth, VIP tables.
    Club,
    /// Booths, bar and low light.
    Lounge,
    /// Open-air deck over the skyline.
    Rooftop,
    /// Sand, cabanas and the Atlantic.
    Beach,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct Venue {
    pub kind: &'static str,
    pub name: &'static str,
    /// Neighbourhood shown with the name (`Victoria Island`, `Ikoyi`, `Lekki Phase 1`, `Oniru`).
    pub area: &'static str,
    pub street: &'static str,
    pub style: VenueStyle,
    pub capacity: u32,
}

const fn club(
    kind: &'static str,
    name: &'static str,
    area: &'static str,
    street: &'static str,
    style: VenueStyle,
    capacity: u32,
) -> Venue {
    Venue {
        kind,
        name,
        area,
        street,
        style,
        capacity,
    }
}

use VenueStyle::{Beach, Club, Lounge, Rooftop};

pub const VENUES: &[Venue] = &[
    // Victoria Island
    club(
        "quilox",
        "Quilox",
        "Victoria Island",
        "Ozumba Mbadiwe Avenue",
        Club,
        60,
    ),
    club(
        "vaniti",
        "Vaniti Lagos",
        "Victoria Island",
        "Adeola Odeku Street",
        Club,
        50,
    ),
    club(
        "escape",
        "Escape Nightlife",
        "Victoria Island",
        "Adeola Odeku Street",
        Club,
        50,
    ),
    club(
        "rooftop_party",
        "Sky Garden",
        "Victoria Island",
        "Adeola Odeku Street",
        Rooftop,
        35,
    ),
    club(
        "zaza",
        "ZAZA Lagos",
        "Victoria Island",
        "Agoro Odiyan Street",
        Lounge,
        40,
    ),
    club(
        "the_pulse",
        "The Pulse",
        "Victoria Island",
        "Idejo Street",
        Club,
        50,
    ),
    club(
        "club_dna",
        "Club DNA",
        "Victoria Island",
        "Adetokunbo Ademola Street",
        Club,
        50,
    ),
    club(
        "alba",
        "Alba Lounge",
        "Victoria Island",
        "Anifowoshe Street",
        Lounge,
        40,
    ),
    // Ikoyi
    club(
        "neon_lounge",
        "Club 57",
        "Ikoyi",
        "Awolowo Road",
        Lounge,
        50,
    ),
    club(
        "the_loft",
        "The Loft",
        "Ikoyi",
        "Falomo, Awolowo Road",
        Lounge,
        40,
    ),
    club(
        "stage_lagos",
        "Stage Lagos",
        "Ikoyi",
        "Glover Road",
        Club,
        50,
    ),
    // Lekki Phase 1 and Oniru
    club(
        "bay_lounge",
        "Bay Lounge",
        "Lekki Phase 1",
        "Admiralty Road",
        Lounge,
        40,
    ),
    club(
        "bayrock",
        "Bayrock",
        "Lekki Phase 1",
        "Adebayo Doherty Road",
        Club,
        50,
    ),
    club(
        "moist_beach",
        "Moist Beach Club",
        "Oniru",
        "Oniru Beach",
        Beach,
        60,
    ),
];

pub fn venue(kind: &str) -> Option<&'static Venue> {
    VENUES.iter().find(|v| v.kind == kind)
}

/// Every nightlife venue kind (all of [`VENUES`]), for actions allowed in any club.
pub fn nightlife_kinds() -> impl Iterator<Item = &'static str> {
    VENUES.iter().map(|v| v.kind)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_are_unique_room_prefixes() {
        for (i, v) in VENUES.iter().enumerate() {
            assert!(!v.kind.contains('-'), "{} would break room ids", v.kind);
            assert!(
                !["city", "private_room"].contains(&v.kind),
                "{} is reserved",
                v.kind
            );
            assert!(
                VENUES[i + 1..].iter().all(|o| o.kind != v.kind),
                "duplicate {}",
                v.kind
            );
        }
    }

    #[test]
    fn legacy_kinds_still_exist() {
        assert_eq!(venue("neon_lounge").unwrap().name, "Club 57");
        assert_eq!(venue("rooftop_party").unwrap().style, VenueStyle::Rooftop);
    }
}
