//! Settings & privacy (spec 18, ADR 0016): the account summary, in-app alert preferences and the blocked list
//! with unblock. Password change and account deletion live in `auth.rs`.

use super::{AppError, SharedState, npcs, publish_event, require_player};
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sidepiece_common::{ApiOk, BlockedEntry, NotificationPrefs, SettingsResponse};
use sqlx::Row;
use std::collections::HashMap;
use uuid::Uuid;

pub async fn notifications(
    state: &SharedState,
    player: Uuid,
) -> Result<NotificationPrefs, AppError> {
    let value: Option<serde_json::Value> =
        sqlx::query_scalar("select notifications from player_settings where player_id = $1")
            .bind(player)
            .fetch_optional(&state.db)
            .await?;
    Ok(value
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default())
}

/// Names a blocked id. Players who deleted their account (or never existed) read as "Former player".
fn blocked_entry(
    target_id: String,
    blocked_at: DateTime<Utc>,
    players: &HashMap<Uuid, String>,
) -> BlockedEntry {
    let (kind, display_name) = if let Some(id) = target_id.strip_prefix("npc:") {
        (
            "npc",
            npcs::find(id).map_or_else(|| "A local".to_string(), |n| n.name.to_string()),
        )
    } else {
        let name = target_id
            .strip_prefix("player:")
            .and_then(|s| Uuid::parse_str(s).ok())
            .and_then(|id| players.get(&id).cloned());
        ("player", name.unwrap_or_else(|| "Former player".into()))
    };
    BlockedEntry {
        target_id,
        display_name,
        kind: kind.into(),
        blocked_at,
    }
}

async fn blocked(state: &SharedState, player: Uuid) -> Result<Vec<BlockedEntry>, AppError> {
    let rows = sqlx::query(
        "select target_id, created_at from player_blocks where blocker_id = $1 order by created_at desc",
    )
    .bind(player)
    .fetch_all(&state.db)
    .await?;
    let ids: Vec<Uuid> = rows
        .iter()
        .filter_map(|r| {
            r.get::<String, _>("target_id")
                .strip_prefix("player:")
                .and_then(|s| Uuid::parse_str(s).ok())
        })
        .collect();
    let players: HashMap<Uuid, String> =
        sqlx::query("select id, display_name from players where id = any($1)")
            .bind(&ids)
            .fetch_all(&state.db)
            .await?
            .into_iter()
            .map(|r| (r.get("id"), r.get("display_name")))
            .collect();
    Ok(rows
        .into_iter()
        .map(|r| blocked_entry(r.get("target_id"), r.get("created_at"), &players))
        .collect())
}

pub async fn get_settings(
    State(state): State<SharedState>,
    Path(player_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<ApiOk<SettingsResponse>>, AppError> {
    require_player(&state, &headers, player_id)?;
    let row = sqlx::query(
        "select p.created_at, a.email from players p left join accounts a on a.player_id = p.id where p.id = $1",
    )
    .bind(player_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::not_found("player not found"))?;
    Ok(Json(ApiOk::new(SettingsResponse {
        email: row.get("email"),
        member_since: row.get("created_at"),
        notifications: notifications(&state, player_id).await?,
        blocked: blocked(&state, player_id).await?,
    })))
}

#[derive(Deserialize)]
pub struct NotificationsRequest {
    player_id: Uuid,
    notifications: NotificationPrefs,
}

pub async fn set_notifications(
    State(state): State<SharedState>,
    Path(player_id): Path<Uuid>,
    headers: HeaderMap,
    Json(req): Json<NotificationsRequest>,
) -> Result<Json<ApiOk<NotificationPrefs>>, AppError> {
    require_player(&state, &headers, player_id)?;
    if req.player_id != player_id {
        return Err(AppError::forbidden("token does not match player_id"));
    }
    sqlx::query(
        "insert into player_settings (player_id, notifications) values ($1, $2)
         on conflict (player_id) do update set notifications = excluded.notifications, updated_at = now()",
    )
    .bind(player_id)
    .bind(serde_json::to_value(req.notifications)?)
    .execute(&state.db)
    .await?;
    Ok(Json(ApiOk::new(req.notifications)))
}

#[derive(Deserialize)]
pub struct UnblockRequest {
    blocker_id: Uuid,
    target_id: String,
}

/// Unblocking only lifts the block. Matches, threads and passes that ended stay ended; they can meet again.
pub async fn unblock(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<UnblockRequest>,
) -> Result<Json<ApiOk<serde_json::Value>>, AppError> {
    require_player(&state, &headers, req.blocker_id)?;
    let removed = sqlx::query("delete from player_blocks where blocker_id = $1 and target_id = $2")
        .bind(req.blocker_id)
        .bind(&req.target_id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if removed == 0 {
        return Err(AppError::not_found("you haven't blocked them"));
    }
    publish_event(
        &state,
        "moderation.player_unblocked",
        Some(req.blocker_id),
        Some(req.target_id.clone()),
        None,
        serde_json::json!({}),
    )
    .await;
    Ok(Json(ApiOk::new(
        serde_json::json!({ "target_id": req.target_id, "status": "unblocked" }),
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocked_entries_name_npcs_players_and_deleted_accounts() {
        let known = Uuid::new_v4();
        let players = HashMap::from([(known, "Ada".to_string())]);
        let now = Utc::now();
        let npc = blocked_entry("npc:maya".into(), now, &players);
        assert_eq!(
            (npc.kind.as_str(), npc.display_name.as_str()),
            ("npc", "Maya")
        );
        let p = blocked_entry(format!("player:{known}"), now, &players);
        assert_eq!(
            (p.kind.as_str(), p.display_name.as_str()),
            ("player", "Ada")
        );
        let gone = blocked_entry(format!("player:{}", Uuid::new_v4()), now, &players);
        assert_eq!(gone.display_name, "Former player");
    }
}
