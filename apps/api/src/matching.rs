//! Discover -> Match (spec Screens 07, 07A, 08).
//!
//! - `deck`: Like/Pass cards. Players first (mutual "show me", discoverable, not blocked, not already
//!   liked/passed/matched), best compatibility first, online players lifted to the top; NPCs fill in.
//! - `like`: records interest; a mutual like between players creates a match on both sides. NPCs "like
//!   back" only once the relationship is Friendly or better, so conversation stays the way in.
//! - `pass`: hides a profile from the deck for `PASS_HOURS` (so it never re-shows in a session).
//! - `matches` / `mark_seen`: the side that didn't act sees the match moment once.

use super::{
    AppError, SharedState, chat, hidden_targets, npcs, player_avatar, player_profile,
    publish_event, require_player, room_display_name,
};
use axum::{
    Json,
    extract::{Query, State},
    http::HeaderMap,
};
use chrono::{DateTime, Utc};
use redis::AsyncCommands;
use serde::Deserialize;
use sidepiece_common::{
    ApiOk, AvatarConfig, DiscoverDeck, DiscoverableProfile, INVITATION_TYPES, InterestResult,
    MatchView, player_compatibility, visible_in_discovery,
};
use sqlx::Row;
use std::collections::HashSet;
use uuid::Uuid;

/// How long a Pass keeps someone out of the deck.
const PASS_HOURS: i32 = 24;
/// NPCs match back from the "Friendly" tier.
pub const NPC_MATCH_AFFINITY: i32 = 25;
const MAX_CANDIDATES: i64 = 300;
const DEFAULT_DECK: usize = 10;

pub enum Target {
    Player(Uuid),
    Npc(&'static npcs::Npc),
}

pub fn parse_target(target_id: &str) -> Result<Target, AppError> {
    if let Some(id) = target_id.strip_prefix("player:") {
        return Uuid::parse_str(id)
            .map(Target::Player)
            .map_err(|_| AppError::bad_request("invalid target"));
    }
    if let Some(id) = target_id.strip_prefix("npc:") {
        return npcs::find(id)
            .map(Target::Npc)
            .ok_or_else(|| AppError::not_found("unknown npc"));
    }
    Err(AppError::bad_request("invalid target"))
}

/// Venue kind from a room id like `neon_lounge-001`.
fn venue_of(room_id: &str) -> &str {
    room_id.rsplit_once('-').map(|(k, _)| k).unwrap_or(room_id)
}

/// `Some((venue kind, venue name))` if the player is in a room right now. Private rooms show as
/// ("", "Busy") so nobody can follow someone into one.
async fn presence(state: &SharedState, player_id: Uuid) -> Option<(String, String)> {
    let mut redis = state.redis.clone()?;
    let room: Option<String> = redis
        .get(format!("player:room:{player_id}"))
        .await
        .ok()
        .flatten();
    room.map(|r| {
        if r.starts_with("private-") {
            (String::new(), "Busy".to_string())
        } else {
            let kind = venue_of(&r);
            (kind.to_string(), room_display_name(kind).to_string())
        }
    })
}

/// Everything that must not appear in this player's deck.
async fn excluded(state: &SharedState, me: Uuid) -> Result<HashSet<String>, AppError> {
    let mut skip = hidden_targets(state, me).await?;
    let rows = sqlx::query(
        "select target_id from player_interests where player_id = $1
         union select target_id from matches where player_id = $1
         union select target_id from player_passes
               where player_id = $1 and created_at > now() - make_interval(hours => $2)",
    )
    .bind(me)
    .bind(PASS_HOURS)
    .fetch_all(&state.db)
    .await?;
    skip.extend(rows.into_iter().map(|r| r.get::<String, _>("target_id")));
    skip.insert(format!("player:{me}"));
    Ok(skip)
}

fn npc_profile(npc: &npcs::Npc, likes: &[String]) -> DiscoverableProfile {
    DiscoverableProfile {
        id: format!("npc:{}", npc.id),
        display_name: npc.name.into(),
        kind: "npc".into(),
        location: room_display_name(npc.venue).into(),
        looking_for: format!("{} · {}", npc.looking_for, npc.traits.join(", ")),
        compatibility: npcs::compatibility(likes, npc.traits),
        social_rating: npc.social_rating,
        is_available: true,
        npc: Some(npc.presence()),
        bio: npc.tagline.into(),
        interests: Vec::new(),
        relationship_style: None,
        open_to: INVITATION_TYPES.iter().map(|t| t.to_string()).collect(),
        look: Some(npc.look()),
        online: true,
    }
}

#[derive(Deserialize)]
pub struct DeckQuery {
    player_id: Uuid,
    limit: Option<usize>,
}

pub async fn deck(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(q): Query<DeckQuery>,
) -> Result<Json<ApiOk<DiscoverDeck>>, AppError> {
    require_player(&state, &headers, q.player_id)?;
    let limit = q.limit.unwrap_or(DEFAULT_DECK).clamp(1, 30);
    let me = player_avatar(&state, q.player_id)
        .await?
        .ok_or_else(|| AppError::bad_request("create your character first"))?;
    let skip = excluded(&state, q.player_id).await?;

    let rows = sqlx::query(
        "select player_id, config from avatars where player_id <> $1 order by updated_at desc limit $2",
    )
    .bind(q.player_id)
    .bind(MAX_CANDIDATES)
    .fetch_all(&state.db)
    .await?;
    let mut candidates: Vec<(String, AvatarConfig, u32)> = rows
        .into_iter()
        .filter_map(|row| {
            let id: Uuid = row.get("player_id");
            let target = format!("player:{id}");
            let other: AvatarConfig = serde_json::from_value(row.get("config")).ok()?;
            (!skip.contains(&target) && visible_in_discovery(&me, &other)).then(|| {
                let score = player_compatibility(&me, &other);
                (target, other, score)
            })
        })
        .collect();
    candidates.sort_by(|a, b| b.2.cmp(&a.2));
    candidates.truncate(limit * 3);

    let mut players = Vec::new();
    for (target, other, _) in candidates {
        let id = Uuid::parse_str(&target["player:".len()..]).unwrap_or_default();
        let location = presence(&state, id).await;
        let mut card = player_profile(
            target,
            other.display_name.clone(),
            location.clone().map(|l| l.1).unwrap_or_default(),
            Some(&me),
            &other,
        );
        card.online = location.is_some();
        players.push(card);
    }
    // Online people first (you can actually go meet them), then by compatibility (stable sort).
    players.sort_by_key(|p| !p.online);
    players.truncate(limit);
    let fallback = players.is_empty();

    let mut npc_cards: Vec<DiscoverableProfile> = npcs::NPCS
        .iter()
        .filter(|n| !skip.contains(&format!("npc:{}", n.id)))
        .filter(|n| {
            me.preferences.show_me.is_empty() || me.preferences.show_me.contains(&n.look().gender)
        })
        .map(|n| npc_profile(n, &me.likes))
        .collect();
    npc_cards.sort_by(|a, b| b.compatibility.cmp(&a.compatibility));
    let room = limit.saturating_sub(players.len());
    players.extend(npc_cards.into_iter().take(room));

    Ok(Json(ApiOk::new(DiscoverDeck {
        profiles: players,
        fallback,
    })))
}

#[derive(Deserialize)]
pub struct TargetRequest {
    player_id: Uuid,
    target_id: String,
}

pub async fn pass(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<TargetRequest>,
) -> Result<Json<ApiOk<serde_json::Value>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    parse_target(&req.target_id)?;
    sqlx::query(
        "insert into player_passes (player_id, target_id) values ($1, $2)
         on conflict (player_id, target_id) do update set created_at = now()",
    )
    .bind(req.player_id)
    .bind(&req.target_id)
    .execute(&state.db)
    .await?;
    Ok(Json(ApiOk::new(
        serde_json::json!({ "passed": req.target_id }),
    )))
}

#[derive(Deserialize)]
pub struct LikeRequest {
    player_id: Uuid,
    target_id: String,
    #[serde(default = "default_intent")]
    intent: String,
}

fn default_intent() -> String {
    "like".into()
}

/// Like / Express Interest. Returns `matched` (and the match) when interest is mutual.
pub async fn like(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<LikeRequest>,
) -> Result<Json<ApiOk<InterestResult>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let target = parse_target(&req.target_id)?;
    let me_target = format!("player:{}", req.player_id);
    if req.target_id == me_target {
        return Err(AppError::bad_request("you can't like yourself"));
    }
    // Blocked either way: behave as if the profile doesn't exist.
    if hidden_targets(&state, req.player_id)
        .await?
        .contains(&req.target_id)
    {
        return Err(AppError::not_found("profile not available"));
    }
    if let Target::Player(id) = target
        && player_avatar(&state, id).await?.is_none()
    {
        return Err(AppError::not_found("profile not available"));
    }

    sqlx::query("insert into player_interests (id, player_id, target_id, intent) values ($1, $2, $3, $4) on conflict (player_id, target_id) do update set intent = excluded.intent")
        .bind(Uuid::new_v4())
        .bind(req.player_id)
        .bind(&req.target_id)
        .bind(&req.intent)
        .execute(&state.db)
        .await?;
    sqlx::query("delete from player_passes where player_id = $1 and target_id = $2")
        .bind(req.player_id)
        .bind(&req.target_id)
        .execute(&state.db)
        .await?;
    publish_event(
        &state,
        "social.interest_expressed",
        Some(req.player_id),
        Some(req.target_id.clone()),
        None,
        serde_json::json!({ "intent": req.intent }),
    )
    .await;

    let mutual = match target {
        Target::Player(other) => sqlx::query_scalar::<_, bool>(
            "select exists(select 1 from player_interests where player_id = $1 and target_id = $2)",
        )
        .bind(other)
        .bind(&me_target)
        .fetch_one(&state.db)
        .await?,
        Target::Npc(npc) => {
            chat::load_stats(&state, req.player_id, &format!("npc:{}", npc.id))
                .await?
                .affinity
                >= NPC_MATCH_AFFINITY
        }
    };

    let mut match_info = None;
    if mutual {
        // The actor sees the match moment right now; the other side sees it on their next poll.
        sqlx::query("insert into matches (player_id, target_id, seen_at) values ($1, $2, now()) on conflict do nothing")
            .bind(req.player_id)
            .bind(&req.target_id)
            .execute(&state.db)
            .await?;
        if let Target::Player(other) = target {
            sqlx::query(
                "insert into matches (player_id, target_id) values ($1, $2) on conflict do nothing",
            )
            .bind(other)
            .bind(&me_target)
            .execute(&state.db)
            .await?;
        }
        publish_event(
            &state,
            "social.match",
            Some(req.player_id),
            Some(req.target_id.clone()),
            None,
            serde_json::json!({}),
        )
        .await;
        match_info = match_view(&state, &req.target_id, Utc::now(), false).await?;
    }

    Ok(Json(ApiOk::new(InterestResult {
        player_id: req.player_id,
        target_id: req.target_id,
        intent: req.intent,
        status: if mutual {
            "matched"
        } else {
            "interest_recorded"
        }
        .into(),
        matched: mutual,
        match_info,
    })))
}

async fn match_view(
    state: &SharedState,
    target_id: &str,
    matched_at: DateTime<Utc>,
    is_new: bool,
) -> Result<Option<MatchView>, AppError> {
    Ok(match parse_target(target_id) {
        Ok(Target::Player(id)) => {
            let Some(avatar) = player_avatar(state, id).await? else {
                return Ok(None);
            };
            let location = presence(state, id).await;
            Some(MatchView {
                target_id: target_id.into(),
                display_name: avatar.display_name,
                kind: "player".into(),
                look: Some(avatar.look),
                matched_at,
                is_new,
                online: location.is_some(),
                venue: location.as_ref().map(|l| l.0.clone()).unwrap_or_default(),
                location: location.map(|l| l.1).unwrap_or_default(),
            })
        }
        Ok(Target::Npc(npc)) => Some(MatchView {
            target_id: target_id.into(),
            display_name: npc.name.into(),
            kind: "npc".into(),
            look: Some(npc.look()),
            matched_at,
            is_new,
            online: true,
            location: room_display_name(npc.venue).into(),
            venue: npc.venue.into(),
        }),
        Err(_) => None,
    })
}

#[derive(Deserialize)]
pub struct PlayerQuery {
    player_id: Uuid,
}

pub async fn matches(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(q): Query<PlayerQuery>,
) -> Result<Json<ApiOk<Vec<MatchView>>>, AppError> {
    require_player(&state, &headers, q.player_id)?;
    let hidden = hidden_targets(&state, q.player_id).await?;
    let rows = sqlx::query(
        "select target_id, created_at, seen_at is null as is_new from matches
         where player_id = $1 order by created_at desc limit 100",
    )
    .bind(q.player_id)
    .fetch_all(&state.db)
    .await?;
    let mut out = Vec::new();
    for row in rows {
        let target: String = row.get("target_id");
        if hidden.contains(&target) {
            continue;
        }
        if let Some(view) =
            match_view(&state, &target, row.get("created_at"), row.get("is_new")).await?
        {
            out.push(view);
        }
    }
    Ok(Json(ApiOk::new(out)))
}

pub async fn mark_seen(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<TargetRequest>,
) -> Result<Json<ApiOk<serde_json::Value>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    sqlx::query(
        "update matches set seen_at = now() where player_id = $1 and target_id = $2 and seen_at is null",
    )
    .bind(req.player_id)
    .bind(&req.target_id)
    .execute(&state.db)
    .await?;
    Ok(Json(ApiOk::new(
        serde_json::json!({ "seen": req.target_id }),
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn targets_parse_strictly() {
        assert!(matches!(parse_target("npc:maya"), Ok(Target::Npc(_))));
        assert!(matches!(
            parse_target("player:6d98cfe4-07ad-4703-bc0f-0540eca878e8"),
            Ok(Target::Player(_))
        ));
        assert!(parse_target("npc:nobody").is_err());
        assert!(parse_target("player:not-a-uuid").is_err());
        assert!(parse_target("maya").is_err());
    }

    #[test]
    fn venue_from_room_id() {
        assert_eq!(venue_of("neon_lounge-001"), "neon_lounge");
        assert_eq!(venue_of("city-002"), "city");
    }

    #[test]
    fn npcs_match_back_from_friendly() {
        let (tier, label) = sidepiece_common::relationship_tier(NPC_MATCH_AFFINITY);
        assert_eq!((tier, label), (3, "Friendly"));
    }
}
