/**
 * pfc-fonts.js — Programmatic replacement for the `onload="this.media='all'"`
 * inline-handler font-loading trick.
 *
 * Why: that inline `onload` attribute is the last on-event attribute the
 * brand-marketing pages still use, and it requires `script-src-attr
 * 'unsafe-inline'` in the CSP. Moving the promotion to an external script
 * (loaded under `script-src 'self'`) lets us tighten that allowance once
 * the remaining 360+ inline handlers across the app are also migrated.
 *
 * Pattern (HTML):
 *   <link rel="stylesheet" media="print" data-defer-style href="…fonts…">
 *   <script src="js/pfc-fonts.js" defer></script>
 *
 * The link starts at media="print" so the browser fetches it without
 * blocking render. Once this script runs, every link[data-defer-style]
 * gets its media promoted to "all" — same effect as the original onload
 * trick, but with no inline event attribute.
 *
 * Reduced-motion / cache hit semantics: identical to the prior pattern
 * (instant if the sheet is already in cache, otherwise it fires when the
 * sheet loads). No perceptible difference for the user.
 */
(function () {
  'use strict';

  function promote(linkEl) {
    if (!linkEl) return;
    if (linkEl.sheet) {
      // Stylesheet already parsed (cache hit) — switch immediately.
      linkEl.media = 'all';
    } else {
      // Not yet loaded — wait for load event.
      linkEl.addEventListener('load', function once() {
        linkEl.media = 'all';
        linkEl.removeEventListener('load', once);
      });
    }
  }

  function promoteAll() {
    document.querySelectorAll('link[data-defer-style]').forEach(promote);
  }

  if (document.readyState !== 'loading') {
    promoteAll();
  } else {
    document.addEventListener('DOMContentLoaded', promoteAll, { once: true });
  }
})();
