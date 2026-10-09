import { playerColours } from './multiplayer/protocol.js';
import { Summit } from './summit.js';
import { Climber } from './climber.js';
import { World } from './world.js';
import { HEIGHT, ledges, nearHolds } from './level.js';
import { Conditions, CONDITION_TYPES } from './conditions.js';
import { Sound } from './sound.js';
import { firebaseConfig, sharedRun } from './firebase-config.js';
import { Progress } from './multiplayer/progress.js';
import { FirebaseTransport } from './multiplayer/firebase-transport.js';
import { Multiplayer } from './multiplayer/session.js';

const canvas = document.querySelector('canvas');
const world = new World(canvas), player = new Climber(), audio = new Sound();
const input = { active: false, world: { x: 0, y: 0 }, screen: { x: 0, y: 0 } };
const pointers = new Set();
const storage = kind => { try { return window[kind]; } catch { return null; } };
const progress = new Progress(sharedRun, storage('sessionStorage'), storage('localStorage'), performance.getEntriesByType('navigation')[0]?.type === 'reload');
progress.restore(player);
Object.assign(player, playerColours(progress.name));
world.camera = Math.max(0, player.y - 55);
const connection = document.createElement('div');
connection.id = 'connection'; connection.setAttribute('aria-live', 'polite'); document.body.append(connection);
let multiplayer;
const ui = Object.fromEntries(['notice', 'hint', 'meters', 'marker', 'region'].map(id => [id, document.getElementById(id)]));
let last = performance.now(), noticeTimer;
const conditions = new Conditions((type, rock, count) => {
  if (rock) {
    world.catch(rock, true);
    for (let i = 0; i < 7; i++) world.particles.push({ x: rock.x, y: rock.y, vx: (i - 3) * 12, vy: 25 + i * 4, life: 1.3, size: 1.5 });
  }
  showNotice(type.replaceAll('_', ' ') + (count > 1 ? ` · ${count} CONDITIONS ACTIVE` : ''), 1900);
  audio.condition(type);
});

function locate(event) {
  input.screen = { x: event.clientX, y: event.clientY };
  input.world = world.world(event.clientX, event.clientY);
}
canvas.addEventListener('pointerdown', event => {
  event.preventDefault(); canvas.focus(); audio.unlock();
  pointers.add(event.pointerId); canvas.setPointerCapture(event.pointerId); locate(event);
  if (pointers.size > 1) { input.active = false; player.release(); }
  else { input.active = true; player.reachToward(input.world); }
});
canvas.addEventListener('pointermove', locate);
function end(event) { pointers.delete(event.pointerId); input.active = false; }
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', event => { end(event); player.pending = null; });
function cancelInput() { input.active = false; pointers.clear(); player.pending = null; }
window.addEventListener('blur', cancelInput);
window.addEventListener('resize', cancelInput);
canvas.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('keydown', event => {
  if (event.code === 'Space' && !event.repeat) { event.preventDefault(); audio.unlock(); player.release(); }
});

function showNotice(text, duration) {
  ui.notice.textContent = text; ui.notice.style.opacity = 1;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { ui.notice.style.opacity = 0; }, duration);
}
const summit = new Summit(world, audio, showNotice);
if (player.finished) summit.arrive();
const replay = document.createElement('button');
replay.id = 'replay'; replay.textContent = 'CLIMB AGAIN'; replay.hidden = true;
document.body.append(replay);
function resetPresentation() {
  cancelInput(); summit.reset(); world.camera = 0; world.cameraX = 0; world.particles.length = 0;
  clearTimeout(noticeTimer); ui.notice.style.opacity = 0; replay.hidden = true;
}
replay.addEventListener('click', async () => {
  audio.unlock(); replay.disabled = true;
  try {
    if (multiplayer?.online) await multiplayer.replay();
    else { player.reset(player.epoch); conditions.reset(); resetPresentation(); progress.save(player); }
  } finally { replay.disabled = false; }
});
function checkpointNotice(cp, reset) {
  if (cp === 4 && !reset) {
    summit.arrive();
    if (!multiplayer?.online) summit.winner({name:progress.name,at:Date.now()}, Date.now());
    return;
  }
  showNotice(reset ? 'THE MOUNTAIN WILL WAIT' : cp === 4 ? 'YOU MADE IT. STAY A WHILE.' :
    ['', 'A PLACE TO BREATHE', 'THE WORLD FALLS QUIET', 'ABOVE THE WEATHER'][cp], 4500);
}
function caught(hold, hard) { world.catch(hold, hard); audio.catch(); multiplayer?.grab(hold); }

function startMultiplayer() {
  if (!firebaseConfig) { connection.textContent = 'local climb'; return; }
  multiplayer = new Multiplayer({
    transport: new FirebaseTransport(firebaseConfig, sharedRun), player, conditions, progress,
    notice: showNotice,
    winner: (record, now) => summit.winner(record, now),
    arrival: record => showNotice(`${record.name} REACHED THE SUMMIT`, 3500),
    reset: resetPresentation,
    status: state => { connection.textContent = state === 'online' ? '' : state === 'connecting' ? 'joining the mountain…' : 'offline · still climbing'; },
    feedback: rock => { if (Math.abs(rock.y-player.y)<world.h/world.scale) world.catch(rock, true); },
  });
  multiplayer.start();
}
startMultiplayer();
window.addEventListener('pagehide', () => { multiplayer?.stop(); progress.save(player); });
window.addEventListener('pageshow', event => { if(event.persisted) startMultiplayer(); });
document.addEventListener('visibilitychange', () => { if(document.hidden) progress.save(player); });
window.addEventListener('online', () => {
  if (multiplayer && !multiplayer.transport.db) { multiplayer.stop(); startMultiplayer(); }
});

// Explicit opt-in development mode; no extra UI or key bindings in the normal game.
const params = new URLSearchParams(location.search);
const devMode = ['localhost','127.0.0.1','[::1]'].includes(location.hostname) && params.get('dev') === '1';
if (devMode) {
  const trigger = type => conditions.trigger(type.toUpperCase().replaceAll(' ', '_'));
  const combos = [['WIND', 'LOW_GRAVITY'], ['WIND', 'SPEED'], ['DARKNESS', 'WIND'], ['ICE', 'SLOW'], ['ROCKFALL', 'LOW_GRAVITY']];
  let combo = 0;
  window.__stillward = {
    player, world, conditions, trigger,
    clear: () => conditions.clear(),
    snapshot: () => ({ active: [...conditions.active.values()].map(e => e.type), modifiers: { ...conditions.modifiers }, spent: conditions.spent.size, debris: conditions.debris.length }),
  };
  window.addEventListener('keydown', event => {
    if (!event.altKey || event.repeat) return;
    const number = Number(event.code.replace('Digit', ''));
    if (!Number.isInteger(number)) return;
    event.preventDefault(); audio.unlock();
    if (number >= 1 && number <= 7) trigger(CONDITION_TYPES[number - 1]);
    if (number === 0) conditions.clear();
    if (number === 8) { for (const type of combos[combo++ % combos.length]) trigger(type); }
    if (number === 9) {
      const index = (player.checkpoint + 1) % 4, ledge = ledges[index];
      player.x = ledge.x; player.y = ledge.y + 27; player.vx = player.vy = 0;
      player.checkpoint = index; player.grips = [null, null]; player.pending = null; player.grounded = true;
      input.active = false; world.camera = Math.max(0, player.y - 55);
    }
  });
  for (const type of (params.get('conditions') || '').split(',')) if (type) trigger(type);
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, .033); last = now;
  input.world = world.world(input.screen.x, input.screen.y);
  const modifiers = conditions.update(dt, player);
  player.update(dt, input, caught, checkpointNotice, modifiers);
  const remotes = multiplayer?.update(now) || [];
  summit.update(dt, player);
  replay.hidden = !(player.finished && summit.arrival > 9 && (!multiplayer?.online || multiplayer.replayAvailable()));
  world.draw(player, input, dt, conditions, remotes);
  const position = world.screen(player.x, player.y);
  ui.hint.style.left = `${Math.min(innerWidth - 190, Math.max(15, position.x - 85))}px`;
  ui.hint.style.top = `${position.y + 50}px`; ui.hint.style.opacity = player.count > 2 ? 0 : 1;
  ui.meters.textContent = `${Math.max(0, Math.round(player.y / HEIGHT * 2400))} m`;
  ui.marker.style.bottom = `${Math.min(100, Math.max(0, player.y / HEIGHT * 100))}%`;
  const region = Math.min(3, Math.floor(Math.max(0, player.y) / 1600));
  const name = ['THE ROOTS', 'THE OPEN WIND', 'THE FROZEN FACE', 'THE SILENT SKY'][region];
  if (ui.region.dataset.region !== String(region)) {
    ui.region.innerHTML = `0${region + 1} <i> / </i> ${name}`; ui.region.dataset.region = String(region);
  }
  if (devMode) {
    canvas.dataset.debug = JSON.stringify({
      x: player.x, y: player.y, grips: player.grips.map(h => h?.id ?? null), catches: player.count,
      active: [...conditions.active.values()].map(e=>e.type), spent: conditions.spent.size,
      network: {online:multiplayer?.online, error:multiplayer?.error, uid:multiplayer?.uid, remotes:remotes.length, name:progress.name},
      reaching: input.active, pointer: input.world,
      nearby: nearHolds(player.x, player.y + 13, player.reach).map(h => ({id:h.id, effect:h.effect, ...world.screen(h.x,h.y)})),
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
