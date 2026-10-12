# 0016: Settings & privacy, in-app alerts, and what account deletion erases

**Context.** Spec Screen 18 lists account management, character visibility, discovery preferences, notification
controls, blocked players, privacy, help, sign out and account deletion, with "clear toggle labels" that explain
what each setting changes. Three things weren't specified: what "notifications" means when the game has no push or
email yet (the email provider still needs client input), how far deletion reaches into other players' data, and
how unblocking interacts with matches and threads that a block ended.

**Decision.**

- **One Settings sheet** opened from Profile (gear in the header, plus a row above Sign out). Sections: Account,
  Character visibility, Discovery, Notifications, Blocked, Privacy & help, Sign out, Delete account.
- **Visibility toggles reuse existing preferences** (`discoverable`, `public_interests`, `public_relationship_style`)
  and save the avatar, so the creator and Settings can't disagree. Stat visibility links to the Detailed stats
  sheet (ADR 0014) rather than duplicating it. Discovery preferences open the creator's Preferences step.
- **Notifications are in-app alerts**, stored server-side in `player_settings.notifications`
  (`NotificationPrefs`: messages, matches, invitations, feed; all on by default, `#[serde(default)]` per field).
  They gate the Messages and Feed badges, the polled match moment and invitation toasts. They never hide a
  **private-room request**, which needs an answer (consent). Push and email are out of scope until a provider
  is chosen.
- **Blocked list + unblock** (`GET /v1/player/{id}/settings`, `POST /v1/moderation/unblock`). Unblocking only
  lifts the block: matches, ended threads and passes stay as they are, so people reconnect deliberately.
  Players who deleted their account show as "Former player".
- **Password change** needs the current password, is rate limited, and keeps the current session.
- **Account deletion** needs the word `DELETE` and, for email accounts, the password. In one transaction it
  deletes the player (everything they own cascades: account, avatar, life, NPC chats, DMs both ways, invitations
  they sent, rooms they created, rewards, achievements, settings) plus rows other players hold *about* them by
  text id (relationships, interests, passes, matches, conversation state, blocks of them, invitations and
  dates/encounters with them, feedback either way) and their audit events (which also feed the Feed). It clears
  their Redis presence. The email can be registered again.
  - **Kept:** other players' `activity_rewards` rows (their stats and body count don't change when a partner
    leaves) and `moderation_reports` filed *about* the deleted player (safety review).
  - An `account.deleted` event is published **without** a player id, so the audit doesn't re-link to them.
  - `GET /v1/auth/verify` now checks the player still exists, so a deleted account's token can't restore a session.

**Consequences.** The other side of a deleted player's history keeps the numbers but loses the names (partner
shows by id fallback). JWTs aren't revoked: a deleted player's token is still signed for up to 7 days, but every
lookup it can reach finds nothing, and session restore refuses it. A changed password doesn't sign out other
devices.

**Revisit when:** a push or email provider is chosen (add channels to `NotificationPrefs`); legal review of the
privacy policy sets a retention period for reports and audit rows; token revocation is needed (sign out everywhere
on password change).
