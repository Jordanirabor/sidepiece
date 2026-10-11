use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub type PlayerId = Uuid;
pub type RoomId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameEvent {
    pub event_type: String,
    pub player_id: Option<PlayerId>,
    pub target_id: Option<String>,
    pub room_id: Option<RoomId>,
    pub payload: serde_json::Value,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiOk<T> {
    pub ok: bool,
    pub data: T,
}

impl<T> ApiOk<T> {
    pub fn new(data: T) -> Self {
        Self { ok: true, data }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthTokenClaims {
    pub sub: PlayerId,
    pub display_name: String,
    pub exp: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthVerifyResponse {
    pub player_id: PlayerId,
    pub display_name: String,
    pub expires_at: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub service: String,
    pub status: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvatarConfig {
    pub display_name: String,
    /// "male" | "female" | "non_binary"
    #[serde(default)]
    pub gender: String,
    /// "Likes in a partner" tags, e.g. Adventurous, Caring. Drives compatibility.
    #[serde(default)]
    pub likes: Vec<String>,
    #[serde(default)]
    pub look: AvatarLook,
    #[serde(default = "default_intent")]
    pub intent: PlayerIntent,
    /// Short shareable code shown on the "Identity complete" card.
    #[serde(default)]
    pub match_code: String,
    /// Optional public bio shown on the profile preview and to others.
    #[serde(default)]
    pub bio: String,
    /// Onboarding preferences (spec Screen 04). Private unless a `public_*` flag says otherwise.
    #[serde(default)]
    pub preferences: Preferences,
}

/// Spec Screen 04: relationship style, interests, boundaries and discovery settings.
/// (Intent lives on `AvatarConfig::intent`.) Every field defaults so old rows still load.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Preferences {
    /// One of `RELATIONSHIP_STYLES`, or empty if not set.
    #[serde(default)]
    pub relationship_style: String,
    /// Up to `MAX_INTERESTS` of `INTERESTS`.
    #[serde(default)]
    pub interests: Vec<String>,
    /// Invitation types (`INVITATION_TYPES`) this player does not want to receive.
    #[serde(default)]
    pub boundaries: Vec<String>,
    /// Genders this player wants to encounter in discovery. Empty = everyone.
    #[serde(default)]
    pub show_me: Vec<String>,
    /// Appear in other players' discovery lists.
    #[serde(default = "yes")]
    pub discoverable: bool,
    #[serde(default)]
    pub public_relationship_style: bool,
    #[serde(default = "yes")]
    pub public_interests: bool,
}

fn yes() -> bool {
    true
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            relationship_style: String::new(),
            interests: Vec::new(),
            boundaries: Vec::new(),
            show_me: Vec::new(),
            discoverable: true,
            public_relationship_style: false,
            public_interests: true,
        }
    }
}

pub const GENDERS: &[&str] = &["male", "female", "non_binary"];
pub const RELATIONSHIP_STYLES: &[&str] = &["casual_dating", "committed", "non_exclusive", "open"];
pub const INTERESTS: &[&str] = &[
    "Afrobeats",
    "Amapiano",
    "Rooftop parties",
    "Lounges & cocktails",
    "Dancing",
    "Food spots",
    "Live music",
    "Art & fashion",
    "Beach days",
    "Gaming",
    "Fitness",
    "Movies",
];
pub const MAX_INTERESTS: usize = 5;
pub const MAX_LIKES: usize = 3;
pub const MAX_BIO_CHARS: usize = 160;
/// Invitation kinds from spec Screen 10. Boundaries opt out of these.
pub const INVITATION_TYPES: &[&str] = &["public_date", "venue_visit", "private_location"];

/// Validate and normalise a player-submitted avatar. Rejects unknown catalog values
/// instead of silently dropping them (our client only sends known ids).
pub fn validate_avatar(mut a: AvatarConfig) -> Result<AvatarConfig, String> {
    a.display_name = a.display_name.trim().to_string();
    let name_len = a.display_name.chars().count();
    if !(2..=24).contains(&name_len) {
        return Err("alias must be 2-24 characters".into());
    }
    if !a.gender.is_empty() && !GENDERS.contains(&a.gender.as_str()) {
        return Err("unknown gender".into());
    }
    a.bio = a.bio.trim().to_string();
    if a.bio.chars().count() > MAX_BIO_CHARS {
        return Err(format!("bio must be at most {MAX_BIO_CHARS} characters"));
    }
    let check = |values: &mut Vec<String>, catalog: &[&str], max: usize, what: &str| {
        let mut seen = std::collections::HashSet::new();
        values.retain(|v| seen.insert(v.clone()));
        if values.len() > max {
            return Err(format!("pick at most {max} {what}"));
        }
        match values.iter().find(|v| !catalog.contains(&v.as_str())) {
            Some(bad) => Err(format!("unknown {what}: {bad}")),
            None => Ok(()),
        }
    };
    check(&mut a.likes, PARTNER_TRAITS, MAX_LIKES, "likes")?;
    let p = &mut a.preferences;
    if !p.relationship_style.is_empty()
        && !RELATIONSHIP_STYLES.contains(&p.relationship_style.as_str())
    {
        return Err("unknown relationship style".into());
    }
    check(&mut p.interests, INTERESTS, MAX_INTERESTS, "interests")?;
    check(
        &mut p.boundaries,
        INVITATION_TYPES,
        INVITATION_TYPES.len(),
        "boundaries",
    )?;
    check(&mut p.show_me, GENDERS, GENDERS.len(), "genders")?;
    Ok(a)
}

/// Whether `viewer` should see `other` in discovery: `other` must be discoverable, and each
/// side's "show me" must include the other's gender (mutual; empty means everyone).
pub fn visible_in_discovery(viewer: &AvatarConfig, other: &AvatarConfig) -> bool {
    let wants = |who: &AvatarConfig, gender: &str| {
        who.preferences.show_me.is_empty()
            || gender.is_empty()
            || who.preferences.show_me.iter().any(|g| g == gender)
    };
    other.preferences.discoverable && wants(viewer, &other.gender) && wants(other, &viewer.gender)
}

fn intent_group(i: &PlayerIntent) -> u8 {
    match i {
        PlayerIntent::Socialize => 0,
        PlayerIntent::Flirt | PlayerIntent::CasualDating | PlayerIntent::Explore => 1,
        PlayerIntent::Relationship => 2,
    }
}

/// Player-to-player compatibility (0-99) from shared partner tastes, intent, relationship
/// style and interests. Only the number leaves the server, never the private inputs.
pub fn player_compatibility(a: &AvatarConfig, b: &AvatarConfig) -> u32 {
    let mut score: i32 = 50;
    let shared = |x: &[String], y: &[String]| x.iter().filter(|v| y.contains(v)).count() as i32;
    score += 8 * shared(&a.likes, &b.likes);
    score += 3 * shared(&a.preferences.interests, &b.preferences.interests).min(4);
    // Intent: same goal is great; casual vs. relationship-seeking is a real mismatch.
    let (ia, ib) = (intent_group(&a.intent), intent_group(&b.intent));
    score += if std::mem::discriminant(&a.intent) == std::mem::discriminant(&b.intent) {
        12
    } else if ia == ib || ia == 0 || ib == 0 {
        5
    } else {
        -8
    };
    // Relationship style: unknown is neutral; committed vs. non-exclusive/open conflicts.
    let (sa, sb) = (
        a.preferences.relationship_style.as_str(),
        b.preferences.relationship_style.as_str(),
    );
    if !sa.is_empty() && !sb.is_empty() {
        let conflict = |x: &str, y: &str| x == "committed" && (y == "non_exclusive" || y == "open");
        score += if sa == sb {
            10
        } else if conflict(sa, sb) || conflict(sb, sa) {
            -10
        } else {
            3
        };
    }
    score.clamp(5, 99) as u32
}

fn default_intent() -> PlayerIntent {
    PlayerIntent::Socialize
}

pub const PARTNER_TRAITS: &[&str] = &[
    "Adventurous",
    "Career-Focused",
    "Caring",
    "Humorous",
    "Reserved",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlayerIntent {
    Socialize,
    Flirt,
    CasualDating,
    Relationship,
    Explore,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipStats {
    pub attraction: i32,
    pub trust: i32,
    pub reputation: i32,
    /// 0-100 overall relationship score driven by conversation; determines the tier.
    #[serde(default)]
    pub affinity: i32,
}

pub const RELATIONSHIP_TIERS: &[(i32, &str)] = &[
    (0, "Stranger"),
    (10, "Acquaintance"),
    (25, "Friendly"),
    (40, "Friend"),
    (60, "Close Friend"),
    (78, "Best Friend"),
    (92, "Partner"),
];

/// Returns (1-based tier index, label) for an affinity score.
pub fn relationship_tier(affinity: i32) -> (usize, &'static str) {
    let idx = RELATIONSHIP_TIERS
        .iter()
        .rposition(|(min, _)| affinity >= *min)
        .unwrap_or(0);
    (idx + 1, RELATIONSHIP_TIERS[idx].1)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoverableProfile {
    pub id: String,
    pub display_name: String,
    pub kind: String,
    pub location: String,
    pub looking_for: String,
    pub compatibility: u32,
    pub social_rating: f32,
    pub is_available: bool,
    /// NPC-only: where they stand and how they look in the venue.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub npc: Option<NpcPresence>,
    /// Public profile details (players only; respects their public/private toggles).
    #[serde(default)]
    pub bio: String,
    #[serde(default)]
    pub interests: Vec<String>,
    #[serde(default)]
    pub relationship_style: Option<String>,
    /// Invitation types this profile accepts (all minus their boundaries).
    #[serde(default)]
    pub open_to: Vec<String>,
    /// Their avatar, for portraits on cards (the same avatar everyone sees in the world).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub look: Option<AvatarLook>,
    /// In a venue right now (`location` then names it).
    #[serde(default)]
    pub online: bool,
}

/// Spec Screen 07: Like/Pass deck. Players first; NPCs fill in when players run out.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoverDeck {
    pub profiles: Vec<DiscoverableProfile>,
    /// True when no players are left and the deck is NPCs only.
    pub fallback: bool,
}

/// Spec Screen 08: a mutual match, as seen by one side.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchView {
    pub target_id: String,
    pub display_name: String,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub look: Option<AvatarLook>,
    pub matched_at: DateTime<Utc>,
    /// Not yet shown to this player (drives the match moment for the side that didn't act).
    pub is_new: bool,
    pub online: bool,
    /// Venue name if online.
    pub location: String,
    /// Venue kind if online in a public venue (`city`, `neon_lounge`, ...), so the client can go there.
    #[serde(default)]
    pub venue: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmMessageView {
    pub id: String,
    pub sender_id: PlayerId,
    pub recipient_id: PlayerId,
    pub content: String,
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_at: Option<DateTime<Utc>>,
    pub outgoing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationView {
    pub target_id: String,
    pub display_name: String,
    /// "player" or "npc".
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub look: Option<AvatarLook>,
    pub last_message: String,
    pub updated_at: DateTime<Utc>,
    pub unread_count: i64,
    pub online: bool,
    pub location: String,
    #[serde(default)]
    pub venue: String,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub ended: bool,
    /// Label of an incoming invitation still waiting for this player's answer.
    #[serde(default)]
    pub pending_invite: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboxResponse {
    pub conversations: Vec<ConversationView>,
    pub unread_count: i64,
    /// Incoming invitations waiting for an answer (adds to the nav badge).
    #[serde(default)]
    pub invite_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmThreadResponse {
    pub target_id: String,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub look: Option<AvatarLook>,
    pub online: bool,
    pub location: String,
    #[serde(default)]
    pub venue: String,
    pub muted: bool,
    pub ended: bool,
    pub messages: Vec<DmMessageView>,
    /// Invitation types the other player accepts (same as the public `open_to` on their profile card).
    #[serde(default)]
    pub open_to: Vec<String>,
    /// Activity invitations between the two players, oldest first (spec Screen 11, shown in-chat).
    #[serde(default)]
    pub invitations: Vec<InvitationView>,
}

/// An activity a player can propose (spec Screen 10). Ids double as boundary types (`INVITATION_TYPES`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityInfo {
    pub id: String,
    pub label: String,
    pub description: String,
    pub icon: String,
    /// ₦ the sender pays, charged only when the invitation is accepted.
    pub cost: i32,
    /// Venue kind where it happens (`rooftop_party`, `neon_lounge`, `private_room`).
    pub venue: String,
}

/// One invitation and its lifecycle: pending → accepted | declined | expired | cancelled.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvitationView {
    pub id: Uuid,
    pub activity: String,
    pub label: String,
    pub icon: String,
    pub cost: i32,
    pub from_player_id: Uuid,
    pub from_name: String,
    pub target_id: String,
    pub target_name: String,
    /// True when the viewer sent it.
    pub outgoing: bool,
    pub status: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    /// Set once a date scene exists (accepted public date / venue visit).
    #[serde(default)]
    pub date_id: Option<Uuid>,
    /// `active`, `completed` or `left` once a date exists.
    #[serde(default)]
    pub date_status: Option<String>,
    /// Private room to enter (accepted private location).
    #[serde(default)]
    pub room_id: Option<String>,
    /// Short explanation, e.g. why an NPC said not yet.
    #[serde(default)]
    pub note: Option<String>,
}

/// One resolved beat of a date: what each side said and how the vibe moved.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateLine {
    pub beat: i32,
    pub prompt: String,
    pub mine: String,
    pub theirs: String,
    pub delta: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateOutcome {
    pub label: String,
    pub summary: String,
    pub xp: i32,
    pub affinity: i32,
    pub objective_met: bool,
}

/// Date / shared scene state (spec Screen 12), from the viewer's side.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateView {
    pub id: Uuid,
    pub scene: String,
    pub title: String,
    /// Venue kind the stage is built from.
    pub venue: String,
    pub objective: String,
    pub partner_id: String,
    pub partner_name: String,
    /// "player" or "npc".
    pub partner_kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub partner_look: Option<AvatarLook>,
    /// Current beat, 0-based. Equals `beats_total` once finished.
    pub beat: i32,
    pub beats_total: i32,
    pub prompt: String,
    pub choices: Vec<String>,
    pub my_choice: Option<i32>,
    /// The partner has picked for the current beat (their line stays hidden until both have).
    pub partner_ready: bool,
    pub chemistry: i32,
    pub chemistry_goal: i32,
    pub history: Vec<DateLine>,
    /// `active`, `completed` or `left`.
    pub status: String,
    pub left_by_me: bool,
    pub partner_present: bool,
    #[serde(default)]
    pub outcome: Option<DateOutcome>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpcPresence {
    pub x: f32,
    pub z: f32,
    pub look: AvatarLook,
    pub tagline: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomingPrivateRoomRequest {
    pub room_id: String,
    pub from_player_id: PlayerId,
    pub from_display_name: String,
    pub consent_state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomingRequestsResponse {
    pub requests: Vec<IncomingPrivateRoomRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryResponse {
    pub room_id: RoomId,
    pub profiles: Vec<DiscoverableProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterestResult {
    pub player_id: PlayerId,
    pub target_id: String,
    pub intent: String,
    /// "interest_recorded" or "matched".
    pub status: String,
    #[serde(default)]
    pub matched: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub match_info: Option<MatchView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivateRoomResult {
    pub room: RoomSummary,
    pub consent_state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyActionResult {
    pub target_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipSnapshot {
    pub target_id: String,
    pub stats: RelationshipStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterestSnapshot {
    pub target_id: String,
    pub intent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivateRoomSnapshot {
    pub id: String,
    pub target_id: String,
    pub consent_state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerStateResponse {
    pub player_id: PlayerId,
    pub avatar: Option<AvatarConfig>,
    pub relationships: Vec<RelationshipSnapshot>,
    pub interests: Vec<InterestSnapshot>,
    pub private_rooms: Vec<PrivateRoomSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomRecommendationResponse {
    pub recommended_room_kind: String,
    pub display_name: String,
    pub reason: String,
    pub alternatives: Vec<RoomSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomJoinTicketResponse {
    pub room_id: RoomId,
    pub ticket: String,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomDirectoryResponse {
    pub rooms: Vec<RoomSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomSummary {
    pub id: RoomId,
    pub kind: String,
    pub display_name: String,
    pub player_count: u32,
    pub capacity: u32,
    pub websocket_url: String,
}

/// Visual identity sent over the realtime channel so others render you correctly.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct AvatarLook {
    pub gender: String,
    /// 0 (deep) .. 1 (light)
    pub skin_tone: f32,
    pub hair_color: String,
    /// 0 (short) .. 1 (long)
    pub hair_length: f32,
    /// 0 (slim) .. 1 (broad)
    pub body_type: f32,
    /// Two 2D facial-structure pads, each component in -1..1.
    pub face: [f32; 4],
    pub top: String,
    pub bottom: String,
    pub accessory: String,
    /// "streetwear" | "classic" | "glam"
    pub style: String,
}

impl Default for AvatarLook {
    fn default() -> Self {
        Self {
            gender: "male".into(),
            skin_tone: 0.35,
            hair_color: "#1a1110".into(),
            hair_length: 0.3,
            body_type: 0.5,
            face: [0.0; 4],
            top: "tee_white".into(),
            bottom: "jeans".into(),
            accessory: "none".into(),
            style: "streetwear".into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tiers_match_thresholds() {
        assert_eq!(relationship_tier(0), (1, "Stranger"));
        assert_eq!(relationship_tier(39), (3, "Friendly"));
        assert_eq!(relationship_tier(80), (6, "Best Friend"));
        assert_eq!(relationship_tier(100), (7, "Partner"));
    }

    #[test]
    fn old_avatar_rows_still_deserialize() {
        let old = serde_json::json!({
            "display_name": "Jay", "body_preset": "athletic", "skin_tone": "medium",
            "hair_style": "starter", "outfit_id": "streetwear_black", "interests": [], "intent": "flirt"
        });
        let cfg: AvatarConfig = serde_json::from_value(old).unwrap();
        assert_eq!(cfg.display_name, "Jay");
        assert_eq!(cfg.look, AvatarLook::default());
    }

    fn avatar(gender: &str) -> AvatarConfig {
        serde_json::from_value(serde_json::json!({ "display_name": "Test", "gender": gender }))
            .unwrap()
    }

    #[test]
    fn old_rows_get_safe_preference_defaults() {
        let cfg = avatar("female");
        assert!(
            cfg.preferences.discoverable,
            "old players stay discoverable"
        );
        assert!(cfg.preferences.show_me.is_empty());
        assert!(!cfg.preferences.public_relationship_style);
        assert_eq!(cfg.bio, "");
    }

    #[test]
    fn validation_rejects_unknown_and_oversized_values() {
        let mut a = avatar("female");
        a.display_name = "  Ada  ".into();
        a.preferences.interests = vec!["Afrobeats".into(), "Dancing".into()];
        let ok = validate_avatar(a.clone()).unwrap();
        assert_eq!(ok.display_name, "Ada");

        let mut bad = a.clone();
        bad.preferences.interests = vec!["Skydiving".into()];
        assert!(validate_avatar(bad).is_err());
        let mut bad = a.clone();
        bad.preferences.boundaries = vec!["sleepover".into()];
        assert!(validate_avatar(bad).is_err());
        let mut bad = a.clone();
        bad.preferences.relationship_style = "complicated".into();
        assert!(validate_avatar(bad).is_err());
        let mut bad = a.clone();
        bad.bio = "x".repeat(MAX_BIO_CHARS + 1);
        assert!(validate_avatar(bad).is_err());
        let mut bad = a.clone();
        bad.preferences.interests = INTERESTS.iter().map(|s| s.to_string()).collect();
        assert!(validate_avatar(bad).is_err(), "too many interests");
        let mut bad = a;
        bad.display_name = "x".into();
        assert!(validate_avatar(bad).is_err());
    }

    #[test]
    fn discovery_respects_show_me_both_ways_and_discoverable() {
        let mut man = avatar("male");
        let mut woman = avatar("female");
        assert!(visible_in_discovery(&man, &woman));
        woman.preferences.show_me = vec!["female".into()];
        assert!(
            !visible_in_discovery(&man, &woman),
            "she doesn't want to see men"
        );
        assert!(!visible_in_discovery(&woman, &man));
        woman.preferences.show_me = vec![];
        man.preferences.show_me = vec!["male".into()];
        assert!(!visible_in_discovery(&man, &woman));
        man.preferences.show_me = vec![];
        woman.preferences.discoverable = false;
        assert!(!visible_in_discovery(&man, &woman));
        assert!(
            visible_in_discovery(&woman, &man),
            "hiding yourself doesn't hide others"
        );
    }

    #[test]
    fn compatibility_uses_intent_and_style() {
        let mut a = avatar("female");
        let mut b = avatar("male");
        a.intent = PlayerIntent::Relationship;
        b.intent = PlayerIntent::Relationship;
        a.preferences.relationship_style = "committed".into();
        b.preferences.relationship_style = "committed".into();
        let aligned = player_compatibility(&a, &b);
        b.intent = PlayerIntent::Explore;
        b.preferences.relationship_style = "open".into();
        let clashing = player_compatibility(&a, &b);
        assert!(aligned >= 70, "aligned {aligned}");
        assert!(clashing < 40, "clashing {clashing}");
        a.likes = vec!["Caring".into()];
        b.likes = vec!["Caring".into()];
        assert!(player_compatibility(&a, &b) > clashing, "shared likes help");
        assert_eq!(
            player_compatibility(&a, &b),
            player_compatibility(&b, &a),
            "symmetric"
        );
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RosterEntry {
    pub player_id: PlayerId,
    pub display_name: String,
    pub look: AvatarLook,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub rot_y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientEvent {
    Join {
        player_id: PlayerId,
        display_name: String,
        room_id: RoomId,
        token: String,
        #[serde(default)]
        look: AvatarLook,
    },
    Move {
        x: f32,
        y: f32,
        z: f32,
        rot_y: f32,
    },
    Chat {
        text: String,
    },
    Emote {
        emote: String,
    },
    Leave,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerEvent {
    Welcome {
        player_id: PlayerId,
        room_id: RoomId,
        roster: Vec<RosterEntry>,
    },
    PlayerJoined {
        player_id: PlayerId,
        display_name: String,
        look: AvatarLook,
    },
    PlayerLeft {
        player_id: PlayerId,
    },
    PlayerMoved {
        player_id: PlayerId,
        x: f32,
        y: f32,
        z: f32,
        rot_y: f32,
    },
    Chat {
        player_id: PlayerId,
        display_name: String,
        text: String,
    },
    Error {
        message: String,
    },
}
