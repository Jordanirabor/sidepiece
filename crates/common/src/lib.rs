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
    pub status: String,
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
