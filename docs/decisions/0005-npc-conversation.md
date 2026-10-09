# 0005: NPC conversation is free-text, scored, and provider-agnostic

**Context.** The client's gameplay screenshot shows free-text NPC chat with per-message scores, a relationship meter, a tier label and a typing indicator. The spec's date scenes use 2–3 dialogue choices.

**Decision.**
- NPC chat is **free-text**. Each player message is scored −5..+5. The score moves `affinity` (0–100), which sets **7 tiers**: Stranger, Acquaintance, Friendly, Friend, Close Friend, Best Friend, Partner.
- Uses any **OpenAI-compatible** chat API (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`).
- If no model is configured or it fails, a deterministic **offline scorer** keeps the game playable.
- The system prompt contains: persona, relationship tier, player profile, the content rules from ADR 0003, and an instruction to return JSON.
- History is stored in `npc_messages`. The chat is rate limited.
- Date scenes (not built yet) will use short **choice-driven** beats, alongside free-text chat.
- NPCs are content (`apps/api/src/npcs.rs`): id, venue, persona, traits (from `PARTNER_TRAITS`), greeting, fallback lines, look.

**Consequences.**
- Model cost and latency per message.
- Prompt changes are product changes. Test them against the offline scorer's expectations and the smoke test.

**Revisit when.** A provider is chosen (pin a model). NPC memory needs summarisation beyond 12 turns. NPCs move to admin-managed data in Postgres.
