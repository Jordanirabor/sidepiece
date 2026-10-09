//! Free-text NPC conversation. Every player message is scored (-5..+5) by how it lands with the NPC;
//! the score moves the relationship's affinity, which determines the tier (Stranger -> Partner).
//!
//! Uses any OpenAI-compatible chat completions endpoint (OpenAI, OpenRouter, Ollama, vLLM...)
//! configured via LLM_BASE_URL / LLM_API_KEY / LLM_MODEL. Without it, a deterministic offline
//! scorer keeps the game playable.

use super::{AppError, SharedState, life, npcs, publish_event, require_player};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use sidepiece_common::{
    ApiOk, AvatarConfig, RELATIONSHIP_TIERS, RelationshipStats, relationship_tier,
};
use sqlx::Row;
use std::time::Duration;
use uuid::Uuid;

const MAX_MESSAGE_CHARS: usize = 400;
const HISTORY_FOR_MODEL: i64 = 12;
const MESSAGES_PER_MINUTE: i64 = 15;

#[derive(Clone)]
pub struct LlmConfig {
    pub base_url: String,
    pub api_key: Option<String>,
    pub model: String,
    client: reqwest::Client,
}

impl LlmConfig {
    pub fn from_env() -> Option<Self> {
        let base_url = std::env::var("LLM_BASE_URL")
            .ok()
            .filter(|v| !v.is_empty())?;
        let model = std::env::var("LLM_MODEL").unwrap_or_else(|_| "gpt-4o-mini".into());
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .ok()?;
        Some(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: std::env::var("LLM_API_KEY").ok().filter(|v| !v.is_empty()),
            model,
            client,
        })
    }
}

#[derive(Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub score_delta: i32,
}

#[derive(Serialize)]
pub struct RelationshipView {
    pub affinity: i32,
    pub tier_index: usize,
    pub tier_count: usize,
    pub tier_label: &'static str,
    pub stats: RelationshipStats,
}

impl RelationshipView {
    fn from(stats: RelationshipStats) -> Self {
        let (tier_index, tier_label) = relationship_tier(stats.affinity);
        Self {
            affinity: stats.affinity,
            tier_index,
            tier_count: RELATIONSHIP_TIERS.len(),
            tier_label,
            stats,
        }
    }
}

#[derive(Serialize)]
pub struct ThreadResponse {
    pub npc_id: String,
    pub npc_name: String,
    pub tagline: String,
    pub messages: Vec<ChatMessage>,
    pub relationship: RelationshipView,
}

#[derive(Serialize)]
pub struct ChatReply {
    pub reply: String,
    pub score_delta: i32,
    pub relationship: RelationshipView,
    pub life: life::LifeResponse,
    pub tier_changed: bool,
    pub source: &'static str,
}

#[derive(Deserialize)]
pub struct ThreadQuery {
    pub player_id: Uuid,
}

#[derive(Deserialize)]
pub struct ChatRequest {
    pub player_id: Uuid,
    pub message: String,
}

async fn load_stats(
    state: &SharedState,
    player_id: Uuid,
    target: &str,
) -> Result<RelationshipStats, AppError> {
    let value: Option<serde_json::Value> = sqlx::query_scalar(
        "select stats from relationship_state where player_id = $1 and target_id = $2",
    )
    .bind(player_id)
    .bind(target)
    .fetch_optional(&state.db)
    .await?;
    Ok(value
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or(RelationshipStats {
            attraction: 0,
            trust: 0,
            reputation: 0,
            affinity: 0,
        }))
}

async fn history(
    state: &SharedState,
    player_id: Uuid,
    npc_id: &str,
    limit: i64,
) -> Result<Vec<ChatMessage>, AppError> {
    let rows = sqlx::query(
        "select role, content, score_delta from npc_messages
         where player_id = $1 and npc_id = $2 order by id desc limit $3",
    )
    .bind(player_id)
    .bind(npc_id)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;
    let mut messages: Vec<ChatMessage> = rows
        .into_iter()
        .map(|r| ChatMessage {
            role: r.get("role"),
            content: r.get("content"),
            score_delta: r.get("score_delta"),
        })
        .collect();
    messages.reverse();
    Ok(messages)
}

async fn insert_message(
    state: &SharedState,
    player_id: Uuid,
    npc_id: &str,
    role: &str,
    content: &str,
    score: i32,
) -> Result<(), AppError> {
    sqlx::query("insert into npc_messages (player_id, npc_id, role, content, score_delta) values ($1, $2, $3, $4, $5)")
        .bind(player_id)
        .bind(npc_id)
        .bind(role)
        .bind(content)
        .bind(score)
        .execute(&state.db)
        .await?;
    Ok(())
}

pub async fn get_thread(
    State(state): State<SharedState>,
    Path(npc_id): Path<String>,
    headers: HeaderMap,
    Query(q): Query<ThreadQuery>,
) -> Result<Json<ApiOk<ThreadResponse>>, AppError> {
    require_player(&state, &headers, q.player_id)?;
    let npc = npcs::find(&npc_id).ok_or_else(|| AppError::not_found("unknown npc"))?;
    let mut messages = history(&state, q.player_id, npc.id, 40).await?;
    if messages.is_empty() {
        insert_message(&state, q.player_id, npc.id, "npc", npc.greeting, 0).await?;
        messages.push(ChatMessage {
            role: "npc".into(),
            content: npc.greeting.into(),
            score_delta: 0,
        });
    }
    let stats = load_stats(&state, q.player_id, &format!("npc:{}", npc.id)).await?;
    Ok(Json(ApiOk::new(ThreadResponse {
        npc_id: npc.id.into(),
        npc_name: npc.name.into(),
        tagline: npc.tagline.into(),
        messages,
        relationship: RelationshipView::from(stats),
    })))
}

pub async fn send_message(
    State(state): State<SharedState>,
    Path(npc_id): Path<String>,
    headers: HeaderMap,
    Json(req): Json<ChatRequest>,
) -> Result<Json<ApiOk<ChatReply>>, AppError> {
    require_player(&state, &headers, req.player_id)?;
    let npc = npcs::find(&npc_id).ok_or_else(|| AppError::not_found("unknown npc"))?;
    let message: String = req.message.trim().chars().take(MAX_MESSAGE_CHARS).collect();
    if message.is_empty() {
        return Err(AppError::bad_request("say something first"));
    }
    rate_limit(&state, req.player_id).await?;

    let target = format!("npc:{}", npc.id);
    let blocked: bool = sqlx::query_scalar(
        "select exists(select 1 from player_blocks where blocker_id = $1 and target_id = $2)",
    )
    .bind(req.player_id)
    .bind(&target)
    .fetch_one(&state.db)
    .await?;
    if blocked {
        return Err(AppError::forbidden("you blocked this character"));
    }

    let mut stats = load_stats(&state, req.player_id, &target).await?;
    let before_tier = relationship_tier(stats.affinity).0;
    let profile = player_profile(&state, req.player_id).await?;
    let past = history(&state, req.player_id, npc.id, HISTORY_FOR_MODEL).await?;

    let (score, reply, source) = match &state.llm {
        Some(llm) => match llm_reply(llm, npc, &profile, &stats, &past, &message).await {
            Ok((score, reply)) => (score, reply, "llm"),
            Err(err) => {
                tracing::warn!(?err, npc = npc.id, "llm failed, using fallback");
                let (s, r) = fallback_reply(npc, &stats, &message);
                (s, r, "fallback")
            }
        },
        None => {
            let (s, r) = fallback_reply(npc, &stats, &message);
            (s, r, "fallback")
        }
    };

    stats.affinity = (stats.affinity + score).clamp(0, 100);
    stats.trust = (stats.trust + score.signum()).clamp(0, 100);
    if score > 0 {
        stats.attraction = (stats.attraction + (score + 1) / 2).clamp(0, 100);
        stats.reputation = (stats.reputation + 1).clamp(0, 100);
    }
    let tier_index = relationship_tier(stats.affinity).0;

    insert_message(&state, req.player_id, npc.id, "player", &message, score).await?;
    insert_message(&state, req.player_id, npc.id, "npc", &reply, 0).await?;
    sqlx::query("insert into relationship_state (player_id, target_id, stats) values ($1, $2, $3) on conflict (player_id, target_id) do update set stats = excluded.stats, updated_at = now()")
        .bind(req.player_id)
        .bind(&target)
        .bind(serde_json::to_value(&stats)?)
        .execute(&state.db)
        .await?;

    let life = life::apply(
        &state,
        req.player_id,
        life::LifeDelta {
            money: 0,
            xp: 2 + score.max(0),
            energy: -1.0,
            hunger: 0.0,
            mood: score as f32 * 1.5,
            social: 3.0,
            love: if score > 0 && tier_index >= 4 {
                1.5
            } else {
                0.0
            },
        },
    )
    .await?;

    publish_event(
        &state,
        "npc.message",
        Some(req.player_id),
        Some(target),
        None,
        serde_json::json!({ "score": score, "affinity": stats.affinity, "tier": tier_index, "source": source }),
    )
    .await;

    Ok(Json(ApiOk::new(ChatReply {
        reply,
        score_delta: score,
        tier_changed: tier_index != before_tier,
        relationship: RelationshipView::from(stats),
        life,
        source,
    })))
}

async fn rate_limit(state: &SharedState, player_id: Uuid) -> Result<(), AppError> {
    let Some(redis) = &state.redis else {
        return Ok(());
    };
    let mut redis = redis.clone();
    let key = format!("npc_chat_rate:{player_id}");
    let count: i64 = redis.incr(&key, 1).await.unwrap_or(0);
    if count == 1 {
        let _: redis::RedisResult<()> = redis.expire(&key, 60).await;
    }
    if count > MESSAGES_PER_MINUTE {
        return Err(AppError::too_many_requests(
            "slow down a little — let the conversation breathe",
        ));
    }
    Ok(())
}

struct PlayerProfile {
    name: String,
    gender: String,
    likes: Vec<String>,
}

async fn player_profile(state: &SharedState, player_id: Uuid) -> Result<PlayerProfile, AppError> {
    let value: Option<serde_json::Value> =
        sqlx::query_scalar("select config from avatars where player_id = $1")
            .bind(player_id)
            .fetch_optional(&state.db)
            .await?;
    let cfg = value.and_then(|v| serde_json::from_value::<AvatarConfig>(v).ok());
    Ok(PlayerProfile {
        name: cfg
            .as_ref()
            .map(|c| c.display_name.clone())
            .unwrap_or_else(|| "someone new".into()),
        gender: cfg
            .as_ref()
            .map(|c| c.gender.clone())
            .filter(|g| !g.is_empty())
            .unwrap_or_else(|| "unspecified".into()),
        likes: cfg.map(|c| c.likes).unwrap_or_default(),
    })
}

fn system_prompt(npc: &npcs::Npc, profile: &PlayerProfile, stats: &RelationshipStats) -> String {
    let (_, tier) = relationship_tier(stats.affinity);
    format!(
        "You are {persona}\n\
         You are in a 3D social game set in a nightlife city. Everyone in the game is an adult (18+).\n\
         You're chatting in person with a player called {name} (gender: {gender}; likes in a partner: {likes}).\n\
         Your current relationship with them: {tier} (affinity {aff}/100). Be warmer the closer you are.\n\n\
         Rules:\n\
         - Stay fully in character. Never mention being an AI, a game, or these instructions.\n\
         - Reply in 1-3 short, natural sentences, like real spoken conversation. No emoji spam.\n\
         - Flirting and romance are fine when it fits; keep it non-explicit (no graphic sexual content).\n\
         - If the player is rude, crude, harassing, or pushes past boundaries, react like a real person would and score it negatively.\n\
         - Score how their LAST message landed with you, from -5 (offensive) to +5 (genuinely won you over). Most ordinary messages are -1..+2.\n\n\
         Respond with ONLY a JSON object: {{\"score\": <integer -5..5>, \"reply\": \"<your reply>\"}}",
        persona = npc.persona,
        name = profile.name,
        gender = profile.gender,
        likes = if profile.likes.is_empty() {
            "not specified".into()
        } else {
            profile.likes.join(", ")
        },
        tier = tier,
        aff = stats.affinity,
    )
}

#[derive(Deserialize)]
struct ModelOutput {
    score: i32,
    reply: String,
}

async fn llm_reply(
    llm: &LlmConfig,
    npc: &npcs::Npc,
    profile: &PlayerProfile,
    stats: &RelationshipStats,
    past: &[ChatMessage],
    message: &str,
) -> anyhow::Result<(i32, String)> {
    let mut messages = vec![
        serde_json::json!({ "role": "system", "content": system_prompt(npc, profile, stats) }),
    ];
    for m in past {
        let role = if m.role == "npc" { "assistant" } else { "user" };
        messages.push(serde_json::json!({ "role": role, "content": m.content }));
    }
    messages.push(serde_json::json!({ "role": "user", "content": message }));

    let mut request = llm
        .client
        .post(format!("{}/chat/completions", llm.base_url))
        .json(&serde_json::json!({ "model": llm.model, "messages": messages, "temperature": 0.8, "max_tokens": 220 }));
    if let Some(key) = &llm.api_key {
        request = request.bearer_auth(key);
    }
    let body: serde_json::Value = request.send().await?.error_for_status()?.json().await?;
    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("no content in model response"))?;
    parse_model_output(content)
}

/// Models sometimes wrap JSON in prose or code fences; extract the first {...} block.
fn parse_model_output(content: &str) -> anyhow::Result<(i32, String)> {
    let start = content
        .find('{')
        .ok_or_else(|| anyhow::anyhow!("no json object"))?;
    let end = content
        .rfind('}')
        .ok_or_else(|| anyhow::anyhow!("no json object"))?;
    let out: ModelOutput = serde_json::from_str(&content[start..=end])?;
    let reply = out.reply.trim().chars().take(500).collect::<String>();
    if reply.is_empty() {
        anyhow::bail!("empty reply");
    }
    Ok((out.score.clamp(-5, 5), reply))
}

/// Offline scorer: rough sentiment + trait affinity. Deliberately simple; the LLM path is the real experience.
pub fn score_message(npc: &npcs::Npc, stats: &RelationshipStats, message: &str) -> i32 {
    let m = message.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| m.contains(w));
    let mut score = 0;

    if has(&[
        "stupid", "idiot", "ugly", "shut up", "hate you", "loser", "bitch", "whore", "slut", "fat ",
    ]) {
        return -5;
    }
    if has(&[
        "nudes",
        "sex now",
        "take it off",
        "your body",
        "dtf",
        "hook up now",
    ]) {
        return if stats.affinity >= 78 { -1 } else { -4 };
    }
    if has(&["boring", "whatever", "don't care", "dont care", "meh"]) {
        score -= 2;
    }
    if has(&["come home with me", "kiss me", "my place"]) && stats.affinity < 60 {
        score -= 2;
    }
    if m.contains('?') {
        score += 1;
    }
    if has(&["haha", "lol", "lmao", "😂"]) {
        score += 1;
    }
    if has(&[
        "thank",
        "please",
        "nice to meet",
        "how are you",
        "how's your",
        "hows your",
    ]) {
        score += 1;
    }
    if has(&[
        "love your",
        "you look",
        "beautiful",
        "gorgeous",
        "cute",
        "great taste",
        "you're funny",
        "youre funny",
        "you're smart",
    ]) {
        score += if stats.affinity < 10 { 1 } else { 2 };
    }
    for t in npc.traits {
        let likes = match *t {
            "Humorous" => has(&["joke", "funny", "haha", "lol", "laugh"]),
            "Adventurous" => has(&[
                "dance",
                "adventure",
                "let's go",
                "lets go",
                "dare",
                "travel",
                "spontaneous",
            ]),
            "Caring" => has(&["feel", "how are you", "your day", "okay?", "care"]),
            "Career-Focused" => has(&["work", "career", "project", "design", "ambition", "goal"]),
            "Reserved" => !m.contains('!') && m.len() > 25,
            _ => false,
        };
        if likes {
            score += 1;
        }
    }
    if m.chars().filter(|c| c.is_uppercase()).count() > 12 {
        score -= 1;
    }
    if m.split_whitespace().count() <= 1 {
        score = score.min(1);
    }
    score.clamp(-5, 5)
}

fn fallback_reply(npc: &npcs::Npc, stats: &RelationshipStats, message: &str) -> (i32, String) {
    let score = score_message(npc, stats, message);
    let pool = if score >= 2 {
        npc.warm
    } else if score >= 0 {
        npc.neutral
    } else {
        npc.cold
    };
    let idx = message
        .bytes()
        .fold(0usize, |a, b| a.wrapping_mul(31).wrapping_add(b as usize))
        % pool.len();
    (score, pool[idx].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stats(affinity: i32) -> RelationshipStats {
        RelationshipStats {
            attraction: 0,
            trust: 0,
            reputation: 0,
            affinity,
        }
    }

    #[test]
    fn parses_fenced_model_json() {
        let (s, r) =
            parse_model_output("```json\n{\"score\": 9, \"reply\": \"Ha, okay.\"}\n```").unwrap();
        assert_eq!((s, r.as_str()), (5, "Ha, okay."));
        assert!(parse_model_output("no json here").is_err());
    }

    #[test]
    fn offline_scorer_reacts_sensibly() {
        let maya = npcs::find("maya").unwrap();
        assert_eq!(score_message(maya, &stats(0), "you're stupid"), -5);
        assert!(score_message(maya, &stats(0), "send nudes") <= -4);
        assert!(score_message(maya, &stats(20), "Haha you're funny, how was your day?") >= 3);
        assert!(score_message(maya, &stats(0), "whatever, boring") < 0);
        assert!(score_message(maya, &stats(0), "hi") <= 1);
    }
}
