use axum::{
    Json, Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
    routing::get,
};
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use redis::AsyncCommands;
use serde::Deserialize;
use sidepiece_common::{
    ApiOk, ClientEvent, GameEvent, HealthResponse, PlayerId, RoomId, RosterEntry, ServerEvent,
};
use std::{collections::HashMap, env, net::SocketAddr, sync::Arc};
use tokio::sync::{RwLock, broadcast};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
struct AppState {
    rooms: Arc<RwLock<HashMap<RoomId, RoomHandle>>>,
    redis: Option<redis::aio::ConnectionManager>,
    nats: Option<async_nats::Client>,
}

#[derive(Clone)]
struct RoomHandle {
    tx: broadcast::Sender<ServerEvent>,
    roster: Arc<RwLock<HashMap<PlayerId, RosterEntry>>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let redis = match env::var("REDIS_URL") {
        Ok(url) => Some(redis::Client::open(url)?.get_connection_manager().await?),
        Err(_) => None,
    };

    let nats = match env::var("NATS_URL") {
        Ok(url) => Some(async_nats::connect(url).await?),
        Err(_) => None,
    };

    let state = AppState {
        rooms: Arc::new(RwLock::new(HashMap::new())),
        redis,
        nats,
    };
    let app = Router::new()
        .route("/health", get(health))
        .route("/ws", get(ws_handler))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = env::var("ROOM_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:4001".into())
        .parse()?;
    tracing::info!(%addr, "sidepiece room server listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> Json<ApiOk<HealthResponse>> {
    Json(ApiOk::new(HealthResponse {
        service: "sidepiece-room-server".into(),
        status: "ok".into(),
        timestamp: Utc::now(),
    }))
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let Some(Ok(Message::Text(first))) = receiver.next().await else {
        return;
    };
    let Ok(ClientEvent::Join {
        player_id,
        display_name,
        room_id,
        token,
        look,
    }) = serde_json::from_str::<ClientEvent>(&first)
    else {
        let _ = send_ws_error(&mut sender, "first message must be join").await;
        return;
    };

    if let Err(message) =
        verify_join_ticket(&state, player_id, &display_name, &room_id, &token).await
    {
        let _ = send_ws_error(&mut sender, &message).await;
        return;
    }

    set_player_present(&state, &room_id, player_id, &display_name).await;
    publish_event(
        &state,
        "room.player_joined",
        Some(player_id),
        None,
        Some(room_id.clone()),
        serde_json::json!({ "display_name": display_name }),
    )
    .await;

    let handle = get_or_create_room(&state, &room_id).await;
    let mut rx = handle.tx.subscribe();
    // Snapshot existing occupants before adding ourselves, so the joiner can render them immediately.
    let roster: Vec<RosterEntry> = {
        let mut occupants = handle.roster.write().await;
        let existing = occupants
            .values()
            .filter(|e| e.player_id != player_id)
            .cloned()
            .collect();
        occupants.insert(
            player_id,
            RosterEntry {
                player_id,
                display_name: display_name.clone(),
                look: look.clone(),
                x: 0.0,
                y: 0.0,
                z: -3.0,
                rot_y: 0.0,
            },
        );
        existing
    };
    let _ = handle.tx.send(ServerEvent::PlayerJoined {
        player_id,
        display_name: display_name.clone(),
        look,
    });
    let _ = sender
        .send(Message::Text(
            serde_json::to_string(&ServerEvent::Welcome {
                player_id,
                room_id: room_id.clone(),
                roster,
            })
            .unwrap()
            .into(),
        ))
        .await;

    let mut send_task = tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            if sender
                .send(Message::Text(serde_json::to_string(&event).unwrap().into()))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    let tx = handle.tx.clone();
    let roster_handle = handle.roster.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            let Message::Text(text) = msg else {
                continue;
            };
            match serde_json::from_str::<ClientEvent>(&text) {
                Ok(ClientEvent::Move { x, y, z, rot_y }) => {
                    if let Some(entry) = roster_handle.write().await.get_mut(&player_id) {
                        entry.x = x;
                        entry.y = y;
                        entry.z = z;
                        entry.rot_y = rot_y;
                    }
                    let _ = tx.send(ServerEvent::PlayerMoved {
                        player_id,
                        x,
                        y,
                        z,
                        rot_y,
                    });
                }
                Ok(ClientEvent::Chat { text }) => {
                    let text: String = text.trim().chars().take(280).collect();
                    if text.is_empty() {
                        continue;
                    }
                    let _ = tx.send(ServerEvent::Chat {
                        player_id,
                        display_name: display_name.clone(),
                        text,
                    });
                }
                Ok(ClientEvent::Leave) => break,
                Ok(_) => {}
                Err(err) => tracing::warn!(?err, "bad websocket event"),
            }
        }
    });

    tokio::select! { _ = (&mut send_task) => recv_task.abort(), _ = (&mut recv_task) => send_task.abort() }
    let room_empty = {
        let mut occupants = handle.roster.write().await;
        occupants.remove(&player_id);
        occupants.is_empty()
    };
    let _ = handle.tx.send(ServerEvent::PlayerLeft { player_id });
    if room_empty {
        state.rooms.write().await.remove(&room_id);
    }
    set_player_absent(&state, &room_id, player_id).await;
    publish_event(
        &state,
        "room.player_left",
        Some(player_id),
        None,
        Some(room_id),
        serde_json::json!({}),
    )
    .await;
}

async fn send_ws_error(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    message: &str,
) -> Result<(), axum::Error> {
    sender
        .send(Message::Text(
            serde_json::to_string(&ServerEvent::Error {
                message: message.into(),
            })
            .unwrap()
            .into(),
        ))
        .await
}

#[derive(Deserialize)]
struct StoredRoomTicket {
    player_id: PlayerId,
    display_name: String,
    room_id: String,
}

async fn verify_join_ticket(
    state: &AppState,
    player_id: PlayerId,
    display_name: &str,
    room_id: &str,
    ticket: &str,
) -> Result<(), String> {
    let Some(redis) = &state.redis else {
        return Err("redis is required for room tickets".into());
    };
    let mut redis = redis.clone();
    let key = format!("room_ticket:{ticket}");
    let stored_json: Option<String> = redis
        .get(&key)
        .await
        .map_err(|_| "could not read room ticket".to_string())?;
    let Some(stored_json) = stored_json else {
        return Err("room ticket expired or invalid".into());
    };
    let stored: StoredRoomTicket = serde_json::from_str(&stored_json)
        .map_err(|_| "room ticket payload invalid".to_string())?;
    if stored.player_id != player_id {
        return Err("ticket does not match joining player".into());
    }
    if stored.display_name != display_name {
        return Err("ticket does not match display name".into());
    }
    if stored.room_id != room_id {
        return Err("ticket does not match room".into());
    }
    let _: redis::RedisResult<()> = redis.del(key).await;
    Ok(())
}

async fn publish_event(
    state: &AppState,
    event_type: &str,
    player_id: Option<PlayerId>,
    target_id: Option<String>,
    room_id: Option<String>,
    payload: serde_json::Value,
) {
    let Some(nats) = &state.nats else {
        return;
    };
    let event = GameEvent {
        event_type: event_type.into(),
        player_id,
        target_id,
        room_id,
        payload,
        timestamp: Utc::now(),
    };
    match serde_json::to_vec(&event) {
        Ok(bytes) => {
            if let Err(err) = nats
                .publish(format!("events.{event_type}"), bytes.into())
                .await
            {
                tracing::warn!(?err, event_type, "failed to publish nats event");
            }
        }
        Err(err) => tracing::warn!(?err, event_type, "failed to serialize event"),
    }
}

async fn set_player_present(
    state: &AppState,
    room_id: &str,
    player_id: PlayerId,
    display_name: &str,
) {
    let Some(redis) = &state.redis else {
        return;
    };
    let mut redis = redis.clone();
    let player_id = player_id.to_string();
    let players_key = format!("room:players:{room_id}");
    let names_key = format!("room:names:{room_id}");
    let _: redis::RedisResult<()> = redis.sadd(&players_key, &player_id).await;
    let _: redis::RedisResult<()> = redis.hset(&names_key, &player_id, display_name).await;
    let _: redis::RedisResult<()> = redis
        .set_ex(format!("player:room:{player_id}"), room_id, 300)
        .await;
}

async fn set_player_absent(state: &AppState, room_id: &str, player_id: PlayerId) {
    let Some(redis) = &state.redis else {
        return;
    };
    let mut redis = redis.clone();
    let player_id = player_id.to_string();
    let players_key = format!("room:players:{room_id}");
    let names_key = format!("room:names:{room_id}");
    let _: redis::RedisResult<()> = redis.srem(&players_key, &player_id).await;
    let _: redis::RedisResult<()> = redis.hdel(&names_key, &player_id).await;
    let _: redis::RedisResult<()> = redis.del(format!("player:room:{player_id}")).await;
}

async fn get_or_create_room(state: &AppState, room_id: &str) -> RoomHandle {
    if let Some(handle) = state.rooms.read().await.get(room_id).cloned() {
        return handle;
    }
    let mut rooms = state.rooms.write().await;
    rooms
        .entry(room_id.to_string())
        .or_insert_with(|| {
            let (tx, _) = broadcast::channel(512);
            RoomHandle {
                tx,
                roster: Arc::new(RwLock::new(HashMap::new())),
            }
        })
        .clone()
}
