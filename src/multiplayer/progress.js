import { holds, ledges } from '../level.js';
import { encodePlayer, validPlayer, safeName, randomId } from './protocol.js';

const read = (storage, key) => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };
const write = (storage, key, value) => { try { storage.setItem(key, JSON.stringify(value)); } catch {} };
export class Progress {
  constructor(run, session, local, reload = false) {
    this.key = `stillward:${run}`; this.session = session; this.local = local;
    this.saved = read(session, this.key) || read(local, this.key);
    this.winnerSeen=this.saved?.winnerSeen||null;
    this.name = reload && safeName(this.saved?.name) ? this.saved.name :
      `CLIMBER ${randomId().replaceAll('-', '').slice(0, 4).toUpperCase()}`;
    const authors=read(session, `${this.key}:authors`);
    this.previous = reload && Array.isArray(authors) ? authors.filter(x => x && typeof x.uid === 'string' && Number.isFinite(x.at) && x.at > Date.now()-20000).slice(-6) : [];
  }
  author(uid) {
    this.previous.push({ uid, at: Date.now() });
    this.previous = this.previous.slice(-6);
    write(this.session, `${this.key}:authors`, this.previous);
  }
  owns(uid) { return this.previous.some(x => x.uid === uid); }
  restore(player) {
    const saved = this.saved;
    if (!validPlayer(saved)) return false;
    player.checkpoint = saved.checkpoint;player.epoch=saved.epoch||0;
    const grips = [holds[saved.left] || null, holds[saved.right] || null];
    const grip = grips.find(Boolean);
    if (saved.checkpoint!==4 && grip && Math.hypot(grip.x - saved.x, grip.y - saved.y) < 120) {
      player.x = saved.x; player.y = saved.y; player.grips = grips; player.grounded = false;
    } else {
      const ledge = ledges[player.checkpoint];
      player.x = ledge.x; player.y = ledge.y + 27; player.grounded = true;
    }
    player.next = saved.next; player.count = saved.checkpoint ? 3 : (grip ? 3 : 0);
    player.finished = saved.checkpoint === 4; player.vx = player.vy = 0;
    return true;
  }
  save(player) {
    const data = {...encodePlayer(player, this.name),winnerSeen:this.winnerSeen};
    if (!validPlayer(data)) return;
    write(this.session, this.key, data); write(this.local, this.key, data);
    // Keep the current author fresh so a refresh during a condition preserves immunity.
    if (this.previous.length) this.previous[this.previous.length - 1].at = Date.now();
    write(this.session, `${this.key}:authors`, this.previous);
  }
}
