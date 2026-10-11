# Side Piece: product vision

> This is the consolidated product truth, distilled from the three client sources (see `source-analysis.md`).
> If an implementation choice contradicts this file, either change the implementation or update this
> file **with the client's agreement**. Don't let them drift apart silently.

## One line

**Side Piece is a mobile-first, web-based, semi-realistic 3D adult (18+) social world set in Lagos nightlife.**
You build a character, enter the city, meet compatible people (real players and NPCs), flirt and chat,
agree on dates and private experiences, and earn money, reputation and story.

Tagline: **"Same People. New Options."** · Ethos: **"Better Choices, Bigger Stories."**

## Who it's for

Adults (18+) who enjoy social and romance games such as Sims-style life sims, Highrise, Choices and Thirsty Suitors,
and who want attraction, dating and adult relationships to be the *core* gameplay rather than a side system.

## The core loop

```
Onboarding (once, editable later)
  Account (18+) → Character creator (4 panels) → Preferences → Profile preview → Enter the City

Gameplay loop (where players spend their time)
  Discover → Connect (interest / match) → Chat → Make plans (invitation) → Experience (date / private scene)
  → Outcome & rewards (₦, XP, reputation, body count) → Discover again
```

Life-sim pressure runs underneath the loop. Needs (energy, hunger, mood, social, love), money, XP/level and
the world clock (day/night) give the player reasons to work, eat, rest, go out and come back.

## Pillars

1. **Your character is your identity.** The creator matters (both client videos are entirely about it), and the
   same avatar appears everywhere: world, cards, chat headers, dates, profile.
2. **A lively place, not a menu.** Small, populated, semi-realistic 3D venues (ADR 0012). Never leave a player in an empty room
   with no next step. NPCs fill gaps when players are scarce.
3. **Conversation is gameplay.** NPC chat is free-text and every message is *scored*. Relationships move through
   visible tiers (Stranger → … → Best Friend → Partner).
4. **Consent is a mechanic.** Every escalation (private room, date, encounter) needs explicit agreement. Either
   side can decline, cancel or leave at any time. Block and report are always one tap away.
5. **Progression you can see.** ₦ cash, level, reputation, relationships, body count (unique partners) and
   achievements. All of it is computed **server-side**.
6. **Consistency over breadth.** One design system and one component library. A few polished venues beat many
   half-built ones.

## Setting

Lagos, Nigeria: Victoria Island rooftops, Lekki lounges and estates, Afrobeats clubs (Quilox-style),
neon-lit streets. Currency is **₦ (naira)**. The cast is fashionable, adult and Black/African-forward.

## Content rules (non-negotiable)

- 18+ only. Age gate at registration; stronger verification before public launch (jurisdiction-dependent).
- Adult themes are allowed, but **intimate scenes are non-graphic**: character reactions, romantic animation, fade-to-black.
- NPC language-model output stays non-explicit and in character. Crude or harassing players get negative scores.
- Progression must not *require* sexual encounters. Dating, socializing and relationships are valid paths.
- No pressure mechanics: no repeated nagging to accept invites, no fake urgency.
- Private data stays private. Players choose which preferences and stats are public.

## Platform & tech (see `docs/decisions/`)

Web first (mobile-first layout), native later. Rust backend (Axum API, WebSocket room server, event worker),
Postgres, Redis, NATS, optional MinIO. Babylon.js + React client. Deployed with Docker Compose on Dokploy,
designed to scale out.

## Non-goals (for now)

- A massive seamless open world.
- Photoreal avatars (we target semi-realistic, ADR 0012).
- Graphic sexual content.
- Multiple currencies, loot boxes, complex crafting or a dozen half-finished venues.
