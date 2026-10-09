# 0003: Consent as a mechanic; non-graphic adult content

**Context.** The game is built around adult attraction, dating and hookups (sources B and C). It has to stay safe, legal and app-platform friendly.

**Decision.**
- **18+ only.** DOB gate and terms at registration. Real age verification before public launch.
- Every escalation needs **explicit agreement from the other side**:
  - For player targets, only the invited player can accept. The requester can only cancel.
  - Private-room tickets require `accepted` status and participant membership.
  - NPC consent is simulated for the MVP only.
- Either side can decline, cancel or leave at any time. **Block** hides both ways. **Report** is always available.
- Intimate scenes are **non-graphic**: reactions, romantic animation, fade-to-black. Language-model output stays non-explicit.
- Body count = unique partners from qualifying completed encounters, computed **server-side**. It is never required for normal progression.
- No pressure mechanics: no repeated nagging, no fake urgency.

**Consequences.** Every new interaction flow must have decline, cancel and leave paths, plus tests for them. See `scripts/smoke.mjs` for the existing consent assertions.

**Revisit when.** Legal or platform requirements change. Any loosening of content rules needs explicit client sign-off and a new record.
