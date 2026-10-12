//! Private encounters (spec Screen 13, ADR 0014).
//!
//! Every accepted private room gets one encounter. Accepting the room is not the same as agreeing to the
//! moment, so both sides confirm again inside (an NPC partner's consent was given when it accepted, at Friend
//! tier). Once both confirm, a short non-graphic scene plays and fades to black. Either side can leave at any
//! point, before or during the scene, with no penalty. Completion pays once per participant (`progress::grant`).

use super::{
    AppError, SharedState, dates, hidden_targets, life, messages, progress, publish_event,
    require_player,
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use chrono::{DateTime, Duration, Utc};
use serde::Deserialize;
use sidepiece_common::{ApiOk, EncounterView};
use sqlx::Row;
use uuid::Uuid;

/// A partner who hasn't polled for this long is shown as "dropped off" (neutral recovery).
const PRESENCE_TIMEOUT_SECS: i64 = 25;
/// How long the scene runs before it fades to the outcome. Skip goes straight there.
pub const SCENE_SECS: i32 = 14;
/// A repeat encounter with the same partner inside this window counts in stats but pays nothing.
pub const REWARD_COOLDOWN_HOURS: i64 = 24;

/// Rewards for a completed encounter (placeholder economy, needs client input).
pub fn reward(repeat: bool) -> (life::LifeDelta, i32) {
    let needs = life::LifeDelta {
        mood: 15.0,
        love: 15.0,
        social: 5.0,
        energy: -10.0,
        ..Default::default()
    };
    if repeat {
        (needs, 2)
    } else {
        (
            life::LifeDelta {
                money: 5_000,
                xp: 40,
                ..needs
            },
            6,
        )
    }
}

/// Opens the encounter for a private room that was just accepted. Idempotent per room.
pub async fn open(
    state: &SharedState,
    room_id: &str,
    host: Uuid,
    guest: &str,
) -> Result<Uuid, AppError> {
    sqlx::query(
        "insert into encounters (id, room_id, host_id, guest_id, guest_confirmed) values ($1, $2, $3, $4, $5)
         on conflict (room_id) do nothing",
    )
    .bind(Uuid::new_v4())
    .bind(room_id)
    .bind(host)
    .bind(guest)
    .bind(guest.starts_with("npc:"))
    .execute(&state.db)
    .await?;
    let id = id_for_room(state, room_id)
        .await?
        .ok_or_else(|| AppError::not_found("encounter not found"))?;
    publish_event(
        state,
        "encounter.opened",
        Some(host),
        Some(guest.to_string()),
        Some(room_id.to_string()),
        serde_json::json!({ "encounter_id": id }),
    )
    .await;
    Ok(id)
}

pub async fn id_for_room(state: &SharedState, room_id: &str) -> Result<Option<Uuid>, AppError> {
    Ok(
        sqlx::query_scalar("select id from encounters where room_id = $1")
            .bind(room_id)
            .fetch_optional(&state.db)
            .await?,
    )
}

#[derive(Deserialize)]
pub struct PlayerQuery {
    player_id: Uuid,
}

#[derive(Deserialize)]
pub struct PlayerRequest {
    player_id: Uuid,
}

struct EncounterRow {
    id: Uuid,
    room_id: String,
    host_id: Uuid,
    guest_id: String,
    host_confirmed: bool,
    guest_confirmed: bool,
    status: String,
    left_by: Option<String>,
    host_seen_at: DateTime<Utc>,
    guest_seen_at: DateTime<Utc>,
    started_at: Option<DateTime<Utc>>,
}

impl EncounterRow {
    /// (my actor id, partner actor id, am I the host)
    fn sides(&self, me: Uuid) -> Option<(String, String, bool)> {
        let mine = format!("player:{me}");
        if self.host_id == me {
            Some((mine, self.guest_id.clone(), true))
        } else if self.guest_id == mine {
            Some((mine, format!("player:{}", self.host_id), false))
        } else {
            None
        }
    }
}

async fn load(state: &SharedState, id: Uuid) -> Result<EncounterRow, AppError> {
    let r = sqlx::query(
        "select id, room_id, host_id, guest_id, host_confirmed, guest_confirmed, status, left_by,
                host_seen_at, guest_seen_at, started_at
         from encounters where id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::not_found("encounter not found"))?;
    Ok(EncounterRow {
        id: r.get("id"),
        room_id: r.get("room_id"),
        host_id: r.get("host_id"),
        guest_id: r.get("guest_id"),
        host_confirmed: r.get("host_confirmed"),
        guest_confirmed: r.get("guest_confirmed"),
        status: r.get("status"),
        left_by: r.get("left_by"),
        host_seen_at: r.get("host_seen_at"),
        guest_seen_at: r.get("guest_seen_at"),
        started_at: r.get("started_at"),
    })
}

/// Loads the encounter for a participant. Strangers and blocked pairs get a 404.
async fn load_for(
    state: &SharedState,
    id: Uuid,
    me: Uuid,
) -> Result<(EncounterRow, String, String, bool), AppError> {
    let row = load(state, id).await?;
    let (mine, partner, host) = row
        .sides(me)
        .ok_or_else(|| AppError::not_found("encounter not found"))?;
    if hidden_targets(state, me).await?.contains(&partner) {
        return Err(AppError::not_found("encounter not found"));
    }
    Ok((row, mine, partner, host))
}

async fn view(
    state: &SharedState,
    row: &EncounterRow,
    me: Uuid,
    mine: &str,
    partner: &str,
    host: bool,
) -> Result<EncounterView, AppError> {
    let (partner_name, partner_kind, partner_look) =
        dates::partner_identity(state, partner).await?;
    let (i_confirmed, partner_confirmed, partner_seen) = if host {
        (row.host_confirmed, row.guest_confirmed, row.guest_seen_at)
    } else {
        (row.guest_confirmed, row.host_confirmed, row.host_seen_at)
    };
    Ok(EncounterView {
        id: row.id,
        room_id: row.room_id.clone(),
        partner_id: partner.into(),
        partner_present: partner_kind == "npc"
            || Utc::now() - partner_seen < Duration::seconds(PRESENCE_TIMEOUT_SECS),
        partner_kind,
        partner_look,
        status: row.status.clone(),
        i_confirmed,
        partner_confirmed,
        left_by_me: row.left_by.as_deref() == Some(mine),
        elapsed_secs: row
            .started_at
            .map(|t| (Utc::now() - t).num_milliseconds() as f64 / 1000.0),
        scene_secs: SCENE_SECS,
        outcome: if row.status == "completed" {
            progress::outcome_for(state, row.id, me, &partner_name).await?
        } else {
            None
        },
        partner_name,
    })
}

async fn respond(
    state: &SharedState,
    id: Uuid,
    me: Uuid,
) -> Result<Json<ApiOk<EncounterView>>, AppError> {
    let (row, mine, partner, host) = load_for(state, id, me).await?;
    Ok(Json(ApiOk::new(
        view(state, &row, me, &mine, &partner, host).await?,
    )))
}

/// Polling or acting shows this side is still there (partner drop-off detection).
async fn heartbeat(state: &SharedState, id: Uuid, host: bool) -> Result<(), AppError> {
    let column = if host {
        "host_seen_at"
    } else {
        "guest_seen_at"
    };
    sqlx::query(&format!(
        "update encounters set {column} = now() where id = $1"
    ))
    .bind(id)
    .execute(&state.db)
    .await?;
    Ok(())
}

pub async fn get_encounter(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Query(q): Query<PlayerQuery>,
) -> Result<Json<ApiOk<EncounterView>>, AppError> {
    require_player(&state, &headers, q.player_id)?;
    let (_, _, _, host) = load_for(&state, id, q.player_id).await?;
    heartbeat(&state, id, host).await?;
    respond(&state, id, q.player_id).await
}

/// "I'm ready": this side's explicit agreement. The scene starts only once both have confirmed.
pub async fn confirm(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(req): Json<PlayerRequest>,
) -> Result<Json<ApiOk<EncounterView>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let (row, _, partner, host) = load_for(&state, id, req.player_id).await?;
    heartbeat(&state, id, host).await?;
    if row.status != "waiting" {
        return Err(AppError::conflict(match row.status.as_str() {
            "left" => "this moment has ended",
            _ => "you've already both agreed",
        }));
    }
    let column = if host {
        "host_confirmed"
    } else {
        "guest_confirmed"
    };
    sqlx::query(&format!(
        "update encounters set {column} = true where id = $1 and status = 'waiting'"
    ))
    .bind(id)
    .execute(&state.db)
    .await?;
    // Only one request can flip waiting → playing.
    let started = sqlx::query(
        "update encounters set status = 'playing', started_at = now()
         where id = $1 and status = 'waiting' and host_confirmed and guest_confirmed",
    )
    .bind(id)
    .execute(&state.db)
    .await?
    .rows_affected();
    publish_event(
        &state,
        if started > 0 {
            "encounter.started"
        } else {
            "encounter.confirmed"
        },
        Some(req.player_id),
        Some(partner),
        Some(row.room_id),
        serde_json::json!({ "encounter_id": id }),
    )
    .await;
    respond(&state, id, req.player_id).await
}

/// The scene reached its end (or was skipped). The first call completes it and pays both sides once;
/// later calls just return the finished view.
pub async fn complete(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(req): Json<PlayerRequest>,
) -> Result<Json<ApiOk<EncounterView>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let (row, _, _, host) = load_for(&state, id, req.player_id).await?;
    heartbeat(&state, id, host).await?;
    match row.status.as_str() {
        "waiting" => return Err(AppError::conflict("you both need to agree first")),
        "left" => return Err(AppError::conflict("this moment has ended")),
        _ => {}
    }
    let done = sqlx::query(
        "update encounters set status = 'completed', completed_at = now() where id = $1 and status = 'playing'",
    )
    .bind(id)
    .execute(&state.db)
    .await?
    .rows_affected();
    if done > 0 {
        pay(&state, &row).await?;
    }
    respond(&state, id, req.player_id).await
}

async fn pay(state: &SharedState, row: &EncounterRow) -> Result<(), AppError> {
    let mut sides = vec![(row.host_id, row.guest_id.clone())];
    if let Ok(guest) = messages::parse_player_target(&row.guest_id) {
        sides.push((guest, format!("player:{}", row.host_id)));
    }
    for (player, partner) in sides {
        let repeat: bool = sqlx::query_scalar(
            "select exists(select 1 from activity_rewards where player_id = $1 and partner_id = $2 and kind = 'encounter'
               and not repeat and created_at > now() - make_interval(hours => $3))",
        )
        .bind(player)
        .bind(&partner)
        .bind(REWARD_COOLDOWN_HOURS as i32)
        .fetch_one(&state.db)
        .await?;
        let (delta, affinity) = reward(repeat);
        let granted = progress::grant(
            state,
            progress::Grant {
                source_id: row.id,
                player,
                kind: "encounter",
                partner: &partner,
                label: "A night to remember",
                summary: if repeat {
                    "You both chose this. It counts in your stats; rewards with the same person reset after 24 hours."
                } else {
                    "You both chose this, and it showed."
                },
                objective_met: true,
                repeat,
                life: delta,
                affinity,
            },
        )
        .await?;
        if granted {
            progress::bump_relationship(state, player, &partner, affinity, true).await?;
            if partner.starts_with("npc:") {
                progress::npc_feedback(state, row.id, &partner, player, true).await?;
            }
        }
    }
    publish_event(
        state,
        "encounter.completed",
        Some(row.host_id),
        Some(row.guest_id.clone()),
        Some(row.room_id.clone()),
        serde_json::json!({ "encounter_id": row.id }),
    )
    .await;
    Ok(())
}

/// Leave at any time, before or during the scene (spec 13: "Either participant exits → End the scene").
/// Idempotent; no penalty for either side.
pub async fn leave(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(req): Json<PlayerRequest>,
) -> Result<Json<ApiOk<EncounterView>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let (row, mine, partner, _) = load_for(&state, id, req.player_id).await?;
    let left = sqlx::query(
        "update encounters set status = 'left', left_by = $2 where id = $1 and status in ('waiting', 'playing')",
    )
    .bind(id)
    .bind(&mine)
    .execute(&state.db)
    .await?
    .rows_affected();
    if left > 0 {
        publish_event(
            &state,
            "encounter.left",
            Some(req.player_id),
            Some(partner),
            Some(row.room_id),
            serde_json::json!({ "encounter_id": id }),
        )
        .await;
    }
    respond(&state, id, req.player_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeats_count_but_do_not_pay() {
        let (first, a1) = reward(false);
        let (again, a2) = reward(true);
        assert!(first.money > 0 && first.xp > 0 && a1 > 0);
        assert_eq!((again.money, again.xp), (0, 0));
        assert!(a2 >= 0 && again.mood > 0.0);
    }

    #[test]
    fn sides_identify_participants_only() {
        let host = Uuid::new_v4();
        let guest = Uuid::new_v4();
        let row = EncounterRow {
            id: Uuid::new_v4(),
            room_id: "private-x".into(),
            host_id: host,
            guest_id: format!("player:{guest}"),
            host_confirmed: false,
            guest_confirmed: false,
            status: "waiting".into(),
            left_by: None,
            host_seen_at: Utc::now(),
            guest_seen_at: Utc::now(),
            started_at: None,
        };
        assert!(row.sides(host).unwrap().2);
        assert_eq!(row.sides(guest).unwrap().1, format!("player:{host}"));
        assert!(row.sides(Uuid::new_v4()).is_none());
    }
}
