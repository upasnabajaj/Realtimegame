import { rand } from './level.js';

export const CONDITION_TYPES = ['WIND', 'SLOW', 'SPEED', 'LOW_GRAVITY', 'DARKNESS', 'ICE', 'ROCKFALL'];
export const DEFINITIONS = {
  WIND: { duration: 8, color: '#c7d4bc' },
  SLOW: { duration: 6, color: '#c7b8d1' },
  SPEED: { duration: 6, color: '#e8c68d' },
  LOW_GRAVITY: { duration: 8, color: '#c6ded7' },
  DARKNESS: { duration: 7, color: '#b7bed6' },
  ICE: { duration: 9, color: '#d8edf0' },
  ROCKFALL: { duration: 7, color: '#d5ad8c' },
};
export const NORMAL = Object.freeze({ tempo: 1, gravity: 1, spring: 1, damping: 1, wind: 0, float: 0, darkness: 0, ice: 0, rockfall: 0 });
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const smooth = value => { const x = clamp(value, 0, 1); return x * x * (3 - 2 * x); };

// Effects own their envelopes. Physics receives a fresh bounded aggregate every frame;
// nothing multiplies or permanently mutates a climber's baseline values.
export class Conditions {
  constructor(onActivate = () => {}) {
    this.active = new Map();
    this.spent = new Set();
    this.flashes = new Map();
    this.onActivate = onActivate;
    this.time = 0;
    this.serial = 0;
    this.debris = [];
    this.gripId = null;
    this.gripAge = 0;
    this.hitCooldown = 0;
    this.modifiers = { ...NORMAL };
  }

  trigger(type, rock = null, event = null) {
    const key = event?.id || type;
    const age = event ? Math.max(0, (event.clock() - event.startedAt) / 1000) : 0;
    if (event && (this.active.has(key) || age >= DEFINITIONS[type]?.duration)) return false;
    if (!DEFINITIONS[type] || (rock && this.spent.has(rock.id))) return false;
    if (rock) {
      this.spent.add(rock.id);
      this.flashes.set(rock.id, 1);
    }
    const previous = this.active.get(key);
    this.active.set(key, {
      type, clock: event?.clock, startedAt: event?.startedAt,
      age, duration: DEFINITIONS[type].duration,
      start: previous?.strength || 0, strength: previous?.strength || 0,
      direction: event?.direction || previous?.direction || (++this.serial % 2 ? 1 : -1),
      wave: event ? Math.floor(age / 1.5) - 1 : -1,
    });
    this.onActivate(type, rock, this.active.size);
    return true;
  }

  grab(rock) { return rock.effect ? this.trigger(rock.effect, rock) : false; }

  clear() {
    // The developer reset also uses the normal fade-out path.
    for (const stone of this.debris) stone.life = Math.min(stone.life, 1.4);
    for (const effect of this.active.values()) {
      effect.releaseStart = effect.strength;
      effect.releaseAge = effect.age;
      effect.duration = effect.age + 1.4;
    }
  }

  slippery(rock) { return !!rock && rock.id % 3 !== 0; }

  update(dt, player) {
    this.time += dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    for (const [id, flash] of this.flashes) {
      if (flash <= dt * 1.6) this.flashes.delete(id);
      else this.flashes.set(id, flash - dt * 1.6);
    }
    for (const [key, effect] of this.active) {
      const type = effect.type;
      effect.age = effect.clock ? Math.max(0, (effect.clock() - effect.startedAt) / 1000) : effect.age + dt;
      if (effect.age >= effect.duration) { this.active.delete(key); continue; }
      const attack = effect.start + (1 - effect.start) * smooth(effect.age / .65);
      effect.strength = (effect.releaseAge === undefined ? attack : effect.releaseStart) * smooth((effect.duration - effect.age) / 1.4);
      if (type === 'ROCKFALL' && effect.releaseAge === undefined && effect.age < 4.8) {
        const wave = Math.floor(effect.age / 1.5);
        if (wave > effect.wave) { effect.wave = wave; this.spawnWave(player, wave, effect); }
      }
    }
    const matching = type => [...this.active.values()].filter(e => e.type === type).sort((a,b) => b.strength-a.strength);
    const strength = type => matching(type)[0]?.strength || 0;
    const slow = strength('SLOW'), speed = strength('SPEED'), floating = strength('LOW_GRAVITY');
    const gust = matching('WIND')[0];
    this.modifiers = {
      tempo: clamp((1 - slow * .4) * (1 + speed * .65), .6, 1.65),
      gravity: 1 - floating * .76,
      spring: clamp((1 - slow * .48) * (1 + speed * .6) * (1 - floating * .35), .34, 1.6),
      damping: clamp((1 + slow * .16) * (1 - speed * .37) * (1 - floating * .4), .38, 1.16),
      wind: gust ? gust.direction * gust.strength * (540 + 360 * Math.sin((gust.clock ? gust.age : this.time) * 2.6) ** 2) : 0,
      float: floating,
      darkness: strength('DARKNESS'), ice: strength('ICE'), rockfall: strength('ROCKFALL'),
    };
    const grip = player.grips.find(Boolean);
    if (grip?.id !== this.gripId) { this.gripId = grip?.id ?? null; this.gripAge = 0; }
    if (grip && this.slippery(grip) && this.modifiers.ice > .15) {
      this.gripAge += dt * this.modifiers.ice;
      player.slip = clamp(this.gripAge / 3.5, 0, 1);
      if (this.gripAge >= 3.5) {
        player.release();
        player.cooldown = .6;
        this.gripAge = 0;
      }
    } else { this.gripAge = Math.max(0, this.gripAge - dt * 3); player.slip = 0; }
    this.updateDebris(dt, player);
    return this.modifiers;
  }

  spawnWave(player, wave, effect = {}) {
    // One telegraphed corridor aims at the current position; its neighbors leave
    // generous escape space. A hit gives a shove, never an unavoidable instant fall.
    for (let i = -1; i <= 1; i++) {
      this.debris.push({
        x: player.x + i * 88, y: player.y + 220 + Math.abs(i) * 35,
        vx: (rand(wave * 7 + i + this.serial) - .5) * 16, vy: 0,
        warning: 1.05 + Math.abs(i) * .12, life: 5.5,
        clock: effect.clock, expiresAt: effect.startedAt + effect.duration * 1000,
        radius: 5 + rand(wave * 19 + i) * 3, spin: rand(i + wave) * 6,
      });
    }
  }

  updateDebris(dt, player) {
    for (const stone of this.debris) {
      if(stone.clock && stone.clock() >= stone.expiresAt){stone.life=0;continue;}
      stone.life -= dt;
      if (stone.warning > 0) { stone.warning -= dt; continue; }
      const oldY = stone.y;
      stone.vy = Math.max(-600, stone.vy - 450 * this.modifiers.gravity * dt);
      stone.vx += this.modifiers.wind * .06 * dt;
      stone.x += stone.vx * dt;
      stone.y += stone.vy * dt;
      stone.spin += dt * 3;
      const cross = oldY >= player.y - 20 && stone.y <= player.y + 30;
      if (!stone.hit && cross && Math.abs(stone.x - player.x) < stone.radius + 11 && !player.grounded && this.hitCooldown === 0) {
        stone.hit = true;
        this.hitCooldown = 1.2;
        player.vx = clamp(player.vx + (stone.x < player.x ? 100 : -100), -230, 230);
        player.vy = Math.max(-300, player.vy - 65);
        player.pending = null;
        player.cooldown = Math.max(player.cooldown, .22);
        player.catchPulse = .55;
      }
    }
    this.debris = this.debris.filter(stone => stone.life > 0 && stone.y > player.y - 700);
  }
}
