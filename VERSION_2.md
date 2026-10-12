# Stillward — Version 2 release notes

## Preservation and publishing boundary

Version 1 is recoverable from the local annotated Git tag `v1-preserved-2026-10-12` (original commit `ef96c06`). Version 2 lives on `codex/version-2-google-auth`. To inspect V1 without replacing V2, create a separate checkout with `git worktree add ../Stillward-v1 v1-preserved-2026-10-12`.

No publishing or live database-rule deployment was performed for this update. The tag is local until you choose to push it. Changes committed by another application during development remain preserved in this branch.

## What changed

- Google popup authentication, per-tab session persistence, loading/cancellation/error feedback, local name/photo and sign-out.
- Multiplayer starts only after Google authentication. Presence is removed before sign-out; refreshed tabs use fresh session IDs and restart at the base.
- Version 2 uses `stillward/runs/mountain-v2`, separate from V1. Movement stays local with throttled updates and remote interpolation.
- Atomic per-rock events now affect all connected players, including the activator, as requested in the environmental update. A shared reservation enforces a 12-second rest after each complete event. Dormant state comes from the same event record; concurrent grabs cannot produce two winners.
- Remote colours now use session identity, so players with identical names are still distinguished. Summit retry handles a missing winner record.
- Existing mountain, routes, climbing, conditions, checkpoints and ending are retained.

## Exact proposed security rules — review before applying

`database.v2.rules.json` is the complete generated rules file; `scripts/database-rules-v2.mjs` is its maintainable source. `firebase.v2.json` selects it. The old `database.rules.json` remains the V1 reference.

The proposed rules deny all access by default and allow only Google-authenticated users to read the V2 run. Writes are restricted to each authenticated owner's session, with field and position validation. Events must reference one of the known special rocks, match its effect and duration, and be submitted by a present player holding that rock. Events cannot be edited after creation. Summit claims require a summit pose and checkpoint. Replay requires an existing winner and an eligible finished player, increments the epoch, and clears the old events. Only expired presence may be pruned by another player.

These are access-control rules, not a server-authoritative anti-cheat system: clients simulate movement. The client checks that all active climbers finish before replay; rules additionally restrict who may request replay, but do not independently aggregate every dynamic player record.

**Do not paste this whole file over rules used by another app without reviewing them.** It intentionally denies other paths, including V1. If V1 must remain available, merge its narrowly scoped rules separately. Remove broad ancestor `.write: true` grants: a permissive parent overrides restrictive child rules. Do not use public-write test mode. No production rules have been applied here.

## Before publishing

1. Confirm Google sign-in is enabled for `my-project-96cca`. Set the provider support email if Firebase requests it.
2. In Authentication → Settings → Authorized domains, keep `upasnabajaj.github.io`; add `localhost` for local tests if absent. Domains are hostnames, not repository paths. Keep the configured `authDomain` (`my-project-96cca.firebaseapp.com`) unchanged.
3. Review and publish the V2 rules in Realtime Database → Rules only when ready. A denied connection should remain denied; do not loosen rules to make an error disappear.
4. Run `npm test`, then `npm run build`. Preview the built folder through HTTP. All application imports/assets use relative paths, so `/Realtimegame/` is supported.
5. After your approval, publish the **contents of `dist/`** through the repository's Pages deployment process. Do not publish tests or development source as the production entry point. Check GitHub Actions/Pages for deployment completion.
6. Open the deployed URL in two separate browser profiles using different Google accounts. Verify names/photos, different climber colours, movement, all-player events and cooldown timing, disconnect/reconnect, sign-out, refresh at base, summit and replay. If the OAuth consent screen is restricted to testing users, add both test accounts there.

## Verification and remaining acceptance checks

Passed automated checks: full physics-driven ascent, fall recovery and routes; seven conditions and six combinations repeated three times; expiry and reset; three-client protocol synchronization, immunity and races; throttling, interpolation, refresh, disconnect/reconnect, replay and summit; Google SDK contract tests for successful/cancelled/blocked/error sign-in, sign-out, ownership and presence cleanup.

Passed real local Realtime Database emulator checks: Google-only access, anonymous denial, ownership, invalid data rejection, immutable rock events, summit authorization, epoch reset and stale cleanup. These use emulator identities, not real Google OAuth tokens, and never write to the production project. To repeat with Firebase CLI installed, run `firebase emulators:exec --only database --project demo-stillward-v2 --config firebase.v2.json "node tests/rules-v2.mjs"`.

Browser inspection: production sign-in screen loads the live Firebase SDK without console errors; cancelling returns a usable sign-in button. Phone layout is inspected with the 390×844 fixture in `tests/responsive.html`. Authentication success/profile rendering and sign-out are covered by SDK contract tests, not by two real signed-in browser accounts.

**Not yet verified:** completed real Google sign-in with two different accounts, live V2 database acceptance under the proposed rules, actual phone touch hardware, and the deployed V2 GitHub Pages URL. These require the approved rules/publish steps and account access. Do not treat simulated multiplayer tests as live multi-account acceptance.

## Environmental update (local, not deployed)

Wind lasts 15 seconds with a 35% upward travel reduction at full strength. Falling rocks run for 20 seconds with repeated warned volleys and real grip-breaking hits. Downward Pull replaces Darkness for 8 seconds; the spotlight has been removed. Frozen lasts 12 seconds and affects all 453 holds, with a one-second same-stone grip limit. The countdown reuses the existing notice text. The controls, Google authentication and page layout are unchanged.

This request supersedes the previous activator-immunity behavior: shared events now affect their author as well. A 12-second rest separates normal shared events. A special stone grabbed during an event/rest stays unused and can be grabbed again afterward. Tests may deliberately stack conditions; normal multiplayer activation is serialized. Server timestamps determine expiry and the rest window, including after refresh and background suspension.

Rebuild and publish the updated game and updated `database.v2.rules.json` together after approval. The rules add an atomic `encounters/slot` reservation and require each immutable event to match it. Without the new rules, activation is correctly rejected. Do not make the database publicly writable to bypass that rejection. Failed reservations are recoverable; an abandoned uncommitted reservation expires after five seconds. Replay clears the slot along with old events.

Additional checks cover all 453 holds being reachable/catchable, same-stone frost timer abuse, late rockfall spawning, real fall impulses, all-player delivery, server-enforced event spacing, and expired conditions. Live Google-account multiplayer still requires final acceptance after the approved rules update; no production writes or deployment were performed.
