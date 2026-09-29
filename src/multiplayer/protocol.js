import { holds } from '../level.js';
import { DEFINITIONS, NORMAL } from '../conditions.js';

export function randomId() {
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  if(globalThis.crypto?.getRandomValues)return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  return Date.now().toString(16)+Math.random().toString(16).slice(2);
}
export const VERSION = 1;
export const STALE_MS = 45000;
const finite = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
const rounded = n => Math.round(n * 10) / 10;
export const safeName = name => typeof name === 'string' && /^CLIMBER [A-Z0-9]{4}$/.test(name);
export function encodePlayer(p, name) {
  return {
    v: VERSION, epoch:p.epoch||0, name, x: rounded(p.x), y: rounded(p.y), vx: rounded(p.vx), vy: rounded(p.vy),
    angle: rounded(p.angle), checkpoint: p.checkpoint, grounded: p.grounded,
    left: p.grips[0]?.id ?? -1, right: p.grips[1]?.id ?? -1, next: p.next,
    tx: rounded(p.target?.x ?? p.x), ty: rounded(p.target?.y ?? p.y), reaching: !!p.target,
    wind: rounded(p.modifiers.wind), slip: rounded(p.slip || 0),
  };
}
export function validPlayer(p) {
  return p && Number.isInteger(p.epoch??0) && (p.epoch??0)>=0 && p.v === VERSION && safeName(p.name) && finite(p.x, -10000, 10000) && finite(p.y, -1000, 7000)
    && finite(p.vx, -3000, 3000) && finite(p.vy, -4000, 4000) && finite(p.angle, -2, 2)
    && Number.isInteger(p.checkpoint) && p.checkpoint >= 0 && p.checkpoint <= 4
    && [p.left, p.right].every(id => Number.isInteger(id) && id >= -1 && id < holds.length)
    && [0, 1].includes(p.next) && typeof p.grounded === 'boolean' && typeof p.reaching === 'boolean'
    && finite(p.tx, -20000, 20000) && finite(p.ty, -20000, 20000)
    && finite(p.wind, -1000, 1000) && finite(p.slip, 0, 1);
}
export function validEvent(e, now) {
  const h = holds[e?.rock];
  return e && h?.effect === e.type && e.id === `rock-${h.id}` && typeof e.author === 'string'
    && /^[A-Za-z0-9_-]{1,128}$/.test(e.author) && safeName(e.name)
    && e.duration === DEFINITIONS[e.type]?.duration * 1000
    && finite(e.startedAt, 0, now + 2000) && finite(e.requestedAt, e.startedAt - 3000, e.startedAt + 2000);
}
export function claimEncounter(current, event) {
  if ((current?.epoch||0)!==(event.epoch||0))return;
  if (current?.rocks?.[event.rock] || current?.events?.[event.id]) return;
  return { ...current, epoch:event.epoch||0, rocks: { ...current?.rocks, [event.rock]: event.id }, events: { ...current?.events, [event.id]: event } };
}

// A short playback buffer absorbs normal network jitter. Only body motion is
// interpolated; grips stay bound to deterministic mountain hold coordinates.
export class RemotePlayers {
  constructor() { this.entries = new Map(); }
  receive(id, data, now) {
    if (!validPlayer(data) || !finite(data.updatedAt, now - STALE_MS, now + 2000)) return;
    const entry = this.entries.get(id) || { samples: [], last: 0 };
    if (data.updatedAt <= entry.last) return;
    entry.last = data.updatedAt;
    entry.samples.push({ ...data, at: data.updatedAt });
    if (entry.samples.length > 12) entry.samples.shift();
    this.entries.set(id, entry);
  }
  remove(id) { this.entries.delete(id); }
  render(now) {
    const result = [], at = now - 160;
    for (const [id, entry] of this.entries) {
      if (now - entry.last > STALE_MS) { this.entries.delete(id); continue; }
      const samples = entry.samples;
      let a = samples[0], b = a;
      for (const sample of samples) { b = sample; if (sample.at >= at) break; a = sample; }
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const t = distance > 450 ? 1 : Math.max(0, Math.min(1, (at - a.at) / Math.max(1, b.at - a.at)));
      const discrete = t < .5 ? a : b;
      const pose = { ...discrete };
      for (const field of ['x', 'y', 'vx', 'vy', 'angle', 'slip', 'wind']) pose[field] = a[field] + (b[field] - a[field]) * t;
      if (at > b.at && !b.grounded) {
        const extra = Math.min(.12, (at - b.at) / 1000);
        pose.x += b.vx * extra; pose.y += b.vy * extra;
      }
      pose.grips = [holds[discrete.left] || null, holds[discrete.right] || null];
      pose.target = discrete.reaching ? { x: discrete.tx, y: discrete.ty } : null;
      pose.modifiers = { ...NORMAL, wind: pose.wind };
      pose.pending = null; pose.catchPulse = 0;
      pose.accent = ['#98afa2', '#baaa80', '#9cabb9', '#b5958b'][id.charCodeAt(0) % 4];
      result.push(pose);
    }
    return result;
  }
}
