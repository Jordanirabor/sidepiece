---
name: sidepiece-npc
description: Author and tune Side Piece NPCs and their free-text, scored conversations (apps/api/src/npcs.rs, chat.rs). Use when adding or editing NPCs, personas, traits, greetings, fallback lines, venue placement, relationship tiers, the language-model prompt or scoring, or when configuring the LLM provider.
---

# NPCs & scored conversation

Reference: the client gameplay screenshot `docs/references/whatsapp/03-gameplay-npc-chat-hud.jpg`:
free-text input, per-message score "(−3)", a ☹️–😊 meter, a tier label ("Best Friend") and "6/7". See ADR 0005.

## Adding an NPC (`apps/api/src/npcs.rs` → `NPCS`)
Fill **every** field:
- `id` (lowercase, stable: it is part of `npc:{id}` relationship keys and `npc_messages`), `name`
- `venue` (an existing room kind), `x`, `z` (inside venue bounds, clear of spawn/doors)
- `tagline`, `looking_for`, `social_rating`
- `traits`: 1–3 values from `sidepiece_common::PARTNER_TRAITS` (Adventurous, Career-Focused, Caring, Humorous, Reserved). Compatibility = overlap with the player's likes.
- `persona`: who they are, age (adult), job, vibe, what wins them over and what turns them off. Lagos-rooted once M2 lands.
- `greeting`: their opening line. It is shown as the first message.
- `warm` / `neutral` / `cold`: 3+ offline fallback replies each.
- `look`: `AvatarLook`. Add any new `top`/`bottom`/`accessory` ids to `web/src/look.ts` catalogs.

The `catalog_is_consistent` test enforces traits and non-empty lines. Run `cargo test -p sidepiece-api`.

## Tone & content (ADR 0003)
Adults only. Flirtatious is fine; **never graphic**. Crude, harassing or pushy messages must score negatively,
and the NPC reacts like a real person. NPCs never mention being an AI or a game.

## Scoring & tiers
- Score −5..+5 per player message. `affinity` 0–100 drives `RELATIONSHIP_TIERS` in `crates/common`:
  Stranger 0, Acquaintance 10, Friendly 25, Friend 40, Close Friend 60, Best Friend 78, Partner 92.
- Side effects in `chat.rs::send_message`: trust ±1, attraction and reputation rise on positive messages,
  and life deltas apply (social +3, energy −1, XP +2+score, mood ±, love at tier ≥ 4).
- "Somewhere private" on the client is gated to tier ≥ 4 (Friend).
- When changing the offline scorer (`score_message`), update `offline_scorer_reacts_sensibly`.

## Language-model configuration
Env vars: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. Any OpenAI-compatible endpoint works: OpenAI, OpenRouter, Ollama (`http://host.docker.internal:11434/v1`), vLLM.
The prompt is built in `system_prompt()`. The model must reply with JSON `{"score": n, "reply": "…"}`; fenced or wrapped JSON is tolerated by `parse_model_output`.
If the model fails, the offline fallback runs. The response includes `source: "llm" | "fallback"`.

Test the model path without a real key by running a mock OpenAI-compatible server. Example from this project's history:
- run a Node HTTP server on :4999 that answers `/v1/chat/completions` with a fenced JSON reply
- run a local api with `LLM_BASE_URL=http://127.0.0.1:4999/v1` on another port
- assert `source == "llm"` and that history grows each turn
- kill the mock and assert it falls back

**Choosing a provider and content level needs client input.** Ask before setting one up.
