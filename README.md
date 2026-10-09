# Stillward

A self-contained illustrated climbing game. Original procedural art and generated audio; Firebase is the only network service.

## Play locally

Run `python3 -m http.server 5173`, then open http://localhost:5173.

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

- **WIND** (8s): directional gusts push the body, rope, grit, and clouds.
- **SLOW** (6s): slower reaching and heavier spring recovery.
- **SPEED** (6s): faster reaching and reduced damping create overshoot.
- **LOW GRAVITY** (8s): lighter falls, floatier swings, and longer releases.
- **DARKNESS** (7s): atmospheric darkness leaves a readable area around the climber.
- **ICE** (9s): two-thirds of holds frost over; remaining on one for about 2.25 seconds causes a slip. Dry holds remain safe.
- **ROCKFALL** (7s): three warned volleys of stones; collisions shove and briefly interrupt reaching. Ledges are safe.

Different effects overlap. Repeating one type refreshes its envelope rather than multiplying it. All modifiers are bounded and rebuilt from baseline every frame, with a 1.4-second fade-out. Sound is synthesized quietly after a player gesture; it is never required to play.

`src/conditions.js` owns activation, durations, composition, slippery grips, and debris. `src/condition-art.js` draws seams, frost, debris, and atmospheric effects. `src/sound.js` provides optional gesture-gated audio.

## Hidden development controls

Open `http://localhost:5173/?dev=1`. The presentation is identical to the ordinary game; no testing panel is shown.

| Shortcut | Action |
| --- | --- |
| Alt+1…7 | WIND, SLOW, SPEED, LOW GRAVITY, DARKNESS, ICE, ROCKFALL |
| Alt+0 | Smoothly fade all conditions out |
| Alt+8 | Cycle the five requested test combinations |
| Alt+9 | Move to the next checkpoint for route inspection |

The console API is available only in development mode: `__stillward.trigger('WIND')`, `__stillward.clear()`, and `__stillward.snapshot()`. Triggers can be repeated. `?dev=1&conditions=WIND,LOW_GRAVITY` starts a combination without sound until interaction. The canvas exposes a `data-debug` snapshot only in this mode for browser test observation.

Run `npm test` (or both `node tests/route.mjs` and `node tests/conditions.mjs`). Checks cover every effect and the requested combinations over repeated physics runs, bounded velocities, expiry, reaching timing, floating releases, grip slipping, warned debris collisions, one-shot activation, checkpoint recovery, and a full ascent with natural activations.


## Realtime multiplayer

Firebase integration is configured for the supplied project. See [MULTIPLAYER.md](MULTIPLAYER.md) for the required anonymous-provider/rules setup, data layout, deployment, and test commands. Normal special-rock catches now publish a shared event: its author is immune and every other connected player receives the condition. The opt-in developer shortcuts remain local test triggers.

Local controls and physics do not wait for the network. Remote climbers use the same illustrated renderer, an understated scarf accent, and small temporary names. Reload restarts the local climber at the base; shared players, spent rocks, and events come from Realtime Database.

## Production build and ending

`npm run build` creates `dist/` containing only the static game. Publish that folder to GitHub Pages; all game paths are relative, including on a repository subpath. The build removes developer shortcuts and excludes test pages, scripts and configuration files. No build dependencies are required beyond Node.

The final hold leads to a brief physical mantle onto the summit, a landscape reveal, one quiet tremor and the first climber’s name. Later arrivals receive a short acknowledgment. Shared replay waits for active climbers to finish; a new epoch resets used rocks, effects and local climbing state. Offline replay remains local.

Release limitation: Firebase Authentication still returns `CONFIGURATION_NOT_FOUND`; live multiplayer acceptance and rules deployment remain outstanding. Automated three-client tests are deterministic protocol tests, not evidence of a live Firebase session.
