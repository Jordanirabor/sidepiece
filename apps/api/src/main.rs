mod auth;
mod chat;
mod dates;
mod invites;
mod life;
mod matching;
mod messages;
mod npcs;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::Utc;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use rand::{Rng, distr::Alphanumeric};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use sidepiece_common::{
    ApiOk, AuthTokenClaims, AuthVerifyResponse, AvatarConfig, DiscoverableProfile,
    DiscoveryResponse, GameEvent, HealthResponse, INVITATION_TYPES, IncomingPrivateRoomRequest,
    IncomingRequestsResponse, InterestSnapshot, PlayerIntent, PlayerStateResponse,
    PrivateRoomResult, PrivateRoomSnapshot, RelationshipSnapshot, RoomDirectoryResponse,
    RoomJoinTicketResponse, RoomRecommendationResponse, RoomSummary, SafetyActionResult,
};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use std::{
    collections::{HashMap, HashSet},
    env,
    net::SocketAddr,
    sync::Arc,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    db: PgPool,
    redis: Option<redis::aio::ConnectionManager>,
    nats: Option<async_nats::Client>,
    jwt_secret: String,
    room_ws_public_url: String,
    allow_dev_login: bool,
    llm: Option<chat::LlmConfig>,
}

type SharedState = Arc<AppState>;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL is required");
    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;
    sqlx::migrate!("../../migrations").run(&db).await?;

    let redis = match env::var("REDIS_URL") {
        Ok(url) => Some(redis::Client::open(url)?.get_connection_manager().await?),
        Err(_) => None,
    };

    let nats = match env::var("NATS_URL") {
        Ok(url) => Some(async_nats::connect(url).await?),
        Err(_) => None,
    };

    let production = env::var("APP_ENV").is_ok_and(|v| v == "production");
    let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| DEV_JWT_SECRET.into());
    if production && (jwt_secret == DEV_JWT_SECRET || jwt_secret.len() < 32) {
        anyhow::bail!("JWT_SECRET must be set to a random value of 32+ characters in production");
    }
    let allow_dev_login = env::var("ALLOW_DEV_LOGIN").is_ok_and(|v| v == "true") && !production;
    let cors = cors_layer(env::var("CORS_ORIGINS").ok(), production)?;
    let llm = chat::LlmConfig::from_env();
    tracing::info!(
        production,
        allow_dev_login,
        llm = llm
            .as_ref()
            .map(|l| l.model.as_str())
            .unwrap_or("offline fallback"),
        "api configuration loaded"
    );

    let state = Arc::new(AppState {
        db,
        redis,
        nats,
        jwt_secret,
        room_ws_public_url: env::var("ROOM_WS_PUBLIC_URL")
            .unwrap_or_else(|_| "ws://localhost:4001/ws".to_string()),
        allow_dev_login,
        llm,
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/bootstrap", get(bootstrap))
        .route("/v1/auth/register", post(auth::register))
        .route("/v1/auth/login", post(auth::login))
        .route("/v1/auth/dev-login", post(dev_login))
        .route("/v1/auth/verify", get(verify_auth))
        .route("/v1/player/{player_id}/state", get(player_state))
        .route("/v1/avatar", post(save_avatar))
        .route("/v1/rooms", get(list_rooms))
        .route("/v1/rooms/recommendation", get(room_recommendation))
        .route("/v1/rooms/join-ticket", post(issue_room_join_ticket))
        .route("/v1/matchmaking/join", post(join_room))
        .route(
            "/v1/npc/{npc_id}/chat",
            get(chat::get_thread).post(chat::send_message),
        )
        .route("/v1/player/{player_id}/life", get(life::get_life))
        .route("/v1/player/{player_id}/life/action", post(life::do_action))
        .route("/v1/life/actions", get(life::list_actions))
        .route("/v1/world/clock", get(life::get_clock))
        .route("/v1/discovery", get(discovery))
        .route("/v1/social/interest", post(matching::like))
        .route("/v1/discover", get(matching::deck))
        .route("/v1/social/pass", post(matching::pass))
        .route("/v1/social/matches", get(matching::matches))
        .route("/v1/social/matches/seen", post(matching::mark_seen))
        .route("/v1/messages/inbox", get(messages::inbox))
        .route("/v1/messages/thread", get(messages::thread))
        .route("/v1/messages/send", post(messages::send))
        .route("/v1/messages/read", post(messages::mark_read))
        .route("/v1/messages/control", post(messages::control))
        .route("/v1/activities", get(invites::list_activities))
        .route("/v1/invitations", post(invites::create))
        .route("/v1/invitations/{id}/respond", post(invites::respond))
        .route("/v1/dates/{id}", get(dates::get_date))
        .route("/v1/dates/{id}/choose", post(dates::choose))
        .route("/v1/dates/{id}/leave", post(dates::leave))
        .route("/v1/social/private-room", post(request_private_room))
        .route(
            "/v1/social/private-room/incoming",
            get(incoming_private_room_requests),
        )
        .route(
            "/v1/social/private-room/{room_id}",
            get(private_room_status),
        )
        .route(
            "/v1/social/private-room/{room_id}/consent",
            post(update_private_room_consent),
        )
        .route("/v1/moderation/report", post(report_target))
        .route("/v1/moderation/block", post(block_target))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = env::var("API_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:4000".into())
        .parse()?;
    tracing::info!(%addr, "sidepiece api listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> Json<ApiOk<HealthResponse>> {
    Json(ApiOk::new(HealthResponse {
        service: "sidepiece-api".into(),
        status: "ok".into(),
        timestamp: Utc::now(),
    }))
}

#[derive(Serialize)]
struct BootstrapResponse {
    intents: Vec<PlayerIntent>,
    starter_outfits: Vec<&'static str>,
    starter_rooms: Vec<&'static str>,
}

async fn bootstrap() -> Json<ApiOk<BootstrapResponse>> {
    Json(ApiOk::new(BootstrapResponse {
        intents: vec![
            PlayerIntent::Socialize,
            PlayerIntent::Flirt,
            PlayerIntent::CasualDating,
            PlayerIntent::Relationship,
            PlayerIntent::Explore,
        ],
        starter_outfits: vec!["streetwear_black", "red_nightlife", "casual_denim"],
        starter_rooms: vec!["neon_lounge", "rooftop_party"],
    }))
}

#[derive(Deserialize)]
struct DevLoginRequest {
    display_name: String,
}

#[derive(Serialize)]
struct DevLoginResponse {
    player_id: Uuid,
    display_name: String,
    token: String,
}

async fn dev_login(
    State(state): State<SharedState>,
    Json(req): Json<DevLoginRequest>,
) -> Result<Json<ApiOk<DevLoginResponse>>, AppError> {
    if !state.allow_dev_login {
        return Err(AppError::not_found("dev login is disabled"));
    }
    let player_id = Uuid::new_v4();
    sqlx::query("insert into players (id, display_name) values ($1, $2) on conflict do nothing")
        .bind(player_id)
        .bind(&req.display_name)
        .execute(&state.db)
        .await?;
    publish_event(
        &state,
        "player.dev_login",
        Some(player_id),
        None,
        None,
        serde_json::json!({ "display_name": req.display_name }),
    )
    .await;
    let token = issue_token(&state, player_id, &req.display_name)?;
    Ok(Json(ApiOk::new(DevLoginResponse {
        player_id,
        display_name: req.display_name,
        token,
    })))
}

async fn verify_auth(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<ApiOk<AuthVerifyResponse>>, AppError> {
    let token = bearer_token(&headers).ok_or_else(|| anyhow::anyhow!("missing bearer token"))?;
    let claims = decode::<AuthTokenClaims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    )?
    .claims;

    Ok(Json(ApiOk::new(AuthVerifyResponse {
        player_id: claims.sub,
        display_name: claims.display_name,
        expires_at: claims.exp,
    })))
}

fn issue_token(state: &SharedState, player_id: Uuid, display_name: &str) -> anyhow::Result<String> {
    let exp = (Utc::now().timestamp() + 60 * 60 * 24 * 7) as usize;
    let claims = AuthTokenClaims {
        sub: player_id,
        display_name: display_name.into(),
        exp,
    };
    Ok(encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )?)
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}

fn auth_claims(state: &SharedState, headers: &HeaderMap) -> Result<AuthTokenClaims, AppError> {
    let token =
        bearer_token(headers).ok_or_else(|| AppError::unauthorized("missing bearer token"))?;
    let claims = decode::<AuthTokenClaims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| AppError::unauthorized("invalid bearer token"))?
    .claims;
    Ok(claims)
}

fn require_player(
    state: &SharedState,
    headers: &HeaderMap,
    player_id: Uuid,
) -> Result<(), AppError> {
    let claims = auth_claims(state, headers)?;
    if claims.sub != player_id {
        return Err(AppError::forbidden("token does not match player_id"));
    }
    Ok(())
}

async fn player_state(
    State(state): State<SharedState>,
    Path(player_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<ApiOk<PlayerStateResponse>>, AppError> {
    require_player(&state, &headers, player_id)?;

    let avatar_value: Option<serde_json::Value> =
        sqlx::query_scalar("select config from avatars where player_id = $1")
            .bind(player_id)
            .fetch_optional(&state.db)
            .await?;
    let avatar = avatar_value
        .map(serde_json::from_value::<AvatarConfig>)
        .transpose()?;

    let relationship_rows = sqlx::query("select target_id, stats from relationship_state where player_id = $1 order by updated_at desc")
        .bind(player_id)
        .fetch_all(&state.db)
        .await?;
    let relationships = relationship_rows
        .into_iter()
        .map(|row| {
            let stats_value: serde_json::Value = row.get("stats");
            Ok(RelationshipSnapshot {
                target_id: row.get("target_id"),
                stats: serde_json::from_value(stats_value)?,
            })
        })
        .collect::<anyhow::Result<Vec<_>>>()?;

    let interest_rows = sqlx::query("select target_id, intent from player_interests where player_id = $1 order by created_at desc")
        .bind(player_id)
        .fetch_all(&state.db)
        .await?;
    let interests = interest_rows
        .into_iter()
        .map(|row| InterestSnapshot {
            target_id: row.get("target_id"),
            intent: row.get("intent"),
        })
        .collect();

    let private_room_rows = sqlx::query("select id, target_id, consent_state from private_rooms where created_by = $1 order by created_at desc")
        .bind(player_id)
        .fetch_all(&state.db)
        .await?;
    let private_rooms = private_room_rows
        .into_iter()
        .map(|row| PrivateRoomSnapshot {
            id: row.get("id"),
            target_id: row.get("target_id"),
            consent_state: row.get("consent_state"),
        })
        .collect();

    Ok(Json(ApiOk::new(PlayerStateResponse {
        player_id,
        avatar,
        relationships,
        interests,
        private_rooms,
    })))
}

#[derive(Deserialize)]
struct SaveAvatarRequest {
    player_id: Uuid,
    avatar: AvatarConfig,
}

async fn save_avatar(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<SaveAvatarRequest>,
) -> Result<Json<ApiOk<AvatarConfig>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let avatar =
        sidepiece_common::validate_avatar(req.avatar).map_err(|e| AppError::bad_request(&e))?;
    let avatar_json = serde_json::to_value(&avatar)?;
    sqlx::query("insert into avatars (player_id, config) values ($1, $2) on conflict (player_id) do update set config = excluded.config, updated_at = now()")
        .bind(req.player_id)
        .bind(avatar_json)
        .execute(&state.db)
        .await?;
    publish_event(
        &state,
        "avatar.saved",
        Some(req.player_id),
        None,
        None,
        serde_json::json!({ "display_name": avatar.display_name }),
    )
    .await;
    Ok(Json(ApiOk::new(avatar)))
}

async fn room_recommendation(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<DiscoveryQuery>,
) -> Result<Json<ApiOk<RoomRecommendationResponse>>, AppError> {
    require_player(&state, &headers, query.player_id)?;
    let avatar_value: Option<serde_json::Value> =
        sqlx::query_scalar("select config from avatars where player_id = $1")
            .bind(query.player_id)
            .fetch_optional(&state.db)
            .await?;
    let avatar = avatar_value
        .map(serde_json::from_value::<AvatarConfig>)
        .transpose()?;

    let (kind, reason) = match avatar.as_ref().map(|a| &a.intent) {
        Some(PlayerIntent::Flirt) | Some(PlayerIntent::CasualDating) => (
            "neon_lounge",
            "Ikoyi Lounge has the highest chemistry potential for flirting, first conversations, and casual discovery.",
        ),
        Some(PlayerIntent::Relationship) => (
            "rooftop_party",
            "Victoria Island Rooftop is better for slower conversations, profile browsing, and relationship-minded encounters.",
        ),
        Some(PlayerIntent::Explore) => (
            "rooftop_party",
            "Victoria Island Rooftop gives you a broader mix of people, scenes, and social options while you explore.",
        ),
        _ => (
            "neon_lounge",
            "Ikoyi Lounge is the best starter venue for meeting people and learning how Lagos nights flow.",
        ),
    };

    Ok(Json(ApiOk::new(RoomRecommendationResponse {
        recommended_room_kind: kind.into(),
        display_name: room_display_name(kind).into(),
        reason: reason.into(),
        alternatives: vec![
            room_summary(&state, "neon_lounge", "neon_lounge-001".into()).await,
            room_summary(&state, "rooftop_party", "rooftop_party-001".into()).await,
        ],
    })))
}

async fn list_rooms(
    State(state): State<SharedState>,
) -> Result<Json<ApiOk<RoomDirectoryResponse>>, AppError> {
    let mut rooms = Vec::new();
    for kind in ["neon_lounge", "rooftop_party"] {
        for index in 1..=3 {
            let id = format!("{kind}-{index:03}");
            rooms.push(room_summary(&state, kind, id).await);
        }
    }
    Ok(Json(ApiOk::new(RoomDirectoryResponse { rooms })))
}

#[derive(Deserialize)]
struct RoomJoinTicketRequest {
    player_id: Uuid,
    room_id: String,
}

#[derive(Serialize)]
struct StoredRoomTicket {
    player_id: Uuid,
    display_name: String,
    room_id: String,
}

async fn issue_room_join_ticket(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<RoomJoinTicketRequest>,
) -> Result<Json<ApiOk<RoomJoinTicketResponse>>, AppError> {
    let claims = auth_claims(&state, &headers)?;
    if claims.sub != req.player_id {
        return Err(AppError::forbidden("token does not match player_id"));
    }

    // Private rooms are only joinable by the two participants, and only after consent.
    if req.room_id.starts_with("private-") {
        let room = load_private_room(&state, &req.room_id).await?;
        let participant = room.created_by == req.player_id
            || room.target_id == format!("player:{}", req.player_id);
        if !participant {
            return Err(AppError::forbidden(
                "not a participant in this private room",
            ));
        }
        if room.consent_state != "accepted" {
            return Err(AppError::forbidden("private room has not been accepted"));
        }
    }

    let ticket: String = rand::rng()
        .sample_iter(&Alphanumeric)
        .take(48)
        .map(char::from)
        .collect();
    let stored = StoredRoomTicket {
        player_id: req.player_id,
        display_name: claims.display_name,
        room_id: req.room_id.clone(),
    };
    let stored_json = serde_json::to_string(&stored)?;

    let Some(redis) = &state.redis else {
        return Err(AppError::from(anyhow::anyhow!(
            "redis is required for room tickets"
        )));
    };
    let mut redis = redis.clone();
    redis
        .set_ex::<_, _, ()>(format!("room_ticket:{ticket}"), stored_json, 30)
        .await?;

    Ok(Json(ApiOk::new(RoomJoinTicketResponse {
        room_id: req.room_id,
        ticket,
        expires_in_seconds: 30,
    })))
}

#[derive(Deserialize)]
struct JoinRoomRequest {
    player_id: Uuid,
    preferred_room: Option<String>,
}

async fn join_room(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<JoinRoomRequest>,
) -> Result<Json<ApiOk<RoomSummary>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let room_kind = req
        .preferred_room
        .unwrap_or_else(|| "neon_lounge".to_string());
    let room_id = choose_room_instance(&state, &room_kind).await;
    sqlx::query("insert into room_assignments (player_id, room_id) values ($1, $2) on conflict (player_id) do update set room_id = excluded.room_id, updated_at = now()")
        .bind(req.player_id)
        .bind(&room_id)
        .execute(&state.db)
        .await?;
    publish_event(
        &state,
        "matchmaking.joined_room",
        Some(req.player_id),
        None,
        Some(room_id.clone()),
        serde_json::json!({ "room_kind": room_kind }),
    )
    .await;
    Ok(Json(ApiOk::new(
        room_summary(&state, &room_kind, room_id).await,
    )))
}

const ROOM_INSTANCES: u32 = 3;

async fn choose_room_instance(state: &SharedState, room_kind: &str) -> String {
    let mut counts = Vec::new();
    for index in 1..=ROOM_INSTANCES {
        let room_id = format!("{room_kind}-{index:03}");
        let count = room_player_count(state, &room_id).await;
        counts.push((room_id, count));
    }
    pick_instance(&counts, room_capacity(room_kind)).unwrap_or_else(|| format!("{room_kind}-001"))
}

/// Fill-first: a social venue is only fun if people actually meet, so join the busiest
/// instance that still has comfortable headroom (80% of capacity). Only spill into a
/// new instance once the busy ones are near full.
fn pick_instance(counts: &[(String, u32)], capacity: u32) -> Option<String> {
    let soft_cap = (capacity * 4 / 5).max(1);
    // `max_by_key` returns the last maximum, so iterate in reverse to prefer lower instance numbers.
    counts
        .iter()
        .rev()
        .filter(|(_, c)| *c < soft_cap)
        .max_by_key(|(_, c)| *c)
        .or_else(|| {
            counts
                .iter()
                .filter(|(_, c)| *c < capacity)
                .min_by_key(|(_, c)| *c)
        })
        .map(|(id, _)| id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rooms(counts: &[u32]) -> Vec<(String, u32)> {
        counts
            .iter()
            .enumerate()
            .map(|(i, c)| (format!("r-{i}"), *c))
            .collect()
    }

    #[test]
    fn venues_use_lagos_names() {
        assert_eq!(room_display_name("city"), "Lekki Phase 1");
        assert_eq!(room_display_name("neon_lounge"), "Ikoyi Lounge");
        assert_eq!(
            room_display_name("rooftop_party"),
            "Victoria Island Rooftop"
        );
    }

    #[test]
    fn empty_venue_uses_first_instance() {
        assert_eq!(
            pick_instance(&rooms(&[0, 0, 0]), 50).as_deref(),
            Some("r-0")
        );
    }

    #[test]
    fn fills_busiest_instance_with_headroom() {
        assert_eq!(
            pick_instance(&rooms(&[3, 0, 1]), 50).as_deref(),
            Some("r-0")
        );
    }

    #[test]
    fn spills_over_when_near_full() {
        assert_eq!(
            pick_instance(&rooms(&[40, 5, 0]), 50).as_deref(),
            Some("r-1")
        );
    }

    #[test]
    fn falls_back_to_least_full_when_all_near_full() {
        assert_eq!(
            pick_instance(&rooms(&[45, 42, 49]), 50).as_deref(),
            Some("r-1")
        );
    }

    #[test]
    fn none_when_everything_is_full() {
        assert_eq!(pick_instance(&rooms(&[50, 50]), 50), None);
    }
}

async fn room_summary(state: &SharedState, kind: &str, id: String) -> RoomSummary {
    RoomSummary {
        id: id.clone(),
        kind: kind.into(),
        display_name: room_display_name(kind).into(),
        player_count: room_player_count(state, &id).await,
        capacity: room_capacity(kind),
        websocket_url: state.room_ws_public_url.clone(),
    }
}

async fn room_player_count(state: &SharedState, room_id: &str) -> u32 {
    if let Some(redis) = &state.redis {
        let mut redis = redis.clone();
        redis
            .scard::<_, u32>(format!("room:players:{room_id}"))
            .await
            .unwrap_or(0)
    } else {
        0
    }
}

fn room_capacity(kind: &str) -> u32 {
    match kind {
        "rooftop_party" => 35,
        "city" => 80,
        "private_room" => 2,
        _ => 50,
    }
}

fn room_display_name(kind: &str) -> &'static str {
    match kind {
        "rooftop_party" => "Victoria Island Rooftop",
        "city" => "Lekki Phase 1",
        "private_room" => "Private Room",
        _ => "Ikoyi Lounge",
    }
}

#[derive(Deserialize)]
struct DiscoveryQuery {
    player_id: Uuid,
    room_id: Option<String>,
}

async fn player_avatar(
    state: &SharedState,
    player_id: Uuid,
) -> Result<Option<AvatarConfig>, AppError> {
    let value: Option<serde_json::Value> =
        sqlx::query_scalar("select config from avatars where player_id = $1")
            .bind(player_id)
            .fetch_optional(&state.db)
            .await?;
    Ok(value.and_then(|v| serde_json::from_value::<AvatarConfig>(v).ok()))
}

/// Target ids hidden from this player: anyone they blocked, plus players who blocked them.
async fn hidden_targets(state: &SharedState, player_id: Uuid) -> Result<HashSet<String>, AppError> {
    let rows = sqlx::query(
        "select target_id as id from player_blocks where blocker_id = $1
         union
         select 'player:' || blocker_id::text as id from player_blocks where target_id = $2",
    )
    .bind(player_id)
    .bind(format!("player:{player_id}"))
    .fetch_all(&state.db)
    .await?;
    Ok(rows.into_iter().map(|r| r.get::<String, _>("id")).collect())
}

async fn discovery(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<DiscoveryQuery>,
) -> Result<Json<ApiOk<DiscoveryResponse>>, AppError> {
    require_player(&state, &headers, query.player_id)?;
    let room_id = query.room_id.unwrap_or_else(|| "neon_lounge-001".into());
    let venue = room_id
        .rsplit_once('-')
        .map(|(k, _)| k)
        .unwrap_or(&room_id)
        .to_string();
    let hidden = hidden_targets(&state, query.player_id).await?;
    let me = player_avatar(&state, query.player_id).await?;
    let likes = me.as_ref().map(|a| a.likes.clone()).unwrap_or_default();
    let show_me = me
        .as_ref()
        .map(|a| a.preferences.show_me.clone())
        .unwrap_or_default();
    let location = room_display_name(&venue).to_string();

    let mut profiles = Vec::new();

    // Real players currently present in this room instance.
    if let Some(redis) = &state.redis {
        let mut redis = redis.clone();
        let names: HashMap<String, String> = redis
            .hgetall(format!("room:names:{room_id}"))
            .await
            .unwrap_or_default();
        for (id, display_name) in names {
            let Ok(other_id) = Uuid::parse_str(&id) else {
                continue;
            };
            let target = format!("player:{other_id}");
            if other_id == query.player_id || hidden.contains(&target) {
                continue;
            }
            let Some(other) = player_avatar(&state, other_id).await? else {
                continue; // still in the creator
            };
            if let Some(me) = &me
                && !sidepiece_common::visible_in_discovery(me, &other)
            {
                continue;
            }
            profiles.push(player_profile(
                target,
                display_name,
                location.clone(),
                me.as_ref(),
                &other,
            ));
        }
    }

    for npc in npcs::for_venue(&venue) {
        let target = format!("npc:{}", npc.id);
        if hidden.contains(&target)
            || (!show_me.is_empty() && !show_me.contains(&npc.look().gender))
        {
            continue;
        }
        profiles.push(DiscoverableProfile {
            id: target,
            display_name: npc.name.into(),
            kind: "npc".into(),
            location: location.clone(),
            looking_for: format!("{} · {}", npc.looking_for, npc.traits.join(", ")),
            compatibility: npcs::compatibility(&likes, npc.traits),
            social_rating: npc.social_rating,
            is_available: true,
            npc: Some(npc.presence()),
            bio: npc.tagline.into(),
            interests: Vec::new(),
            relationship_style: None,
            open_to: INVITATION_TYPES.iter().map(|t| t.to_string()).collect(),
            look: Some(npc.look()),
            online: true,
        });
    }

    profiles.sort_by(|a, b| b.compatibility.cmp(&a.compatibility));
    Ok(Json(ApiOk::new(DiscoveryResponse { room_id, profiles })))
}

/// What another player may see of `other`: only fields they marked public.
fn player_profile(
    id: String,
    display_name: String,
    location: String,
    me: Option<&AvatarConfig>,
    other: &AvatarConfig,
) -> DiscoverableProfile {
    let p = &other.preferences;
    DiscoverableProfile {
        id,
        display_name,
        kind: "player".into(),
        location,
        looking_for: if other.likes.is_empty() {
            "Keeping it open".into()
        } else {
            format!("Into: {}", other.likes.join(", "))
        },
        compatibility: match me {
            Some(me) => sidepiece_common::player_compatibility(me, other),
            None => 50,
        },
        social_rating: 7.5,
        is_available: true,
        npc: None,
        bio: other.bio.clone(),
        interests: if p.public_interests {
            p.interests.clone()
        } else {
            Vec::new()
        },
        relationship_style: (p.public_relationship_style && !p.relationship_style.is_empty())
            .then(|| p.relationship_style.clone()),
        open_to: INVITATION_TYPES
            .iter()
            .filter(|t| !p.boundaries.iter().any(|b| b == *t))
            .map(|t| t.to_string())
            .collect(),
        look: Some(other.look.clone()),
        online: true,
    }
}

#[derive(Deserialize)]
struct PrivateRoomRequest {
    player_id: Uuid,
    target_id: String,
}

async fn request_private_room(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<PrivateRoomRequest>,
) -> Result<Json<ApiOk<PrivateRoomResult>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    // Boundaries (spec Screen 04): never deliver an invitation type the target opted out of.
    if let Some(target) = req
        .target_id
        .strip_prefix("player:")
        .and_then(|id| Uuid::parse_str(id).ok())
        && let Some(target_avatar) = player_avatar(&state, target).await?
        && target_avatar
            .preferences
            .boundaries
            .iter()
            .any(|b| b == "private_location")
    {
        return Err(AppError::forbidden(
            "they aren't open to private invitations",
        ));
    }
    let room_id = format!("private-{}", Uuid::new_v4());
    sqlx::query("insert into private_rooms (id, created_by, target_id, consent_state) values ($1, $2, $3, 'requested')")
        .bind(&room_id)
        .bind(req.player_id)
        .bind(&req.target_id)
        .execute(&state.db)
        .await?;
    publish_event(
        &state,
        "social.private_room_requested",
        Some(req.player_id),
        Some(req.target_id.clone()),
        Some(room_id.clone()),
        serde_json::json!({ "consent_state": "requested" }),
    )
    .await;

    Ok(Json(ApiOk::new(PrivateRoomResult {
        consent_state: "requested".into(),
        room: RoomSummary {
            id: room_id,
            kind: "private_room".into(),
            display_name: "Private Room Request".into(),
            player_count: 1,
            capacity: room_capacity("private_room"),
            websocket_url: state.room_ws_public_url.clone(),
        },
    })))
}

#[derive(Deserialize)]
struct PrivateRoomConsentRequest {
    player_id: Uuid,
    action: String,
}

struct PrivateRoomRow {
    created_by: Uuid,
    target_id: String,
    consent_state: String,
}

async fn load_private_room(state: &SharedState, room_id: &str) -> Result<PrivateRoomRow, AppError> {
    let row =
        sqlx::query("select created_by, target_id, consent_state from private_rooms where id = $1")
            .bind(room_id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| AppError::not_found("private room not found"))?;
    Ok(PrivateRoomRow {
        created_by: row.get("created_by"),
        target_id: row.get("target_id"),
        consent_state: row.get("consent_state"),
    })
}

fn private_room_summary(
    state: &SharedState,
    room_id: String,
    consent_state: &str,
) -> PrivateRoomResult {
    PrivateRoomResult {
        consent_state: consent_state.into(),
        room: RoomSummary {
            id: room_id,
            kind: "private_room".into(),
            display_name: if consent_state == "accepted" {
                "Private Room"
            } else {
                "Private Room Request"
            }
            .into(),
            player_count: 0,
            capacity: room_capacity("private_room"),
            websocket_url: state.room_ws_public_url.clone(),
        },
    }
}

/// Consent rules:
/// - Player targets: only the invited player can accept/decline. The requester can only cancel.
/// - NPC targets: NPC consent is simulated, so the requester resolves it (MVP only).
async fn update_private_room_consent(
    State(state): State<SharedState>,
    Path(room_id): Path<String>,
    headers: HeaderMap,
    Json(req): Json<PrivateRoomConsentRequest>,
) -> Result<Json<ApiOk<PrivateRoomResult>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let room = load_private_room(&state, &room_id).await?;
    if room.consent_state != "requested" {
        return Err(AppError::bad_request("request already resolved"));
    }
    let is_creator = room.created_by == req.player_id;
    let is_target = room.target_id == format!("player:{}", req.player_id);
    let npc_target = room.target_id.starts_with("npc:");

    let consent_state = match (req.action.as_str(), is_creator, is_target, npc_target) {
        ("accept", _, true, _) => "accepted",
        ("decline", _, true, _) => "declined",
        ("accept", true, _, true) => "accepted",
        ("decline", true, _, true) | ("cancel", true, _, _) => "cancelled",
        ("accept", true, _, false) => {
            return Err(AppError::forbidden("the invited player must accept"));
        }
        _ => return Err(AppError::forbidden("not allowed to change this request")),
    };

    sqlx::query("update private_rooms set consent_state = $1, updated_at = now() where id = $2")
        .bind(consent_state)
        .bind(&room_id)
        .execute(&state.db)
        .await?;

    publish_event(
        &state,
        "social.private_room_consent_updated",
        Some(req.player_id),
        Some(room.target_id),
        Some(room_id.clone()),
        serde_json::json!({ "consent_state": consent_state }),
    )
    .await;

    Ok(Json(ApiOk::new(private_room_summary(
        &state,
        room_id,
        consent_state,
    ))))
}

#[derive(Deserialize)]
struct PlayerQuery {
    player_id: Uuid,
}

async fn private_room_status(
    State(state): State<SharedState>,
    Path(room_id): Path<String>,
    headers: HeaderMap,
    Query(query): Query<PlayerQuery>,
) -> Result<Json<ApiOk<PrivateRoomResult>>, AppError> {
    require_player(&state, &headers, query.player_id)?;
    let room = load_private_room(&state, &room_id).await?;
    let allowed = room.created_by == query.player_id
        || room.target_id == format!("player:{}", query.player_id);
    if !allowed {
        return Err(AppError::forbidden("not a participant"));
    }
    Ok(Json(ApiOk::new(private_room_summary(
        &state,
        room_id,
        &room.consent_state,
    ))))
}

async fn incoming_private_room_requests(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<PlayerQuery>,
) -> Result<Json<ApiOk<IncomingRequestsResponse>>, AppError> {
    require_player(&state, &headers, query.player_id)?;
    let rows = sqlx::query(
        "select r.id, r.created_by, r.consent_state, p.display_name
         from private_rooms r join players p on p.id = r.created_by
         where r.target_id = $1 and r.consent_state = 'requested'
           and r.created_at > now() - interval '15 minutes'
         order by r.created_at desc",
    )
    .bind(format!("player:{}", query.player_id))
    .fetch_all(&state.db)
    .await?;
    let requests = rows
        .into_iter()
        .map(|row| IncomingPrivateRoomRequest {
            room_id: row.get("id"),
            from_player_id: row.get("created_by"),
            from_display_name: row.get("display_name"),
            consent_state: row.get("consent_state"),
        })
        .collect();
    Ok(Json(ApiOk::new(IncomingRequestsResponse { requests })))
}

#[derive(Deserialize)]
struct ReportRequest {
    reporter_id: Uuid,
    target_id: String,
    reason: String,
    details: Option<String>,
}

async fn report_target(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<ReportRequest>,
) -> Result<Json<ApiOk<SafetyActionResult>>, AppError> {
    require_player(&state, &headers, req.reporter_id)?;
    sqlx::query("insert into moderation_reports (id, reporter_id, target_id, reason, details) values ($1, $2, $3, $4, $5)")
        .bind(Uuid::new_v4())
        .bind(req.reporter_id)
        .bind(&req.target_id)
        .bind(&req.reason)
        .bind(&req.details)
        .execute(&state.db)
        .await?;
    publish_event(
        &state,
        "moderation.report_created",
        Some(req.reporter_id),
        Some(req.target_id.clone()),
        None,
        serde_json::json!({ "reason": req.reason }),
    )
    .await;

    Ok(Json(ApiOk::new(SafetyActionResult {
        target_id: req.target_id,
        status: "reported".into(),
    })))
}

#[derive(Deserialize)]
struct BlockRequest {
    blocker_id: Uuid,
    target_id: String,
}

async fn block_target(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<BlockRequest>,
) -> Result<Json<ApiOk<SafetyActionResult>>, AppError> {
    require_player(&state, &headers, req.blocker_id)?;
    sqlx::query(
        "insert into player_blocks (blocker_id, target_id) values ($1, $2) on conflict do nothing",
    )
    .bind(req.blocker_id)
    .bind(&req.target_id)
    .execute(&state.db)
    .await?;
    publish_event(
        &state,
        "moderation.player_blocked",
        Some(req.blocker_id),
        Some(req.target_id.clone()),
        None,
        serde_json::json!({}),
    )
    .await;

    Ok(Json(ApiOk::new(SafetyActionResult {
        target_id: req.target_id,
        status: "blocked".into(),
    })))
}

async fn publish_event(
    state: &SharedState,
    event_type: &str,
    player_id: Option<Uuid>,
    target_id: Option<String>,
    room_id: Option<String>,
    payload: serde_json::Value,
) {
    let Some(nats) = &state.nats else {
        return;
    };
    let event = GameEvent {
        event_type: event_type.into(),
        player_id,
        target_id,
        room_id,
        payload,
        timestamp: Utc::now(),
    };
    match serde_json::to_vec(&event) {
        Ok(bytes) => {
            if let Err(err) = nats
                .publish(format!("events.{event_type}"), bytes.into())
                .await
            {
                tracing::warn!(?err, event_type, "failed to publish nats event");
            }
        }
        Err(err) => tracing::warn!(?err, event_type, "failed to serialize event"),
    }
}

const DEV_JWT_SECRET: &str = "dev-secret-change-me";

fn cors_layer(origins: Option<String>, production: bool) -> anyhow::Result<CorsLayer> {
    use axum::http::{HeaderValue, Method, header};
    let origins: Vec<HeaderValue> = origins
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|o| !o.is_empty())
        .map(HeaderValue::from_str)
        .collect::<Result<_, _>>()?;
    if origins.is_empty() {
        if production {
            anyhow::bail!("CORS_ORIGINS must list the web app origin(s) in production");
        }
        return Ok(CorsLayer::permissive());
    }
    Ok(CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]))
}

#[derive(Debug)]
struct AppError {
    status: StatusCode,
    error: anyhow::Error,
}

impl AppError {
    fn unauthorized(message: &str) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            error: anyhow::anyhow!(message.to_string()),
        }
    }

    fn forbidden(message: &str) -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            error: anyhow::anyhow!(message.to_string()),
        }
    }

    fn not_found(message: &str) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            error: anyhow::anyhow!(message.to_string()),
        }
    }

    fn conflict(message: &str) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            error: anyhow::anyhow!(message.to_string()),
        }
    }

    fn too_many_requests(message: &str) -> Self {
        Self {
            status: StatusCode::TOO_MANY_REQUESTS,
            error: anyhow::anyhow!(message.to_string()),
        }
    }

    fn bad_request(message: &str) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            error: anyhow::anyhow!(message.to_string()),
        }
    }
}

impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(err: E) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            error: err.into(),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        // Never leak internal error details (SQL, Redis, etc.) to clients.
        let message = if self.status.is_server_error() {
            tracing::error!(status = %self.status, error = ?self.error, "api error");
            "internal error".to_string()
        } else {
            tracing::warn!(status = %self.status, error = %self.error, "request rejected");
            self.error.to_string()
        };
        (
            self.status,
            Json(serde_json::json!({ "ok": false, "error": message })),
        )
            .into_response()
    }
}
