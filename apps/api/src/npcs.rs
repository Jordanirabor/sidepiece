//! Data-driven NPC catalog. NPCs keep venues alive when few real players are online and are the
//! main free-text conversation partners. Later this should move to Postgres/admin tooling.

use sidepiece_common::{AvatarLook, NpcPresence};

pub struct Npc {
    pub id: &'static str,
    pub name: &'static str,
    pub venue: &'static str,
    pub tagline: &'static str,
    pub looking_for: &'static str,
    pub social_rating: f32,
    pub x: f32,
    pub z: f32,
    /// Partner traits this NPC embodies; matched against the player's "likes in a partner".
    pub traits: &'static [&'static str],
    /// Personality brief used to drive the language model.
    pub persona: &'static str,
    pub greeting: &'static str,
    /// Offline fallback replies, by how the player's message landed.
    pub warm: &'static [&'static str],
    pub neutral: &'static [&'static str],
    pub cold: &'static [&'static str],
    look: fn() -> AvatarLook,
}

fn look(
    gender: &str,
    skin: f32,
    hair: &str,
    hair_len: f32,
    body: f32,
    top: &str,
    bottom: &str,
    acc: &str,
    style: &str,
) -> AvatarLook {
    AvatarLook {
        gender: gender.into(),
        skin_tone: skin,
        hair_color: hair.into(),
        hair_length: hair_len,
        body_type: body,
        face: [0.0; 4],
        top: top.into(),
        bottom: bottom.into(),
        accessory: acc.into(),
        style: style.into(),
    }
}

pub const NPCS: &[Npc] = &[
    Npc {
        id: "maya",
        name: "Maya",
        venue: "neon_lounge",
        tagline: "Neon regular · warm, teasing",
        looking_for: "Conversation, chemistry, and respectful flirting",
        social_rating: 8.4,
        x: -2.8,
        z: 3.6,
        traits: &["Caring", "Humorous"],
        persona: "Maya, 27, a graphic designer and lounge regular. Warm, playful, quick to tease, allergic to cheesy pickup lines. Rewards curiosity, humour and respect; goes cold on pushiness, crude talk or negativity. Loves 90s R&B and late-night food spots.",
        greeting: "Hey there! Seems like we're sharing this space — what brings you here tonight?",
        warm: &[
            "Okay, I like you already. Tell me more.",
            "Ha! You're funnier than you look.",
            "See, that's the kind of energy I came out for.",
        ],
        neutral: &[
            "Mm, fair enough. What else?",
            "Interesting. Go on.",
            "Okay, I'm listening.",
        ],
        cold: &[
            "Whoa there! Did I step on a landmine? Let's lighten up.",
            "That's... a lot. Try again?",
            "Not loving that, honestly.",
        ],
        look: || {
            look(
                "female",
                0.45,
                "#1a0f0c",
                0.85,
                0.6,
                "cami_yellow",
                "skirt_lilac",
                "none",
                "glam",
            )
        },
    },
    Npc {
        id: "dre",
        name: "Dre",
        venue: "neon_lounge",
        tagline: "Bartender · knows everyone",
        looking_for: "Good company and people who tip in stories",
        social_rating: 7.9,
        x: 2.4,
        z: 4.6,
        traits: &["Humorous", "Reserved"],
        persona: "Dre, 34, the lounge bartender. Dry humour, observant, protective of regulars, gives honest advice about who's who. Respects people who are genuine; unimpressed by bragging.",
        greeting: "First time in here? I can tell. What are you drinking — and who are you hoping to run into?",
        warm: &[
            "Ha. Alright, you're good people.",
            "Respect. First one's on me.",
            "That's the right attitude for this place.",
        ],
        neutral: &["Mm-hm.", "Fair.", "We'll see how the night goes."],
        cold: &[
            "Easy. This is a classy spot.",
            "I've heard that one before. Didn't work then either.",
            "Let's keep it respectful, yeah?",
        ],
        look: || {
            look(
                "male",
                0.2,
                "#0d0d0d",
                0.05,
                0.85,
                "shirt_white",
                "trousers_black",
                "none",
                "classic",
            )
        },
    },
    Npc {
        id: "zara",
        name: "Zara",
        venue: "rooftop_party",
        tagline: "Creative director · slow burner",
        looking_for: "Real conversation that might turn into something",
        social_rating: 8.8,
        x: -3.5,
        z: 4.5,
        traits: &["Career-Focused", "Reserved"],
        persona: "Zara, 30, creative director. Thoughtful, ambitious, slow to warm up but deeply loyal once she does. Values depth, honesty and ambition; dislikes small talk and showing off.",
        greeting: "Best view in the city and everyone's staring at their phones. What brings you up here?",
        warm: &[
            "That's... actually a good answer.",
            "You're more interesting than the skyline. Barely.",
            "Keep talking like that and I might stay.",
        ],
        neutral: &["Hm. Okay.", "Tell me something real.", "Go on."],
        cold: &[
            "I'm going to pretend you didn't say that.",
            "Small talk. Pass.",
            "Not my thing, sorry.",
        ],
        look: || {
            look(
                "female",
                0.25,
                "#2b1a12",
                0.6,
                0.35,
                "blazer_tan",
                "trousers_cream",
                "glasses",
                "classic",
            )
        },
    },
    Npc {
        id: "kai",
        name: "Kai",
        venue: "rooftop_party",
        tagline: "DJ · life of the party",
        looking_for: "Energy, laughs, no pressure",
        social_rating: 8.1,
        x: -4.0,
        z: 6.0,
        traits: &["Adventurous", "Humorous"],
        persona: "Kai, 26, the rooftop DJ. High energy, spontaneous, loves dancing and dares. Rewards enthusiasm and spontaneity; bored by negativity and overthinking.",
        greeting: "Yo! Request something or dance — standing still is illegal up here.",
        warm: &[
            "Ohhh, okay! I see you!",
            "That's the vibe. Next track's for you.",
            "You're trouble. I like it.",
        ],
        neutral: &["Cool, cool.", "Say less.", "Alright, alright."],
        cold: &[
            "Bro... the vibe.",
            "Nah, don't kill the energy.",
            "Yikes. Dance it off.",
        ],
        look: || {
            look(
                "male",
                0.55,
                "#c9a227",
                0.2,
                0.55,
                "jacket_red",
                "jeans_black",
                "cap",
                "streetwear",
            )
        },
    },
];

pub fn find(id: &str) -> Option<&'static Npc> {
    NPCS.iter().find(|n| n.id == id)
}

pub fn for_venue(venue: &str) -> impl Iterator<Item = &'static Npc> + '_ {
    NPCS.iter().filter(move |n| n.venue == venue)
}

/// Compatibility from overlap between the player's "likes in a partner" and someone's traits.
pub fn compatibility(likes: &[String], traits: &[&str]) -> u32 {
    if likes.is_empty() {
        return 65;
    }
    let overlap = likes
        .iter()
        .filter(|l| traits.iter().any(|t| t.eq_ignore_ascii_case(l)))
        .count() as u32;
    (58 + overlap * 18).min(97)
}

impl Npc {
    pub fn look(&self) -> AvatarLook {
        (self.look)()
    }

    pub fn presence(&self) -> NpcPresence {
        NpcPresence {
            x: self.x,
            z: self.z,
            look: self.look(),
            tagline: self.tagline.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_is_consistent() {
        for npc in NPCS {
            assert!(find(npc.id).is_some());
            assert!(
                !npc.traits.is_empty()
                    && !npc.warm.is_empty()
                    && !npc.neutral.is_empty()
                    && !npc.cold.is_empty()
            );
            for t in npc.traits {
                assert!(
                    sidepiece_common::PARTNER_TRAITS.contains(t),
                    "{} has unknown trait {t}",
                    npc.id
                );
            }
        }
        assert!(for_venue("neon_lounge").count() >= 1);
        assert!(for_venue("rooftop_party").count() >= 1);
    }

    #[test]
    fn compatibility_rewards_overlap() {
        let likes = vec!["Caring".to_string(), "Humorous".to_string()];
        assert_eq!(compatibility(&likes, &["Caring", "Humorous"]), 94);
        assert_eq!(compatibility(&likes, &["Reserved"]), 58);
        assert_eq!(compatibility(&[], &["Reserved"]), 65);
    }
}
