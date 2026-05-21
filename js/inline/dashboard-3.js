    window.addEventListener('DOMContentLoaded', () => {
      if (typeof PFCAuth !== 'undefined') PFCAuth.requireAuth();
    });

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
