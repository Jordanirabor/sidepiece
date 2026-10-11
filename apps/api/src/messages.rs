//! Persisted player-to-player DMs and inbox (spec Screens 09, 09A, 17).
//!
//! M5 keeps delivery simple: clients poll inbox/thread, while the server owns history, unread counts,
//! match/block checks, and local conversation controls (mute/end).

use super::{
    AppError, SharedState, hidden_targets, player_avatar, publish_event, require_player,
    room_display_name,
};
use axum::{
    Json,
    extract::{Query, State},
    http::HeaderMap,
};
use chrono::{DateTime, Duration, Utc};
use redis::AsyncCommands;
use serde::Deserialize;
use sidepiece_common::{
    ApiOk, AvatarLook, ConversationView, DmMessageView, DmThreadResponse, INVITATION_TYPES,
    InboxResponse,
};
use sqlx::Row;
use uuid::Uuid;

const MAX_MESSAGE_CHARS: usize = 400;
const THREAD_LIMIT: i64 = 80;

#[derive(Deserialize)]
pub struct PlayerQuery {
    player_id: Uuid,
}

#[derive(Deserialize)]
pub struct ThreadQuery {
    player_id: Uuid,
    target_id: String,
}

#[derive(Deserialize)]
pub struct SendRequest {
    player_id: Uuid,
    target_id: String,
    message: String,
}

#[derive(Deserialize)]
pub struct TargetRequest {
    player_id: Uuid,
    target_id: String,
}

#[derive(Deserialize)]
pub struct ControlRequest {
    player_id: Uuid,
    target_id: String,
    action: String,
}

pub(crate) fn parse_player_target(target_id: &str) -> Result<Uuid, AppError> {
    target_id
        .strip_prefix("player:")
        .ok_or_else(|| AppError::bad_request("player conversation required"))
        .and_then(|id| Uuid::parse_str(id).map_err(|_| AppError::bad_request("invalid target")))
}

fn venue_of(room_id: &str) -> &str {
    room_id.rsplit_once('-').map(|(k, _)| k).unwrap_or(room_id)
}

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

pub(crate) async fn player_name_look(
    state: &SharedState,
    player_id: Uuid,
) -> Result<(String, Option<AvatarLook>), AppError> {
    let row = sqlx::query("select display_name from players where id = $1")
        .bind(player_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::not_found("profile not available"))?;
    let display_name: String = row.get("display_name");
    let look = player_avatar(state, player_id).await?.map(|a| a.look);
    Ok((display_name, look))
}

pub(crate) async fn ensure_visible_matched(
    state: &SharedState,
    me: Uuid,
    other: Uuid,
) -> Result<(), AppError> {
    if other == me {
        return Err(AppError::bad_request("you can't message yourself"));
    }
    let target = format!("player:{other}");
    if hidden_targets(state, me).await?.contains(&target) {
        return Err(AppError::not_found("conversation not available"));
    }
    let matched: bool = sqlx::query_scalar(
        "select exists(select 1 from matches where player_id = $1 and target_id = $2)",
    )
    .bind(me)
    .bind(&target)
    .fetch_one(&state.db)
    .await?;
    if !matched {
        return Err(AppError::forbidden("match first to message"));
    }
    Ok(())
}

async fn state_flags(
    state: &SharedState,
    me: Uuid,
    target_id: &str,
) -> Result<(bool, bool), AppError> {
    let row = sqlx::query("select muted_until, ended_at from conversation_state where player_id = $1 and target_id = $2")
        .bind(me)
        .bind(target_id)
        .fetch_optional(&state.db)
        .await?;
    let Some(row) = row else {
        return Ok((false, false));
    };
    let muted_until: Option<DateTime<Utc>> = row.get("muted_until");
    let ended_at: Option<DateTime<Utc>> = row.get("ended_at");
    Ok((
        muted_until.is_some_and(|t| t > Utc::now()),
        ended_at.is_some(),
    ))
}

async fn last_dm(
    state: &SharedState,
    me: Uuid,
    other: Uuid,
) -> Result<Option<(String, DateTime<Utc>)>, AppError> {
    let row = sqlx::query(
        "select content, created_at from dm_messages
         where (sender_id = $1 and recipient_id = $2) or (sender_id = $2 and recipient_id = $1)
         order by created_at desc limit 1",
    )
    .bind(me)
    .bind(other)
    .fetch_optional(&state.db)
    .await?;
    Ok(row.map(|r| (r.get("content"), r.get("created_at"))))
}

pub async fn inbox(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(q): Query<PlayerQuery>,
) -> Result<Json<ApiOk<InboxResponse>>, AppError> {
    require_player(&state, &headers, q.player_id)?;
    let hidden = hidden_targets(&state, q.player_id).await?;
    let pending = super::invites::pending_for(&state, q.player_id).await?;
    let rows = sqlx::query(
        "select target_id, created_at from matches where player_id = $1 order by created_at desc",
    )
    .bind(q.player_id)
    .fetch_all(&state.db)
    .await?;

    let mut conversations = Vec::new();
    for row in rows {
        let target_id: String = row.get("target_id");
        if hidden.contains(&target_id) {
            continue;
        }
        if let Some(npc_id) = target_id.strip_prefix("npc:") {
            if let Some(npc) = super::npcs::find(npc_id) {
                let last = sqlx::query(
                    "select content, id from npc_messages where player_id = $1 and npc_id = $2 order by id desc limit 1",
                )
                .bind(q.player_id)
                .bind(npc.id)
                .fetch_optional(&state.db)
                .await?;
                let last_message = last
                    .map(|r| r.get::<String, _>("content"))
                    .unwrap_or(npc.greeting.into());
                let (muted, ended) = state_flags(&state, q.player_id, &target_id).await?;
                conversations.push(ConversationView {
                    target_id: target_id.clone(),
                    display_name: npc.name.into(),
                    kind: "npc".into(),
                    look: Some(npc.look()),
                    last_message,
                    updated_at: row.get("created_at"),
                    unread_count: 0,
                    online: true,
                    location: room_display_name(npc.venue).into(),
                    venue: npc.venue.into(),
                    muted,
                    ended,
                    pending_invite: None,
                });
            }
            continue;
        }
        let Ok(other) = parse_player_target(&target_id) else {
            continue;
        };
        let (display_name, look) = player_name_look(&state, other).await?;
        let matched_at: DateTime<Utc> = row.get("created_at");
        let last = last_dm(&state, q.player_id, other).await?;
        let updated_at = last.as_ref().map(|(_, t)| *t).unwrap_or(matched_at);
        let (muted, ended) = state_flags(&state, q.player_id, &target_id).await?;
        let ended_at: Option<DateTime<Utc>> = sqlx::query_scalar(
            "select ended_at from conversation_state where player_id = $1 and target_id = $2 and ended_at is not null",
        )
        .bind(q.player_id)
        .bind(&target_id)
        .fetch_optional(&state.db)
        .await?;
        let pending_invite = pending.get(&target_id).cloned();
        if ended_at.is_some_and(|t| t >= updated_at) && pending_invite.is_none() {
            continue;
        }
        let unread_count: i64 = sqlx::query_scalar(
            "select count(*) from dm_messages where recipient_id = $1 and sender_id = $2 and read_at is null",
        )
        .bind(q.player_id)
        .bind(other)
        .fetch_one(&state.db)
        .await?;
        let loc = presence(&state, other).await;
        conversations.push(ConversationView {
            target_id,
            display_name,
            kind: "player".into(),
            look,
            last_message: last
                .map(|(m, _)| m)
                .unwrap_or_else(|| "You matched. Say hello.".into()),
            updated_at,
            unread_count,
            online: loc.is_some(),
            location: loc
                .as_ref()
                .map(|l| l.1.clone())
                .unwrap_or_else(|| "Offline".into()),
            venue: loc.map(|l| l.0).unwrap_or_default(),
            muted,
            ended,
            pending_invite,
        });
    }
    conversations.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    let unread_count = badge_unread(&conversations);
    let invite_count = conversations
        .iter()
        .filter(|c| c.pending_invite.is_some())
        .count() as i64;
    Ok(Json(ApiOk::new(InboxResponse {
        conversations,
        unread_count,
        invite_count,
    })))
}

/// The nav badge total. Muting pauses alerts, so muted threads keep their own count but don't add to it.
fn badge_unread(conversations: &[ConversationView]) -> i64 {
    conversations
        .iter()
        .filter(|c| !c.muted)
        .map(|c| c.unread_count)
        .sum()
}

pub async fn thread(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(q): Query<ThreadQuery>,
) -> Result<Json<ApiOk<DmThreadResponse>>, AppError> {
    require_player(&state, &headers, q.player_id)?;
    let other = parse_player_target(&q.target_id)?;
    ensure_visible_matched(&state, q.player_id, other).await?;
    let (display_name, look) = player_name_look(&state, other).await?;
    let rows = sqlx::query(
        "select id, sender_id, recipient_id, content, created_at, read_at from dm_messages
         where (sender_id = $1 and recipient_id = $2) or (sender_id = $2 and recipient_id = $1)
         order by created_at desc limit $3",
    )
    .bind(q.player_id)
    .bind(other)
    .bind(THREAD_LIMIT)
    .fetch_all(&state.db)
    .await?;
    let mut messages: Vec<DmMessageView> = rows
        .into_iter()
        .map(|r| {
            let sender_id: Uuid = r.get("sender_id");
            DmMessageView {
                id: r.get::<Uuid, _>("id").to_string(),
                sender_id,
                recipient_id: r.get("recipient_id"),
                content: r.get("content"),
                created_at: r.get("created_at"),
                read_at: r.get("read_at"),
                outgoing: sender_id == q.player_id,
            }
        })
        .collect();
    messages.reverse();
    let (muted, ended) = state_flags(&state, q.player_id, &q.target_id).await?;
    let loc = presence(&state, other).await;
    Ok(Json(ApiOk::new(DmThreadResponse {
        target_id: q.target_id,
        display_name,
        look,
        online: loc.is_some(),
        location: loc
            .as_ref()
            .map(|l| l.1.clone())
            .unwrap_or_else(|| "Offline".into()),
        venue: loc.map(|l| l.0).unwrap_or_default(),
        muted,
        ended,
        messages,
        open_to: open_to(&state, other).await?,
        invitations: super::invites::between(&state, q.player_id, other).await?,
    })))
}

/// Invitation types this player is open to: everything not in their (private) boundaries list.
async fn open_to(state: &SharedState, player_id: Uuid) -> Result<Vec<String>, AppError> {
    let boundaries = player_avatar(state, player_id)
        .await?
        .map(|a| a.preferences.boundaries)
        .unwrap_or_default();
    Ok(INVITATION_TYPES
        .iter()
        .filter(|t| !boundaries.iter().any(|b| b == *t))
        .map(|t| t.to_string())
        .collect())
}

pub async fn send(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<SendRequest>,
) -> Result<Json<ApiOk<DmMessageView>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let other = parse_player_target(&req.target_id)?;
    ensure_visible_matched(&state, req.player_id, other).await?;
    let message: String = req.message.trim().chars().take(MAX_MESSAGE_CHARS).collect();
    if message.is_empty() {
        return Err(AppError::bad_request("say something first"));
    }
    let id = Uuid::new_v4();
    let row = sqlx::query(
        "insert into dm_messages (id, sender_id, recipient_id, content) values ($1, $2, $3, $4)
         returning id, sender_id, recipient_id, content, created_at, read_at",
    )
    .bind(id)
    .bind(req.player_id)
    .bind(other)
    .bind(&message)
    .fetch_one(&state.db)
    .await?;
    sqlx::query(
        "insert into conversation_state (player_id, target_id, ended_at) values ($1, $2, null)
         on conflict (player_id, target_id) do update set ended_at = null, updated_at = now()",
    )
    .bind(req.player_id)
    .bind(&req.target_id)
    .execute(&state.db)
    .await?;
    publish_event(
        &state,
        "message.sent",
        Some(req.player_id),
        Some(req.target_id.clone()),
        None,
        serde_json::json!({ "message_id": id, "length": message.chars().count() }),
    )
    .await;
    Ok(Json(ApiOk::new(DmMessageView {
        id: row.get::<Uuid, _>("id").to_string(),
        sender_id: row.get("sender_id"),
        recipient_id: row.get("recipient_id"),
        content: row.get("content"),
        created_at: row.get("created_at"),
        read_at: row.get("read_at"),
        outgoing: true,
    })))
}

pub async fn mark_read(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<TargetRequest>,
) -> Result<Json<ApiOk<serde_json::Value>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let other = parse_player_target(&req.target_id)?;
    ensure_visible_matched(&state, req.player_id, other).await?;
    let updated = sqlx::query(
        "update dm_messages set read_at = coalesce(read_at, now())
         where recipient_id = $1 and sender_id = $2 and read_at is null",
    )
    .bind(req.player_id)
    .bind(other)
    .execute(&state.db)
    .await?
    .rows_affected();
    Ok(Json(ApiOk::new(serde_json::json!({ "read": updated }))))
}

pub async fn control(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<ControlRequest>,
) -> Result<Json<ApiOk<serde_json::Value>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    match req.target_id.strip_prefix("npc:") {
        Some(_) => {}
        None => {
            let other = parse_player_target(&req.target_id)?;
            ensure_visible_matched(&state, req.player_id, other).await?;
        }
    }
    // `set_mute` keeps End from silently unmuting: only mute/unmute touch muted_until.
    let (set_mute, muted_until, ended_at) = match req.action.as_str() {
        "mute" => (true, Some(Utc::now() + Duration::hours(8)), None),
        "unmute" => (true, None, None),
        "end" => (false, None, Some(Utc::now())),
        _ => return Err(AppError::bad_request("unknown conversation action")),
    };
    sqlx::query(
        "insert into conversation_state (player_id, target_id, muted_until, ended_at) values ($1, $2, $3, $4)
         on conflict (player_id, target_id) do update set
           muted_until = case when $5 then excluded.muted_until else conversation_state.muted_until end,
           ended_at = coalesce(excluded.ended_at, conversation_state.ended_at),
           updated_at = now()",
    )
    .bind(req.player_id)
    .bind(&req.target_id)
    .bind(muted_until)
    .bind(ended_at)
    .bind(set_mute)
    .execute(&state.db)
    .await?;
    Ok(Json(ApiOk::new(
        serde_json::json!({ "target_id": req.target_id, "status": req.action }),
    )))
}

#[cfg(test)]
mod tests {
    use super::{badge_unread, parse_player_target};
    use chrono::Utc;
    use sidepiece_common::ConversationView;
    use uuid::Uuid;

    fn convo(unread_count: i64, muted: bool) -> ConversationView {
        ConversationView {
            target_id: format!("player:{}", Uuid::new_v4()),
            display_name: "Tolu".into(),
            kind: "player".into(),
            look: None,
            last_message: String::new(),
            updated_at: Utc::now(),
            unread_count,
            online: false,
            location: "Offline".into(),
            venue: String::new(),
            muted,
            ended: false,
            pending_invite: None,
        }
    }

    #[test]
    fn muted_threads_do_not_count_toward_badge() {
        assert_eq!(
            badge_unread(&[convo(2, false), convo(5, true), convo(1, false)]),
            3
        );
        assert_eq!(badge_unread(&[]), 0);
    }

    #[test]
    fn target_parser_is_strict() {
        let id = Uuid::new_v4();
        assert_eq!(parse_player_target(&format!("player:{id}")).unwrap(), id);
        assert!(parse_player_target("npc:maya").is_err());
        assert!(parse_player_target("player:not-a-uuid").is_err());
    }
}
