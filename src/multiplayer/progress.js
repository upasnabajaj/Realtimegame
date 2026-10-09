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
    // A page load restarts this climber only; shared rocks and other players persist.
    const epoch = validPlayer(this.saved) ? (this.saved.epoch || 0) : 0;
    player.reset(epoch);
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
