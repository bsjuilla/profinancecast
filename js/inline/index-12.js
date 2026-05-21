(function () {
  // 30-day dismiss using PFCStorage (avoid raw localStorage per REUSE-AUDIT).
  const KEY = 'sticky-cta-dismissed-at';
  const COUNT_KEY = 'sticky-cta-dismissed-count';
  const TTL_MS = 30 * 24 * 60 * 60 * 1000;
  function dismissedAt() {
    if (typeof PFCStorage === 'undefined') return 0;
    const raw = PFCStorage.get(KEY);
    return parseInt(raw || '0', 10) || 0;
  }
  function hidden() { return Date.now() - dismissedAt() < TTL_MS; }
  function show() {
    if (hidden()) return;
    document.body.setAttribute('data-sticky-cta', 'show');
    const wrap = document.getElementById('pfc-sticky-cta-wrap');
    if (wrap) wrap.removeAttribute('hidden');
  }
  function dismiss() {
    if (typeof PFCStorage !== 'undefined') {
      PFCStorage.set(KEY, String(Date.now()));
      // Math.max(0, …) defends against a tampered-negative count escaping
      // the upper Math.min cap (data-quality only — not a trust boundary).
      const prev = Math.max(0, parseInt(PFCStorage.get(COUNT_KEY) || '0', 10) || 0);
      const c = Math.min(30, prev + 1);
      PFCStorage.set(COUNT_KEY, String(c));
    }
    document.body.removeAttribute('data-sticky-cta');
    const wrap = document.getElementById('pfc-sticky-cta-wrap');
    if (wrap) wrap.setAttribute('hidden', '');
  }
  // Engagement gate: 5s after page load before showing, so the user can
  // read the hero first. Skip the timer entirely when already dismissed
  // — no point queuing a closure for 5s only to bail out.
  if (!hidden()) setTimeout(show, 5000);
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('pfc-sticky-cta-dismiss');
    if (btn) btn.addEventListener('click', dismiss);
  });
})();
