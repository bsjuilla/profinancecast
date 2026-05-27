// FULL-P0-B2 helper (audit 2026-05-26) — promise-based modal that replaces
// native window.confirm() in confirmReset. Native confirm() is silently
// invisible in iOS PWA standalone mode — the user taps "Clear my data"
// → modal never appears → user thinks the click did nothing → clicks
// again → still nothing. Same pattern as scenarios-3.js / RC-P0-MODAL /
// G-P1-D / NW-P1-6. Falls back to window.confirm if the modal markup
// hasn't loaded (degraded path).
let _pfcConfirmActive = false;
function _pfcConfirm(message, okLabel) {
  return new Promise(function (resolve) {
    if (_pfcConfirmActive) { resolve(false); return; }
    _pfcConfirmActive = true;
    const modal = document.getElementById('settings-confirm-modal');
    const msgEl = document.getElementById('settings-confirm-msg');
    const okBtn = document.getElementById('settings-confirm-ok');
    const cancelBtn = document.getElementById('settings-confirm-cancel');
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      _pfcConfirmActive = false;
      resolve(window.confirm(message));
      return;
    }
    const previousFocus = document.activeElement;
    msgEl.textContent = message;
    okBtn.textContent = okLabel || 'Confirm';
    modal.classList.add('open');
    okBtn.focus();
    function cleanup(result) {
      modal.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      _pfcConfirmActive = false;
      try { if (previousFocus && previousFocus.focus) previousFocus.focus(); } catch (_) {}
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onKey(e) {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') cleanup(true);
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
  });
}

function showTab(btn, tab) {
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
}

function toggleSwitch(btn) {
  const isOn = btn.classList.contains('on');
  btn.classList.toggle('on', !isOn);
  btn.classList.toggle('off', isOn);
}

function setFreq(btn) {
  document.querySelectorAll('.freq-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function saveSettings() {
  const btn = document.getElementById('save-btn');
  const fname = document.getElementById('s-fname').value.trim();
  const lname = document.getElementById('s-lname').value.trim();
  const fullName = (fname + ' ' + lname).trim();
  const age      = document.getElementById('s-age').value;
  const currencyISO = document.getElementById('s-currency').value;
  // The select stores ISO codes (USD, MUR, etc.) but the rest of the app
  // prepends USER.currency as a SYMBOL. Normalise on write so a refresh
  // reads "₨3,000" not "MUR 3,000". Store the ISO separately so the
  // dropdown re-selects the right option on next load.
  const currencySymbol = (typeof PFCCurrency !== 'undefined' && PFCCurrency.toSymbol)
    ? PFCCurrency.toSymbol(currencyISO)
    : currencyISO;

  // Persist via PFCUser — merges into the existing object so we never wipe
  // the user's income/expenses/debts written by onboarding, propagates the
  // change to every other open page via PFCUser.onChange, and handles all
  // three storage sinks (LS sync, encrypted PFCStorage, cash-forecast LS).
  if (typeof PFCUser !== 'undefined') {
    try {
      PFCUser.update({
        name: fullName,
        firstName: fname,
        lastName: lname,
        age,
        currency: currencySymbol,    // display-ready symbol
        currencyCode: currencyISO,   // ISO code for dropdown re-selection
      });
    } catch (e) { /* never block save UI on storage failure */ }
  } else if (typeof PFCStorage !== 'undefined') {
    // Fallback if PFCUser failed to load
    try {
      const existing = PFCStorage.getJSON('user') || {};
      const merged = {
        ...existing,
        name: fullName,
        firstName: fname,
        lastName: lname,
        age,
        currency: currencySymbol,
        currencyCode: currencyISO,
      };
      PFCStorage.setJSON('user', merged);
    } catch (e) {}
  }

  if (fname || lname) {
    const initials = ((fname[0] || '') + (lname[0] || '')).toUpperCase();
    const dispName = document.getElementById('profile-display-name');
    if (dispName) dispName.textContent = fullName;
    const bigAv = document.querySelector('.big-avatar');
    if (bigAv && bigAv.childNodes[0]) bigAv.childNodes[0].textContent = initials;
  }

  // Push the name + preferences to Supabase user_metadata so they survive a
  // device switch / cache wipe. user_metadata is the canonical source for
  // display name on first hydration; PFCStorage is the local mirror.
  // Fire-and-forget: if it fails (offline, expired session) the local mirror
  // still keeps the UI consistent until the next successful sync.
  try {
    const supabase = (typeof PFCAuth !== 'undefined') ? PFCAuth.getClient() : null;
    if (supabase) {
      await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          first_name: fname,
          last_name: lname,
          age_range: age,
          currency: currencyISO,
        },
      });
    }
  } catch (e) {
    console.warn('[settings] updateUser failed:', e && e.message);
  }

  // Refresh sidebar pill (avatar + name + paid-tier styling) without waiting
  // for a page reload. pfc-sidebar.js exposes this hook for exactly this case.
  if (window.PFCSidebar && typeof window.PFCSidebar.refreshUserPill === 'function') {
    window.PFCSidebar.refreshUserPill();
  }

  btn.classList.add('saved');
  btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3 3 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg> Saved!';
  showToast('Settings saved successfully');
  setTimeout(() => {
    btn.classList.remove('saved');
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3 3 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg> Save changes';
  }, 2500);
}

async function changePassword() {
  const curr = document.getElementById('s-current-pw').value;
  const nw   = document.getElementById('s-new-pw').value;
  const conf = document.getElementById('s-confirm-pw').value;

  if (!curr || !nw) { showToast('Please fill in all password fields'); return; }
  if (nw !== conf)  { showToast('New passwords do not match'); return; }
  if (nw.length < 8){ showToast('Password must be at least 8 characters'); return; }

  // Button loading state
  const btn = document.querySelector('button[onclick="changePassword()"]');
  const originalText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }

  const supabase = (typeof PFCAuth !== 'undefined') ? PFCAuth.getClient() : null;

  if (!supabase) {
    // Auth SDK didn't load — fail loudly. The previous "demo mode" silent
    // success was misleading: the user thought their password had changed
    // when nothing had actually happened.
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
    showToast('Auth service unavailable — please refresh and try again');
    return;
  }

  // Supabase requires a fresh session to change passwords.
  // Re-authenticate with current password first, then update.
  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData?.session?.user?.email;

  if (!email) {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
    showToast('Session expired — please log in again');
    return;
  }

  // Step 1: verify current password by signing in again
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: curr,
  });

  if (signInError) {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
    showToast('Current password is incorrect');
    return;
  }

  // Step 2: update to the new password
  const { error: updateError } = await supabase.auth.updateUser({ password: nw });

  if (btn) { btn.disabled = false; btn.textContent = originalText; }

  if (updateError) {
    showToast('Error: ' + updateError.message);
    return;
  }

  // Clear fields on success
  document.getElementById('s-current-pw').value = '';
  document.getElementById('s-new-pw').value = '';
  document.getElementById('s-confirm-pw').value = '';
  showToast('Password updated successfully');
}

function handleAvatar(input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const av = document.querySelector('.big-avatar');
    av.style.backgroundImage = `url(${e.target.result})`;
    av.style.backgroundSize = 'cover';
    av.style.backgroundPosition = 'center';
    av.childNodes[0].textContent = '';
    showToast('Profile photo updated');
  };
  reader.readAsDataURL(input.files[0]);
}

// Real export — wired to js/pfc-export.js (audit H5 + L1)
function exportData(type) {
  if (typeof PFCExport === 'undefined') {
    showToast('Export library failed to load — please refresh');
    return;
  }
  try {
    const backup = (typeof PFCExport.fullBackup === 'function')
      ? (PFCExport.fullBackup() || { exportedAt: new Date().toISOString(), data: {} })
      : { data: {} };

    if (type === 'json') {
      PFCExport.json('profinancecast-backup.json', backup);
      showToast('JSON export downloaded');
      return;
    }
    if (type === 'csv') {
      const rows = [];
      Object.entries(backup.data || {}).forEach(([section, value]) => {
        if (Array.isArray(value)) {
          value.forEach((item, idx) => {
            if (item && typeof item === 'object') {
              Object.entries(item).forEach(([field, v]) => {
                rows.push({ section, index: idx, field, value: typeof v === 'object' ? JSON.stringify(v) : String(v) });
              });
            } else {
              rows.push({ section, index: idx, field: '', value: String(item) });
            }
          });
        } else if (value && typeof value === 'object') {
          Object.entries(value).forEach(([field, v]) => {
            rows.push({ section, index: '', field, value: typeof v === 'object' ? JSON.stringify(v) : String(v) });
          });
        } else if (value !== undefined && value !== null) {
          rows.push({ section, index: '', field: '', value: String(value) });
        }
      });
      if (!rows.length) { showToast('No financial data to export yet'); return; }
      PFCExport.csv('profinancecast-data.csv', rows, ['section','index','field','value']);
      showToast('CSV export downloaded');
      return;
    }
    if (type === 'pdf') {
      showToast('Opening print dialog…');
      if (typeof PFCExport.printReport === 'function') PFCExport.printReport();
      else window.print();
      return;
    }
    showToast('Unknown export type');
  } catch (e) {
    console.error('[exportData] failed:', e);
    showToast('Export failed — please try again');
  }
}

function connectGoogle() {
  showToast('Redirecting to Google sign-in…');
  // In production: supabase.auth.signInWithOAuth({ provider: 'google' })
}
function connectFacebook() {
  showToast('Redirecting to Facebook sign-in…');
}

// Real reset — actually clears storage now (audit H5).
// FULL-P0-B2 — was native window.confirm(). Now uses _pfcConfirm (defined
// above) so iOS PWA standalone-mode users actually see the prompt instead
// of a silent no-op. PFCStorage.clearAll() is destructive enough that a
// flaky modal would have led to "I tapped it and nothing happened" support
// tickets at best, or accidental data loss if a user double-tapped and
// hit OK on the second attempt without realizing.
function confirmReset() {
  _pfcConfirm(
    'This will delete all your financial data (income, expenses, debts, goals). Your account and settings will stay. Are you sure?',
    'Clear data'
  ).then((ok) => {
    if (!ok) return;
    if (typeof PFCStorage === 'undefined') {
      showToast('Storage unavailable — please refresh');
      return;
    }
    try {
      PFCStorage.clearAll();
    } catch (e) {
      console.error('[confirmReset] clearAll failed:', e);
      showToast('Reset failed — please try again');
      return;
    }
    showToast('Financial data cleared. Redirecting to onboarding…');
    setTimeout(() => { window.location.href = 'onboarding.html'; }, 1400);
  });
}

// Real account deletion — calls /api/account/delete with double-confirm (audit H5, GDPR)
function _settingsAuthHeaders() {
  const session = (typeof PFCAuth !== 'undefined') ? PFCAuth.getSession() : null;
  const token = session?.access_token;
  return token
    ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    : { 'Content-Type': 'application/json' };
}

async function confirmDelete() {
  const session = (typeof PFCAuth !== 'undefined') ? PFCAuth.getSession() : null;
  const userEmail = session?.user?.email || '';
  if (!session || !userEmail) {
    showToast('You must be signed in to delete your account');
    return;
  }
  const typed = prompt('This permanently deletes your ProFinanceCast account, all financial data, and any active subscription. This cannot be undone.\n\nType your email (' + userEmail + ') to confirm:');
  if (typed === null) return;
  if (typed.trim().toLowerCase() !== userEmail.toLowerCase()) {
    showToast('Email did not match — account NOT deleted');
    return;
  }
  try {
    const res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: _settingsAuthHeaders(),
    });
    if (res.status !== 204 && !res.ok) {
      let msg = 'Deletion failed — please contact support.';
      try { const body = await res.json(); if (body?.error) msg = body.error; } catch (_) {}
      showToast(msg);
      return;
    }
    showToast('Account deleted. Goodbye.');
    try { if (typeof PFCStorage !== 'undefined') PFCStorage.clearAll(); } catch (_) {}
    try { if (typeof PFCAuth !== 'undefined') await PFCAuth.getClient()?.auth.signOut(); } catch (_) {}
    setTimeout(() => { window.location.replace('index.html?deleted=1'); }, 600);
  } catch (e) {
    console.error('[confirmDelete] network error:', e);
    showToast('Network error — account NOT deleted');
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
