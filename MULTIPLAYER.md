# Shared mountain

The existing game stays static-hosted, including GitHub Pages. Firebase's modular CDN SDK loads independently of the frame loop. There is no application server, lobby, login form, or framework change.

## Firebase setup required

The supplied project configuration is in `src/firebase-config.js`.

1. In project **my-project-96cca**, open **Authentication**, click **Get started** if needed, and enable/save the **Anonymous** sign-in provider. Each page receives a separate temporary Firebase UID automatically.
2. Review the current Realtime Database rules before deploying `database.rules.json`. If the database serves other apps, merge the `stillward` subtree rather than replacing their rules. The generated rules deny unauthenticated access and restrict player writes to their owner.
3. Publish the reviewed rules in the Firebase console, or use `firebase deploy --only database --project my-project-96cca` from an already authorized Firebase CLI. The included `firebase.json` contains no Hosting configuration: deployment of the actual game remains GitHub Pages.
4. Open/reload the game on two devices. The subtle connection text disappears once presence is registered.

The latest service probe returned `CONFIGURATION_NOT_FOUND` from Authentication. Configuration alone does not enable that provider. Database rules have been prepared locally, not published.

## Data layout

```
stillward/runs/mountain-v1/
  players/{temporaryFirebaseUid}
    name, x, y, vx, vy, angle, checkpoint, grounded,
    left, right, next, tx, ty, reaching, wind, slip, v, epoch, updatedAt
  encounters/
    epoch: replay generation
    winner: {author, name, epoch, at}
    finishers/{uid}: {author, name, epoch, at}
    rocks/{stableRockId}: "rock-{stableRockId}"
    events/rock-{stableRockId}
      id, rock, type, author, name, requestedAt, startedAt, duration, epoch
```

Movement sends at most eight packets per second, plus a ten-second resting heartbeat. A 160ms playback buffer smooths remote movement; extrapolation is bounded to 120ms. Remote avatars reuse the existing renderer and world coordinates, with a muted scarf accent and small name. Cameras and all local input/physics remain local.

The compact `encounters` subtree is transacted only on a special-rock catch. Dormancy and the immutable event are committed together, preventing both double activations and a spent rock without an event. There are only 21 such records per run; event history is bounded and does not contain movement. The current run persists when everyone leaves, so reconnects cannot accidentally revive spent rocks. After all currently active climbers finish and the ending has settled, a quiet CLIMB AGAIN action appears. It increments the shared epoch and clears encounters in a transaction; clients reset their poses, checkpoints, conditions and camera. The transport checks current presence before proposing replay. A player joining during that small read/commit window joins the fresh climb. Epoch tags prevent old packets or pending claims from affecting the new run.

## Effect semantics

Each event retains its author, server timestamp, type, and original duration. The author is immune only to that event. Different authors' events, including two WIND events, remain distinct. Same-type forces use the strongest active envelope instead of multiplying without limit. Other combinations use the established capped modifiers.

Expiry follows Firebase-adjusted wall time, so backgrounding a tab does not extend a shared condition. Old snapshots mark rocks dormant but never replay expired effects. Delayed claims older than three seconds are rejected by the supplied rules. Grabbing while disconnected does not queue a surprise activation for later. A pending claim can finish after a brief interruption only while still fresh.

## Presence, refresh, and failures

`onDisconnect().remove()` is acknowledged before presence is published. Refresh creates a new temporary UID; the old connection is removed. Reload starts the local climber at the base with no grips or checkpoints. Shared run state and other climbers are preserved. A reload remembers recent self-authored UIDs so the player stays immune to their own still-active event. A newly opened tab receives a distinct identity and does not inherit this immunity.

Remote data is validated before rendering. Stale avatars fade from the shared view by a 45-second cutoff; after 90 seconds an online client can transactionally prune a stale database record. The rules prevent pruning a newly refreshed heartbeat. Every subscription is removed on teardown. Firebase outages never stop the frame loop.

No browser storage is used to transport shared state. It stores only the local recovery pose, name, and short-lived own-author history. Normal multiplayer state is received from Firebase.

## Verification

- `npm test`: original route/physics checks, condition regression tests, and deterministic three-client protocol tests.
- `npm run firebase:check`: creates one temporary anonymous identity, checks database read access, then deletes that identity.
- `npm run firebase:test`: opt-in live Auth/Realtime Database REST integration test using a disposable `test-{ownerUid}` run. Tests three identities, movement, race resolution, timestamps, shared events, and removal; cleans up its run and identities. It never consumes production special rocks.

The REST test is not a substitute for browser WebSocket/presence testing. To finish acceptance, open two actual browsers and verify remote movement, a cross-player activation, overlapping events, reload, tab close, airplane-mode/reconnection, and a phone viewport. Desktop, summit composition and a fixed 390×844 phone layout were inspected in the browser. Live multi-browser acceptance remains blocked by Authentication returning CONFIGURATION_NOT_FOUND. The generated security rules have not been deployed or emulator-validated.

Official references: [Firebase web presence](https://firebase.google.com/docs/database/web/offline-capabilities), [anonymous authentication](https://firebase.google.com/docs/auth/web/anonymous-auth), and [CDN SDK loading](https://firebase.google.com/docs/web/alt-setup).
