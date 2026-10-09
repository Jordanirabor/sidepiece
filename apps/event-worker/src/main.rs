use futures_util::StreamExt;
use sidepiece_common::GameEvent;
use sqlx::{PgPool, postgres::PgPoolOptions};
use std::env;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL is required");
    let nats_url = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".into());

    let db = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    sqlx::migrate!("../../migrations").run(&db).await?;

    let nats = async_nats::connect(nats_url).await?;
    let mut sub = nats.subscribe("events.>").await?;
    tracing::info!("sidepiece event worker subscribed to events.>");

    while let Some(message) = sub.next().await {
        match serde_json::from_slice::<GameEvent>(&message.payload) {
            Ok(event) => {
                if let Err(err) = persist_event(&db, &event).await {
                    tracing::warn!(
                        ?err,
                        event_type = event.event_type,
                        "failed to persist event"
                    );
                } else {
                    tracing::info!(event_type = event.event_type, "persisted event");
                }
            }
            Err(err) => tracing::warn!(?err, subject = %message.subject, "bad event payload"),
        }
    }

    Ok(())
}

async fn persist_event(db: &PgPool, event: &GameEvent) -> anyhow::Result<()> {
    sqlx::query(
        "insert into game_event_audit (event_type, player_id, target_id, room_id, payload, event_timestamp) values ($1, $2, $3, $4, $5, $6)",
    )
    .bind(&event.event_type)
    .bind(event.player_id)
    .bind(&event.target_id)
    .bind(&event.room_id)
    .bind(&event.payload)
    .bind(event.timestamp)
    .execute(db)
    .await?;
    Ok(())
}
