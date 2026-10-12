//! Outcomes and progression (spec Screens 14, 15 and 15A, ADR 0014).
//!
//! Every finished date or encounter writes one row per participant to `activity_rewards`. Its primary key
//! (activity, player) is what makes rewards one-time: a replayed request can't insert a second row, so it
//! can't pay twice. Stats are derived from that ledger: body count = unique encounter partners, total
//! encounters = all of them. Reputation and achievements are derived from the same records, never from
//! anything the client sends.

use super::{AppError, SharedState, chat, hidden_targets, life, publish_event, require_player};
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use serde::Deserialize;
use sidepiece_common::{
    AchievementView, ActivityOutcome, ApiOk, DiscoverableProfile, FEEDBACK_TAGS, FeedbackView,
    PlayerStats, PublicStats, ReputationPart, StatVisibility,
};
use sqlx::Row;
use std::collections::HashSet;
use uuid::Uuid;

/// Level titles (spec 15: "Level 8 · Rising Star"). Each applies from its level up to the next one.
pub const LEVEL_TITLES: &[(i32, &str)] = &[
    (1, "New in town"),
    (3, "Regular"),
    (6, "Rising Star"),
    (10, "Socialite"),
    (15, "Scene Setter"),
    (20, "Lagos Legend"),
];

/// (title, next title) for a level.
pub fn level_title(level: i32) -> (&'static str, Option<&'static str>) {
    let idx = LEVEL_TITLES
        .iter()
        .rposition(|(min, _)| level >= *min)
        .unwrap_or(0);
    (LEVEL_TITLES[idx].1, LEVEL_TITLES.get(idx + 1).map(|t| t.1))
}

pub struct Achievement {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub icon: &'static str,
    /// ₦ paid once on unlock (placeholder economy, needs client input).
    pub reward: i32,
}

const fn a(
    id: &'static str,
    label: &'static str,
    description: &'static str,
    icon: &'static str,
    reward: i32,
) -> Achievement {
    Achievement {
        id,
        label,
        description,
        icon,
        reward,
    }
}

/// Milestones earned through play. Deliberately none for body count: progression never requires
/// encounters (spec 13), and body count is a record, not a goal.
pub const ACHIEVEMENTS: &[Achievement] = &[
    a(
        "first_match",
        "First spark",
        "Match with someone",
        "💘",
        2_000,
    ),
    a("first_date", "First date", "Finish a date", "🌇", 3_000),
    a(
        "sparks_flew",
        "Sparks flew",
        "Meet a date's objective",
        "✨",
        3_000,
    ),
    a("night_owl", "Night owl", "Finish 5 dates", "🌙", 8_000),
    a(
        "after_hours",
        "After hours",
        "Complete a private encounter",
        "🔒",
        3_000,
    ),
    a(
        "good_company",
        "Good company",
        "Receive feedback 3 times",
        "💬",
        5_000,
    ),
    a(
        "inner_circle",
        "Inner circle",
        "Become Close Friends with someone",
        "🤝",
        5_000,
    ),
    a("rising_star", "Rising Star", "Reach level 6", "⭐", 10_000),
];

/// Everything stats, reputation and achievements are derived from.
#[derive(Debug, Default, Clone)]
pub struct Counts {
    pub dates: i64,
    pub sparks: i64,
    pub encounters: i64,
    pub body_count: i64,
    pub matches: i64,
    pub feedback_received: i64,
    /// Relationships at Friend (40) or above.
    pub friends: i64,
    /// Relationships at Close Friend (60) or above.
    pub close_friends: i64,
    pub level: i32,
}

/// (unique partners, total) from the partner of each qualifying completed encounter.
pub fn body_count<S: AsRef<str>>(partners: &[S]) -> (i64, i64) {
    let unique: HashSet<&str> = partners.iter().map(|p| p.as_ref()).collect();
    (unique.len() as i64, partners.len() as i64)
}

/// Achievement ids these counts have earned.
pub fn earned(c: &Counts) -> Vec<&'static str> {
    let rules: [(&str, bool); 8] = [
        ("first_match", c.matches >= 1),
        ("first_date", c.dates >= 1),
        ("sparks_flew", c.sparks >= 1),
        ("night_owl", c.dates >= 5),
        ("after_hours", c.encounters >= 1),
        ("good_company", c.feedback_received >= 3),
        ("inner_circle", c.close_friends >= 1),
        ("rising_star", c.level >= 6),
    ];
    rules
        .into_iter()
        .filter(|(_, ok)| *ok)
        .map(|(id, _)| id)
        .collect()
}

/// Social reputation on a 0-10 scale: a 5.0 base plus capped parts for showing up (finished activities),
/// how people felt (feedback received) and lasting connections. Nothing lowers it: leaving and declining
/// are never punished (ADR 0003).
pub fn reputation(c: &Counts) -> (f32, Vec<ReputationPart>) {
    let part = |label: &str, n: i64, each: f32, max: f32| ReputationPart {
        label: label.into(),
        value: (n as f32 * each).min(max),
        max,
    };
    let parts = vec![
        part(
            "Dates and encounters finished",
            c.dates + c.encounters,
            0.2,
            2.0,
        ),
        part("Feedback received", c.feedback_received, 0.3, 2.5),
        part("Friends made", c.friends, 0.1, 0.5),
    ];
    let score = 5.0 + parts.iter().map(|p| p.value).sum::<f32>();
    ((score * 10.0).round() / 10.0, parts)
}

pub async fn counts(state: &SharedState, player: Uuid) -> Result<Counts, AppError> {
    let ledger = sqlx::query(
        "select kind, partner_id, objective_met from activity_rewards where player_id = $1",
    )
    .bind(player)
    .fetch_all(&state.db)
    .await?;
    let mut c = Counts::default();
    let mut partners = Vec::new();
    for r in &ledger {
        match r.get::<String, _>("kind").as_str() {
            "date" => {
                c.dates += 1;
                c.sparks += i64::from(r.get::<bool, _>("objective_met"));
            }
            _ => partners.push(r.get::<String, _>("partner_id")),
        }
    }
    (c.body_count, c.encounters) = body_count(&partners);
    let target = format!("player:{player}");
    let row = sqlx::query(
        "select
           (select count(*) from matches where player_id = $1) as matches,
           (select count(*) from activity_feedback where to_actor = $2 and cardinality(tags) > 0) as feedback,
           (select count(*) from relationship_state where player_id = $1 and coalesce((stats->>'affinity')::int, 0) >= 40) as friends,
           (select count(*) from relationship_state where player_id = $1 and coalesce((stats->>'affinity')::int, 0) >= 60) as close_friends,
           (select xp from player_life where player_id = $1) as xp",
    )
    .bind(player)
    .bind(&target)
    .fetch_one(&state.db)
    .await?;
    c.matches = row.get("matches");
    c.feedback_received = row.get("feedback");
    c.friends = row.get("friends");
    c.close_friends = row.get("close_friends");
    c.level = life::level_for_xp(row.get::<Option<i32>, _>("xp").unwrap_or(0)).0;
    Ok(c)
}

/// Unlocks anything newly earned and pays its reward once (the insert decides). Returns the new labels.
pub async fn check_achievements(
    state: &SharedState,
    player: Uuid,
) -> Result<Vec<String>, AppError> {
    let c = counts(state, player).await?;
    let mut unlocked = Vec::new();
    for id in earned(&c) {
        let inserted = sqlx::query(
            "insert into achievements (player_id, achievement) values ($1, $2) on conflict do nothing",
        )
        .bind(player)
        .bind(id)
        .execute(&state.db)
        .await?
        .rows_affected();
        if inserted == 0 {
            continue;
        }
        let Some(ach) = ACHIEVEMENTS.iter().find(|x| x.id == id) else {
            continue;
        };
        life::apply(
            state,
            player,
            life::LifeDelta {
                money: ach.reward,
                ..Default::default()
            },
        )
        .await?;
        publish_event(
            state,
            "achievement.unlocked",
            Some(player),
            None,
            None,
            serde_json::json!({ "achievement": id, "label": ach.label, "reward": ach.reward }),
        )
        .await;
        unlocked.push(ach.label.to_string());
    }
    Ok(unlocked)
}

/// One participant's reward for a finished activity.
pub struct Grant<'a> {
    pub source_id: Uuid,
    pub player: Uuid,
    /// "date" or "encounter".
    pub kind: &'a str,
    pub partner: &'a str,
    pub label: &'a str,
    pub summary: &'a str,
    pub objective_met: bool,
    pub repeat: bool,
    /// Money, XP and needs. Zeroed for money/XP on a repeat by the caller.
    pub life: life::LifeDelta,
    pub affinity: i32,
}

/// Records and pays a reward exactly once per (activity, player). Returns false if it already existed.
pub async fn grant(state: &SharedState, g: Grant<'_>) -> Result<bool, AppError> {
    let before = reputation(&counts(state, g.player).await?).0;
    let inserted = sqlx::query(
        "insert into activity_rewards (source_id, player_id, kind, partner_id, label, summary, money, xp, affinity, objective_met, repeat)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) on conflict do nothing",
    )
    .bind(g.source_id)
    .bind(g.player)
    .bind(g.kind)
    .bind(g.partner)
    .bind(g.label)
    .bind(g.summary)
    .bind(g.life.money)
    .bind(g.life.xp)
    .bind(g.affinity)
    .bind(g.objective_met)
    .bind(g.repeat)
    .execute(&state.db)
    .await?
    .rows_affected();
    if inserted == 0 {
        return Ok(false);
    }
    life::apply(state, g.player, g.life).await?;
    let achievements = check_achievements(state, g.player).await?;
    let after = reputation(&counts(state, g.player).await?).0;
    sqlx::query(
        "update activity_rewards set reputation_delta = $3, achievements = $4 where source_id = $1 and player_id = $2",
    )
    .bind(g.source_id)
    .bind(g.player)
    .bind(after - before)
    .bind(&achievements)
    .execute(&state.db)
    .await?;
    Ok(true)
}

/// NPCs leave feedback straight away, warmer when the night went well (simulated, like their consent).
pub async fn npc_feedback(
    state: &SharedState,
    source_id: Uuid,
    npc: &str,
    player: Uuid,
    warm: bool,
) -> Result<(), AppError> {
    let tags: Vec<&str> = if warm {
        vec!["Great vibe", "Would meet again"]
    } else {
        vec!["Respectful"]
    };
    sqlx::query(
        "insert into activity_feedback (source_id, from_actor, to_actor, tags) values ($1, $2, $3, $4) on conflict do nothing",
    )
    .bind(source_id)
    .bind(npc)
    .bind(format!("player:{player}"))
    .bind(&tags)
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn feedback_tags(
    state: &SharedState,
    source_id: Uuid,
    from: &str,
) -> Result<Option<Vec<String>>, AppError> {
    Ok(sqlx::query_scalar(
        "select tags from activity_feedback where source_id = $1 and from_actor = $2",
    )
    .bind(source_id)
    .bind(from)
    .fetch_optional(&state.db)
    .await?)
}

/// The viewer's outcome card for a finished activity, if they were rewarded for it.
pub async fn outcome_for(
    state: &SharedState,
    source_id: Uuid,
    me: Uuid,
    partner_name: &str,
) -> Result<Option<ActivityOutcome>, AppError> {
    let Some(r) = sqlx::query(
        "select kind, partner_id, label, summary, money, xp, affinity, reputation_delta, objective_met, repeat, achievements
         from activity_rewards where source_id = $1 and player_id = $2",
    )
    .bind(source_id)
    .bind(me)
    .fetch_optional(&state.db)
    .await?
    else {
        return Ok(None);
    };
    let partner: String = r.get("partner_id");
    Ok(Some(ActivityOutcome {
        source_id,
        kind: r.get("kind"),
        label: r.get("label"),
        summary: r.get("summary"),
        partner_name: partner_name.into(),
        money: r.get("money"),
        xp: r.get("xp"),
        affinity: r.get("affinity"),
        reputation_delta: r.get("reputation_delta"),
        objective_met: r.get("objective_met"),
        repeat: r.get("repeat"),
        achievements: r.get("achievements"),
        my_feedback: feedback_tags(state, source_id, &format!("player:{me}")).await?,
        their_feedback: feedback_tags(state, source_id, &partner).await?,
        partner_id: partner,
    }))
}

pub async fn visibility(state: &SharedState, player: Uuid) -> Result<StatVisibility, AppError> {
    let value: Option<serde_json::Value> =
        sqlx::query_scalar("select stat_visibility from player_settings where player_id = $1")
            .bind(player)
            .fetch_optional(&state.db)
            .await?;
    Ok(value
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default())
}

/// What other players may see: only the stats this player made public. Cash is never included.
pub async fn public_stats(state: &SharedState, player: Uuid) -> Result<PublicStats, AppError> {
    let v = visibility(state, player).await?;
    let c = counts(state, player).await?;
    // Derived from the same rules as unlocking, so it's right even before their next check pays the reward.
    let unlocked = earned(&c).len() as i64;
    Ok(PublicStats {
        level: v.level.then_some(c.level),
        level_title: v.level.then(|| level_title(c.level).0.to_string()),
        reputation: v.reputation.then(|| reputation(&c).0),
        achievements: v.achievements.then_some(unlocked),
        body_count: v.body_count.then_some(c.body_count),
        encounters: v.encounters.then_some(c.encounters),
    })
}

/// Adds a player's public stats to their card; the rating shown is their reputation, or 0 if private.
pub async fn attach_public_stats(
    state: &SharedState,
    card: &mut DiscoverableProfile,
    player: Uuid,
) -> Result<(), AppError> {
    let stats = public_stats(state, player).await?;
    card.social_rating = stats.reputation.unwrap_or(0.0);
    card.stats = Some(stats);
    Ok(())
}

pub async fn get_stats(
    State(state): State<SharedState>,
    Path(player_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<ApiOk<PlayerStats>>, AppError> {
    require_player(&state, &headers, player_id)?;
    // Catches milestones reached outside an activity (a match, a level-up from chatting).
    check_achievements(&state, player_id).await?;
    let c = counts(&state, player_id).await?;
    let life = life::current(&state, player_id).await?;
    let (rep, parts) = reputation(&c);
    let (title, next) = level_title(life.level);
    let cash: (i64, i64) =
        sqlx::query_as("select cash_earned, cash_spent from player_life where player_id = $1")
            .bind(player_id)
            .fetch_one(&state.db)
            .await?;
    let unlocked: Vec<(String, chrono::DateTime<chrono::Utc>)> =
        sqlx::query_as("select achievement, unlocked_at from achievements where player_id = $1")
            .bind(player_id)
            .fetch_all(&state.db)
            .await?;
    let achievements = ACHIEVEMENTS
        .iter()
        .map(|x| AchievementView {
            id: x.id.into(),
            label: x.label.into(),
            description: x.description.into(),
            icon: x.icon.into(),
            reward: x.reward,
            unlocked_at: unlocked.iter().find(|u| u.0 == x.id).map(|u| u.1),
        })
        .collect();
    let hidden = hidden_targets(&state, player_id).await?;
    let feedback = sqlx::query(
        "select f.from_actor, f.tags, f.created_at, r.label, p.display_name
         from activity_feedback f
         join activity_rewards r on r.source_id = f.source_id and r.player_id = $1
         left join players p on f.from_actor = 'player:' || p.id::text
         where f.to_actor = $2 and cardinality(f.tags) > 0
         order by f.created_at desc limit 20",
    )
    .bind(player_id)
    .bind(format!("player:{player_id}"))
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .filter(|r| !hidden.contains(&r.get::<String, _>("from_actor")))
    .map(|r| {
        let from: String = r.get("from_actor");
        FeedbackView {
            from_name: r
                .get::<Option<String>, _>("display_name")
                .or_else(|| {
                    from.strip_prefix("npc:")
                        .and_then(super::npcs::find)
                        .map(|n| n.name.to_string())
                })
                .unwrap_or_else(|| "Someone".into()),
            activity: r.get("label"),
            tags: r.get("tags"),
            created_at: r.get("created_at"),
        }
    })
    .collect();
    Ok(Json(ApiOk::new(PlayerStats {
        level: life.level,
        level_title: title.into(),
        next_title: next.map(Into::into),
        xp: life.xp,
        xp_into_level: life.xp_into_level,
        xp_for_next: life.xp_for_next,
        money: life.money,
        cash_earned: cash.0,
        cash_spent: cash.1,
        reputation: rep,
        reputation_parts: parts,
        body_count: c.body_count,
        total_encounters: c.encounters,
        dates_completed: c.dates,
        matches: c.matches,
        connections: c.friends,
        achievements,
        feedback,
        visibility: visibility(&state, player_id).await?,
    })))
}

#[derive(Deserialize)]
pub struct VisibilityRequest {
    player_id: Uuid,
    visibility: StatVisibility,
}

pub async fn set_visibility(
    State(state): State<SharedState>,
    Path(player_id): Path<Uuid>,
    headers: HeaderMap,
    Json(req): Json<VisibilityRequest>,
) -> Result<Json<ApiOk<StatVisibility>>, AppError> {
    require_player(&state, &headers, player_id)?;
    if req.player_id != player_id {
        return Err(AppError::forbidden("token does not match player_id"));
    }
    sqlx::query(
        "insert into player_settings (player_id, stat_visibility) values ($1, $2)
         on conflict (player_id) do update set stat_visibility = excluded.stat_visibility, updated_at = now()",
    )
    .bind(player_id)
    .bind(serde_json::to_value(req.visibility)?)
    .execute(&state.db)
    .await?;
    Ok(Json(ApiOk::new(req.visibility)))
}

#[derive(Deserialize)]
pub struct FeedbackRequest {
    player_id: Uuid,
    tags: Vec<String>,
}

pub const MAX_FEEDBACK_TAGS: usize = 3;

/// Validates and de-duplicates feedback tags: 1-3 of `FEEDBACK_TAGS`.
pub fn clean_tags(tags: &[String]) -> Result<Vec<String>, String> {
    let mut seen = HashSet::new();
    let tags: Vec<String> = tags
        .iter()
        .filter(|t| seen.insert(t.as_str()))
        .cloned()
        .collect();
    if tags.is_empty() || tags.len() > MAX_FEEDBACK_TAGS {
        return Err(format!("pick 1 to {MAX_FEEDBACK_TAGS} tags, or skip"));
    }
    match tags.iter().find(|t| !FEEDBACK_TAGS.contains(&t.as_str())) {
        Some(bad) => Err(format!("unknown feedback: {bad}")),
        None => Ok(tags),
    }
}

/// Optional feedback on a finished activity (spec 14). Once per participant; rewards don't depend on it.
pub async fn give_feedback(
    State(state): State<SharedState>,
    Path(source_id): Path<Uuid>,
    headers: HeaderMap,
    Json(req): Json<FeedbackRequest>,
) -> Result<Json<ApiOk<ActivityOutcome>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let me = req.player_id;
    let partner: String = sqlx::query_scalar(
        "select partner_id from activity_rewards where source_id = $1 and player_id = $2",
    )
    .bind(source_id)
    .bind(me)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::not_found("activity not found"))?;
    if hidden_targets(&state, me).await?.contains(&partner) {
        return Err(AppError::not_found("activity not found"));
    }
    let tags = clean_tags(&req.tags).map_err(|e| AppError::bad_request(&e))?;
    let inserted = sqlx::query(
        "insert into activity_feedback (source_id, from_actor, to_actor, tags) values ($1, $2, $3, $4) on conflict do nothing",
    )
    .bind(source_id)
    .bind(format!("player:{me}"))
    .bind(&partner)
    .bind(&tags)
    .execute(&state.db)
    .await?
    .rows_affected();
    if inserted == 0 {
        return Err(AppError::conflict("you already left feedback"));
    }
    publish_event(
        &state,
        "feedback.given",
        Some(me),
        Some(partner.clone()),
        None,
        serde_json::json!({ "source_id": source_id, "tags": tags }),
    )
    .await;
    if let Ok(other) = super::messages::parse_player_target(&partner) {
        // Feedback can complete the partner's "Good company".
        check_achievements(&state, other).await?;
    }
    let name = partner_name(&state, &partner).await?;
    outcome_for(&state, source_id, me, &name)
        .await?
        .map(|o| Json(ApiOk::new(o)))
        .ok_or_else(|| AppError::not_found("activity not found"))
}

pub async fn partner_name(state: &SharedState, partner: &str) -> Result<String, AppError> {
    if let Some(id) = partner.strip_prefix("npc:") {
        return Ok(super::npcs::find(id)
            .map(|n| n.name.to_string())
            .unwrap_or_default());
    }
    let id = super::messages::parse_player_target(partner)?;
    Ok(
        sqlx::query_scalar("select display_name from players where id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?
            .unwrap_or_default(),
    )
}

/// Bumps the relationship after a shared activity (dates and encounters).
pub async fn bump_relationship(
    state: &SharedState,
    player: Uuid,
    target: &str,
    affinity: i32,
    warm: bool,
) -> Result<(), AppError> {
    let mut stats = chat::load_stats(state, player, target).await?;
    stats.affinity = (stats.affinity + affinity).clamp(0, 100);
    stats.trust = (stats.trust + 1).clamp(0, 100);
    stats.attraction = (stats.attraction + if warm { 3 } else { 1 }).clamp(0, 100);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn body_count_is_unique_partners() {
        // Spec 15: three encounters with the same person = body count 1, total 3.
        assert_eq!(body_count(&["player:a", "player:a", "player:a"]), (1, 3));
        assert_eq!(body_count(&["player:a", "npc:maya", "player:a"]), (2, 3));
        assert_eq!(body_count::<&str>(&[]), (0, 0));
    }

    #[test]
    fn titles_follow_levels() {
        assert_eq!(level_title(1), ("New in town", Some("Regular")));
        assert_eq!(level_title(8).0, "Rising Star");
        assert_eq!(level_title(40), ("Lagos Legend", None));
    }

    #[test]
    fn reputation_starts_at_five_and_is_capped() {
        assert_eq!(reputation(&Counts::default()).0, 5.0);
        let busy = Counts {
            dates: 50,
            encounters: 50,
            feedback_received: 50,
            friends: 50,
            ..Default::default()
        };
        assert_eq!(reputation(&busy).0, 10.0);
        let one_date = Counts {
            dates: 1,
            ..Default::default()
        };
        assert_eq!(reputation(&one_date).0, 5.2);
    }

    #[test]
    fn achievements_never_require_encounters_except_their_own() {
        // A player who only dates and socialises can earn everything but "After hours".
        let dater = Counts {
            dates: 5,
            sparks: 1,
            matches: 1,
            feedback_received: 3,
            close_friends: 1,
            level: 6,
            ..Default::default()
        };
        let got = earned(&dater);
        assert_eq!(got.len(), ACHIEVEMENTS.len() - 1);
        assert!(!got.contains(&"after_hours"));
        for id in got {
            assert!(ACHIEVEMENTS.iter().any(|x| x.id == id));
        }
        assert!(earned(&Counts::default()).is_empty());
    }

    #[test]
    fn feedback_tags_are_validated() {
        let t = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(clean_tags(&t(&[])).is_err());
        assert!(clean_tags(&t(&["Rude"])).is_err());
        assert_eq!(
            clean_tags(&t(&["Funny", "Funny", "Respectful"])).unwrap(),
            t(&["Funny", "Respectful"])
        );
        assert!(clean_tags(&t(&["Funny", "Respectful", "Great vibe", "Good listener"])).is_err());
    }
}
