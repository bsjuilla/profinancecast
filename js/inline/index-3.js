(function () {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const isCallback =
    hash.includes('access_token=') ||
    hash.includes('error_description=') ||
    /[?&]code=/.test(search);
  if (!isCallback) return;

  document.documentElement.style.visibility = 'hidden';
  document.addEventListener('DOMContentLoaded', () => {
    const splash = document.createElement('div');
    splash.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;' +
      'background:#0B1410;color:#F0EDE2;font-family:Inter,system-ui,sans-serif;' +
      'visibility:visible;';
    splash.innerHTML =
      '<div style="text-align:center;">' +
        '<div style="width:42px;height:42px;border:3px solid rgba(43,182,125,0.18);' +
          'border-top-color:#2BB67D;border-radius:50%;margin:0 auto 18px;' +
          'animation:pfc-spin .8s linear infinite;"></div>' +
        '<div style="font-size:14px;color:#B8C2BC;letter-spacing:.04em;">Signing you in…</div>' +
      '</div>' +
      '<style>@keyframes pfc-spin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(splash);
    document.documentElement.style.visibility = '';
  });

  function decideDestination() {
    try {
      const u = new URL(window.location.href);
      const next = u.searchParams.get('next');
      // Audit C2 fix: reject protocol-relative URLs and any candidate that
      // doesn't resolve to our own origin.
      if (next && /^\/(?!\/)[A-Za-z0-9_\-./?=&%#]*$/.test(next)) {
        const resolved = new URL(next, window.location.origin);
        if (resolved.origin === window.location.origin) return next;
      }
    } catch (_) {}
    try {
      // Prefer PFCUser.isEmpty() — it consults every source (encrypted store,
      // LS mirrors, legacy keys) so first-time users still route to onboarding
      // even if one storage layer is empty.
      if (typeof PFCUser !== 'undefined' && PFCUser.isEmpty()) return 'onboarding.html';
      if (typeof PFCUser === 'undefined' && typeof PFCStorage !== 'undefined' && !PFCStorage.get('user')) return 'onboarding.html';
    } catch (_) {}
    return 'dashboard.html';
  }

  if (hash.includes('error_description=')) {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const msg = decodeURIComponent(params.get('error_description') || 'Sign-in failed');
    console.error('[oauth] error:', msg);
    window.location.replace('auth.html?error=' + encodeURIComponent(msg));
    return;
  }

  let done = false;
  const timeout = setTimeout(() => {
    if (done) return; done = true;
    console.warn('[oauth] timed out');
    window.location.replace('auth.html?error=timeout');
  }, 5000);

  function tryComplete() {
    if (done) return;
    if (typeof PFCAuth === 'undefined') { setTimeout(tryComplete, 50); return; }
    PFCAuth.onReady(uid => {
      if (done) return; done = true; clearTimeout(timeout);
      if (uid && uid !== 'guest') {
        try {
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (_) {}
        window.location.replace(decideDestination());
      } else {
        console.error('[oauth] hash present but no session');
        window.location.replace('auth.html?error=no_session');
      }
    });
  }
  tryComplete();
})();
