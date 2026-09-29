import assert from 'node:assert/strict';
import { Conditions, NORMAL, DEFINITIONS } from '../src/conditions.js';
import { Climber } from '../src/climber.js';
import { holds } from '../src/level.js';
import { Multiplayer } from '../src/multiplayer/session.js';
import { Progress } from '../src/multiplayer/progress.js';
import { claimEncounter, encodePlayer, validPlayer, validEvent, RemotePlayers, STALE_MS } from '../src/multiplayer/protocol.js';
import { FirebaseTransport } from '../src/multiplayer/firebase-transport.js';

class Storage {
  constructor() { this.data = new Map(); }
  getItem(k) { return this.data.get(k) ?? null; }
  setItem(k,v) { this.data.set(k,v); }
}
// Deterministic transport model tests the real coordinator. It is never loaded
// by the game or used as a substitute for Firebase shared state.
class Hub {
  constructor() { this.time=Date.now(); this.clients=[]; this.players={}; this.encounters=null; this.serial=0; }
  transport() {
    const hub=this, id=`test${++this.serial}`;
    const t={ id, connected:true, writes:0, now:()=>hub.time,
      async start(callbacks,initial) {
        t.callbacks=callbacks; t.initial=initial; hub.clients.push(t);
        callbacks.identity(id); callbacks.status('online');
        for(const [uid,state] of Object.entries(hub.players))if(uid!==id)callbacks.player(uid,state);
        for(const rock of Object.keys(hub.encounters?.rocks||{}))callbacks.rock(Number(rock));
        for(const event of Object.values(hub.encounters?.events||{}))callbacks.event(event);
        await t.publish(initial());
      },
      async publish(state) {
        if(!t.connected)return false; t.writes++;
        hub.players[id]={...state,updatedAt:hub.time};
        for(const other of hub.clients)if(other!==t&&other.connected)other.callbacks.player(id,hub.players[id]);
        return true;
      },
      async claim(event) {
        if(!t.connected)return false;
        // This is the same pure transaction callback used by runTransaction.
        const next=claimEncounter(hub.encounters,{...event,startedAt:hub.time});
        if(!next)return false;
        hub.encounters=next;
        for(const other of hub.clients)if(other.connected){other.callbacks.rock(event.rock);other.callbacks.event(event);}
        return true;
      },
      prune(uid,at) {if(hub.players[uid]?.updatedAt===at&&at<hub.time-STALE_MS*2)delete hub.players[uid];},
      disconnect() {
        t.connected=false; t.callbacks.status('offline'); delete hub.players[id];
        for(const other of hub.clients)if(other!==t&&other.connected)other.callbacks.remove(id);
      },
      async reconnect() {
        t.connected=true; t.callbacks.status('online');
        for(const rock of Object.keys(hub.encounters?.rocks||{}))t.callbacks.rock(Number(rock));
        for(const event of Object.values(hub.encounters?.events||{}))t.callbacks.event(event);
        await t.publish(t.initial());
      },
      async stop() {t.disconnect();hub.clients=hub.clients.filter(c=>c!==t);},
    };return t;
  }
}
function client(hub,session=new Storage(),local=new Storage(),reload=false) {
  const player=new Climber(),conditions=new Conditions(),progress=new Progress('test-run',session,local,reload),messages=[];
  progress.restore(player);
  const transport=hub.transport();
  const game=new Multiplayer({transport,player,conditions,progress,notice:text=>messages.push(text)});
  return {game,player,conditions,progress,transport,messages,session,local};
}
const tick = (hub, clients, seconds) => {
  for(let i=0;i<seconds*60;i++){
    hub.time+=1000/60;
    for(const c of clients){const m=c.conditions.update(1/60,c.player);c.player.update(1/60,{active:false},()=>{},()=>{},m);}
  }
};
const h = new Hub(), a=client(h),b=client(h),c=client(h);
await Promise.all([a.game.start(),b.game.start(),c.game.start()]);
assert.equal(a.game.remotes.entries.size,2);assert.equal(b.game.remotes.entries.size,2);
const winds=holds.filter(r=>r.effect==='WIND'), low=holds.find(r=>r.effect==='LOW_GRAVITY');
assert(await a.game.grab(winds[0]));
assert.equal(a.conditions.active.size,0,'Activator is immune');
assert.equal(b.conditions.active.size,1);assert.equal(c.conditions.active.size,1);
assert(await b.game.grab(low));
assert.deepEqual([...a.conditions.active.values()].map(e=>e.type),['LOW_GRAVITY']);
assert.deepEqual([...b.conditions.active.values()].map(e=>e.type),['WIND']);
assert.equal(c.conditions.active.size,2);
assert(c.messages.some(s=>s.includes(a.progress.name)&&s.includes('WIND')));
assert(await b.game.grab(winds[1]));
assert.equal(a.conditions.active.size,2,'Triggering wind earlier gives no blanket wind immunity');
assert.equal(b.conditions.active.size,1,'B is immune only to its own wind');
assert.equal(c.conditions.active.size,3,'Same-type events retain independent authors and expiry');
tick(h,[a,b,c],1);
assert(c.conditions.modifiers.wind!==0 && c.conditions.modifiers.gravity<1);
assert.equal(b.conditions.modifiers.gravity,1);
assert(a.conditions.spent.has(low.id)&&c.conditions.spent.has(low.id));
const raceRock=holds.find(r=>r.effect==='ICE');
const winners=await Promise.all([a.game.grab(raceRock),b.game.grab(raceRock),c.game.grab(raceRock)]);
assert.equal(winners.filter(Boolean).length,1,'Exactly one concurrent rock claimant wins');
assert.equal(Object.keys(h.encounters.events).length,4);
const before=c.conditions.active.size;
c.game.receive(h.encounters.events[`rock-${raceRock.id}`]);assert.equal(c.conditions.active.size,before,'Replayed event is idempotent');
// All seven event types are delivered using the exact existing condition system.
for(const type of Object.keys(DEFINITIONS)) {
  const hub=new Hub(),one=client(hub),two=client(hub);await one.game.start();await two.game.start();
  const rock=holds.find(r=>r.effect===type);await one.game.grab(rock);
  assert.equal(one.conditions.active.size,0);assert.equal(two.conditions.active.size,1);
  tick(hub,[one,two],12);assert.deepEqual(two.conditions.modifiers,NORMAL);assert.equal(two.conditions.active.size,0);
}
// Refresh preserves a valid grip and immunity to a still-active event from the old identity.
const refreshHub=new Hub(),old=client(refreshHub),observer=client(refreshHub);await old.game.start();await observer.game.start();
old.player.x=winds[0].x;old.player.y=winds[0].y-43;old.player.grips=[winds[0],null];old.player.grounded=false;
await old.game.grab(winds[0]);old.progress.save(old.player);const oldID=old.game.uid;
await old.game.stop();assert(!observer.game.remotes.entries.has(oldID));
const refreshed=client(refreshHub,old.session,old.local,true);await refreshed.game.start();
assert.notEqual(refreshed.game.uid,oldID);assert.equal(refreshed.progress.name,old.progress.name);
assert.equal(refreshed.player.grips[0].id,winds[0].id);assert.equal(refreshed.conditions.active.size,0);
assert.equal(observer.game.remotes.entries.size,1,'Refresh does not leave a second avatar');
const anotherTab=client(refreshHub,old.session,old.local,false);await anotherTab.game.start();
assert(!anotherTab.progress.owns(oldID),'A newly opened tab does not inherit old author immunity');
assert.equal(anotherTab.conditions.active.size,1);
// Disconnection never blocks local physics or queues an offline activation.
b.transport.disconnect();assert(!a.game.remotes.entries.has(b.game.uid));
const offlineRock=holds.find(r=>r.effect==='DARKNESS');assert.equal(await b.game.grab(offlineRock),false);
await a.game.grab(offlineRock);h.time+=12000;await b.transport.reconnect();
assert(b.conditions.spent.has(offlineRock.id));tick(h,[a,b,c],.1);
assert.equal(b.conditions.active.size,0,'Expired effects are not replayed on reconnect');
// Throttled movement and heartbeat, interpolated positions, NaN rejection.
const traffic=new Hub(),sender=client(traffic),receiver=client(traffic);await sender.game.start();await receiver.game.start();
const initialWrites=sender.transport.writes;
for(let frame=0;frame<60;frame++) {traffic.time+=1000/60;sender.player.x+=1;sender.game.update(frame*1000/60);await Promise.resolve();await Promise.resolve();await Promise.resolve();}
assert(sender.transport.writes-initialWrites<=8);
assert(receiver.game.remotes.render(traffic.time)[0].x> -95);
const buffer=new RemotePlayers(),base={...encodePlayer(new Climber(),'CLIMBER TEST'),updatedAt:1000};
buffer.receive('remote',base,1000);buffer.receive('remote',{...base,x:5,updatedAt:1200},1200);
assert(Math.abs(buffer.render(1260)[0].x-(-45))<.001,'Playback position is interpolated halfway');
buffer.receive('invalid',{...base,x:NaN},1200);assert(!buffer.entries.has('invalid'));
buffer.receive('old',{...base,updatedAt:1000},1000+STALE_MS+1);assert(!buffer.entries.has('old'));
assert.equal(buffer.render(1000+STALE_MS+300).length,0);
assert(!validPlayer({...base,left:99999}));assert(!validEvent({...h.encounters.events[`rock-${winds[0].id}`],type:'SPEED'},h.time));
const restWrites=sender.transport.writes;
for(let i=1;i<=10;i++){traffic.time+=1000;sender.game.update(1000+i*1000);await Promise.resolve();await Promise.resolve();await Promise.resolve();}
assert(sender.transport.writes-restWrites<=2,'Resting climbers send a heartbeat, not frame updates');
// Firebase adapter contract: onDisconnect is armed before the first write;
// listener teardown and offline writes are exercised without mocking game logic.
const calls=[],subscriptions=[];
const sdk={
  ref:(_,path)=>path,getDatabase:()=>({}),serverTimestamp:()=>({'.sv':'timestamp'}),
  onValue(path,callback){subscriptions.push({path,callback});return()=>calls.push('unsubscribe');},
  onChildAdded(){return()=>calls.push('unsubscribe');},onChildChanged(){return()=>calls.push('unsubscribe');},onChildRemoved(){return()=>calls.push('unsubscribe');},
  onDisconnect:()=>({async remove(){calls.push('arm-disconnect');}}),
  async set(){calls.push('write');},goOffline(){calls.push('offline');},
};
const adapter=new FirebaseTransport({},'test-contract',async()=>[
  {initializeApp:()=>({}),async deleteApp(){calls.push('delete-app');}},
  {initializeAuth:()=>({}),inMemoryPersistence:{},async signInAnonymously(){return{user:{uid:'contract'}};}},sdk,
]);
await adapter.start({status:()=>{},identity:()=>{},error:e=>{throw e;}},()=>base);
assert.equal(await adapter.publish(base),false);
subscriptions.find(s=>s.path==='.info/connected').callback({val:()=>true});
await Promise.resolve();await Promise.resolve();await Promise.resolve();
assert(calls.indexOf('arm-disconnect')<calls.indexOf('write'));assert(adapter.ready);
subscriptions.find(s=>s.path==='.info/connected').callback({val:()=>false});
assert.equal(await adapter.publish(base),false);
await adapter.stop();assert(calls.includes('offline'));assert(calls.filter(c=>c==='unsubscribe').length===7);
console.log('Multiplayer: three-player immunity, seven effects, atomic races, same-type overlap, replay/expiry, refresh, separate tabs, disconnect/reconnect, interpolation, throttling, and Firebase presence lifecycle pass.');
// Tab suspension must not extend a shared condition or leave old falling stones.
const suspended = new Conditions();let wall=100000;
suspended.trigger('ROCKFALL',null,{id:'suspended-rockfall',startedAt:wall,clock:()=>wall,direction:1});
wall+=1000;suspended.update(.016,new Climber());assert(suspended.debris.length>0);
wall+=60000;suspended.update(.016,new Climber());
assert.equal(suspended.active.size,0);assert.equal(suspended.debris.length,0);assert.deepEqual(suspended.modifiers,NORMAL);
const corrupt=new Storage();corrupt.setItem('stillward:test:authors','{"not":"an array"}');
assert.doesNotThrow(()=>new Progress('test',corrupt,null,true));
assert.doesNotThrow(()=>new Progress('test',null,null,true));
