//! Email/password accounts with an 18+ age gate.
//! Passwords are hashed with Argon2id; login attempts are rate limited per email via Redis.
//! Settings (spec 18) can change the password and delete the account (ADR 0016).

use super::{AppError, SharedState, issue_token, publish_event, require_player};
use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use axum::{Json, extract::State, http::HeaderMap};
use chrono::{Datelike, NaiveDate, Utc};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use sidepiece_common::ApiOk;
use sqlx::Row;
use uuid::Uuid;

pub const MIN_AGE: i32 = 18;
const MAX_ATTEMPTS_PER_WINDOW: i64 = 10;
const ATTEMPT_WINDOW_SECONDS: i64 = 300;

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub display_name: String,
    pub date_of_birth: NaiveDate,
    pub accept_terms: bool,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct SessionResponse {
    pub player_id: Uuid,
    pub display_name: String,
    pub token: String,
    pub has_avatar: bool,
}

pub fn age_on(dob: NaiveDate, today: NaiveDate) -> i32 {
    let mut age = today.year() - dob.year();
    if (today.month(), today.day()) < (dob.month(), dob.day()) {
        age -= 1;
    }
    age
}

fn normalize_email(email: &str) -> Result<String, AppError> {
    let email = email.trim().to_lowercase();
    let valid = email.len() <= 254
        && email.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
        });
    if !valid {
        return Err(AppError::bad_request("enter a valid email address"));
    }
    Ok(email)
}

fn validate_display_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    let len = name.chars().count();
    if !(2..=24).contains(&len) {
        return Err(AppError::bad_request(
            "display name must be 2-24 characters",
        ));
    }
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '-' || c == ' ')
    {
        return Err(AppError::bad_request(
            "display name can only use letters, numbers, spaces, _ and -",
        ));
    }
    Ok(name.to_string())
}

fn validate_password(password: &str) -> Result<(), AppError> {
    if password.chars().count() < 10 {
        return Err(AppError::bad_request(
            "password must be at least 10 characters",
        ));
    }
    if password.len() > 256 {
        return Err(AppError::bad_request("password is too long"));
    }
    Ok(())
}

fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::from(anyhow::anyhow!("password hashing failed: {e}")))
}

fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false)
}

async fn check_rate_limit(state: &SharedState, key: &str) -> Result<(), AppError> {
    let Some(redis) = &state.redis else {
        return Ok(());
    };
    let mut redis = redis.clone();
    let key = format!("auth_attempts:{key}");
    let attempts: i64 = redis.incr(&key, 1).await.unwrap_or(0);
    if attempts == 1 {
        let _: redis::RedisResult<()> = redis.expire(&key, ATTEMPT_WINDOW_SECONDS).await;
    }
    if attempts > MAX_ATTEMPTS_PER_WINDOW {
        return Err(AppError::too_many_requests(
            "too many attempts, try again in a few minutes",
        ));
    }
    Ok(())
}

async fn has_avatar(state: &SharedState, player_id: Uuid) -> Result<bool, AppError> {
    Ok(
        sqlx::query_scalar("select exists(select 1 from avatars where player_id = $1)")
            .bind(player_id)
            .fetch_one(&state.db)
            .await?,
    )
}

pub async fn register(
    State(state): State<SharedState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<ApiOk<SessionResponse>>, AppError> {
    let email = normalize_email(&req.email)?;
    let display_name = validate_display_name(&req.display_name)?;
    validate_password(&req.password)?;
    if !req.accept_terms {
        return Err(AppError::bad_request(
            "you must accept the terms and community rules",
        ));
    }
    if age_on(req.date_of_birth, Utc::now().date_naive()) < MIN_AGE {
        return Err(AppError::forbidden("Side Piece is for adults 18+ only"));
    }
    check_rate_limit(&state, &format!("register:{email}")).await?;

    let exists: bool =
        sqlx::query_scalar("select exists(select 1 from accounts where lower(email) = $1)")
            .bind(&email)
            .fetch_one(&state.db)
            .await?;
    if exists {
        return Err(AppError::conflict(
            "an account with that email already exists",
        ));
    }

    let password_hash = hash_password(&req.password)?;
    let player_id = Uuid::new_v4();
    let mut tx = state.db.begin().await?;
    sqlx::query("insert into players (id, display_name) values ($1, $2)")
        .bind(player_id)
        .bind(&display_name)
        .execute(&mut *tx)
        .await?;
    sqlx::query("insert into accounts (player_id, email, password_hash, date_of_birth, last_login_at) values ($1, $2, $3, $4, now())")
        .bind(player_id)
        .bind(&email)
        .bind(&password_hash)
        .bind(req.date_of_birth)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    publish_event(
        &state,
        "player.registered",
        Some(player_id),
        None,
        None,
        serde_json::json!({}),
    )
    .await;
    let token = issue_token(&state, player_id, &display_name)?;
    Ok(Json(ApiOk::new(SessionResponse {
        player_id,
        display_name,
        token,
        has_avatar: false,
    })))
}

pub async fn login(
    State(state): State<SharedState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<ApiOk<SessionResponse>>, AppError> {
    let email = normalize_email(&req.email)?;
    check_rate_limit(&state, &format!("login:{email}")).await?;

    let row = sqlx::query(
        "select a.player_id, a.password_hash, p.display_name
         from accounts a join players p on p.id = a.player_id
         where lower(a.email) = $1",
    )
    .bind(&email)
    .fetch_optional(&state.db)
    .await?;

    // Same error for unknown email and wrong password, so accounts can't be enumerated.
    let invalid = || AppError::unauthorized("incorrect email or password");
    let Some(row) = row else {
        // Spend comparable time to a real verification to blunt timing attacks.
        let _ = hash_password(&req.password);
        return Err(invalid());
    };
    let hash: String = row.get("password_hash");
    if !verify_password(&req.password, &hash) {
        return Err(invalid());
    }

    let player_id: Uuid = row.get("player_id");
    let display_name: String = row.get("display_name");
    sqlx::query("update accounts set last_login_at = now() where player_id = $1")
        .bind(player_id)
        .execute(&state.db)
        .await?;
    publish_event(
        &state,
        "player.logged_in",
        Some(player_id),
        None,
        None,
        serde_json::json!({}),
    )
    .await;

    let token = issue_token(&state, player_id, &display_name)?;
    let has_avatar = has_avatar(&state, player_id).await?;
    Ok(Json(ApiOk::new(SessionResponse {
        player_id,
        display_name,
        token,
        has_avatar,
    })))
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub player_id: Uuid,
    pub current_password: String,
    pub new_password: String,
}

pub async fn change_password(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<Json<ApiOk<serde_json::Value>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    check_rate_limit(&state, &format!("password:{}", req.player_id)).await?;
    let hash: Option<String> =
        sqlx::query_scalar("select password_hash from accounts where player_id = $1")
            .bind(req.player_id)
            .fetch_optional(&state.db)
            .await?;
    let Some(hash) = hash else {
        return Err(AppError::bad_request("this player has no email account"));
    };
    if !verify_password(&req.current_password, &hash) {
        return Err(AppError::forbidden("your current password is incorrect"));
    }
    validate_password(&req.new_password)?;
    if req.new_password == req.current_password {
        return Err(AppError::bad_request(
            "choose a password you haven't used here",
        ));
    }
    sqlx::query("update accounts set password_hash = $2 where player_id = $1")
        .bind(req.player_id)
        .bind(hash_password(&req.new_password)?)
        .execute(&state.db)
        .await?;
    publish_event(
        &state,
        "account.password_changed",
        Some(req.player_id),
        None,
        None,
        serde_json::json!({}),
    )
    .await;
    Ok(Json(ApiOk::new(serde_json::json!({ "changed": true }))))
}

#[derive(Deserialize)]
pub struct DeleteAccountRequest {
    pub player_id: Uuid,
    /// Required for email accounts; dev-login players have none.
    #[serde(default)]
    pub password: Option<String>,
    /// Must be exactly `DELETE`, so a stray request can't wipe an account.
    pub confirm: String,
}

/// Permanently deletes the player and everything that points at them (ADR 0016).
/// Other players keep their own reward history (stats don't change); reports filed about this player are kept
/// for safety review.
pub async fn delete_account(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<DeleteAccountRequest>,
) -> Result<Json<ApiOk<serde_json::Value>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    if req.confirm != "DELETE" {
        return Err(AppError::bad_request("type DELETE to confirm"));
    }
    check_rate_limit(&state, &format!("delete:{}", req.player_id)).await?;
    let hash: Option<String> =
        sqlx::query_scalar("select password_hash from accounts where player_id = $1")
            .bind(req.player_id)
            .fetch_optional(&state.db)
            .await?;
    if let Some(hash) = hash
        && !verify_password(req.password.as_deref().unwrap_or(""), &hash)
    {
        return Err(AppError::forbidden("your password is incorrect"));
    }

    let me = req.player_id;
    let actor = format!("player:{me}");
    let mut tx = state.db.begin().await?;
    // Rows other players hold about this one, keyed by the text actor id (no foreign key to cascade).
    for sql in [
        "delete from relationship_state where target_id = $1",
        "delete from player_interests where target_id = $1",
        "delete from player_passes where target_id = $1",
        "delete from matches where target_id = $1",
        "delete from conversation_state where target_id = $1",
        "delete from player_blocks where target_id = $1",
        "delete from invitations where target_id = $1",
        "delete from date_sessions where guest_id = $1",
        "delete from encounters where guest_id = $1",
        "delete from private_rooms where target_id = $1",
        "delete from activity_feedback where from_actor = $1 or to_actor = $1",
        "delete from game_event_audit where target_id = $1",
    ] {
        sqlx::query(sql).bind(&actor).execute(&mut *tx).await?;
    }
    sqlx::query("delete from game_event_audit where player_id = $1")
        .bind(me)
        .execute(&mut *tx)
        .await?;
    // Everything owned by the player (account, avatar, life, messages, invitations sent…) cascades.
    let deleted = sqlx::query("delete from players where id = $1")
        .bind(me)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    tx.commit().await?;
    if deleted == 0 {
        return Err(AppError::not_found("player not found"));
    }

    if let Some(redis) = &state.redis {
        let mut redis = redis.clone();
        let room: Option<String> = redis.get(format!("player:room:{me}")).await.unwrap_or(None);
        if let Some(room) = room {
            let _: redis::RedisResult<()> = redis
                .srem(format!("room:players:{room}"), me.to_string())
                .await;
            let _: redis::RedisResult<()> = redis
                .hdel(format!("room:names:{room}"), me.to_string())
                .await;
        }
        let _: redis::RedisResult<()> = redis.del(format!("player:room:{me}")).await;
    }
    // No player id on the event: the audit row must not re-attach anything to the deleted account.
    publish_event(
        &state,
        "account.deleted",
        None,
        None,
        None,
        serde_json::json!({}),
    )
    .await;
    Ok(Json(ApiOk::new(serde_json::json!({ "deleted": true }))))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(y: i32, m: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, day).unwrap()
    }

    #[test]
    fn age_respects_birthday_not_yet_reached() {
        assert_eq!(age_on(d(2008, 10, 10), d(2026, 10, 9)), 17);
        assert_eq!(age_on(d(2008, 10, 9), d(2026, 10, 9)), 18);
        assert_eq!(age_on(d(2000, 2, 29), d(2026, 2, 28)), 25);
    }

    #[test]
    fn email_validation() {
        assert_eq!(
            normalize_email("  Ada@Example.COM ").ok().as_deref(),
            Some("ada@example.com")
        );
        assert!(normalize_email("nope").is_err());
        assert!(normalize_email("a@b").is_err());
        assert!(normalize_email("@b.com").is_err());
    }

    #[test]
    fn password_hash_roundtrip() {
        let hash = hash_password("correct horse battery").unwrap();
        assert!(verify_password("correct horse battery", &hash));
        assert!(!verify_password("wrong password!!", &hash));
    }

    #[test]
    fn display_name_rules() {
        assert!(validate_display_name("Jay_123").is_ok());
        assert!(validate_display_name("x").is_err());
        assert!(validate_display_name("<script>").is_err());
    }
}
