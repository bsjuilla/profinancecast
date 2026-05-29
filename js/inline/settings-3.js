    window.addEventListener('DOMContentLoaded', () => {
      if (typeof PFCAuth === 'undefined') return;
      PFCAuth.requireAuth();
      PFCAuth.onReady(() => {
        const session = PFCAuth.getSession();
        const user    = session && session.user;
        if (!user) return;

        const email   = user.email || '';
        const meta    = user.user_metadata || {};
        const stored  = (typeof PFCStorage !== 'undefined')
          ? (PFCStorage.getJSON('user') || {})
          : {};

        // Name resolution: storage > metadata.first/last > split metadata.full_name
        let fname = stored.firstName || meta.first_name || '';
        let lname = stored.lastName  || meta.last_name  || '';
        if (!fname && !lname) {
          const fullNm = meta.full_name || meta.name || stored.name || '';
          const parts  = fullNm.trim().split(/\s+/);
          fname = parts[0] || '';
          lname = parts.slice(1).join(' ') || '';
        }
        const fullName = stored.name || (fname + ' ' + lname).trim() || meta.full_name || '';

        const age      = stored.age      || meta.age_range || '25 – 34';
        // Currency dropdown options are ISO codes (USD, EUR, MUR). The
        // stored value might be either an ISO code (older format) or a
        // symbol (new format set by saveSettings below). Prefer the
        // explicit currencyCode field if present; otherwise convert
        // whatever stored.currency holds into an ISO via PFCCurrency.toISO.
        const rawCurrency = stored.currencyCode || stored.currency || meta.currency || 'USD';
        const currency = (typeof PFCCurrency !== 'undefined' && PFCCurrency.toISO)
          ? PFCCurrency.toISO(rawCurrency)
          : rawCurrency;

        const initials = ((fname[0] || email[0] || '') + (lname[0] || '')).toUpperCase() || '—';
        const setVal   = (id, v) => { const el = document.getElementById(id); if (el && 'value' in el) el.value = v; };
        const setText  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

        // Populate the Connected Accounts "Email (...)" line from the
        // actual session — replaces a previously-hardcoded developer email
        // that was showing for every user.
        const connEmailEl = document.getElementById('conn-email');
        if (connEmailEl && email) connEmailEl.textContent = email;

        setVal('s-email',    email);
        setVal('s-fname',    fname);
        setVal('s-lname',    lname);
        setVal('s-age',      age);
        setVal('s-currency', currency);
        setText('profile-display-name',    fullName || email || '—');
        setText('profile-avatar-initials', initials);

        // W30 — reflect the persisted Weekly Check-In opt-in in its toggle.
        if (typeof loadNotificationPrefs === 'function') loadNotificationPrefs();
      });
    });
