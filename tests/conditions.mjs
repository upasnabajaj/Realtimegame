import assert from 'node:assert/strict';
import { Conditions, CONDITION_TYPES, NORMAL } from '../src/conditions.js';
import { Climber } from '../src/climber.js';
import { holds, ledges } from '../src/level.js';

const idle = { active: false };
function step(player, conditions, seconds, input = idle, callback = () => {}) {
  for (let i = 0; i < seconds * 120; i++) {
    const m = conditions.update(1 / 120, player);
    player.update(1 / 120, input, h => conditions.grab(h), callback, m);
    assert(Number.isFinite(player.x) && Number.isFinite(player.y));
    if(m.wind||m.float||m.tempo!==1||m.rockfall)assert(Math.abs(player.vx) <= 280.01 && player.vy >= -850.01);
    assert(m.gravity >= .24 && m.tempo >= .6 && m.tempo <= 1.65);
  }
}
function hanging() {
  const p = new Climber(), rock = holds.find(h => h.y > 700 && h.id % 3 !== 0 && !h.effect);
  p.x = rock.x; p.y = rock.y - 43; p.grips = [rock, null]; p.grounded = false;
  return p;
}
const combinations = [
  ['WIND', 'LOW_GRAVITY'], ['WIND', 'SPEED'], ['DARKNESS', 'WIND'],
  ['ICE', 'SLOW'], ['ROCKFALL', 'LOW_GRAVITY'], CONDITION_TYPES,
];
for (const types of [...CONDITION_TYPES.map(t => [t]), ...combinations]) {
  for (let repeat = 0; repeat < 3; repeat++) {
    const p = hanging(), c = new Conditions();
    types.forEach(t => c.trigger(t));
    step(p, c, 1);
    assert.equal(c.active.size, types.length);
    p.release(); step(p, c, 13);
    assert.deepEqual(c.modifiers, NORMAL, `${types}: all modifiers return exactly to baseline`);
    assert.equal(c.active.size, 0); assert.equal(c.debris.length, 0);
    assert(p.grounded, `${types}: falling recovers to a safe ledge`);
    assert.equal(p.slip, 0);
  }
}
// Each condition measurably changes its intended behavior.
const windPlayer = hanging(), wind = new Conditions(), startX = windPlayer.x;
wind.trigger('WIND'); step(windPlayer, wind, 2);
assert(Math.abs(windPlayer.x - startX) > 12, 'Wind must move the hanging body');
function reachTime(type) {
  const p = hanging(), c = new Conditions(); if (type) c.trigger(type);
  step(p, c, 1);
  const h = holds.find(h => h.y > p.y + 48 && Math.hypot(h.x - p.x, h.y - p.y - 13) < 105);
  assert(h); let elapsed = 0, count = p.count;
  while (p.count === count && elapsed < 1) { step(p, c, 1 / 120, { active: true, world: h }); elapsed += 1 / 120; }
  assert(p.count > count); return elapsed;
}
assert(reachTime('SLOW') > reachTime(null) * 1.3);
assert(reachTime('SPEED') < reachTime(null) * .85);
const floating = hanging(), float = new Conditions(); float.trigger('LOW_GRAVITY'); step(floating, float, 1);
const normal = hanging(), neutral = new Conditions();
const floatY = floating.y, normalY = normal.y;
floating.release(); normal.release(); step(floating, float, .7); step(normal, neutral, .7);
assert(floating.y - floatY > normal.y - normalY + 100, 'Float extends airborne time');
const icePlayer = hanging(), ice = new Conditions(); ice.trigger('ICE'); step(icePlayer, ice, 2);
assert(icePlayer.slip > .35 && icePlayer.grips.some(Boolean));
step(icePlayer, ice, 2.5); assert(!icePlayer.grips.some(Boolean), 'Icy grip eventually slips');
const dark = new Conditions(), dp = hanging(); dark.trigger('DARKNESS'); step(dp, dark, 1); assert.equal(dark.modifiers.darkness, 1);
const rain = new Conditions(), rp = hanging(); rain.trigger('ROCKFALL'); step(rp, rain, .2);
assert(rain.debris.length === 3 && rain.debris.every(s => s.warning > .7));
step(rp, rain, 3); assert(rain.debris.some(s => s.hit), 'A stone collision should push the climber');
const rock = holds.find(h => h.effect), once = new Conditions();
assert(once.grab(rock)); assert(!once.grab(rock)); step(new Climber(), once, 12); assert(!once.grab(rock));
assert(once.trigger(rock.effect), 'Developer triggers can repeat without resetting spent rocks');
once.trigger('DARKNESS'); once.clear(); step(new Climber(), once, 1.5); assert.equal(once.active.size, 0);
assert(holds.filter(h => h.effect).length < holds.length * .1);
assert(holds.filter(h => h.effect).every(h => h.y > 550));
for (const type of CONDITION_TYPES) assert(holds.some(h => h.effect === type));
// All checkpoint recovery paths remain valid with every condition stacked.
for (let cp = 1; cp <= 3; cp++) {
  const p = new Climber(), c = new Conditions(); p.checkpoint = cp;
  p.x = ledges[cp].x + 350; p.y = ledges[cp].y - 450; p.grounded = false; p.vy = -500;
  CONDITION_TYPES.forEach(t => c.trigger(t)); step(p, c, .2);
  assert(p.grounded); assert.equal(p.checkpoint, cp); assert(Math.abs(p.x - ledges[cp].x) < 1);
}
console.log('Seven effects and six combinations pass three repeated physics runs each; timing, float, slip, debris collision, one-shot activation, cleanup, and checkpoints pass.');
// Climb all four regions with natural first-grab activation, including effects
// encountered again after a fall. Ordinary holds remain available as escape routes.
const ascent = new Climber(), events = [], natural = new Conditions(type => events.push(type));
let seconds = 0, catches = 0;
while (!ascent.finished && seconds < 480) {
  const options = holds.filter(h => !ascent.grips.includes(h) && h.y > ascent.y + 48 && Math.hypot(h.x - ascent.x, h.y - ascent.y - 13) <= 109).sort((a, b) => (b.effect ? 120 : 0) - (a.effect ? 120 : 0) + b.y - a.y);
  if (!options.length && ascent.grips.some(Boolean)) {
    const grip = ascent.grips.find(Boolean);
    const above = holds.filter(h => h.y > grip.y + 5).sort((a,b) => Math.hypot(a.x-ascent.x,a.y-ascent.y)-Math.hypot(b.x-ascent.x,b.y-ascent.y))[0];
    if (above) options.push(...holds.filter(h => !ascent.grips.includes(h) && h.y >= grip.y - 10 && Math.hypot(h.x-ascent.x,h.y-ascent.y-13)<110 && Math.abs(h.x-above.x)<Math.abs(grip.x-above.x)).sort((a,b)=>Math.abs(a.x-above.x)-Math.abs(b.x-above.x)));
  }
  if (options.length && ascent.cooldown <= 0) {
    if (ascent.grab(options[0], h => natural.grab(h))) catches++;
  }
  step(ascent, natural, .65); seconds += .65;
}
assert(ascent.finished, `Natural ascent should finish; stopped at ${ascent.y}`);
assert(events.length >= 8, `Full ascent actually encounters special holds: ${events.length} ${events.join(',')}`);
assert.equal(natural.spent.size, events.length, 'Each natural event is a unique stone');
console.log(`Natural-condition summit ascent: ${catches} catches, ${events.length} unique events, ${seconds.toFixed(1)} seconds.`);

const fading = new Conditions(), resting = new Climber();
fading.trigger('DARKNESS'); step(resting, fading, .1);
const dim = fading.modifiers.darkness; fading.clear(); step(resting, fading, .1);
assert(fading.modifiers.darkness <= dim, 'Early clear must never intensify an effect');
step(resting, fading, 2); assert.deepEqual(fading.modifiers, NORMAL);
