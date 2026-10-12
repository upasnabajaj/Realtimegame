# Stillward — Version 2

A self-contained illustrated climbing game. Original procedural art and generated audio; Firebase is the only network service.

## Play locally

Run `python3 -m http.server 5173`, then open http://localhost:5173. Sign in with Google to join. See [VERSION_2.md](VERSION_2.md) for rules, release steps and verification limits.

Hold or drag toward a nearby rock. Hands alternate and the previous grip releases after the next catch. Let go of the pointer to rest. Overstretching for too long loses your grip. Space (or two simultaneous touches) releases both hands. Reach for a lower hold during a fall to recover. Terraces save progress at quarter-height intervals.

## Structure

- `src/level.js`: braided routes, terrace lips, checkpoints, deterministic variation
- `src/climber.js`: reach, catches, spring motion, gravity, recovery
- `src/world.js`: illustrated landscape, climber animation, camera, particles
- `src/main.js`: pointer controls, sound, frame loop, minimal interface
- `style.css`: viewport and interface styling

Run `node tests/route.mjs` to verify connected routes, grip settling, fall recovery, and a complete physics-driven summit ascent. `tests/visual.html?altitude=5000` provides an isolated visual check at any altitude.

The game works with Pointer Events and disables browser scrolling and selection on the playfield. Browser resize behavior and a phone-sized viewport have been inspected; real-device touch testing is still recommended.

## Strange rocks and temporary conditions

Twenty-one existing holds now carry an `effect` field. Their fine luminous seams turn dark after their first successful grab; activation stays spent for the current run, including checkpoint recoveries. The first appears above the teaching section. Ordinary neighboring routes are unchanged.

- **WIND** (15s): upward movement is reduced by up to 35%, with lateral resistance and drifting grit.
- **SLOW** (6s): slower reaching and heavier spring recovery.
- **SPEED** (6s): faster reaching and reduced damping create overshoot.
- **LOW GRAVITY** (8s): lighter falls, floatier swings, and longer releases.
- **DOWNWARD PULL** (8s): support gives way, followed by a recoverable downward force. No spotlight or visibility mask.
- **FROZEN** (12s): all holds frost over. One second gripping a stone causes a slip; only catching a different stone resets the timer.
- **FALLING ROCKS** (20s): three warned stones spawn every 0.8 seconds across changing positions. Hits detach the grip and cause a recoverable fall. Ledges remain safe.

Shared events affect every player, including the activator, and have a server-enforced 12-second rest between events. Developer tests can still stack effects to check bounded physics. All modifiers are bounded and rebuilt from baseline every frame, with a 1.4-second fade-out. Sound is synthesized quietly after a player gesture; it is never required to play.

`src/conditions.js` owns activation, durations, composition, slippery grips, and debris. `src/condition-art.js` draws seams, frost, debris, and atmospheric effects. `src/sound.js` provides optional gesture-gated audio.

## Hidden development controls

Open `http://localhost:5173/?dev=1`. The presentation is identical to the ordinary game; no testing panel is shown.

| Shortcut | Action |
| --- | --- |
| Alt+1…7 | WIND, SLOW, SPEED, LOW GRAVITY, DOWNWARD_PULL, ICE, ROCKFALL |
| Alt+0 | Smoothly fade all conditions out |
| Alt+8 | Cycle the five requested test combinations |
| Alt+9 | Move to the next checkpoint for route inspection |

The console API is available only in development mode: `__stillward.trigger('WIND')`, `__stillward.clear()`, and `__stillward.snapshot()`. Triggers can be repeated. `?dev=1&conditions=WIND,LOW_GRAVITY` starts a combination without sound until interaction. The canvas exposes a `data-debug` snapshot only in this mode for browser test observation.

Run `npm test` (or both `node tests/route.mjs` and `node tests/conditions.mjs`). Checks cover every effect and the requested combinations over repeated physics runs, bounded velocities, expiry, reaching timing, floating releases, grip slipping, warned debris collisions, one-shot activation, checkpoint recovery, and a full ascent with natural activations.


## Realtime multiplayer

Google authentication gates multiplayer access. Review [VERSION_2.md](VERSION_2.md) and the exact proposed `database.v2.rules.json` before publishing. Special-rock catches publish one shared event: every connected player, including its author, receives the condition. Developer shortcuts remain local-only test triggers.

Local controls and physics do not wait for the network. Remote climbers use the same illustrated renderer, an understated scarf accent, and small temporary names. Reload restarts the local climber at the base; shared players, spent rocks, and events come from Realtime Database.

## Production build and ending

`npm run build` creates `dist/` containing only the static game. Publish that folder to GitHub Pages; all game paths are relative, including on a repository subpath. The build removes developer shortcuts and excludes test pages, scripts and configuration files. No build dependencies are required beyond Node.

The final hold leads to a brief physical mantle onto the summit, a landscape reveal, one quiet tremor and the first climber’s name. Later arrivals receive a short acknowledgment. Shared replay waits for active climbers to finish; a new epoch resets used rocks, effects and local climbing state. Offline replay remains local.

Release limitation: real two-account Google OAuth and live V2 multiplayer acceptance remain outstanding. Automated three-client and local-emulator tests are not evidence of live multi-account acceptance. See VERSION_2.md.
