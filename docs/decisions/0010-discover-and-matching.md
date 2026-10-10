# 0010: Discover deck, matching rules and where Discover lives

**Context.** Spec Screens 07/07A/08 ask for fast Like/Pass cards, a profile detail, and a short match moment.
They don't say how NPCs match, how long a Pass lasts, or where Discover sits in a 4-tab bottom nav. Player
DMs (Screen 09) are M5, after this.

**Decision.**
- **Entry points:** Discover opens from the world dock (primary pink button) and from the Messages tab. The
  bottom nav stays World / Messages / Feed / Profile (design-system.md); no fifth tab.
- **Deck order:** players first, filtered by mutual "show me" + discoverable + blocks, excluding anyone already
  liked/matched or passed in the last 24h; best compatibility first, online players lifted to the top. NPCs
  fill the deck when players run out (`fallback`).
- **Pass** hides a profile for **24 hours** (server-side, so reloads don't bring it back). It is never permanent.
- **Player match:** both sides liked each other. The actor sees the match moment immediately; the other side
  sees it once on their next poll (`matches.seen_at`).
- **NPC match:** an NPC "likes back" only when your relationship is **Friendly** (affinity ≥ 25) or better.
  Liking earlier records interest and tells you to go chat. Conversation stays the way in (pillar 3).
- **Start chat** with an NPC opens their chat. With a player it opens Messages, which lists the match with
  where they are ("Meet there" jumps to their venue) until DMs land in M5.
- Liking someone who blocked you returns "profile not available" (404), never revealing the block.

**Consequences.** New tables `player_passes`, `matches`. `POST /v1/social/interest` now returns `matched` and
`match_info`, so every "Interest" button can trigger the match moment.

**Revisit when.** Player volume makes the 300-candidate scan slow (move ranking into SQL), or the client wants
NPCs to be harder/easier to match.
