// Route guard: redirect unauthed users to sign-in. Same pattern as every
// other gated page in the codebase. Also Pro-gates server-side via
// PFCPlan.requirePlan — without this, Free users would see the whole UI
// for a flash before the soft client-side gate kicks in.
//
// Hide the body until both checks resolve to prevent the flicker.
document.documentElement.style.visibility = 'hidden';
window.addEventListener('DOMContentLoaded', () => {
  if (typeof PFCAuth !== 'undefined') PFCAuth.requireAuth();
  // Pro-gate via PFCPlan when the plan resolves (Pro/Premium pass through,
  // Free is redirected to billing.html). PFCPlan.onChange handles the case
  // where the plan is loaded after PFCAuth.onReady.
  function _afterReady() {
    try {
      if (window.PFCPlan && typeof PFCPlan.requirePlan === 'function') {
        // requirePlan handles its own redirect for Free users; the soft
        // banner in portfolio-main.js is the fallback for the brief window
        // before PFCPlan resolves.
        PFCPlan.requirePlan(['pro', 'premium']);
      }
    } catch (_) {}
    document.documentElement.style.visibility = '';
  }
  if (typeof PFCAuth !== 'undefined' && typeof PFCAuth.onReady === 'function') {
    PFCAuth.onReady(_afterReady);
  } else {
    _afterReady();
  }
});
