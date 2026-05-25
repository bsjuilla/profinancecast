    // DS-CRIT-1 fix (audit 2026-05-25) — REMOVED PFCAuth.requireAuth() call.
    // This is a PUBLIC SEO tool (JSON-LD declares isAccessibleForFree: true,
    // and the meta description targets organic search visitors comparing
    // debt-payoff strategies). The prior requireAuth() redirected every
    // guest to /auth.html?next=… — destroying both the SEO landing
    // purpose AND the documented "no signup" promise in the feature list.
    //
    // The sibling /debt-optimizer.html is the AUTHENTICATED, full-feature
    // version that requires login (and that's where the cross-link CTA on
    // this page now routes interested users — see the funnel-loop pattern
    // shipped in DEF-1 / DEF-4 on take-home-pay / salary-calculator).
    //
    // Sentry breadcrumb still fires from pfc-auth.js if a session exists;
    // we just don't FORCE auth on entry to this guest-accessible tool.
    window.addEventListener('DOMContentLoaded', () => {
      // No-op. Tool is intentionally guest-accessible per its SEO purpose.
    });
