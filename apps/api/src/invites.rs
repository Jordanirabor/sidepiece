//! Activity invitations (spec Screens 10 and 11, ADR 0013).
//!
//! Lifecycle: pending → accepted | declined | cancelled, or expired once `expires_at` passes while pending.
//! Only the invited player accepts or declines; only the sender cancels. The sender pays the ₦ cost, and only
//! when the invitation is accepted. Anti-pressure rules: one pending invitation per pair, and a cooldown
//! after a decline. NPCs answer at once from their relationship with the player (simulated consent, ADR 0003).

use super::{
    AppError, SharedState, chat, dates, encounters, hidden_targets, life, messages, npcs,
    player_avatar, publish_event, require_player,
};
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use chrono::{DateTime, Duration, Utc};
use serde::Deserialize;
use sidepiece_common::{ActivityInfo, ApiOk, InvitationView};
use sqlx::{Row, postgres::PgRow};
use std::collections::HashMap;
use uuid::Uuid;

/// Pending invitations expire after this long (spec 11: Expired).
const INVITE_TTL_SECS: i64 = 10 * 60;
/// After a decline, the sender waits this long before inviting the same person again (no nagging).
const DECLINE_COOLDOWN_MINUTES: i64 = 30;

pub struct Activity {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub icon: &'static str,
    pub cost: i32,
    pub venue: &'static str,
    /// Date scene played after acceptance; `None` goes to a private room instead.
    pub scene: Option<&'static str>,
    /// NPCs agree from this relationship affinity (Friendly = 25, Friend = 40).
    pub npc_affinity: i32,
}

pub const ACTIVITIES: &[Activity] = &[
    Activity {
        id: "public_date",
        label: "Rooftop date",
        description: "Small chops and the skyline at Sky Garden, Victoria Island. Public, relaxed, about five minutes.",
        icon: "🌇",
        cost: 12_000,
        venue: "rooftop_party",
        scene: Some("rooftop_dinner"),
        npc_affinity: 25,
    },
    Activity {
        id: "venue_visit",
        label: "Lounge night",
        description: "Grab a booth together at Club 57. Drinks, music, maybe a dance.",
        icon: "🍸",
        cost: 6_000,
        venue: "neon_lounge",
        scene: Some("lounge_booth"),
        npc_affinity: 25,
    },
    Activity {
        id: "private_location",
        label: "Somewhere private",
        description: "Just the two of you in a private room. You both have to agree, and either of you can leave at any time.",
        icon: "🔒",
        cost: 15_000,
        venue: "private_room",
        scene: None,
        npc_affinity: 40,
    },
];

pub fn activity(id: &str) -> Option<&'static Activity> {
    ACTIVITIES.iter().find(|a| a.id == id)
}

/// Stored status plus the clock: a pending invitation past its expiry reads as expired.
pub fn effective_status(status: &str, expires_at: DateTime<Utc>, now: DateTime<Utc>) -> &str {
    if status == "pending" && expires_at <= now {
        "expired"
    } else {
        status
    }
}

/// Simulated NPC consent: yes once the relationship is warm enough for this activity.
pub fn npc_answer(a: &Activity, affinity: i32, npc_name: &str) -> Result<(), String> {
    if affinity >= a.npc_affinity {
        Ok(())
    } else {
        Err(format!(
            "{npc_name} wants to get to know you a little better first. Keep talking."
        ))
    }
}

pub async fn list_activities() -> Json<ApiOk<Vec<ActivityInfo>>> {
    Json(ApiOk::new(
        ACTIVITIES
            .iter()
            .map(|a| ActivityInfo {
                id: a.id.into(),
                label: a.label.into(),
                description: a.description.into(),
                icon: a.icon.into(),
                cost: a.cost,
                venue: a.venue.into(),
            })
            .collect(),
    ))
}

const SELECT: &str = "select i.id, i.from_player, i.target_id, i.activity, i.cost, i.status, i.expires_at, i.created_at,
        i.room_id, i.note, fp.display_name as from_name, tp.display_name as target_name, d.status as date_status,
        e.id as encounter_id
     from invitations i
     join players fp on fp.id = i.from_player
     left join players tp on i.target_id = 'player:' || tp.id::text
     left join date_sessions d on d.id = i.id
     left join encounters e on e.room_id = i.room_id";

fn to_view(row: &PgRow, me: Uuid, now: DateTime<Utc>) -> InvitationView {
    let id: Uuid = row.get("id");
    let activity_id: String = row.get("activity");
    let a = activity(&activity_id);
    let target_id: String = row.get("target_id");
    let from_player: Uuid = row.get("from_player");
    let target_name: Option<String> = row.get("target_name");
    let status: String = row.get("status");
    let expires_at: DateTime<Utc> = row.get("expires_at");
    let date_status: Option<String> = row.get("date_status");
    InvitationView {
        id,
        label: a.map(|a| a.label).unwrap_or("Activity").into(),
        icon: a.map(|a| a.icon).unwrap_or("✨").into(),
        activity: activity_id,
        cost: row.get("cost"),
        from_player_id: from_player,
        from_name: row.get("from_name"),
        target_name: target_name.unwrap_or_else(|| {
            target_id
                .strip_prefix("npc:")
                .and_then(npcs::find)
                .map(|n| n.name.to_string())
                .unwrap_or_default()
        }),
        target_id,
        outgoing: from_player == me,
        status: effective_status(&status, expires_at, now).into(),
        expires_at,
        created_at: row.get("created_at"),
        date_id: date_status.is_some().then_some(id),
        date_status,
        room_id: row.get("room_id"),
        note: row.get("note"),
        encounter_id: row.get("encounter_id"),
    }
}

async fn load_view(state: &SharedState, id: Uuid, me: Uuid) -> Result<InvitationView, AppError> {
    let row = sqlx::query(&format!("{SELECT} where i.id = $1"))
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::not_found("invitation not found"))?;
    Ok(to_view(&row, me, Utc::now()))
}

/// Invitations between two players, oldest first, for the chat timeline.
pub async fn between(
    state: &SharedState,
    me: Uuid,
    other: Uuid,
) -> Result<Vec<InvitationView>, AppError> {
    let rows = sqlx::query(&format!(
        "{SELECT} where (i.from_player = $1 and i.target_id = $2) or (i.from_player = $3 and i.target_id = $4)
         order by i.created_at desc limit 20"
    ))
    .bind(me)
    .bind(format!("player:{other}"))
    .bind(other)
    .bind(format!("player:{me}"))
    .fetch_all(&state.db)
    .await?;
    let now = Utc::now();
    let mut list: Vec<_> = rows.iter().map(|r| to_view(r, me, now)).collect();
    list.reverse();
    Ok(list)
}

/// Incoming invitations still waiting for `me`, keyed by the sender's target id ("player:<uuid>").
pub async fn pending_for(
    state: &SharedState,
    me: Uuid,
) -> Result<HashMap<String, String>, AppError> {
    let rows = sqlx::query(
        "select from_player, activity from invitations
         where target_id = $1 and status = 'pending' and expires_at > now() order by created_at",
    )
    .bind(format!("player:{me}"))
    .fetch_all(&state.db)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let from: Uuid = r.get("from_player");
            let a: String = r.get("activity");
            (
                format!("player:{from}"),
                activity(&a)
                    .map(|a| a.label)
                    .unwrap_or("Activity")
                    .to_string(),
            )
        })
        .collect())
}

#[derive(Deserialize)]
pub struct CreateRequest {
    player_id: Uuid,
    target_id: String,
    activity: String,
    /// Dev/test only (ignored unless dev login is enabled): shorter expiry so smoke tests can see Expired.
    ttl_seconds: Option<i64>,
}

#[derive(Deserialize)]
pub struct RespondRequest {
    player_id: Uuid,
    action: String,
}

/// What happens on acceptance: start the date scene, or open a private room for the two of them.
async fn on_accept(
    state: &SharedState,
    id: Uuid,
    a: &Activity,
    from: Uuid,
    target: &str,
) -> Result<(), AppError> {
    match a.scene {
        Some(scene) => dates::start(state, id, scene, from, target).await,
        None => {
            let room_id = format!("private-{}", Uuid::new_v4());
            sqlx::query("insert into private_rooms (id, created_by, target_id, consent_state) values ($1, $2, $3, 'accepted')")
                .bind(&room_id)
                .bind(from)
                .bind(target)
                .execute(&state.db)
                .await?;
            sqlx::query("update invitations set room_id = $2 where id = $1")
                .bind(id)
                .bind(&room_id)
                .execute(&state.db)
                .await?;
            // Screen 13: the room holds an encounter that both still confirm inside.
            encounters::open(state, &room_id, from, target).await?;
            Ok(())
        }
    }
}

fn charge(cost: i32) -> life::LifeDelta {
    life::LifeDelta {
        money: -cost,
        ..Default::default()
    }
}

pub async fn create(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<CreateRequest>,
) -> Result<Json<ApiOk<InvitationView>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let a = activity(&req.activity).ok_or_else(|| AppError::bad_request("unknown activity"))?;
    let me = req.player_id;
    if hidden_targets(&state, me).await?.contains(&req.target_id) {
        return Err(AppError::not_found("profile not available"));
    }
    let id = Uuid::new_v4();

    if let Some(npc_id) = req.target_id.strip_prefix("npc:") {
        let npc = npcs::find(npc_id).ok_or_else(|| AppError::not_found("profile not available"))?;
        let affinity = chat::load_stats(&state, me, &req.target_id).await?.affinity;
        let answer = npc_answer(a, affinity, npc.name);
        if answer.is_ok() {
            life::apply(&state, me, charge(a.cost)).await?;
        }
        sqlx::query(
            "insert into invitations (id, from_player, target_id, activity, cost, status, expires_at, note)
             values ($1, $2, $3, $4, $5, $6, now(), $7)",
        )
        .bind(id)
        .bind(me)
        .bind(&req.target_id)
        .bind(a.id)
        .bind(a.cost)
        .bind(if answer.is_ok() { "accepted" } else { "declined" })
        .bind(answer.as_ref().err())
        .execute(&state.db)
        .await?;
        if answer.is_ok() {
            on_accept(&state, id, a, me, &req.target_id).await?;
        }
        publish_event(
            &state,
            "invitation.npc_answered",
            Some(me),
            Some(req.target_id.clone()),
            None,
            serde_json::json!({ "invitation_id": id, "activity": a.id, "accepted": answer.is_ok() }),
        )
        .await;
        return Ok(Json(ApiOk::new(load_view(&state, id, me).await?)));
    }

    let other = messages::parse_player_target(&req.target_id)?;
    messages::ensure_visible_matched(&state, me, other).await?;
    if let Some(avatar) = player_avatar(&state, other).await?
        && avatar.preferences.boundaries.iter().any(|b| b == a.id)
    {
        return Err(AppError::forbidden(&format!(
            "they aren't open to {} invitations",
            a.label.to_lowercase()
        )));
    }
    let pending: bool = sqlx::query_scalar(
        "select exists(select 1 from invitations where from_player = $1 and target_id = $2 and status = 'pending' and expires_at > now())",
    )
    .bind(me)
    .bind(&req.target_id)
    .fetch_one(&state.db)
    .await?;
    if pending {
        return Err(AppError::conflict(
            "you already have an invitation waiting with them",
        ));
    }
    let recently_declined: bool = sqlx::query_scalar(
        "select exists(select 1 from invitations where from_player = $1 and target_id = $2 and status = 'declined'
           and updated_at > now() - make_interval(mins => $3))",
    )
    .bind(me)
    .bind(&req.target_id)
    .bind(DECLINE_COOLDOWN_MINUTES as i32)
    .fetch_one(&state.db)
    .await?;
    if recently_declined {
        return Err(AppError::conflict(
            "they passed recently. Give it a little time.",
        ));
    }
    let cash = life::balance(&state, me).await?;
    if cash < a.cost {
        return Err(AppError::bad_request(&format!(
            "not enough cash: that costs {}, you have {}",
            life::naira(a.cost),
            life::naira(cash)
        )));
    }
    let ttl = match req.ttl_seconds {
        Some(s) if state.allow_dev_login => s.clamp(1, INVITE_TTL_SECS),
        _ => INVITE_TTL_SECS,
    };
    sqlx::query(
        "insert into invitations (id, from_player, target_id, activity, cost, expires_at) values ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(me)
    .bind(&req.target_id)
    .bind(a.id)
    .bind(a.cost)
    .bind(Utc::now() + Duration::seconds(ttl))
    .execute(&state.db)
    .await?;
    publish_event(
        &state,
        "invitation.sent",
        Some(me),
        Some(req.target_id.clone()),
        None,
        serde_json::json!({ "invitation_id": id, "activity": a.id, "cost": a.cost }),
    )
    .await;
    Ok(Json(ApiOk::new(load_view(&state, id, me).await?)))
}

pub async fn respond(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(req): Json<RespondRequest>,
) -> Result<Json<ApiOk<InvitationView>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let me = req.player_id;
    let current = load_view(&state, id, me).await?;
    let is_sender = current.from_player_id == me;
    let is_target = current.target_id == format!("player:{me}");
    let other = if is_sender {
        current.target_id.clone()
    } else {
        format!("player:{}", current.from_player_id)
    };
    if !(is_sender || is_target) || hidden_targets(&state, me).await?.contains(&other) {
        return Err(AppError::not_found("invitation not found"));
    }
    let next = match (req.action.as_str(), is_target) {
        ("accept", true) => "accepted",
        ("decline", true) => "declined",
        ("cancel", false) => "cancelled",
        ("accept" | "decline", false) => {
            return Err(AppError::forbidden(&format!(
                "only {} can answer this",
                current.target_name
            )));
        }
        ("cancel", true) => {
            return Err(AppError::forbidden(
                "only the sender can cancel. You can decline.",
            ));
        }
        _ => return Err(AppError::bad_request("unknown invitation action")),
    };
    let changed = sqlx::query(
        "update invitations set status = $2, updated_at = now() where id = $1 and status = 'pending' and expires_at > now()",
    )
    .bind(id)
    .bind(next)
    .execute(&state.db)
    .await?
    .rows_affected();
    if changed == 0 {
        return Err(AppError::conflict(&format!(
            "this invitation is already {}",
            current.status
        )));
    }
    if next == "accepted" {
        let a =
            activity(&current.activity).ok_or_else(|| AppError::bad_request("unknown activity"))?;
        // The sender pays on acceptance. Their balance is never shown to the person accepting.
        if life::apply(&state, current.from_player_id, charge(current.cost))
            .await
            .is_err()
        {
            sqlx::query(
                "update invitations set status = 'pending', updated_at = now() where id = $1",
            )
            .bind(id)
            .execute(&state.db)
            .await?;
            return Err(AppError::conflict(&format!(
                "{} can't cover this right now. The invitation is still open.",
                current.from_name
            )));
        }
        on_accept(&state, id, a, current.from_player_id, &current.target_id).await?;
    }
    publish_event(
        &state,
        &format!("invitation.{next}"),
        Some(me),
        Some(other),
        None,
        serde_json::json!({ "invitation_id": id, "activity": current.activity }),
    )
    .await;
    Ok(Json(ApiOk::new(load_view(&state, id, me).await?)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sidepiece_common::INVITATION_TYPES;

    #[test]
    fn activities_cover_every_boundary_type() {
        for t in INVITATION_TYPES {
            assert!(activity(t).is_some(), "{t} needs an activity");
        }
        for a in ACTIVITIES {
            assert!(
                INVITATION_TYPES.contains(&a.id),
                "{} must be a boundary type",
                a.id
            );
            assert!(
                a.scene.is_none_or(|s| dates::scene(s).is_some()),
                "{} scene exists",
                a.id
            );
            assert!(a.cost >= 0 && a.description.len() > 20);
        }
    }

    #[test]
    fn pending_expires_but_resolved_states_stick() {
        let now = Utc::now();
        let past = now - Duration::seconds(1);
        let future = now + Duration::seconds(60);
        assert_eq!(effective_status("pending", future, now), "pending");
        assert_eq!(effective_status("pending", past, now), "expired");
        assert_eq!(effective_status("accepted", past, now), "accepted");
        assert_eq!(effective_status("declined", past, now), "declined");
        assert_eq!(effective_status("cancelled", past, now), "cancelled");
    }

    #[test]
    fn npcs_need_more_trust_for_private() {
        let date = activity("public_date").unwrap();
        let private = activity("private_location").unwrap();
        assert!(npc_answer(date, 10, "Maya").is_err());
        assert!(npc_answer(date, 25, "Maya").is_ok());
        assert!(npc_answer(private, 30, "Maya").is_err());
        assert!(npc_answer(private, 40, "Maya").is_ok());
    }
}
