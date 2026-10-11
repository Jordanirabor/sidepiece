//! Date / shared scenes (spec Screen 12, ADR 0013).
//!
//! A date is three short beats. Each beat shows a prompt and three response choices; each participant picks
//! one and the beat resolves once both have (an NPC partner picks straight away). Choices move a shared
//! chemistry meter toward the scene's objective. Either side can leave at any time. Completion grants XP and
//! relationship affinity exactly once (the beat-advancing update only succeeds for one request).

use super::{
    AppError, SharedState, chat, hidden_targets, life, messages, npcs, publish_event,
    require_player,
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use chrono::{DateTime, Duration, Utc};
use serde::Deserialize;
use sidepiece_common::{ApiOk, AvatarLook, DateLine, DateOutcome, DateView, RelationshipStats};
use sqlx::Row;
use std::collections::HashMap;
use uuid::Uuid;

/// A partner who hasn't polled the date for this long is shown as "dropped off" (neutral recovery).
const PRESENCE_TIMEOUT_SECS: i64 = 25;

pub struct Choice {
    pub text: &'static str,
    pub delta: i32,
}

pub struct Beat {
    /// `{partner}` is replaced with the partner's name for each viewer.
    pub prompt: &'static str,
    pub choices: [Choice; 3],
}

pub struct SceneScript {
    pub id: &'static str,
    pub title: &'static str,
    pub venue: &'static str,
    pub objective: &'static str,
    /// Chemistry needed to meet the objective (two people, three beats).
    pub goal: i32,
    pub beats: &'static [Beat],
}

const fn c(text: &'static str, delta: i32) -> Choice {
    Choice { text, delta }
}

pub const SCENES: &[SceneScript] = &[
    SceneScript {
        id: "rooftop_dinner",
        title: "Rooftop date",
        venue: "rooftop_party",
        objective: "Build the chemistry before the night winds down",
        goal: 9,
        beats: &[
            Beat {
                prompt: "Your table is by the rail. The link bridge glows over the lagoon, and {partner} catches your eye.",
                choices: [
                    c("“This view is unreal. Glad I'm seeing it with you.”", 3),
                    c("“So… come here often?”", 1),
                    c("Check your phone for a second.", -2),
                ],
            },
            Beat {
                prompt: "Small chops arrive: suya, puff-puff, peppered snail. The DJ slides into an Afrobeats set.",
                choices: [
                    c(
                        "“Tell me the best thing that happened to you this week.”",
                        3,
                    ),
                    c("“I'd rate this suya a solid seven.”", 1),
                    c("Talk about your ex for a while.", -2),
                ],
            },
            Beat {
                prompt: "A breeze comes off the water. The night is nearly over.",
                choices: [
                    c("“I'd really like to do this again.”", 3),
                    c("“Same time next week? Your treat.”", 2),
                    c("“Anyway, early morning tomorrow.”", -1),
                ],
            },
        ],
    },
    SceneScript {
        id: "lounge_booth",
        title: "Lounge night",
        venue: "neon_lounge",
        objective: "Find your rhythm before last call",
        goal: 9,
        beats: &[
            Beat {
                prompt: "You grab a high table near the bar at Ikoyi Lounge. The bass is low enough to talk. {partner} leans in.",
                choices: [
                    c("“You look good under neon.”", 3),
                    c("“Okay, what are we drinking? My shout.”", 2),
                    c("“It's so loud in here.”", -1),
                ],
            },
            Beat {
                prompt: "The DJ asks the room for requests.",
                choices: [
                    c("Request their favourite song.", 3),
                    c("Request yours and sing along, badly.", 2),
                    c("Stay quiet and scroll the menu.", -1),
                ],
            },
            Beat {
                prompt: "Last call. The lights go warm.",
                choices: [
                    c("“One dance before we go?”", 3),
                    c("“Let me walk you out.”", 2),
                    c("Head off without saying bye.", -3),
                ],
            },
        ],
    },
];

pub fn scene(id: &str) -> Option<&'static SceneScript> {
    SCENES.iter().find(|s| s.id == id)
}

/// How an NPC partner answers: warmer once you're friends.
pub fn npc_pick(affinity: i32) -> usize {
    if affinity >= 40 { 0 } else { 1 }
}

/// Outcome and one-time rewards for a finished date. Dates are a full progression path on their own (spec 13).
pub fn outcome(chemistry: i32, goal: i32) -> DateOutcome {
    let (label, summary, xp, affinity) = if chemistry >= goal {
        (
            "Sparks flew",
            "You were both fully there. This one's going somewhere.",
            35,
            8,
        )
    } else if chemistry * 2 >= goal {
        ("A good night", "Easy company and a few real laughs.", 20, 4)
    } else {
        (
            "Just friends tonight",
            "Not every night clicks, and that's fine.",
            10,
            1,
        )
    };
    DateOutcome {
        label: label.into(),
        summary: summary.into(),
        xp,
        affinity,
        objective_met: chemistry >= goal,
    }
}

/// Creates the date when an invitation is accepted. The date id is the invitation id.
pub async fn start(
    state: &SharedState,
    invitation_id: Uuid,
    scene_id: &str,
    host: Uuid,
    guest: &str,
) -> Result<(), AppError> {
    sqlx::query(
        "insert into date_sessions (id, scene, host_id, guest_id) values ($1, $2, $3, $4) on conflict (id) do nothing",
    )
    .bind(invitation_id)
    .bind(scene_id)
    .bind(host)
    .bind(guest)
    .execute(&state.db)
    .await?;
    publish_event(
        state,
        "date.started",
        Some(host),
        Some(guest.to_string()),
        None,
        serde_json::json!({ "date_id": invitation_id, "scene": scene_id }),
    )
    .await;
    Ok(())
}

#[derive(Deserialize)]
pub struct PlayerQuery {
    player_id: Uuid,
}

#[derive(Deserialize)]
pub struct ChooseRequest {
    player_id: Uuid,
    beat: i32,
    choice: i32,
}

#[derive(Deserialize)]
pub struct LeaveRequest {
    player_id: Uuid,
}

struct DateRow {
    id: Uuid,
    scene: &'static SceneScript,
    host_id: Uuid,
    guest_id: String,
    beat: i32,
    chemistry: i32,
    status: String,
    left_by: Option<String>,
    host_seen_at: DateTime<Utc>,
    guest_seen_at: DateTime<Utc>,
}

impl DateRow {
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

async fn load(state: &SharedState, id: Uuid) -> Result<DateRow, AppError> {
    let row = sqlx::query(
        "select id, scene, host_id, guest_id, beat, chemistry, status, left_by, host_seen_at, guest_seen_at
         from date_sessions where id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::not_found("date not found"))?;
    let scene_id: String = row.get("scene");
    Ok(DateRow {
        id: row.get("id"),
        scene: scene(&scene_id).ok_or_else(|| AppError::not_found("date not found"))?,
        host_id: row.get("host_id"),
        guest_id: row.get("guest_id"),
        beat: row.get("beat"),
        chemistry: row.get("chemistry"),
        status: row.get("status"),
        left_by: row.get("left_by"),
        host_seen_at: row.get("host_seen_at"),
        guest_seen_at: row.get("guest_seen_at"),
    })
}

/// Loads the date for a participant. Strangers and blocked pairs get a 404.
async fn load_for(
    state: &SharedState,
    id: Uuid,
    me: Uuid,
) -> Result<(DateRow, String, String, bool), AppError> {
    let row = load(state, id).await?;
    let (mine, partner, host) = row
        .sides(me)
        .ok_or_else(|| AppError::not_found("date not found"))?;
    if hidden_targets(state, me).await?.contains(&partner) {
        return Err(AppError::not_found("date not found"));
    }
    Ok((row, mine, partner, host))
}

async fn partner_identity(
    state: &SharedState,
    partner: &str,
) -> Result<(String, String, Option<AvatarLook>), AppError> {
    if let Some(npc_id) = partner.strip_prefix("npc:") {
        let npc = npcs::find(npc_id).ok_or_else(|| AppError::not_found("date not found"))?;
        return Ok((npc.name.into(), "npc".into(), Some(npc.look())));
    }
    let (name, look) =
        messages::player_name_look(state, messages::parse_player_target(partner)?).await?;
    Ok((name, "player".into(), look))
}

async fn view(
    state: &SharedState,
    row: &DateRow,
    mine: &str,
    partner: &str,
    host: bool,
) -> Result<DateView, AppError> {
    let (partner_name, partner_kind, partner_look) = partner_identity(state, partner).await?;
    let picks: HashMap<(String, i32), i32> =
        sqlx::query("select actor, beat, choice from date_choices where date_id = $1")
            .bind(row.id)
            .fetch_all(&state.db)
            .await?
            .into_iter()
            .map(|r| ((r.get("actor"), r.get("beat")), r.get("choice")))
            .collect();
    let script = row.scene;
    let prompt_for = |b: &Beat| b.prompt.replace("{partner}", &partner_name);
    let text = |beat: i32, actor: &str| {
        picks
            .get(&(actor.to_string(), beat))
            .and_then(|&c| script.beats.get(beat as usize)?.choices.get(c as usize))
            .map(|c| c.text.to_string())
    };
    let history = (0..row.beat.min(script.beats.len() as i32))
        .map(|b| {
            let beat = &script.beats[b as usize];
            let delta = [mine, partner]
                .iter()
                .filter_map(|a| picks.get(&(a.to_string(), b)))
                .filter_map(|&c| beat.choices.get(c as usize))
                .map(|c| c.delta)
                .sum();
            DateLine {
                beat: b,
                prompt: prompt_for(beat),
                mine: text(b, mine).unwrap_or_default(),
                theirs: text(b, partner).unwrap_or_default(),
                delta,
            }
        })
        .collect();
    let current = script.beats.get(row.beat as usize);
    let partner_seen = if host {
        row.guest_seen_at
    } else {
        row.host_seen_at
    };
    Ok(DateView {
        id: row.id,
        scene: script.id.into(),
        title: script.title.into(),
        venue: script.venue.into(),
        objective: script.objective.into(),
        partner_id: partner.into(),
        partner_name: partner_name.clone(),
        partner_present: partner_kind == "npc"
            || Utc::now() - partner_seen < Duration::seconds(PRESENCE_TIMEOUT_SECS),
        partner_kind,
        partner_look,
        beat: row.beat,
        beats_total: script.beats.len() as i32,
        prompt: current.map(prompt_for).unwrap_or_default(),
        choices: current
            .map(|b| b.choices.iter().map(|c| c.text.to_string()).collect())
            .unwrap_or_default(),
        my_choice: picks.get(&(mine.to_string(), row.beat)).copied(),
        partner_ready: picks.contains_key(&(partner.to_string(), row.beat)),
        chemistry: row.chemistry,
        chemistry_goal: script.goal,
        history,
        status: row.status.clone(),
        left_by_me: row.left_by.as_deref() == Some(mine),
        outcome: (row.status == "completed").then(|| outcome(row.chemistry, script.goal)),
    })
}

pub async fn get_date(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Query(q): Query<PlayerQuery>,
) -> Result<Json<ApiOk<DateView>>, AppError> {
    require_player(&state, &headers, q.player_id)?;
    let (row, mine, partner, host) = load_for(&state, id, q.player_id).await?;
    // Polling the date is the presence heartbeat.
    let column = if host {
        "host_seen_at"
    } else {
        "guest_seen_at"
    };
    sqlx::query(&format!(
        "update date_sessions set {column} = now() where id = $1"
    ))
    .bind(id)
    .execute(&state.db)
    .await?;
    Ok(Json(ApiOk::new(
        view(&state, &row, &mine, &partner, host).await?,
    )))
}

pub async fn choose(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(req): Json<ChooseRequest>,
) -> Result<Json<ApiOk<DateView>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let (row, mine, partner, host) = load_for(&state, id, req.player_id).await?;
    if row.status != "active" {
        return Err(AppError::conflict("this date has ended"));
    }
    if req.beat != row.beat {
        return Err(AppError::conflict("that moment has passed"));
    }
    let beat = &row.scene.beats[row.beat as usize];
    let choice = beat
        .choices
        .get(usize::try_from(req.choice).unwrap_or(usize::MAX))
        .ok_or_else(|| AppError::bad_request("pick one of the options"))?;
    let inserted = sqlx::query(
        "insert into date_choices (date_id, actor, beat, choice, delta) values ($1, $2, $3, $4, $5) on conflict do nothing",
    )
    .bind(id)
    .bind(&mine)
    .bind(row.beat)
    .bind(req.choice)
    .bind(choice.delta)
    .execute(&state.db)
    .await?
    .rows_affected();
    if inserted == 0 {
        return Err(AppError::conflict("you already chose"));
    }
    if partner.starts_with("npc:") {
        let affinity = chat::load_stats(&state, req.player_id, &partner)
            .await?
            .affinity;
        let pick = npc_pick(affinity);
        sqlx::query(
            "insert into date_choices (date_id, actor, beat, choice, delta) values ($1, $2, $3, $4, $5) on conflict do nothing",
        )
        .bind(id)
        .bind(&partner)
        .bind(row.beat)
        .bind(pick as i32)
        .bind(beat.choices[pick].delta)
        .execute(&state.db)
        .await?;
    }

    let picked = sqlx::query("select delta from date_choices where date_id = $1 and beat = $2")
        .bind(id)
        .bind(row.beat)
        .fetch_all(&state.db)
        .await?;
    if picked.len() >= 2 {
        let sum: i32 = picked.iter().map(|r| r.get::<i32, _>("delta")).sum();
        // Only one request can move the beat on, so completion (and its rewards) happens exactly once.
        let advanced = sqlx::query(
            "update date_sessions set beat = beat + 1, chemistry = chemistry + $3,
               status = case when beat + 1 >= $4 then 'completed' else status end,
               completed_at = case when beat + 1 >= $4 then now() else completed_at end
             where id = $1 and beat = $2 and status = 'active'
             returning status, chemistry",
        )
        .bind(id)
        .bind(row.beat)
        .bind(sum)
        .bind(row.scene.beats.len() as i32)
        .fetch_optional(&state.db)
        .await?;
        if let Some(done) = advanced
            && done.get::<String, _>("status") == "completed"
        {
            reward(&state, &row, done.get("chemistry")).await?;
        }
    }
    let row = load(&state, id).await?;
    Ok(Json(ApiOk::new(
        view(&state, &row, &mine, &partner, host).await?,
    )))
}

async fn bump_relationship(
    state: &SharedState,
    player: Uuid,
    target: &str,
    affinity: i32,
    sparks: bool,
) -> Result<(), AppError> {
    let mut stats: RelationshipStats = chat::load_stats(state, player, target).await?;
    stats.affinity = (stats.affinity + affinity).clamp(0, 100);
    stats.trust = (stats.trust + 1).clamp(0, 100);
    stats.attraction = (stats.attraction + if sparks { 3 } else { 1 }).clamp(0, 100);
    sqlx::query(
        "insert into relationship_state (player_id, target_id, stats) values ($1, $2, $3)
         on conflict (player_id, target_id) do update set stats = excluded.stats, updated_at = now()",
    )
    .bind(player)
    .bind(target)
    .bind(serde_json::to_value(&stats)?)
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn reward(state: &SharedState, row: &DateRow, chemistry: i32) -> Result<(), AppError> {
    let out = outcome(chemistry, row.scene.goal);
    let delta = life::LifeDelta {
        xp: out.xp,
        mood: 10.0,
        social: 12.0,
        love: if out.objective_met { 6.0 } else { 2.0 },
        ..Default::default()
    };
    let mut players = vec![(row.host_id, row.guest_id.clone())];
    if let Ok(guest) = messages::parse_player_target(&row.guest_id) {
        players.push((guest, format!("player:{}", row.host_id)));
    }
    for (player, other) in players {
        life::apply(state, player, delta).await?;
        bump_relationship(state, player, &other, out.affinity, out.objective_met).await?;
    }
    publish_event(
        state,
        "date.completed",
        Some(row.host_id),
        Some(row.guest_id.clone()),
        None,
        serde_json::json!({ "date_id": row.id, "scene": row.scene.id, "chemistry": chemistry, "outcome": out.label }),
    )
    .await;
    Ok(())
}

/// Leave at any time (spec 12: "A visible Leave button"). Idempotent; no penalty for either side.
pub async fn leave(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(req): Json<LeaveRequest>,
) -> Result<Json<ApiOk<DateView>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let (_, mine, partner, host) = load_for(&state, id, req.player_id).await?;
    let left = sqlx::query(
        "update date_sessions set status = 'left', left_by = $2 where id = $1 and status = 'active'",
    )
    .bind(id)
    .bind(&mine)
    .execute(&state.db)
    .await?
    .rows_affected();
    if left > 0 {
        publish_event(
            &state,
            "date.left",
            Some(req.player_id),
            Some(partner.clone()),
            None,
            serde_json::json!({ "date_id": id }),
        )
        .await;
    }
    let row = load(&state, id).await?;
    Ok(Json(ApiOk::new(
        view(&state, &row, &mine, &partner, host).await?,
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scenes_are_short_with_three_choices() {
        for s in SCENES {
            assert!(
                (2..=4).contains(&s.beats.len()),
                "{} should stay short",
                s.id
            );
            let best: i32 = s
                .beats
                .iter()
                .map(|b| b.choices.iter().map(|c| c.delta).max().unwrap() * 2)
                .sum();
            assert!(s.goal <= best, "{} goal must be reachable", s.id);
            for b in s.beats {
                // Every beat has a warm, an okay and a misstep option.
                assert!(
                    b.choices.iter().any(|c| c.delta > 0) && b.choices.iter().any(|c| c.delta < 0)
                );
            }
        }
    }

    #[test]
    fn outcome_tiers_follow_chemistry() {
        assert!(outcome(9, 9).objective_met);
        assert_eq!(outcome(12, 9).label, "Sparks flew");
        assert_eq!(outcome(5, 9).label, "A good night");
        assert_eq!(outcome(4, 9).label, "Just friends tonight");
        assert!(outcome(12, 9).xp > outcome(5, 9).xp && outcome(5, 9).xp > outcome(0, 9).xp);
        // A rough date still gives a little: dates are never a punishment path.
        assert!(outcome(-6, 9).xp > 0 && outcome(-6, 9).affinity >= 0);
    }

    #[test]
    fn npc_warms_up_with_affinity() {
        assert_eq!(npc_pick(10), 1);
        assert_eq!(npc_pick(60), 0);
    }

    #[test]
    fn sides_identify_participants_only() {
        let host = Uuid::new_v4();
        let guest = Uuid::new_v4();
        let row = DateRow {
            id: Uuid::new_v4(),
            scene: &SCENES[0],
            host_id: host,
            guest_id: format!("player:{guest}"),
            beat: 0,
            chemistry: 0,
            status: "active".into(),
            left_by: None,
            host_seen_at: Utc::now(),
            guest_seen_at: Utc::now(),
        };
        assert_eq!(row.sides(host).unwrap().1, format!("player:{guest}"));
        assert_eq!(row.sides(guest).unwrap().1, format!("player:{host}"));
        assert!(row.sides(Uuid::new_v4()).is_none());
    }
}
