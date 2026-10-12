//! Feed (spec Screen 16, ADR 0015): a lightweight, personal view of what happened in your Lagos.
//!
//! Built from `game_event_audit` (written by the event worker from NATS). Only events this player took part in
//! become items, so nobody's dates, encounters or achievements leak to anyone else. Authored world posts (NPC
//! updates, venue announcements) rotate once per game day (one real hour). Every item links somewhere.

use super::{AppError, SharedState, hidden_targets, invites, npcs, progress, require_player};
use axum::{
    Json,
    extract::{Query, State},
    http::HeaderMap,
};
use chrono::{DateTime, Duration, DurationRound, Utc};
use serde::Deserialize;
use sidepiece_common::{ApiOk, FeedItem, FeedResponse};
use sqlx::Row;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

/// Events that can become feed items.
const EVENT_TYPES: &[&str] = &[
    "social.match",
    "invitation.sent",
    "invitation.accepted",
    "invitation.declined",
    "invitation.npc_answered",
    "date.completed",
    "encounter.completed",
    "achievement.unlocked",
    "player.level_up",
    "feedback.given",
];
const DEFAULT_LIMIT: i64 = 40;
const MAX_LIMIT: i64 = 100;

/// One audit row, as the mapper sees it.
pub struct Event<'a> {
    pub event_type: &'a str,
    pub player_id: Option<Uuid>,
    pub target_id: Option<&'a str>,
    pub payload: &'a serde_json::Value,
}

/// A feed item before names are filled in: `{name}` in title/body is the other side.
#[derive(Debug, PartialEq)]
pub struct Draft {
    pub kind: &'static str,
    pub icon: &'static str,
    pub title: String,
    pub body: String,
    /// Other participant ("player:<uuid>" / "npc:<id>"), if any.
    pub other: Option<String>,
    pub action_label: &'static str,
    /// What the client opens: "chat:<target>", "npc:<id>", "stats", "venue:<kind>".
    pub action: String,
}

fn activity_label(payload: &serde_json::Value) -> String {
    payload["activity"]
        .as_str()
        .and_then(invites::activity)
        .map(|a| a.label)
        .unwrap_or("plans")
        .to_string()
}

/// Where "Open chat" goes for this partner: DMs for players, NPC chat for locals.
fn chat_action(other: &str) -> String {
    match other.strip_prefix("npc:") {
        Some(id) => format!("npc:{id}"),
        None => format!("chat:{other}"),
    }
}

/// Turns an event into this player's feed item, or `None` if it isn't theirs to see (or isn't worth a line).
pub fn describe(ev: &Event, me: Uuid) -> Option<Draft> {
    let me_actor = format!("player:{me}");
    let mine = ev.player_id == Some(me);
    let at_me = ev.target_id == Some(me_actor.as_str());
    if !mine && !at_me {
        return None;
    }
    // The other side: the target when I acted, the actor when it was aimed at me.
    let other = if mine {
        ev.target_id.map(str::to_string)
    } else {
        ev.player_id.map(|p| format!("player:{p}"))
    };
    let d = |kind, icon, title: String, body: String, label, action: String| Draft {
        kind,
        icon,
        title,
        body,
        other: other.clone(),
        action_label: label,
        action,
    };
    let p = ev.payload;
    match ev.event_type {
        "social.match" => {
            let o = other.clone()?;
            Some(d(
                "match",
                "💘",
                "You matched with {name}".into(),
                "Say hi before the night ends.".into(),
                "Open chat",
                chat_action(&o),
            ))
        }
        "invitation.sent" if at_me => Some(d(
            "invitation",
            "💌",
            format!("{{name}} invited you: {}", activity_label(p)),
            "Accept or decline in your chat. No pressure either way.".into(),
            "See invitation",
            chat_action(other.as_deref()?),
        )),
        "invitation.accepted" if at_me => Some(d(
            "invitation",
            "🥂",
            format!("{{name}} said yes to {}", activity_label(p)),
            "Your plans are on.".into(),
            "Open chat",
            chat_action(other.as_deref()?),
        )),
        "invitation.declined" if at_me => Some(d(
            "invitation",
            "🌙",
            format!("{{name}} passed on {} this time", activity_label(p)),
            "No hard feelings. The chat is still open.".into(),
            "Open chat",
            chat_action(other.as_deref()?),
        )),
        "invitation.npc_answered" if mine && p["accepted"].as_bool() == Some(true) => Some(d(
            "invitation",
            "🥂",
            format!("{{name}} said yes to {}", activity_label(p)),
            "Locals remember who treats them well.".into(),
            "Chat",
            chat_action(other.as_deref()?),
        )),
        "date.completed" => Some(d(
            "date",
            "🌇",
            "Date with {name}".into(),
            p["outcome"].as_str().unwrap_or("Date complete").to_string(),
            "Open chat",
            chat_action(other.as_deref()?),
        )),
        "encounter.completed" => Some(d(
            "encounter",
            "🔒",
            "A private night with {name}".into(),
            "Only you can see this.".into(),
            "Your stats",
            "stats".into(),
        )),
        "achievement.unlocked" if mine => Some(Draft {
            kind: "achievement",
            icon: "🏆",
            title: format!(
                "Achievement unlocked: {}",
                p["label"].as_str().unwrap_or("New milestone")
            ),
            body: match p["reward"].as_i64() {
                Some(r) if r > 0 => {
                    format!("+{} added to your cash.", super::life::naira(r as i32))
                }
                _ => "Nice one.".into(),
            },
            other: None,
            action_label: "See achievements",
            action: "stats".into(),
        }),
        "player.level_up" if mine => {
            let level = p["level"].as_i64().unwrap_or(1) as i32;
            Some(Draft {
                kind: "level",
                icon: "⭐",
                title: format!("Level {level}"),
                body: format!("You're now: {}.", progress::level_title(level).0),
                other: None,
                action_label: "Your stats",
                action: "stats".into(),
            })
        }
        "feedback.given" if at_me => {
            let tags: Vec<&str> = p["tags"]
                .as_array()
                .map(|a| a.iter().filter_map(|t| t.as_str()).collect())
                .unwrap_or_default();
            Some(d(
                "feedback",
                "💬",
                "{name} left you feedback".into(),
                if tags.is_empty() {
                    "Kind words.".into()
                } else {
                    tags.join(" · ")
                },
                "Rating history",
                "stats".into(),
            ))
        }
        _ => None,
    }
}

/// Authored world posts: NPC updates and venue announcements (spec 16). `{venue}` is filled from the venue.
struct WorldPost {
    npc: Option<&'static str>,
    venue: &'static str,
    text: &'static str,
}

const fn post(npc: Option<&'static str>, venue: &'static str, text: &'static str) -> WorldPost {
    WorldPost { npc, venue, text }
}

const WORLD_POSTS: &[WorldPost] = &[
    post(
        None,
        "neon_lounge",
        "Amapiano night at {venue}. The DJ goes on at ten.",
    ),
    post(
        None,
        "rooftop_party",
        "Clear skies over the lagoon. {venue} is filling up.",
    ),
    post(
        Some("maya"),
        "neon_lounge",
        "Saving a seat at the bar. Who's coming through?",
    ),
    post(
        Some("dre"),
        "neon_lounge",
        "New cocktail on the menu. I need a second opinion.",
    ),
    post(
        Some("zara"),
        "rooftop_party",
        "Sunset was unreal. Staying for the night set.",
    ),
    post(
        Some("kai"),
        "rooftop_party",
        "Suya stand just opened by the stairs. You're welcome.",
    ),
    post(
        None,
        "city",
        "Lekki traffic finally cleared. Good night to head out.",
    ),
    post(
        None,
        "neon_lounge",
        "Ladies' night at {venue}: half-price small chops till midnight.",
    ),
    post(
        None,
        "quilox",
        "Ozumba Mbadiwe is packed. {venue} has a queue round the block.",
    ),
    post(
        None,
        "moist_beach",
        "Bonfire on the sand at {venue}. Amapiano till the tide comes in.",
    ),
    post(
        None,
        "bay_lounge",
        "Lagoon breeze and a live band at {venue} tonight.",
    ),
    post(
        None,
        "stage_lagos",
        "Drummers and dancers on stage at {venue} from eleven.",
    ),
];

/// Two posts per game day (one real hour), rotating through the list.
fn world_posts(now: DateTime<Utc>) -> Vec<FeedItem> {
    let hour_start = now.duration_trunc(Duration::hours(1)).unwrap_or(now);
    let slot = (hour_start.timestamp() / 3600) as usize;
    (0..2)
        .map(|i| {
            let idx = (slot * 2 + i) % WORLD_POSTS.len();
            let p = &WORLD_POSTS[idx];
            let venue_name = super::room_display_name(p.venue);
            let text = p.text.replace("{venue}", venue_name);
            let (kind, icon, title, label, action) = match p.npc.and_then(npcs::find) {
                Some(n) => (
                    "npc",
                    "📣",
                    format!("{} · {}", n.name, venue_name),
                    "Chat",
                    format!("npc:{}", n.id),
                ),
                None => (
                    "venue",
                    "🎶",
                    venue_name.to_string(),
                    "Go there",
                    format!("venue:{}", p.venue),
                ),
            };
            FeedItem {
                id: format!("world-{slot}-{i}"),
                kind: kind.into(),
                icon: icon.into(),
                title,
                body: text,
                at: hour_start - Duration::seconds(i as i64),
                action_label: Some(label.into()),
                action: Some(action),
                new: false,
            }
        })
        .collect()
}

async fn names(
    state: &SharedState,
    actors: &HashSet<String>,
) -> Result<HashMap<String, String>, AppError> {
    let mut out = HashMap::new();
    let mut ids = Vec::new();
    for a in actors {
        if let Some(id) = a.strip_prefix("npc:") {
            if let Some(n) = npcs::find(id) {
                out.insert(a.clone(), n.name.to_string());
            }
        } else if let Some(id) = a
            .strip_prefix("player:")
            .and_then(|s| Uuid::parse_str(s).ok())
        {
            ids.push(id);
        }
    }
    let rows = sqlx::query("select id, display_name from players where id = any($1)")
        .bind(&ids)
        .fetch_all(&state.db)
        .await?;
    for r in rows {
        out.insert(
            format!("player:{}", r.get::<Uuid, _>("id")),
            r.get("display_name"),
        );
    }
    Ok(out)
}

async fn seen_at(state: &SharedState, me: Uuid) -> Result<Option<DateTime<Utc>>, AppError> {
    Ok(sqlx::query_scalar::<_, Option<DateTime<Utc>>>(
        "select feed_seen_at from player_settings where player_id = $1",
    )
    .bind(me)
    .fetch_optional(&state.db)
    .await?
    .flatten())
}

#[derive(Deserialize)]
pub struct FeedQuery {
    player_id: Uuid,
    limit: Option<i64>,
}

pub async fn get_feed(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(q): Query<FeedQuery>,
) -> Result<Json<ApiOk<FeedResponse>>, AppError> {
    require_player(&state, &headers, q.player_id)?;
    let me = q.player_id;
    let limit = q.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let rows = sqlx::query(
        "select id, event_type, player_id, target_id, payload, event_timestamp from game_event_audit
         where event_type = any($1) and (player_id = $2 or target_id = $3)
         order by event_timestamp desc limit $4",
    )
    .bind(EVENT_TYPES)
    .bind(me)
    .bind(format!("player:{me}"))
    // Some events don't become items; read a little extra so the page stays full.
    .bind(limit * 2)
    .fetch_all(&state.db)
    .await?;
    let hidden = hidden_targets(&state, me).await?;
    let mut drafts = Vec::new();
    for r in &rows {
        let payload: serde_json::Value = r.get("payload");
        let target: Option<String> = r.get("target_id");
        let ev = Event {
            event_type: r.get("event_type"),
            player_id: r.get("player_id"),
            target_id: target.as_deref(),
            payload: &payload,
        };
        if let Some(d) = describe(&ev, me)
            && !d.other.as_ref().is_some_and(|o| hidden.contains(o))
        {
            drafts.push((
                r.get::<i64, _>("id"),
                r.get::<DateTime<Utc>, _>("event_timestamp"),
                d,
            ));
        }
    }
    // One "You matched" line per person (newest first), even if a match was ever recorded twice.
    let mut seen_pairs = HashSet::new();
    drafts.retain(|(_, _, d)| d.kind != "match" || seen_pairs.insert(d.other.clone()));
    drafts.truncate(limit as usize);

    let actors: HashSet<String> = drafts
        .iter()
        .filter_map(|(_, _, d)| d.other.clone())
        .collect();
    let names = names(&state, &actors).await?;
    let seen = seen_at(&state, me).await?;
    let mut items: Vec<FeedItem> = drafts
        .into_iter()
        .map(|(id, at, d)| {
            let name = d
                .other
                .as_ref()
                .and_then(|o| names.get(o))
                .cloned()
                .unwrap_or_else(|| "Someone".into());
            FeedItem {
                id: id.to_string(),
                kind: d.kind.into(),
                icon: d.icon.into(),
                title: d.title.replace("{name}", &name),
                body: d.body.replace("{name}", &name),
                at,
                action_label: Some(d.action_label.into()),
                action: Some(d.action),
                new: seen.is_none_or(|s| at > s),
            }
        })
        .collect();
    let unseen_count = items.iter().filter(|i| i.new).count() as i64;
    items.extend(world_posts(Utc::now()));
    items.sort_by(|a, b| b.at.cmp(&a.at));
    Ok(Json(ApiOk::new(FeedResponse {
        items,
        unseen_count,
    })))
}

#[derive(Deserialize)]
pub struct SeenRequest {
    player_id: Uuid,
}

/// Opening the feed clears its badge.
pub async fn mark_seen(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<SeenRequest>,
) -> Result<Json<ApiOk<serde_json::Value>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    sqlx::query(
        "insert into player_settings (player_id, feed_seen_at) values ($1, now())
         on conflict (player_id) do update set feed_seen_at = now()",
    )
    .bind(req.player_id)
    .execute(&state.db)
    .await?;
    Ok(Json(ApiOk::new(serde_json::json!({ "seen": true }))))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ev<'a>(
        t: &'a str,
        player: Option<Uuid>,
        target: Option<&'a str>,
        p: &'a serde_json::Value,
    ) -> Event<'a> {
        Event {
            event_type: t,
            player_id: player,
            target_id: target,
            payload: p,
        }
    }

    #[test]
    fn only_my_events_become_items() {
        let me = Uuid::new_v4();
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let p = json!({});
        let them = format!("player:{b}");
        // Someone else's date is never in my feed.
        assert!(describe(&ev("date.completed", Some(a), Some(&them), &p), me).is_none());
        let mine = format!("player:{me}");
        let m = describe(&ev("social.match", Some(a), Some(&mine), &p), me).unwrap();
        assert_eq!(m.other, Some(format!("player:{a}")));
        assert_eq!(m.action, format!("chat:player:{a}"));
    }

    #[test]
    fn invitations_show_to_the_right_side() {
        let me = Uuid::new_v4();
        let other = Uuid::new_v4();
        let at_me = format!("player:{me}");
        let at_them = format!("player:{other}");
        let p = json!({ "activity": "public_date" });
        // Incoming invitation: yes. My own sent invitation: no (I know I sent it).
        let inc = describe(&ev("invitation.sent", Some(other), Some(&at_me), &p), me).unwrap();
        assert!(inc.title.contains("Rooftop date"));
        assert!(describe(&ev("invitation.sent", Some(me), Some(&at_them), &p), me).is_none());
        // NPC answers only show when they said yes.
        let yes = json!({ "activity": "public_date", "accepted": true });
        let no = json!({ "activity": "public_date", "accepted": false });
        let npc = describe(
            &ev("invitation.npc_answered", Some(me), Some("npc:maya"), &yes),
            me,
        )
        .unwrap();
        assert_eq!(npc.action, "npc:maya");
        assert!(
            describe(
                &ev("invitation.npc_answered", Some(me), Some("npc:maya"), &no),
                me
            )
            .is_none()
        );
    }

    #[test]
    fn private_events_stay_discreet_and_link_somewhere() {
        let me = Uuid::new_v4();
        let p = json!({ "label": "First date", "reward": 3000 });
        let a = describe(&ev("achievement.unlocked", Some(me), None, &p), me).unwrap();
        assert_eq!(a.action, "stats");
        assert!(a.body.contains("₦3,000"));
        let enc = describe(
            &ev(
                "encounter.completed",
                Some(me),
                Some("npc:maya"),
                &json!({}),
            ),
            me,
        )
        .unwrap();
        assert!(enc.body.contains("Only you"));
        // Every item kind has an action.
        for t in EVENT_TYPES {
            if let Some(d) = describe(
                &ev(t, Some(me), Some("npc:maya"), &json!({ "accepted": true })),
                me,
            ) {
                assert!(!d.action.is_empty(), "{t} needs an action");
            }
        }
    }

    #[test]
    fn world_posts_rotate_hourly_and_link() {
        let now = Utc::now();
        let a = world_posts(now);
        let b = world_posts(now + Duration::hours(1));
        assert_eq!(a.len(), 2);
        assert_ne!(a[0].body, b[0].body);
        assert!(a.iter().all(|i| i.action.is_some() && !i.new));
    }
}
