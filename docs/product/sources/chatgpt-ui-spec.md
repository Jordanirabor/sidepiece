<!--
SOURCE DOCUMENT — do not edit the body; it is a verbatim capture.
Origin: ChatGPT shared chat "Side Piece — Complete UI Flow & Screen-by-Screen Design Specification"
URL: https://chatgpt.com/s/t_6ac92a4367888191b9b830748813fdb8
Captured: 2026-10-09. Reference images from this chat live in docs/references/ui-spec-chat/.
How it is used: see docs/product/source-analysis.md (§ Source C) and docs/product/screen-map.md.
-->

# SIDE PIECE

## Complete UI Flow & Screen-by-Screen Design Specification

Version 1.0 · Product design blueprint · Mobile-first web game

The goal is to make Side Piece feel like one continuous, addictive social world rather than a collection of disconnected screens.

A player should be able to create a character, enter a lively Lagos-inspired environment, discover people who share their interests, flirt, chat, go on dates, explore consensual adult encounters, earn virtual money, build a reputation and return for more — without getting lost in menus.

The most important design principle is **consistency**. The character profile, world, player cards, chat interface, date scenes and statistics must all feel like parts of the same game.

# 1. The complete game flow

This is the master journey from the first launch to the repeat gameplay loop.

After progression, the player returns to discovery. The loop continues.

There should be two distinct parts to the experience:

- **Onboarding:** Create an account and build the character once, with the option to edit later.
- **The gameplay loop:** Discover → connect → chat → make plans → experience → reward → discover again.

The second part should account for most of the player's time.

---

# 2. The consistent UI system

Before designing individual screens, establish one shared visual language.

## A. Overall visual direction

Side Piece should look like a premium, playful nightlife game. Think stylish Lagos lounges, rooftop parties, contemporary apartments, neon-lit streets and fashionable adult characters.


> 🖼️ _Reference image search: stylized 3D mobile social game UI design dark plum lavender pink nightlife aesthetic, stylized 3D Lagos rooftop nightlife city game environment neon lights, stylized 3D fashionable adult game avatars modern casual streetwear_


Suggested design system:

| Element | Standard |
|--------|--------|
| Background | Deep plum, charcoal or warm off-white, depending on the screen |
| Primary accent | Purple or violet |
| Secondary accent | Coral pink |
| Success accent | Muted green |
| Typography | One modern sans-serif family with consistent weights |
| Cards | Rounded corners and subtle elevation |
| Buttons | One consistent height, radius and hierarchy |
| Icons | One consistent icon family and stroke style |
| Animation | Short, responsive transitions rather than long cutscenes |
| Spacing | Consistent 8-point spacing system |

Use dark, immersive layouts in the social world and shared scenes. Use clearer, quieter layouts for account setup, profile editing and statistics.

## B. Persistent interface elements

Every main gameplay screen should follow the same structure.

CEE

Level 8

₦85,000

---

## Main Content Area

Scene, profile, chat or activity

Primary Action

---

Illustrative layout structure. The exact cash display, top bar and navigation can adapt to each screen without changing the overall visual system.

The persistent shell has four elements:

1. **Identity:** Avatar, display name and level.
2. **Status:** Virtual cash and other relevant progression information.
3. **Content:** The main thing the player is doing.
4. **Navigation:** World, Messages, Feed and Profile.

During a full-screen date or shared scene, the cash display and bottom navigation can disappear temporarily. The back or exit control must remain accessible.

---

# 3. Screen-by-screen specification

## Screen 01 — Welcome

**Purpose:** Get the player into the game quickly.

The opening screen features the Side Piece logo, a short description of the game and a visually attractive nightlife background. Avoid showing too many menus or statistics before the player has entered the world.

Elements:

- Side Piece logo.
- Animated or illustrated nightlife backdrop.
- Create Account button.
- Sign In button.
- Terms and Privacy links.

**Primary action:** Create Account.

**Flow:**

- Create Account → Screen 02.
- Sign In → Screen 02A.
- Terms or Privacy → relevant legal page.

The opening screen should communicate the game's identity immediately: social discovery, attraction, freedom and progression.

## Screen 02 — Account creation

**Purpose:** Establish the player's account.

Elements:

- Username or email.
- Password or supported sign-in method.
- Date-of-birth or age-eligibility verification.
- Terms acceptance.

**Primary action:** Create Account.

**Flow:**

- Successful registration → Screen 03.
- Invalid information → Inline error.
- Existing account → Sign In.
- Network failure → Retry without losing entered information.

Because the game is built around adult themes, access should be restricted to eligible adults, with appropriate age verification.

## Screen 03 — Character builder

**Purpose:** Let the player build the character they will inhabit.


> 🖼️ _Reference image search: stylized 3D video game character creator fashionable male avatar clothing selection interface, stylized 3D video game character creator fashionable female avatar hairstyle outfit selection_


The screen should have a large avatar preview and a small set of customization categories.

**Layout:**

- Centre: Character preview.
- Left or top: Customization categories.
- Bottom: Previous, Randomize and Continue.

Customization categories:

1. Face and skin appearance.
2. Hairstyle.
3. Body type.
4. Clothing and accessories.
5. Display name.

**Primary action:** Continue.

**Flow:**

- Change appearance → Preview updates immediately.
- Randomize → Generates another appearance.
- Continue → Screen 04.
- Back → Account creation or welcome, as appropriate.

**Consistency rule:** The avatar created here must be the same avatar shown in profile cards, chat headers, the world, date scenes and the player's profile.

The character should not mysteriously change appearance between screens.

## Screen 04 — Preferences and intent

**Purpose:** Tell the game what kinds of people and experiences the player wants to discover.

This is a personalization screen, not a long questionnaire.

Group preferences into a few compact sections:

- Relationship style: casual dating, committed relationships, non-exclusive relationships or open to different arrangements.
- Interests: activities and social settings the player enjoys.
- Intent: meet people, flirt, date, explore casual connections or pursue a relationship.
- Boundaries: activities the player does not want to be invited to.
- Discovery settings: who they want to encounter.

**Primary action:** Save Preferences.

**Flow:**

- Save → Screen 05.
- Back → Screen 03.
- Later changes → Profile settings.

Do not expose private preferences to everyone. The player should control which details appear on their public profile.

## Screen 05 — Profile preview

**Purpose:** Show the player how others will see them.

The screen displays:

- Character avatar.
- Display name.
- Optional bio.
- Selected public interests.
- Relationship style, if the player chooses to disclose it.
- Discoverability setting.

**Primary action:** Enter the World.

Secondary actions allow the player to edit their character or preferences.

**Flow:**

- Enter the World → Screen 06.
- Edit Character → Screen 03.
- Edit Preferences → Screen 04.

This is the end of onboarding. Do not introduce extra tutorials, reward shops or complicated dashboards before the player gets to explore.

---

# 4. Entering the game world

## Screen 06 — World / social hub

This is the most important screen in Side Piece.

The player should feel as though they have entered a place where something is happening, rather than a dashboard filled with buttons.


> 🖼️ _Reference image search: stylized 3D open world social game modern Lagos nightlife rooftop lounge city skyline, stylized 3D social simulation game nightclub interior fashionable adult characters, stylized 3D modern Lagos apartment building courtyard social game environment_


### Layout

**Top bar:** Player avatar, level, cash and a compact notification indicator.

**Main view:** A stylized 3D location with other characters and social activity.

**Location label:** For example, *Victoria Island Rooftop*.

**Nearby characters:** Visible characters, with subtle indicators showing who is available or interested in meeting people.

**Bottom controls:**

- Move or interact.
- Discover people.
- View messages.
- Change location.

The game can use a lightweight 3D environment rather than a massive open world. A small, lively location with recognizable characters is more valuable than a huge, empty map.

### Player interactions

- Tap a character → Open their profile.
- Tap a venue hotspot → View location details.
- Tap Discover → Browse compatible profiles.
- Tap Messages → Open the inbox.
- Tap Profile → View character and statistics.

### Important fallback

If no compatible players are available, the game should offer three alternatives:

- Broaden discovery preferences.
- Visit another location.
- Meet an NPC, if NPCs are part of the selected game mode.

Never leave a player staring at an empty location with no explanation.

## Screen 06A — Location details

When the player selects a nightclub, rooftop, lounge or apartment venue, open a compact location panel.

It includes:

- Location artwork.
- Name and atmosphere.
- Activity type.
- Number of available players, when accurate.
- Entry cost, if any.
- Enter Venue button.

**Flow:** Enter Venue → Screen 06 at the selected location.

If the player cannot afford an optional venue, show free alternatives rather than stopping the gameplay loop.

---

# 5. Discovering and connecting with players

## Screen 07 — Discover

The Discover screen can be opened from the world and should also be reachable from the main navigation.

Its job is simple: help players find people worth interacting with.


> 🖼️ _Reference image search: stylized 3D attractive adult game avatars profile cards dating game UI modern dark interface, stylized 3D fashionable adult male female character portraits mobile social game_


Each profile card contains:

- Avatar portrait.
- Name and age, where appropriate.
- Short bio.
- Selected public interests.
- Compatibility hint.
- Like and Pass actions.

**Primary action:** Like.

**Secondary action:** Pass or open the full profile.

**Flow:**

- Like → Record interest.
- If interest is mutual → Screen 08.
- If not mutual → Show the next profile.
- Pass → Show the next profile.
- Tap profile → Screen 07A.

The interface should make these actions fast. Avoid opening a confirmation dialog every time someone taps Like or Pass.

## Screen 07A — Profile detail

This is a deeper view of another player's character.

It includes:

- Larger avatar.
- Full public bio.
- Voluntarily shared interests.
- Relationship preferences that the player has chosen to display.
- Compatibility information.
- Like or Express Interest button.

**Primary action:** Express Interest.

**Flow:**

- Mutual interest → Screen 08.
- No mutual interest yet → Return to Discover with interest recorded.
- Back → Screen 07.

A profile should not reveal private boundaries, hidden relationship details or private messages.

## Screen 08 — Match confirmation

When two players express interest in each other, trigger a short match moment.

The screen shows both avatars, a brief animation and two options:

- Start Chat.
- Keep Exploring.

**Primary action:** Start Chat.

**Flow:**

- Start Chat → Screen 09.
- Keep Exploring → Return to Screen 07 or Screen 06.

The animation should be short and skippable. Its purpose is to reward the interaction, not interrupt the player for several seconds.

---

# 6. The chat interface

## Screen 09 — Chat

The chat screen is the bridge between finding someone and doing something together.

It should feel like an ordinary modern messaging interface integrated into the game's visual identity.

Tara

Matched with you

---

Today · 9:42 PM

Hey, I saw you at the rooftop. You looked familiar.

Maybe you should come say hello properly.

Quick actions

Suggest a date

Suggest a venue

Message...

Illustrative chat wireframe. The messages and character are fictional examples.

### Chat layout

**Header**

- Back button.
- Avatar and display name.
- Presence status, where available.
- Profile shortcut.
- More menu with mute, block and report.

**Conversation area**

- Incoming and outgoing messages.
- Timestamps.
- Delivery indicators where supported.
- Optional quick reactions.

**Composer**

- Text input.
- Send button.
- Optional emoji or reaction control.

**Activity shortcut**

- Suggest a date.
- Suggest a venue.
- Suggest another shared activity.

Keep these actions accessible without forcing the player to leave the conversation.

### Chat state flow

**Match confirmed**

Open a private conversation

**Chat active**

Send messages, flirt, learn about each other

**Suggest an activity**

Choose a date, venue or other experience

Accepted

Proceed to activity

Declined

Return to chat

Important rules:

- Sending a message does not automatically start an activity.
- Suggesting a date does not mean the other player has accepted.
- A declined invitation should not prevent the players from continuing a normal conversation.
- Players must always be able to end a conversation, block or report someone.

## Screen 09A — Conversation controls

Opened from the chat's more menu.

Options:

- Mute notifications.
- Block player.
- Report player.
- End conversation.

Each action should have a clear explanation. Blocking and reporting should be private, and destructive actions should require confirmation.

---

# 7. Invitations and activities

## Screen 10 — Suggest an activity

This screen should be a compact bottom sheet or modal, not a completely new section of the app.

Available options might include:

- Continue chatting.
- Go on a public date.
- Visit a social venue together.
- Visit a private location together.

Each option has an icon, short description and any applicable virtual cost.

**Primary action:** Send Invitation.

**Flow:**

- Send → Screen 11.
- Cancel → Screen 09.
- Recipient accepts → Screen 12.
- Recipient declines or invitation expires → Return to chat.

The activity must be clearly described before the invitation is sent. Private or intimate activities require explicit agreement, and either player must be able to change their mind.

## Screen 11 — Invitation pending

This screen state can appear within the chat rather than taking the player away from it.

Display a small activity card:

- What was proposed.
- Who sent it.
- Current status.
- Cancel invitation option.

Statuses include Pending, Accepted, Declined, Expired and Cancelled.

**Flow:**

- Accepted → Screen 12.
- Declined, expired or cancelled → Screen 09.
- Continue chatting → Remain in Screen 09.

Avoid repeated notifications pressuring someone to accept. A pending invitation should not freeze the conversation.

---

# 8. The date and shared experience

## Screen 12 — Date / shared scene

This is where the game should feel more like an animated social simulation than a messaging app.


> 🖼️ _Reference image search: stylized 3D romantic rooftop dinner night city skyline video game environment, stylized 3D modern Lagos lounge date scene game art adult characters, stylized 3D luxury apartment living room night social simulation game environment_


The environment depends on the chosen activity.

A public date could include:

- A lounge or restaurant.
- Dialogue choices.
- Character reactions.
- Small activity objectives.
- A date outcome.

A venue visit could include:

- Arrival animation.
- Character movement and interaction.
- Conversation choices.
- A shared activity.

### Layout

- Full-screen environment.
- Character avatars in the scene.
- Dialogue panel near the bottom.
- Two or three concise response choices.
- A visible Leave button.
- Optional objective or activity status.

**Primary action:** Select a dialogue choice or activity.

**Flow:**

- Complete activity → Screen 13.
- Leave → Confirmation, then return to chat or world.
- Other player disconnects → Show a neutral recovery option.

Keep the scene short. The point is to make players feel that their choices influence what happens, without requiring long, complex gameplay.

## Screen 13 — Private encounter

For consensual adult encounters, use a non-graphic presentation style: character reactions, romantic animation, a scene transition or a fade-to-black.

The screen should contain:

- Clear confirmation that both players want to proceed.
- A start or continue action.
- A Skip or Leave option.
- A clear transition to the outcome.

**Flow:**

- Both participants confirm → Start the scene.
- Either participant exits → End the scene.
- Completed scene → Screen 14.

Do not require players to complete a sexual encounter to earn ordinary progression rewards. Dating, socializing and relationship-building should also be valid gameplay paths.

---

# 9. Outcomes, rewards and body count

## Screen 14 — Encounter outcome

After an activity, show a concise summary.

Elements:

- Activity completed.
- Optional partner feedback.
- Virtual currency earned.
- Relationship or reputation changes, if applicable.
- Continue button.

**Primary action:** Continue.

**Flow:**

- Continue → Screen 15 or return to the world.
- Submit feedback → Update the outcome summary.
- Skip feedback → Continue without a penalty.

Rewards should be based on legitimate game rules, such as completing an activity or earning an achievement, rather than forcing players to give one another high ratings.

## Screen 15 — Player profile and stats

The player's profile should feel like a personal record of their journey.

# CEE

Level 8 · Rising Star

Social reputation: 8.6/10

Return to World

Illustrative sample stats, not real player data.

The important statistics are:

- **Body count:** Number of unique partners associated with qualifying completed encounters.
- **Total encounters:** Number of qualifying completed encounters, including repeat encounters.
- **Game cash:** Current virtual currency balance.
- **Social reputation:** A broader score derived from relevant gameplay systems.
- **Achievements:** Milestones earned through play.

For example, if a player has completed three qualifying encounters with the same person, that contributes one unique partner and three total encounters.

Body count should not be confused with a rating of how good someone is at intimacy. It is a record of unique partners; reputation can measure other aspects of gameplay.

**Flow:**

- Return to World → Screen 06.
- View detailed stats → Screen 15A.
- Edit character → Screen 03.
- Edit preferences → Screen 04.

## Screen 15A — Detailed statistics

This is an optional detail screen. It should not interrupt the main gameplay loop.

It can show:

- Unique partners.
- Total encounters.
- Currency earned and spent.
- Achievements.
- Rating history.
- Progress towards the next level.

The information should be clear, accurate and easy to understand. Players should be able to control which stats are publicly visible.

---

# 10. The remaining navigation screens

These screens support the core experience but should not dominate it.

## Screen 16 — Feed

The Feed provides a lightweight view of game-world activity.

Possible content:

- New matches.
- Invitations.
- Achievements.
- Updates from fictional characters.
- Completed activity summaries.
- New venue or event announcements.

Each item should link directly to its relevant screen.

Examples:

- New match → Chat.
- Invitation → Invitation card or chat.
- Achievement → Detailed stats.
- Venue announcement → Venue details.

The feed should be relevant and engaging without generating fake urgency.

## Screen 17 — Messages inbox

The inbox is the place to resume previous conversations.

Each row includes:

- Avatar.
- Player name.
- Last message.
- Timestamp.
- Unread indicator.
- Optional presence indicator.

Tapping a row opens the existing chat, preserving the message history and invitation state.

The empty state should direct a new player to Discover rather than leaving them on a blank screen.

## Screen 18 — Settings and privacy

Settings should contain:

- Account management.
- Character visibility.
- Discovery preferences.
- Notification controls.
- Blocked players.
- Privacy settings.
- Help and support.
- Sign out and account deletion.

Use clear toggle labels and explain what each setting changes.

---

# 11. The universal screen-state model

Every screen must handle the same basic conditions. This is essential for a consistent product.

| State | Expected behavior |
|--------|--------|
| Default | Show the content and primary action. |
| Loading | Show a consistent spinner or skeleton and prevent duplicate submissions. |
| Empty | Explain why there is no content and suggest the next step. |
| Error | Explain the problem in plain language and offer Retry or Back. |
| Success | Confirm the action and show the next logical step. |
| Disabled | Explain what is required before the action becomes available. |
| Offline | Show connection status and preserve safe drafts where possible. |

Examples:

- **Discover, empty:** “No one nearby matches your current preferences.” Actions: Broaden preferences or Change location.
- **Chat, error:** “Message not sent.” Action: Retry.
- **Invitation, pending:** “Waiting for a response.” Action: Continue chatting.
- **Venue, insufficient funds:** “You need more game cash to enter.” Action: Choose another venue.
- **Profile, no encounters:** “Your story starts here.” Action: Explore the world.

The wording, icons, button placement and transitions should follow the same rules throughout the game.

---

# 12. The shared application state

For the design and development teams, every screen should respond to a consistent set of application states.

| State group | Possible values |
|--------|--------|
| Session | Signed out, onboarding, signed in |
| Onboarding | Account, avatar, preferences, review, complete |
| Navigation | World, Messages, Feed, Profile |
| Matching | None, liked, matched, passed, blocked |
| Conversation | Empty, active, sending, failed, ended |
| Invitation | Draft, pending, accepted, declined, expired, cancelled |
| Scene | Entering, active, waiting for confirmation, completed, abandoned |
| Screen status | Default, loading, empty, error, success, offline |

The currency balance, body count and completed encounters should be calculated and validated by the server, not awarded solely by the user's browser.

This helps prevent duplicate rewards, inconsistent statistics and cheating.

---

# 13. How the UI stays consistent across every screen

The development team should create a reusable component library before implementing every screen separately.

For example, a character card should use the same avatar ratio, title placement, typography, spacing and action-button style whether it appears in Discover, the Feed or another part of the world.

Likewise, the same invitation component should show consistent Pending, Accepted, Declined and Expired states wherever it appears.

---

# 14. Recommended development order

Build the game in this order so the team can test the complete journey early.

1. **Foundation:** Create the shared typography, colors, spacing, buttons, navigation and reusable components.
2. **Onboarding:** Build account creation, character customization, preferences and profile review.
3. **World:** Create one social location with placeholder characters, venue hotspots and profile interactions.
4. **Discovery and matching:** Implement profile cards, Like, Pass and mutual matches.
5. **Chat:** Build messaging, inbox, activity invitations and safety controls.
6. **Shared activities:** Add a date scene, dialogue choices, invitation acceptance and exit flows.
7. **Progression:** Implement encounter outcomes, body count, virtual currency, achievements and reputation.
8. **Polish:** Add animations, additional venues, the Feed, detailed stats and edge-case handling.

## Final product principle

**Side Piece should make discovering someone and starting an interaction effortless, while making the consequences and progression of that interaction interesting.**

Do not overwhelm players with too many currencies, menus, stats, locations or character settings at launch. A polished world, compelling discovery, a great chat experience and visible progression will do more for engagement than dozens of half-developed features.

The first playable version should prove one complete loop: create a character, enter a lively location, find someone compatible, match, chat, agree on an activity, experience the scene, receive a reward and return to the world. Once that loop is enjoyable, expand the world around it.