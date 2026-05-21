    window.addEventListener('DOMContentLoaded', () => {
      if (typeof PFCAuth !== 'undefined') PFCAuth.requireAuth();
    });

    // Macro context strip — populates the macro-widget div with FRED data.
    // Hides itself entirely when all 4 series are null (e.g., FRED is
    // IP-blocking Vercel's edge POPs — a known reachability issue with
    // their public API). Better to show nothing than 4 cells of "—".
    (function _renderMacroWidget() {
      function _go() {
        try {
          if (typeof PFCMacro === 'undefined') return;
          const el = document.getElementById('macro-widget');
          if (!el) return;
          PFCMacro.get().then((d) => {
            if (!d || !el) return;
            const series = [d.fedFunds, d.mortgage30y, d.treasury10y, d.cpiYoY];
            const populated = series.filter(
              (s) => s && typeof s.value === 'number' && isFinite(s.value)
            );
            // If FRED is unreachable from this Vercel POP, hide silently.
            // The dashboard renders fine without macro context; better than
            // showing a row of useless "—" placeholders.
            if (populated.length === 0) {
              el.style.display = 'none';
              return;
            }
            function _fmtPct(v) {
              return (typeof v === 'number' && isFinite(v)) ? v.toFixed(2) + '%' : '—';
            }
            function _cell(label, val) {
              return '<div style="display:inline-block;margin-right:22px;">' +
                '<span style="display:block;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--text3,#8a9189);margin-bottom:2px;">' +
                  label + '</span>' +
                '<span style="font-family:var(--font-display);font-weight:600;font-size:14px;color:var(--ink,#F0EDE2);">' +
                  val + '</span></div>';
            }
            el.innerHTML =
              _cell('Fed funds',    d.fedFunds    ? _fmtPct(d.fedFunds.value)    : '—') +
              _cell('30Y mortgage', d.mortgage30y ? _fmtPct(d.mortgage30y.value) : '—') +
              _cell('10Y Treasury', d.treasury10y ? _fmtPct(d.treasury10y.value) : '—') +
              _cell('CPI YoY',      d.cpiYoY      ? _fmtPct(d.cpiYoY.value)      : '—') +
              '<span style="float:right;font-size:10.5px;color:var(--text3,#8a9189);">FRED &middot; ' +
                (d.cpiYoY && d.cpiYoY.date ? d.cpiYoY.date : 'live') + '</span>';
            el.style.display = 'block';
          }).catch(() => { /* silent — widget stays hidden */ });
        } catch (_) {}
      }
      if (document.readyState === 'loading') {
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
