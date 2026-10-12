export const isGoogleUser = user => !!user && !user.isAnonymous && user.providerData?.some(p => p.providerId === 'google.com');
export const displayName = user => (user?.displayName || 'Climber').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40) || 'Climber';
export function authMessage(error) {
  return ({
    'auth/popup-closed-by-user': 'Sign-in cancelled. The mountain will wait.',
    'auth/cancelled-popup-request': 'A sign-in window is already open.',
    'auth/popup-blocked': 'Allow pop-ups for this site, then try again.',
    'auth/unauthorized-domain': 'This address needs to be authorized in Firebase before sign-in can work.',
    'auth/operation-not-allowed': 'Google sign-in is not enabled for this game yet.',
    'auth/network-request-failed': 'Could not connect. Check your connection and try again.',
    'auth/web-storage-unsupported': 'Allow site storage to keep your sign-in on this device.',
    'auth/user-disabled': 'This account cannot join the mountain.',
  })[error?.code] || 'Sign-in could not finish. Please try again.';
}
export class GoogleAuth {
  constructor(config, changed, state, loader = null) {
    Object.assign(this, { config, changed, state, loader });
    this.user = null; this.busy = false;
  }
  async start() {
    this.state('loading', 'Preparing your path…');
    try {
      const [appSDK, sdk, dbSDK] = await (this.loader ? this.loader() : Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js'),
      ]));
      this.sdk = sdk; this.dbSDK = dbSDK;
      this.app = appSDK.initializeApp(this.config, 'stillward-v2');
      this.auth = sdk.getAuth(this.app);
      // Session persistence keeps different tabs/accounts independent; reload stays signed in.
      await sdk.setPersistence(this.auth, sdk.browserSessionPersistence);
      this.unsubscribe = sdk.onAuthStateChanged(this.auth, user => {
        this.user = isGoogleUser(user) ? user : null;
        this.changed(this.user);
        this.state(this.user ? 'signed-in' : 'signed-out', '');
      }, error => {
        this.user = null; this.changed(null);
        this.state('error', authMessage(error));
      });
    } catch (error) {
      this.auth = null; // The next click reloads initialization rather than using an incomplete listener.
      this.state('error', authMessage(error));
    }
  }
  async signIn() {
    if (this.busy || !this.auth) return;
    this.busy = true; this.state('signing-in', 'A Google window is opening…');
    try {
      const provider = new this.sdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      // Called directly from a click. Popup avoids cross-site redirect storage issues on Pages.
      await this.sdk.signInWithPopup(this.auth, provider);
    } catch (error) { this.state(this.user ? 'signed-in' : 'signed-out', authMessage(error)); }
    finally { this.busy = false; }
  }
  async signOut() {
    if (!this.auth || this.busy) return false;
    this.busy = true; this.state('signing-out', 'Leaving the mountain…');
    try { await this.sdk.signOut(this.auth); return true; }
    catch { this.state('signed-in', 'Could not sign out. Please try again.'); return false; }
    finally { this.busy = false; }
  }
}
