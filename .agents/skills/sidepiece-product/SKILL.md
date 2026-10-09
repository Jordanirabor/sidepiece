---
name: sidepiece-product
description: Product-truth check for Side Piece. Use before designing, scoping or changing any user-facing feature, screen, flow, copy, economy value or content rule, and whenever unsure what the client actually asked for. Prevents drift from the client's mockups and specs.
---

# Side Piece product-truth check

The client's sources outrank your assumptions. Run this before building, and again before calling a feature done.

## 1. Locate the feature in the spec
- Open `docs/product/screen-map.md` (repo root relative) and find the screen or row. Note its status, gaps and references.
- If it isn't there, it may be new scope. Check `docs/product/vision.md` → *Non-goals* and ask the user before adding scope.
- Confirm it belongs to the **current milestone** in `docs/roadmap.md`. If not, say so and ask before jumping ahead.

## 2. Read what the client said
- Spec text: search `docs/product/sources/chatgpt-ui-spec.md` for the screen number or name (e.g. `Screen 07`).
- Core game intent: `docs/product/sources/chatgpt-core-game.md`.
- **Look at the images.** Open the files listed for that screen in `docs/references/README.md` with the read
  tool. Client WhatsApp material (`docs/references/whatsapp/`) is the highest authority.

## 3. Check conflicts and decisions
- `docs/product/source-analysis.md` → *Conflicts & resolutions*.
- `docs/decisions/` → don't contradict an accepted ADR. If you must, write a superseding ADR and tell the user.

## 4. Apply the non-negotiables (vision.md)
18+ · consent with decline/cancel/leave paths · non-graphic intimacy · server-authoritative economy and stats ·
stylized 3D · design-system tokens · Lagos setting / ₦ (once M2 lands) · no pressure mechanics.

## 5. State the plan in product terms
Before coding, summarise for the user in 3–6 bullets:
- which screen(s)
- what the spec and references require
- what you will build
- any deviation and why

Flag anything that **needs client input**: art pipeline, language-model provider and content level, age verification, email provider, pricing/economy.

## 6. After building
Update `docs/product/screen-map.md` (status, files, remaining gaps) and tick `docs/roadmap.md`. If behaviour
diverges from a source, record it in `source-analysis.md` or as an ADR. Never leave the divergence implicit.
