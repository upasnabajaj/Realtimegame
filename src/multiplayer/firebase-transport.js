import { claimEncounter, STALE_MS, randomId } from './protocol.js';

// Only this module knows Firebase. Loading it never blocks the local frame loop.
export class FirebaseTransport {
  constructor(config, run, loadSDKs = null) {
    this.loadSDKs = loadSDKs;
    this.config = config; this.base = `stillward/runs/${run}`;
    this.connected = false; this.ready = false; this.disposed = false;
    this.listeners = []; this.offset = 0; this.generation = 0;
  }
  now() { return Date.now() + this.offset; }
  async start(callbacks, initial) {
    this.callbacks = callbacks; this.initial = initial;
    callbacks.status('connecting');
    try {
      const [appSDK, authSDK, dbSDK] = await (this.loadSDKs ? this.loadSDKs() : Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js'),
      ]));
      if (this.disposed) return;
      this.sdk = dbSDK; this.appSDK = appSDK;
      this.app = appSDK.initializeApp(this.config, `climber-${randomId()}`);
      const auth = authSDK.initializeAuth(this.app, { persistence: authSDK.inMemoryPersistence });
      const credential = await authSDK.signInAnonymously(auth);
      if (this.disposed) { await appSDK.deleteApp(this.app); return; }
      this.uid = credential.user.uid; callbacks.identity(this.uid);
      this.db = dbSDK.getDatabase(this.app);
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
      const rocks = ref(this.db, `${this.base}/encounters/rocks`);
      this.listeners.push(onChildAdded(rocks, snapshot => callbacks.rock(Number(snapshot.key)), error));
      const events = ref(this.db, `${this.base}/encounters/events`);
      // At most one immutable event per special rock (21 for this mountain).
      this.listeners.push(onChildAdded(events, snapshot => callbacks.event(snapshot.val()), error));
    } catch (error) { callbacks.error(error); callbacks.status('offline'); }
  }
  async establishPresence(generation) {
    const { onDisconnect, set, serverTimestamp } = this.sdk;
    // Register server-side removal BEFORE advertising this connection.
    await onDisconnect(this.self).remove();
    if (this.disposed || this.failed || !this.connected || generation !== this.generation) return;
    await set(this.self, { ...this.initial(), updatedAt: serverTimestamp() });
    if (this.disposed || this.failed || !this.connected || generation !== this.generation) return;
    this.ready = true; this.callbacks.status('online');
  }
  async publish(state) {
    if (!this.ready || this.disposed) return false;
    await this.sdk.set(this.self, { ...state, updatedAt: this.sdk.serverTimestamp() });
    return true;
  }
  async claim(event) {
    if (!this.ready || this.disposed) return false;
    const path = this.sdk.ref(this.db, `${this.base}/encounters`);
    const result = await this.sdk.runTransaction(path,
      current => this.connected && !this.disposed ? claimEncounter(current, { ...event, startedAt: this.sdk.serverTimestamp() }) : undefined,
      { applyLocally: false });
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
    // goOffline executes the already registered server-side disconnect cleanup.
    if (this.db) this.sdk.goOffline(this.db);
    if (this.app) await this.appSDK.deleteApp(this.app).catch(() => {});
  }
}
