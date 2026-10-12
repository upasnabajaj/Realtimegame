import { STALE_MS, randomId, EVENT_GAP_MS } from './protocol.js';
import { replayRun } from './run.js';

// Only this module knows Firebase. Loading it never blocks the local frame loop.
export class FirebaseTransport {
  constructor(config, run, context = null) {
    this.context = context;
    this.config = config; this.base = `stillward/runs/${run}`;
    this.connected = false; this.ready = false; this.disposed = false;
    this.listeners = []; this.offset = 0; this.generation = 0;
  }
  now() { return Date.now() + this.offset; }
  async start(callbacks, initial) {
    this.callbacks = callbacks; this.initial = initial;
    callbacks.status('connecting');
    try {
      const context = this.context;
      if (!context || context.auth.currentUser?.uid !== context.user.uid || context.user.isAnonymous || !context.user.providerData?.some(p=>p.providerId==='google.com')) {
        throw Object.assign(new Error('Sign in with Google to join.'), {code:'auth/sign-in-required'});
      }
      this.sdk = context.dbSDK;
      this.app = context.app;
      this.owner = context.user.uid;
      this.uid = `${this.owner}_${randomId().replaceAll('-','').slice(0,12)}`;
      callbacks.identity(this.uid);
      this.db = this.sdk.getDatabase(this.app);
      this.sdk.goOnline(this.db);
      const dbSDK = this.sdk;
      const { ref, onValue, onChildAdded, onChildChanged, onChildRemoved } = dbSDK;
      this.self = ref(this.db, `${this.base}/players/${this.uid}`);
      const error = err => { this.failed = true; this.ready = false; callbacks.error(err); callbacks.status('offline'); };
      this.listeners.push(onValue(ref(this.db, '.info/serverTimeOffset'), snapshot => { this.offset = snapshot.val() || 0; }, error));
      this.listeners.push(onValue(ref(this.db, '.info/connected'), snapshot => {
        this.connected = snapshot.val() === true; this.failed = false;
        this.ready = false; const generation = ++this.generation;
        if (!this.connected) { callbacks.status('offline'); return; }
        this.establishPresence(generation).catch(error);
      }, error));
      const players = ref(this.db, `${this.base}/players`);
      const receive = snapshot => { if (snapshot.key !== this.uid) callbacks.player(snapshot.key, snapshot.val()); };
      this.listeners.push(onChildAdded(players, receive, error), onChildChanged(players, receive, error),
        onChildRemoved(players, snapshot => callbacks.remove(snapshot.key), error));
      this.listeners.push(onValue(ref(this.db, `${this.base}/encounters`), snapshot => {
        const state=snapshot.val()||{epoch:0}; this.encounters=state;
        if(callbacks.encounters)callbacks.encounters(state);
        else {for(const id of Object.keys(state.rocks||{}))callbacks.rock(Number(id));for(const event of Object.values(state.events||{}))callbacks.event(event);}
      }, error));
    } catch (error) { callbacks.error(error); callbacks.status('offline'); }
  }
  async establishPresence(generation) {
    const { onDisconnect, set, serverTimestamp } = this.sdk;
    // Register server-side removal BEFORE advertising this connection.
    await onDisconnect(this.self).remove();
    if (this.disposed || this.failed || !this.connected || generation !== this.generation) return;
    await set(this.self, { ...this.initial(), owner: this.owner, updatedAt: serverTimestamp() });
    if (this.disposed || this.failed || !this.connected || generation !== this.generation) return;
    this.ready = true; this.callbacks.status('online');
  }
  async publish(state) {
    if (!this.ready || this.disposed || this.context.auth.currentUser?.uid !== this.owner) return false;
    await this.sdk.set(this.self, { ...state, owner: this.owner, updatedAt: this.sdk.serverTimestamp() });
    return true;
  }
  async claim(event) {
    if (!this.ready || this.disposed || this.context.auth.currentUser?.uid !== this.owner) return false;
    // Publish the caught grip before the event: rules verify the author holds this rock.
    await this.publish(this.initial());
    if(!this.ready || this.disposed)return false;
    const slotRef = this.sdk.ref(this.db, `${this.base}/encounters/slot`);
    const reservation = await this.sdk.runTransaction(slotRef, current => {
      if (!this.connected || this.disposed || (current && this.now() < current.startedAt + (this.encounters?.events?.[current.id] ? current.duration + EVENT_GAP_MS : 5000))) return;
      return {id:event.id, author:this.uid, epoch:event.epoch, startedAt:this.sdk.serverTimestamp(), duration:event.duration};
    }, {applyLocally:false});
    if (!reservation.committed) return false;
    // Transaction snapshots can contain the client's estimated server timestamp.
    // Fetch the acknowledged value before rules compare the event to its reservation.
    const slot = (await this.sdk.get(slotRef)).val();
    if (!slot || slot.author !== this.uid || slot.id !== event.id || slot.epoch !== event.epoch) return false;
    try {
      const path = this.sdk.ref(this.db, `${this.base}/encounters/events/${event.id}`);
      const result = await this.sdk.runTransaction(path,
        current => this.connected && !this.disposed && !current ? { ...event, requestedAt:this.now(), startedAt:slot.startedAt } : undefined,
        { applyLocally: false });
      if (result.committed) return true;
    } catch (error) { this.callbacks.error(error); }
    // Failed catches must not consume a full event/cooldown. Never clear somebody else's slot.
    await this.sdk.runTransaction(slotRef, current => current?.author === this.uid && current?.startedAt === slot.startedAt ? null : undefined, {applyLocally:false}).catch(()=>{});
    return false;
  }

  async finish(arrival) {
    if(!this.ready || this.disposed || this.context.auth.currentUser?.uid !== this.owner)return false;
    await this.publish(this.initial());
    const record={...arrival,at:this.sdk.serverTimestamp()};
    await this.sdk.runTransaction(this.sdk.ref(this.db,`${this.base}/encounters/finishers/${this.uid}`),
      value=>this.connected&&!this.disposed&&!value?record:undefined,{applyLocally:false});
    if(this.disposed || !this.connected)return false;
    await this.sdk.runTransaction(this.sdk.ref(this.db,`${this.base}/encounters/winner`),
      value=>this.connected&&!this.disposed&&!value?record:undefined,{applyLocally:false});
    return true;
  }

  async replay() {
    if(!this.ready || this.disposed || this.context.auth.currentUser?.uid !== this.owner)return false;
    const snapshot=await this.sdk.get(this.sdk.ref(this.db,`${this.base}/players`));
    const result=await this.sdk.runTransaction(this.sdk.ref(this.db,`${this.base}/encounters`),
      encounters=>this.connected&&!this.disposed?replayRun({players:snapshot.val(),encounters},this.uid,this.now())?.encounters:undefined,{applyLocally:false});
    return result.committed;
  }
  prune(id, updatedAt) {
    if (!this.ready || updatedAt > this.now() - STALE_MS * 2) return;
    // A transaction cannot delete a player who sent a fresh heartbeat meanwhile.
    this.sdk.runTransaction(this.sdk.ref(this.db, `${this.base}/players/${id}`), value =>
      value && value.updatedAt < this.now() - STALE_MS * 2 ? null : undefined,
    { applyLocally: false }).catch(() => {});
  }
  async stop() {
    this.disposed = true; this.ready = false; ++this.generation;
    this.listeners.splice(0).forEach(unsubscribe => unsubscribe());
    // Remove while credentials still exist, then force the registered disconnect cleanup.
    // Unique per-tab IDs ensure an old disconnect cannot erase a refreshed tab.
    if (this.db) {
      if (this.connected && this.self) {
        let timer;
        await Promise.race([this.sdk.remove(this.self).catch(()=>{}),new Promise(resolve=>{timer=setTimeout(resolve,1500);})]);
        clearTimeout(timer);
      }
      this.sdk.goOffline(this.db);
    }
  }
}
