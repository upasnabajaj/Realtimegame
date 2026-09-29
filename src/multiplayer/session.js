import { DEFINITIONS } from '../conditions.js';
import { holds } from '../level.js';
import { epochOf, canReplay } from './run.js';
import { encodePlayer, validPlayer, validEvent, RemotePlayers, STALE_MS } from './protocol.js';

const messages = {
  WIND: 'DISTURBED THE WIND', SLOW: 'WOKE THE WEIGHT', SPEED: 'QUICKENED THE MOUNTAIN',
  LOW_GRAVITY: 'BROKE GRAVITY', DARKNESS: 'DREW THE DARK', ICE: 'WOKE THE FROST', ROCKFALL: 'LOOSENED THE STONE',
};
export class Multiplayer {
  constructor({ transport, player, conditions, progress, notice = () => {}, status = () => {}, feedback = () => {}, winner = () => {}, arrival = () => {}, reset = () => {} }) {
    Object.assign(this, { transport, player, conditions, progress, notice, status, feedback, winner, arrival, reset });
    this.remotes = new RemotePlayers(); this.seen = new Set(); this.pending = new Set();
    this.uid = null; this.nextWrite = 0; this.lastWrite = 0; this.lastSave = 0;
    this.previous = ''; this.inflight = false; this.online = false; this.disposed = false; this.error = null; this.lastSeen = new Map(); this.deferred = new Map(); this.nextPrune = 0; this.runState={epoch:player.epoch||0};this.playerStates=new Map();this.finishBusy=false;this.nextFinish=0;this.arrivals=new Set();
  }
  start() {
    return this.transport.start({
      identity: uid => { this.uid = uid; this.progress.author(uid); },
      status: value => { this.online = value === 'online'; if (this.online) {this.error=null;this.previous = '';for(const event of this.deferred.values())this.receive(event);this.deferred.clear();} this.status(value); },
      error: error => { this.error = error.code || error.message;  },
      player: (id, state) => {
        if (this.progress.owns(id)) return;
        if (state?.updatedAt < this.transport.now() - STALE_MS * 2) this.transport.prune(id, state.updatedAt);
        if(validPlayer(state) && Number.isFinite(state.updatedAt)){this.lastSeen.set(id,state.updatedAt);this.playerStates.set(id,state);}
        if((state?.epoch||0)!==this.player.epoch){this.remotes.remove(id);return;}
        this.remotes.receive(id, state, this.transport.now());
      },
      remove: id => { this.remotes.remove(id); this.lastSeen.delete(id);this.playerStates.delete(id); },
      rock: id => { if (holds[id]?.effect) this.conditions.spent.add(id); },
      event: event => this.receive(event),
      encounters: state => this.syncRun(state),
    }, () => encodePlayer(this.player, this.progress.name));
  }
  syncRun(state) {
    const epoch=epochOf(state);
    if(epoch<this.player.epoch)return;
    if(epoch!==this.player.epoch){
      this.player.reset(epoch);this.conditions.reset();this.seen.clear();this.pending.clear();this.deferred.clear();this.remotes.entries.clear();this.arrivals.clear();
      this.previous='';this.nextFinish=0;this.progress.winnerSeen=null;this.progress.save(this.player);this.reset();
    }
    this.runState=state;
    for(const id of Object.keys(state.rocks||{}))if(holds[id]?.effect)this.conditions.spent.add(Number(id));
    for(const event of Object.values(state.events||{}))this.receive(event);
    const first=state.winner;
    if(first&&first.epoch===epoch&&typeof first.at==='number'){
      const key=`${epoch}:${first.author}`;
      if(this.progress.winnerSeen!==key){this.progress.winnerSeen=key;this.winner(first,this.transport.now());}
    }
    for(const record of Object.values(state.finishers||{})){
      if(this.arrivals.has(record.author))continue;this.arrivals.add(record.author);
      if(record.author!==first?.author&&this.transport.now()-record.at<6000)this.arrival(record);
    }
  }
  replayAvailable() {
    const players=Object.fromEntries(this.playerStates);
    if(this.uid)players[this.uid]={...encodePlayer(this.player,this.progress.name),updatedAt:this.transport.now()};
    return this.online&&canReplay({players,encounters:this.runState},this.uid,this.transport.now());
  }
  async replay() {
    if(!this.replayAvailable())return false;
    try{return await this.transport.replay();}catch(error){this.error=error.code||error.message;return false;}
  }
  receive(event) {
    if(this.disposed)return;
    if(!this.online){if(holds[event?.rock]?.effect)this.deferred.set(event.id,event);return;}
    const now = this.transport.now();
    if ((event.epoch||0)!==this.player.epoch || !validEvent(event, now) || this.seen.has(event.id)) return;
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
    const event = { epoch:this.player.epoch, id: `rock-${rock.id}`, rock: rock.id, type: rock.effect, author: this.uid,
      name: this.progress.name, requestedAt: this.transport.now(), startedAt: this.transport.now(), duration: DEFINITIONS[rock.effect].duration * 1000 };
    try { return await this.transport.claim(event); }
    catch (error) { this.error = error.code || error.message; return false; }
    finally { this.pending.delete(rock.id); }
  }
  update(now) {
    if (this.disposed) return [];
    if (now - this.lastSave > 1000) { this.progress.save(this.player); this.lastSave = now; }
    if(this.online&&this.player.finished&&!this.runState.finishers?.[this.uid]&&!this.finishBusy&&now>=this.nextFinish&&this.transport.finish){
      this.finishBusy=true;this.nextFinish=now+2500;
      this.transport.finish({author:this.uid,name:this.progress.name,epoch:this.player.epoch,at:this.transport.now()})
        .catch(error=>{this.error=error.code||error.message;}).finally(()=>{this.finishBusy=false;});
    }
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
