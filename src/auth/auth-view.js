export class AuthView {
  constructor(onSignIn, onSignOut) {
    this.gate = document.getElementById('auth-gate');
    this.button = document.getElementById('google-sign-in');
    this.status = document.getElementById('auth-message');
    this.profile = document.getElementById('player-profile');
    this.name = document.getElementById('player-name');
    this.photo = document.getElementById('player-photo');
    this.initial = document.getElementById('player-initial');
    this.signOut = document.getElementById('sign-out');
    this.button.addEventListener('click', onSignIn);
    this.signOut.addEventListener('click', onSignOut);
    this.photo.addEventListener('error', () => { this.photo.hidden = true; this.initial.hidden = false; });
  }
  render(state, message, user, name = '') {
    const signedIn = !!user;
    this.gate.hidden = signedIn;
    this.profile.hidden = !signedIn;
    document.body.classList.toggle('signed-out', !signedIn);
    this.status.textContent = message;
    document.getElementById('profile-message').textContent = signedIn ? message : '';
    const busy = ['loading', 'signing-in', 'signing-out'].includes(state);
    this.button.disabled = busy;
    this.signOut.disabled = busy;
    this.button.setAttribute('aria-busy', String(busy));
    document.getElementById('google-label').textContent = state === 'loading' ? 'Connecting…' : state === 'signing-in' ? 'Signing in…' : 'Sign in with Google';
    if (!signedIn) { this.photo.removeAttribute('src'); return; }
    this.name.textContent = name; this.initial.textContent = name.slice(0, 1).toUpperCase();
    let url;
    try { const candidate = new URL(user.photoURL); if (candidate.protocol === 'https:') url = candidate.href; } catch {}
    this.initial.hidden = !!url; this.photo.hidden = !url;
    if (url && this.photo.getAttribute('src') !== url) this.photo.src = url;
  }
}
