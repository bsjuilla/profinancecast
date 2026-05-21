  (function () {
    if (document.body.classList.contains('pfc-inapp')) return;
    var ref = document.referrer || '';
    var inApp = false;
    try {
      var refPath = new URL(ref || 'about:blank', location.href).pathname || '';
      if (/\/(journal|dashboard|net-worth|goals|recurring|settings|billing|history|tools|salary-calculator|debt-optimizer|sage|scenarios|report-card)(\.html)?$/.test(refPath)) {
        inApp = true;
      }
    } catch (e) {}
    if (typeof PFCAuth !== 'undefined' && PFCAuth.isLoggedIn && PFCAuth.isLoggedIn()) {
      inApp = true;
    }
    if (inApp) {
      document.body.classList.add('pfc-inapp');
      document.querySelectorAll('a').forEach(function (a) {
        if (a.classList.contains('footer-col') || a.closest('footer')) return;
        var raw = (a.textContent || '').trim();
        // Match "Blog", "â† Blog", "â†’ Blog", " Blog", or any single-arrow + Blog combination
        if (/^[â†â†’\s]*Blog[\s]*$/.test(raw) && /\/?blog\.html?$/.test(a.getAttribute('href') || '')) {
          a.setAttribute('href', 'journal.html');
          // Preserve any leading arrow when rewriting the visible text
          var arrowMatch = raw.match(/^([â†â†’])\s*Blog/);
          a.textContent = arrowMatch ? arrowMatch[1] + ' Journal' : 'Journal';
        }
      });
    }
  })();
  (function () {
    var bar = document.getElementById('reading-progress');
    if (!bar) return;
    function update() {
      var h = document.documentElement;
      var max = (h.scrollHeight - h.clientHeight) || 1;
      var pct = Math.min(100, Math.max(0, (h.scrollTop / max) * 100));
      bar.style.width = pct + '%';
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();
