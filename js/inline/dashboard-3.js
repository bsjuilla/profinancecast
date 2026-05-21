    window.addEventListener('DOMContentLoaded', () => {
      if (typeof PFCAuth !== 'undefined') PFCAuth.requireAuth();
    });

    // Macro context strip — currently only shows CPI YoY (inflation) for the
    // user's country, sourced via World Bank. FRED's Fed-funds/Treasury/
    // mortgage series proved unreachable from Vercel (blocks both Edge POPs
    // and Lambda IPs). Inflation is arguably the most personally-relevant
    // macro indicator anyway — "is my savings outpacing it?".
    (function _renderMacroWidget() {
      function _esc(s) {
        return String(s || '').replace(/[&<>"']/g, (c) =>
          ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      }
      function _trendArrow(trend) {
        if (trend === 'rising')  return '<span style="color:var(--amber,#F5A623);">▲</span>';
        if (trend === 'falling') return '<span style="color:var(--teal,#2BB67D);">▼</span>';
        return '';
      }
      function _severityHint(severity) {
        if (severity === 'high')      return ' &middot; <span style="color:var(--red,#E14747);">high inflation</span>';
        if (severity === 'elevated')  return ' &middot; <span style="color:var(--amber,#F5A623);">elevated</span>';
        if (severity === 'deflation') return ' &middot; <span style="color:var(--blue,#7BA8E0);">deflation</span>';
        return '';
      }
      function _go() {
        try {
          if (typeof PFCMacro === 'undefined') return;
          const el = document.getElementById('macro-widget');
          if (!el) return;
          PFCMacro.get().then((d) => {
            if (!d || !el) return;
            const cpi = d.cpiYoY;
            const cpiPopulated = cpi && typeof cpi.value === 'number' && isFinite(cpi.value);
            if (!cpiPopulated) { el.style.display = 'none'; return; }
            const label = cpi.countryName
              ? 'Inflation in ' + _esc(cpi.countryName)
              : 'Inflation (CPI YoY)';
            const val = cpi.value.toFixed(1) + '%';
            el.innerHTML =
              '<div style="display:flex;align-items:center;justify-content:space-between;">' +
                '<div>' +
                  '<span style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--text3,#8a9189);margin-right:10px;">' +
                    _esc(label) + '</span>' +
                  '<span style="font-family:var(--font-display);font-weight:600;font-size:16px;color:var(--ink,#F0EDE2);">' +
                    val + '</span>' +
                  ' ' + _trendArrow(cpi.trend) + _severityHint(cpi.severity) +
                '</div>' +
                '<span style="font-size:10.5px;color:var(--text3,#8a9189);">World Bank &middot; ' +
                  _esc(cpi.date || 'latest') + '</span>' +
              '</div>';
            el.style.display = 'block';
          }).catch(() => { /* silent — widget stays hidden */ });
        } catch (_) {}
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _go, { once: true });
      } else { _go(); }
    })();

    // FX PANEL — full-card currency board on the dashboard overview.
    // Renders the user's base currency against 6 common foreign currencies
    // using PFCFx (Frankfurter / ECB). Hidden until the first fetch
    // resolves so the panel never appears empty.
    //
    // Origin: synthesis Wave-2 #8 — provides the editorial home for the
    // E8 currency-triptych photo (already in DOM as the panel's eyebrow).
    (function _renderFxPanel() {
      // Six default counter-currencies — a deliberately small set that
      // spans the major Frankfurter-tracked corridors. The user's home
      // currency is filtered out of this list if it appears.
      const COUNTERS_USD_BASE = ['EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD'];
      const COUNTERS_EU_BASE  = ['USD', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD'];

      function _go() {
        try {
          if (typeof PFCFx === 'undefined') return;
          const panel = document.getElementById('fx-panel');
          const grid  = document.getElementById('fx-grid');
          const baseEl = document.getElementById('fx-base');
          if (!panel || !grid) return;

          // Pick the base currency. Use the user's home if Frankfurter
          // supports it; otherwise USD. PFCUser may not be ready yet —
          // tolerate undefined gracefully (defaults to USD).
          let base = 'USD';
          try {
            const user = (typeof PFCUser !== 'undefined') ? PFCUser.get() : null;
            const code = (user && user.currencyCode) ||
                         (typeof PFCCurrency !== 'undefined' && user
                            ? PFCCurrency.toISO(user.currency) : 'USD');
            if (code && PFCFx.isSupported(code)) base = code;
          } catch (_) {}
          baseEl.textContent = base;

          const counters = (base === 'USD' ? COUNTERS_USD_BASE : COUNTERS_EU_BASE)
            .filter(c => c !== base);

          PFCFx.getRates(base).then((rates) => {
            if (!rates || typeof rates !== 'object') return;
            const html = counters
              .map(c => {
                const r = rates[c];
                if (!isFinite(r) || r <= 0) return '';
                // Format precision: 4dp for sub-1 (EUR 0.92), 2dp for 1-100
                // range (CAD 1.36), 0dp for high-magnitude (JPY 150).
                const v = r >= 100 ? r.toFixed(0)
                        : r >= 10  ? r.toFixed(2)
                        : r.toFixed(4);
                return (
                  '<div style="background:var(--surface-2,rgba(244,239,229,0.04));' +
                  'border:1px solid var(--line-2,rgba(244,239,229,0.06));' +
                  'border-radius:var(--r-sm,8px);padding:10px 14px;">' +
                  '<div style="font-family:var(--font-mono,monospace);font-size:10.5px;' +
                  'letter-spacing:0.18em;text-transform:uppercase;color:var(--gold,#D4AF6A);' +
                  'margin-bottom:4px;">' + c + '</div>' +
                  '<div style="font-family:var(--font-display,serif);font-size:18px;' +
                  'font-weight:500;color:var(--ink,#F4EFE5);line-height:1.1;">' + v + '</div>' +
                  '</div>'
                );
              })
              .join('');
            if (!html) return; // No rates resolved -> stay hidden
            grid.innerHTML = html;
            panel.style.display = 'block';

            // Surface the cache timestamp if available.
            const updated = document.getElementById('fx-updated');
            if (updated && typeof PFCFx.lastUpdated === 'function') {
              const iso = PFCFx.lastUpdated();
              if (iso) {
                try {
                  const d = new Date(iso);
                  updated.textContent = d.toLocaleDateString(undefined,
                    { day: 'numeric', month: 'short', year: 'numeric' });
                } catch (_) {}
              }
            }
          }).catch(() => { /* silent — panel stays hidden */ });
        } catch (_) {}
      }
      if (typeof PFCUser !== 'undefined' && typeof PFCUser.onReady === 'function') {
        PFCUser.onReady(_go);
      } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _go, { once: true });
      } else { _go(); }
    })();

    // FX widget — show today's rate from USD to the user's currency in the
    // topbar subheader. Silent if user is already on USD or their currency
    // isn't in Frankfurter's coverage (~30 ECB-tracked currencies).
    (function _renderFxChip() {
      function _go() {
        try {
          if (typeof PFCFx === 'undefined' || typeof PFCUser === 'undefined') return;
          const el = document.getElementById('topbar-fx');
          if (!el) return;
          const user = PFCUser.get();
          const code = (user && user.currencyCode) ||
                       (typeof PFCCurrency !== 'undefined' && user
                          ? PFCCurrency.toISO(user.currency) : 'USD');
          if (!code || code === 'USD' || !PFCFx.isSupported(code)) {
            el.textContent = '';
            return;
          }
          PFCFx.getRate('USD', code).then((r) => {
            if (!isFinite(r) || r <= 0) return;
            // Format: more precision for small-rate currencies (EUR ~ 0.92),
            // less for large-rate ones (NGN ~ 1500).
            const formatted = r >= 100 ? r.toFixed(0)
                            : r >= 10  ? r.toFixed(2)
                            : r.toFixed(4);
            el.textContent = '· 1 USD = ' + formatted + ' ' + code;
          }).catch(() => { /* silent */ });
        } catch (_) { /* silent */ }
      }
      // Wait for PFCUser to be ready so we read the right currency.
      if (typeof PFCUser !== 'undefined' && typeof PFCUser.onReady === 'function') {
        PFCUser.onReady(_go);
      } else {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', _go, { once: true });
        } else { _go(); }
      }
    })();
