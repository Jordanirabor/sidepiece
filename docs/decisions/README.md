# Decision records

Short records of decisions that shape the project. Each one says what we chose, why, and what would
make us revisit it. **Do not reverse a decision silently.** Write a new record that supersedes the old one.

| # | Decision | Status |
|---|---|---|
| 0001 | [Rust backend, Babylon.js + React web client](0001-stack.md) | Accepted |
| 0002 | [Single-VPS Dokploy deploy, designed to scale out](0002-deploy-and-scale.md) | Accepted |
| 0003 | [Consent as a mechanic; non-graphic adult content](0003-consent-and-content.md) | Accepted |
| 0004 | [Stylized 3D art direction (not photoreal)](0004-stylized-3d-art.md) | Superseded by 0012 |
| 0005 | [NPC conversation: free-text, scored, provider-agnostic LLM](0005-npc-conversation.md) | Accepted |
| 0006 | [Onboarding shape: mockup creator + preferences + preview](0006-onboarding-shape.md) | Accepted |
| 0007 | [Lagos setting and ₦ currency](0007-lagos-setting.md) | Accepted, implemented (M2); venue naming amended by 0019 |
| 0008 | [Mobile-first persistent shell](0008-mobile-first-shell.md) | Accepted, implemented (M1) |
| 0009 | [Onboarding order: preferences inside the mockup flow](0009-onboarding-order.md) | Accepted, implemented (M3); refines 0006 |
| 0010 | [Discover deck, matching rules and entry points](0010-discover-and-matching.md) | Accepted, implemented (M4) |
| 0011 | [Player messages: polling delivery, match-gated, local controls](0011-messages-delivery-and-controls.md) | Accepted, implemented (M5) |
| 0012 | [Semi-realistic art direction: rendering pipeline, open-licence characters](0012-semi-realistic-art-direction.md) | Superseded by 0017 (rendering tiers kept) |
| 0013 | [Invitations and date scenes: who pays, expiry, anti-pressure, synchronous choices](0013-invitations-and-date-scenes.md) | Accepted, implemented (M6) |
| 0014 | [Private encounters, one-time outcomes, and how progression is derived](0014-encounters-outcomes-progression.md) | Accepted, implemented (M7) |
| 0015 | [The Feed is personal, built from the event audit](0015-personal-feed.md) | Accepted, implemented (M8) |
| 0016 | [Settings & privacy, in-app alerts, and what account deletion erases](0016-settings-and-account-deletion.md) | Accepted, implemented (M8) |
| 0017 | [Stylized open city (Kenney CC0) and modular characters (Quaternius CC0)](0017-stylized-city-and-modular-characters.md) | Implemented; art amended by 0018 |
| 0018 | [Semi-realistic art through a scripted Blender pipeline (MPFB2 + Poly Haven)](0018-semi-realistic-blender-pipeline.md) | Accepted; city and venues implemented (0019), characters next |
| 0019 | [Real Lagos clubs on the map, and the first realistic city and venue kits](0019-real-lagos-clubs-and-realistic-city.md) | Accepted, implemented; amends 0007 (real venue names) |

Template: `NNNN-short-title.md` with **Context · Decision · Consequences · Revisit when**.
