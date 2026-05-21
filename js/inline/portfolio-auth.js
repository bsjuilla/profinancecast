// Route guard: redirect unauthed users to sign-in, then Pro-gate via
// PFCPlan.requirePlan. PFCPlan.requirePlan itself hides documentElement,
// fetches the plan, and either reveals (Pro/Premium) or redirects to
// billing.html (Free). That's the same proven pattern used on scenarios,
// sage, and report-card.
//
// Safety net: if PFCPlan never resolves within 5 seconds (e.g. entitlements
// failed to load), reveal the page so the user isn't staring at a blank
// screen — the soft banner in portfolio-main.js will then handle UX gating.
document.documentElement.style.visibility = 'hidden';
window.addEventListener('DOMContentLoaded', () => {
  if (typeof PFCAuth !== 'undefined') PFCAuth.requireAuth();

  let _proceeded = false;
  function _proceed() {
    if (_proceeded) return;
    _proceeded = true;
    try {
      if (window.PFCPlan && typeof PFCPlan.requirePlan === 'function') {
        PFCPlan.requirePlan(['pro', 'premium']);
      } else {
        // Entitlements module missing — fail open (reveal) so the user can
        // at least see SOMETHING. portfolio-main.js's soft gate kicks in.
        document.documentElement.style.visibility = '';
      }
    } catch (_) {
      document.documentElement.style.visibility = '';
    }
  }

  if (typeof PFCAuth !== 'undefined' && typeof PFCAuth.onReady === 'function') {
    PFCAuth.onReady(_proceed);
  } else {
    _proceed();
  }
  // 5-second deadman switch: never leave the user staring at an invisible page.
  setTimeout(() => {
    if (!_proceeded) {
      _proceeded = true;
      document.documentElement.style.visibility = '';
    }
  }, 5000);
});
