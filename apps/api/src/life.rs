//! Life-sim layer: money, XP/level, needs that drain over time, and a shared world clock.
//! Needs are decayed lazily on read from the elapsed real time, so no background ticker is needed.

use super::{AppError, SharedState, publish_event, require_player};
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use chrono::{DateTime, Duration, NaiveDate, TimeZone, Timelike, Utc};
use serde::{Deserialize, Serialize};
use sidepiece_common::ApiOk;
use sqlx::Row;
use uuid::Uuid;

/// New players start with this much cash (₦). Mirrors the `player_life.money` column default.
pub const STARTING_MONEY: i32 = 50_000;

/// Format naira with thousands separators, e.g. `₦85,000` / `-₦3,500`.
pub fn naira(amount: i32) -> String {
    let digits = amount.unsigned_abs().to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    format!("{}₦{out}", if amount < 0 { "-" } else { "" })
}

/// One real hour is one in-game day.
const TIME_SCALE: i64 = 24;

/// Need decay per real minute.
const DECAY_PER_MIN: Needs = Needs {
    energy: 0.35,
    hunger: 0.5,
    mood: 0.15,
    social: 0.3,
    love: 0.1,
};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Needs {
    pub energy: f32,
    pub hunger: f32,
    pub mood: f32,
    pub social: f32,
    pub love: f32,
}

impl Needs {
    fn clamp(self) -> Self {
        let c = |v: f32| v.clamp(0.0, 100.0);
        Self {
            energy: c(self.energy),
            hunger: c(self.hunger),
            mood: c(self.mood),
            social: c(self.social),
            love: c(self.love),
        }
    }

    pub fn decayed(self, minutes: f32) -> Self {
        let m = minutes.max(0.0);
        let mut n = Self {
            energy: self.energy - DECAY_PER_MIN.energy * m,
            hunger: self.hunger - DECAY_PER_MIN.hunger * m,
            mood: self.mood - DECAY_PER_MIN.mood * m,
            social: self.social - DECAY_PER_MIN.social * m,
            love: self.love - DECAY_PER_MIN.love * m,
        }
        .clamp();
        // Unmet basic needs drag mood down further.
        let starving = (25.0 - n.hunger).max(0.0) + (25.0 - n.energy).max(0.0);
        n.mood = (n.mood - starving * 0.02 * m).clamp(0.0, 100.0);
        n
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct LifeDelta {
    pub money: i32,
    pub xp: i32,
    pub energy: f32,
    pub hunger: f32,
    pub mood: f32,
    pub social: f32,
    pub love: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorldClock {
    pub game_time: String,
    pub hour: u32,
    pub minute: u32,
    pub is_night: bool,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LifeResponse {
    pub money: i32,
    pub xp: i32,
    pub level: i32,
    pub xp_into_level: i32,
    pub xp_for_next: i32,
    pub needs: Needs,
    pub clock: WorldClock,
}

/// Each level needs 100 more XP than the last: L1->2 = 100, L2->3 = 200, ...
pub fn level_for_xp(xp: i32) -> (i32, i32, i32) {
    let mut level = 1;
    let mut remaining = xp.max(0);
    loop {
        let need = level * 100;
        if remaining < need {
            return (level, remaining, need);
        }
        remaining -= need;
        level += 1;
    }
}

pub fn world_clock(now: DateTime<Utc>) -> WorldClock {
    let real_epoch = Utc.with_ymd_and_hms(2026, 10, 1, 0, 0, 0).unwrap();
    let game_epoch = NaiveDate::from_ymd_opt(2031, 5, 11)
        .unwrap()
        .and_hms_opt(18, 0, 0)
        .unwrap()
        .and_utc();
    let elapsed = now - real_epoch;
    let game = game_epoch + Duration::milliseconds(elapsed.num_milliseconds() * TIME_SCALE);
    let hour = game.hour();
    WorldClock {
        game_time: game.to_rfc3339(),
        hour,
        minute: game.minute(),
        is_night: !(6..19).contains(&hour),
        label: game.format("%H:%M · %a %d %b %Y").to_string(),
    }
}

struct LifeRow {
    money: i32,
    xp: i32,
    needs: Needs,
}

async fn load(state: &SharedState, player_id: Uuid) -> Result<LifeRow, AppError> {
    sqlx::query(
        "insert into player_life (player_id, money) values ($1, $2) on conflict do nothing",
    )
    .bind(player_id)
    .bind(STARTING_MONEY)
    .execute(&state.db)
    .await?;
    let row = sqlx::query(
        "select money, xp, energy, hunger, mood, social, love,
                extract(epoch from (now() - updated_at))::float8 as elapsed
         from player_life where player_id = $1",
    )
    .bind(player_id)
    .fetch_one(&state.db)
    .await?;
    let base = Needs {
        energy: row.get("energy"),
        hunger: row.get("hunger"),
        mood: row.get("mood"),
        social: row.get("social"),
        love: row.get("love"),
    };
    let elapsed: f64 = row.get("elapsed");
    Ok(LifeRow {
        money: row.get("money"),
        xp: row.get("xp"),
        needs: base.decayed((elapsed / 60.0) as f32),
    })
}

async fn save(state: &SharedState, player_id: Uuid, life: &LifeRow) -> Result<(), AppError> {
    sqlx::query(
        "update player_life set money = $2, xp = $3, energy = $4, hunger = $5, mood = $6, social = $7, love = $8, updated_at = now()
         where player_id = $1",
    )
    .bind(player_id)
    .bind(life.money)
    .bind(life.xp)
    .bind(life.needs.energy)
    .bind(life.needs.hunger)
    .bind(life.needs.mood)
    .bind(life.needs.social)
    .bind(life.needs.love)
    .execute(&state.db)
    .await?;
    Ok(())
}

fn response(life: &LifeRow) -> LifeResponse {
    let (level, xp_into_level, xp_for_next) = level_for_xp(life.xp);
    LifeResponse {
        money: life.money,
        xp: life.xp,
        level,
        xp_into_level,
        xp_for_next,
        needs: life.needs,
        clock: world_clock(Utc::now()),
    }
}

/// Current life state without changing anything.
pub async fn current(state: &SharedState, player_id: Uuid) -> Result<LifeResponse, AppError> {
    Ok(response(&load(state, player_id).await?))
}

/// Current cash (₦), for affordability checks before something is charged later.
pub async fn balance(state: &SharedState, player_id: Uuid) -> Result<i32, AppError> {
    Ok(load(state, player_id).await?.money)
}

/// Apply a delta (used by actions and by conversations). Fails if the player can't afford it.
pub async fn apply(
    state: &SharedState,
    player_id: Uuid,
    d: LifeDelta,
) -> Result<LifeResponse, AppError> {
    let mut life = load(state, player_id).await?;
    if life.money + d.money < 0 {
        return Err(AppError::bad_request(&format!(
            "not enough cash: that costs {}, you have {}",
            naira(-d.money),
            naira(life.money)
        )));
    }
    let before_level = level_for_xp(life.xp).0;
    life.money += d.money;
    life.xp = (life.xp + d.xp).max(0);
    life.needs = Needs {
        energy: life.needs.energy + d.energy,
        hunger: life.needs.hunger + d.hunger,
        mood: life.needs.mood + d.mood,
        social: life.needs.social + d.social,
        love: life.needs.love + d.love,
    }
    .clamp();
    save(state, player_id, &life).await?;
    if d.money != 0 {
        // Lifetime cash flow for detailed stats (spec 15A).
        sqlx::query(
            "update player_life set cash_earned = cash_earned + $2, cash_spent = cash_spent + $3 where player_id = $1",
        )
        .bind(player_id)
        .bind(i64::from(d.money.max(0)))
        .bind(i64::from((-d.money).max(0)))
        .execute(&state.db)
        .await?;
    }
    let after_level = level_for_xp(life.xp).0;
    if after_level > before_level {
        publish_event(
            state,
            "player.level_up",
            Some(player_id),
            None,
            None,
            serde_json::json!({ "level": after_level }),
        )
        .await;
    }
    Ok(response(&life))
}

pub async fn get_life(
    State(state): State<SharedState>,
    Path(player_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<ApiOk<LifeResponse>>, AppError> {
    require_player(&state, &headers, player_id)?;
    let life = load(&state, player_id).await?;
    Ok(Json(ApiOk::new(response(&life))))
}

#[derive(Deserialize)]
pub struct ActionRequest {
    pub action: String,
    /// Where the player is; some actions only make sense in certain places.
    pub venue: Option<String>,
}

#[derive(Serialize)]
pub struct ActionResult {
    pub message: String,
    pub life: LifeResponse,
}

pub struct ActionDef {
    pub id: &'static str,
    pub label: &'static str,
    pub venues: &'static [&'static str],
    pub delta: LifeDelta,
    pub message: &'static str,
}

/// Stands for every club in the venue catalog (`sidepiece_common::venues`).
pub const NIGHTLIFE: &str = "nightlife";

impl ActionDef {
    /// Venue kinds this action is available in, with [`NIGHTLIFE`] expanded to every club.
    pub fn venue_kinds(&self) -> Vec<&'static str> {
        let mut out = Vec::new();
        for v in self.venues {
            if *v == NIGHTLIFE {
                out.extend(sidepiece_common::venues::nightlife_kinds());
            } else {
                out.push(*v);
            }
        }
        out
    }
}

pub const ACTIONS: &[ActionDef] = &[
    ActionDef {
        id: "buy_drink",
        label: "Buy a drink (₦3,500)",
        venues: &[NIGHTLIFE],
        delta: LifeDelta {
            money: -3_500,
            xp: 2,
            energy: 0.0,
            hunger: 2.0,
            mood: 8.0,
            social: 6.0,
            love: 0.0,
        },
        message: "Cheers. The night feels a little brighter.",
    },
    ActionDef {
        id: "eat",
        label: "Grab food (₦5,000)",
        venues: &[NIGHTLIFE, "city"],
        delta: LifeDelta {
            money: -5_000,
            xp: 1,
            energy: 5.0,
            hunger: 45.0,
            mood: 5.0,
            social: 0.0,
            love: 0.0,
        },
        message: "You're fed. Hunger restored.",
    },
    ActionDef {
        id: "dance",
        label: "Dance",
        venues: &[NIGHTLIFE],
        delta: LifeDelta {
            money: 0,
            xp: 4,
            energy: -12.0,
            hunger: -4.0,
            mood: 12.0,
            social: 10.0,
            love: 0.0,
        },
        message: "You hit the floor. People noticed.",
    },
    ActionDef {
        id: "work_shift",
        label: "Work a shift (+₦18,000)",
        venues: &["city"],
        delta: LifeDelta {
            money: 18_000,
            xp: 6,
            energy: -25.0,
            hunger: -15.0,
            mood: -6.0,
            social: -5.0,
            love: 0.0,
        },
        message: "Shift done. Wallet heavier, feet tired.",
    },
    ActionDef {
        id: "rest",
        label: "Rest",
        venues: &["city", "private_room"],
        delta: LifeDelta {
            money: 0,
            xp: 0,
            energy: 35.0,
            hunger: -5.0,
            mood: 4.0,
            social: 0.0,
            love: 0.0,
        },
        message: "You recharge for a while.",
    },
];

pub async fn do_action(
    State(state): State<SharedState>,
    Path(player_id): Path<Uuid>,
    headers: HeaderMap,
    Json(req): Json<ActionRequest>,
) -> Result<Json<ApiOk<ActionResult>>, AppError> {
    require_player(&state, &headers, player_id)?;
    let action = ACTIONS
        .iter()
        .find(|a| a.id == req.action)
        .ok_or_else(|| AppError::bad_request("unknown action"))?;
    if let Some(venue) = req.venue.as_deref()
        && !action.venue_kinds().contains(&venue)
    {
        return Err(AppError::bad_request("you can't do that here"));
    }
    if action.delta.energy < 0.0 {
        let current = load(&state, player_id).await?;
        if current.needs.energy + action.delta.energy < 0.0 {
            return Err(AppError::bad_request("you're too tired — rest first"));
        }
    }
    let life = apply(&state, player_id, action.delta).await?;
    publish_event(
        &state,
        "life.action",
        Some(player_id),
        None,
        None,
        serde_json::json!({ "action": action.id }),
    )
    .await;
    Ok(Json(ApiOk::new(ActionResult {
        message: action.message.into(),
        life,
    })))
}

#[derive(Serialize)]
pub struct ActionInfo {
    pub id: &'static str,
    pub label: &'static str,
    pub venues: Vec<&'static str>,
}

pub async fn list_actions() -> Json<ApiOk<Vec<ActionInfo>>> {
    Json(ApiOk::new(
        ACTIONS
            .iter()
            .map(|a| ActionInfo {
                id: a.id,
                label: a.label,
                venues: a.venue_kinds(),
            })
            .collect(),
    ))
}

pub async fn get_clock() -> Json<ApiOk<WorldClock>> {
    Json(ApiOk::new(world_clock(Utc::now())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_scale() {
        assert_eq!(level_for_xp(0), (1, 0, 100));
        assert_eq!(level_for_xp(99), (1, 99, 100));
        assert_eq!(level_for_xp(100), (2, 0, 200));
        assert_eq!(level_for_xp(350), (3, 50, 300));
    }

    #[test]
    fn needs_decay_and_clamp() {
        let n = Needs {
            energy: 50.0,
            hunger: 50.0,
            mood: 50.0,
            social: 50.0,
            love: 50.0,
        };
        let later = n.decayed(10.0);
        assert!(later.energy < 50.0 && later.hunger < later.energy);
        let much_later = n.decayed(10_000.0);
        assert_eq!(much_later.hunger, 0.0);
        assert!(much_later.mood >= 0.0);
    }

    #[test]
    fn clock_runs_24x() {
        let t0 = Utc.with_ymd_and_hms(2026, 10, 1, 0, 0, 0).unwrap();
        assert_eq!(world_clock(t0).hour, 18);
        assert_eq!(world_clock(t0 + Duration::minutes(30)).hour, 6); // +12 game hours
        assert!(world_clock(t0).is_night == false);
        assert!(world_clock(t0 + Duration::minutes(10)).is_night); // 22:00
    }

    #[test]
    fn naira_formatting() {
        assert_eq!(naira(0), "\u{20a6}0");
        assert_eq!(naira(950), "\u{20a6}950");
        assert_eq!(naira(3_500), "\u{20a6}3,500");
        assert_eq!(naira(85_000), "\u{20a6}85,000");
        assert_eq!(naira(1_250_000), "\u{20a6}1,250,000");
        assert_eq!(naira(-3_500), "-\u{20a6}3,500");
    }

    #[test]
    fn action_labels_match_naira_deltas() {
        for a in ACTIONS {
            assert!(!a.label.contains('$'), "{} still shows $", a.id);
            if a.delta.money != 0 {
                let shown = naira(a.delta.money.abs());
                assert!(
                    a.label.contains(&shown),
                    "{} label {:?} should show {shown}",
                    a.id,
                    a.label
                );
            }
        }
    }

    #[test]
    fn economy_is_balanced() {
        let cost = |id: &str| -ACTIONS.iter().find(|a| a.id == id).unwrap().delta.money;
        let shift = -cost("work_shift");
        // A shift pays for a night out (several drinks + food); starting cash covers a first night.
        assert!(shift >= 3 * cost("buy_drink") + cost("eat"));
        assert!(STARTING_MONEY >= 10 * cost("buy_drink"));
        assert!(STARTING_MONEY < 5 * shift, "working should matter");
    }
}
