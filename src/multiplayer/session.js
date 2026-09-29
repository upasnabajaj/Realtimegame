import { DEFINITIONS } from '../conditions.js';
import { holds } from '../level.js';
import { encodePlayer, validPlayer, validEvent, RemotePlayers, STALE_MS } from './protocol.js';

const messages = {
  WIND: 'DISTURBED THE WIND', SLOW: 'WOKE THE WEIGHT', SPEED: 'QUICKENED THE MOUNTAIN',
  LOW_GRAVITY: 'BROKE GRAVITY', DARKNESS: 'DREW THE DARK', ICE: 'WOKE THE FROST', ROCKFALL: 'LOOSENED THE STONE',
};
export class Multiplayer {
  constructor({ transport, player, conditions, progress, notice = () => {}, status = () => {}, feedback = () => {} }) {
    Object.assign(this, { transport, player, conditions, progress, notice, status, feedback });
    this.remotes = new RemotePlayers(); this.seen = new Set(); this.pending = new Set();
    this.uid = null; this.nextWrite = 0; this.lastWrite = 0; this.lastSave = 0;
    this.previous = ''; this.inflight = false; this.online = false; this.disposed = false; this.error = null; this.lastSeen = new Map(); this.deferred = new Map(); this.nextPrune = 0;
  }
  start() {
    return this.transport.start({
      identity: uid => { this.uid = uid; this.progress.author(uid); },
      status: value => { this.online = value === 'online'; if (this.online) {this.error=null;this.previous = '';for(const event of this.deferred.values())this.receive(event);this.deferred.clear();} this.status(value); },
      error: error => { this.error = error.code || error.message; console.warn('Stillward multiplayer:', this.error); },
      player: (id, state) => {
        if (this.progress.owns(id)) return;
        if (state?.updatedAt < this.transport.now() - STALE_MS * 2) this.transport.prune(id, state.updatedAt);
        if(validPlayer(state) && Number.isFinite(state.updatedAt))this.lastSeen.set(id,state.updatedAt);
        this.remotes.receive(id, state, this.transport.now());
      },
      remove: id => { this.remotes.remove(id); this.lastSeen.delete(id); },
      rock: id => { if (holds[id]?.effect) this.conditions.spent.add(id); },
      event: event => this.receive(event),
    }, () => encodePlayer(this.player, this.progress.name));
  }
  receive(event) {
    if(this.disposed)return;
    if(!this.online){if(holds[event?.rock]?.effect)this.deferred.set(event.id,event);return;}
    const now = this.transport.now();
    if (!validEvent(event, now) || this.seen.has(event.id)) return;
    this.seen.add(event.id); this.conditions.spent.add(event.rock);
    if (now - event.startedAt >= event.duration) return;
    const rock = holds[event.rock];
    this.conditions.flashes.set(rock.id, 1); this.feedback(rock);
    // Immunity belongs to the immutable author of THIS event, not to an effect type.
    if (event.author === this.uid || this.progress.owns(event.author)) return;
    this.conditions.trigger(event.type, null, {
      id: event.id, startedAt: event.startedAt, clock: () => this.transport.now(),
      direction: event.rock % 2 ? 1 : -1,
    });
    this.notice(`${event.name} ${messages[event.type]}`, 2200);
  }
  async grab(rock) {
    if (!rock.effect || !this.online || this.conditions.spent.has(rock.id) || this.pending.has(rock.id)) return false;
    this.pending.add(rock.id);
    const event = { id: `rock-${rock.id}`, rock: rock.id, type: rock.effect, author: this.uid,
      name: this.progress.name, requestedAt: this.transport.now(), startedAt: this.transport.now(), duration: DEFINITIONS[rock.effect].duration * 1000 };
    try { return await this.transport.claim(event); }
    catch (error) { this.error = error.code || error.message; return false; }
    finally { this.pending.delete(rock.id); }
  }
  update(now) {
    if (this.disposed) return [];
    if (now - this.lastSave > 1000) { this.progress.save(this.player); this.lastSave = now; }
    if (this.online && !this.inflight && now >= this.nextWrite) {
      const state = encodePlayer(this.player, this.progress.name), signature = JSON.stringify(state);
      this.nextWrite = now + 125; // Eight movement packets/second; resting heartbeat is ten seconds.
      if (validPlayer(state) && (signature !== this.previous || now - this.lastWrite > 10000)) {
        this.inflight = true;
        this.transport.publish(state).then(sent => {
          if (sent) { this.previous = signature; this.lastWrite = now; }
        }).catch(error => { this.error = error.code || error.message; })
          .finally(() => { this.inflight = false; });
      }
    }
    if(this.online && now >= this.nextPrune) {
      this.nextPrune = now + 20000;
      for(const [id, timestamp] of this.lastSeen)if(timestamp < this.transport.now()-STALE_MS*2)this.transport.prune(id,timestamp);
    }
    return this.remotes.render(this.transport.now());
  }
  stop() { this.disposed = true; this.progress.save(this.player); return this.transport.stop(); }
}
