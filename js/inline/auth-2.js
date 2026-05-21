// Auth config now comes from pfc-config.js (single source of truth).
// We deliberately do NOT fall back to a "demo mode" that lets users into the
// app without authenticating — that was a backdoor.
const APP_ORIGIN = window.PFC_CONFIG.APP_ORIGIN;

// Audit H6: use the shared PFCAuth client so auth.html shares the same
// persistSession/autoRefreshToken/detectSessionInUrl options the rest of
// the app relies on. PFCAuth.getClient() returns null if the SDK or
// config failed to load — render the same hard error in that case.
const supabaseClient = (typeof PFCAuth !== 'undefined') ? PFCAuth.getClient() : null;
if (!supabaseClient) {
  console.error('[auth] Supabase client unavailable via PFCAuth');
  document.addEventListener('DOMContentLoaded', () => {
    const err = document.createElement('div');
    err.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:var(--canvas);color:#E05252;font-family:Inter,sans-serif;padding:24px;text-align:center;';
    err.innerHTML = '<div><h2 style="font-family:Fraunces,serif;margin-bottom:8px;">Service unavailable</h2><p style="color:#B8C2BC;">Authentication is temporarily down. Please try again in a moment.</p></div>';
    document.body.appendChild(err);
  });
}

// Pages can pass ?next=/scenarios.html to redirect back after sign-in
function _nextDestination() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  // Audit C2 fix: reject protocol-relative URLs ("//evil.com") and any
  // candidate that doesn't resolve to our own origin. Browsers treat
  // "//evil.com" as cross-origin even though it starts with a slash.
  if (next && /^\/(?!\/)[A-Za-z0-9_\-./?=&%#]*$/.test(next)) {
    try {
      const resolved = new URL(next, window.location.origin);
      if (resolved.origin === window.location.origin) return next;
    } catch (_) {}
  }
  return 'dashboard.html';
}

// ── VIEW SWITCHING ──
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  hideAllAlerts();
}

function hideAllAlerts() {
  document.querySelectorAll('.alert').forEach(a => a.classList.remove('show'));
}

function showAlert(id) {
  hideAllAlerts();
  document.getElementById(id).classList.add('show');
}

// ── PASSWORD TOGGLE ──
function togglePw(inputId, icon) {
  const input = document.getElementById(inputId);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  icon.innerHTML = isText
    ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.4"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M6.5 6.6A2.5 2.5 0 0110 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M4 4.5C2.3 5.7 1 8 1 8s2.5 5 7 5c1.5 0 2.8-.5 3.9-1.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M12.5 11.5C14 10.3 15 8 15 8s-2.5-5-7-5c-.8 0-1.6.15-2.3.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
}

// ── EMAIL VALIDATION ──
function validateEmail(input) {
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value);
  const icon  = document.getElementById('email-icon');
  const hint  = document.getElementById('email-hint');
  if (input.value.length < 4) { icon.innerHTML = ''; hint.classList.remove('show'); return; }
  if (valid) {
    input.classList.remove('error'); input.classList.add('success');
    icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3" stroke="#22C55E" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    hint.textContent = ''; hint.classList.remove('show');
  } else {
    input.classList.remove('success'); input.classList.add('error');
    icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="#E05252" stroke-width="1.6" stroke-linecap="round"/></svg>';
    hint.textContent = 'Please enter a valid email address';
    hint.className = 'field-hint hint-error show';
  }
}

// ── PASSWORD STRENGTH ──
function checkPwStrength(pw) {
  const el = document.getElementById('pw-strength');
  el.classList.add('show');
  let score = 0;
  if (pw.length >= 8)   score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const colors = ['#E05252','#F5A623','#3B82F6','var(--money)'];
  const labels = ['Weak','Fair','Good','Strong'];
  for (let i = 1; i <= 4; i++) {
    document.getElementById('pb' + i).style.background = i <= score ? colors[score-1] : 'rgba(255,255,255,0.07)';
  }
  document.getElementById('pw-label').textContent = score > 0 ? labels[score-1] : '';
  document.getElementById('pw-label').style.color = score > 0 ? colors[score-1] : 'var(--text3)';
}

// ── LOADING STATE ──
// Mirrors the visual disabled state into the assistive-tech contract:
// aria-busy tells screen readers a region is being updated; aria-disabled
// belt-and-suspenders the native `disabled` for any UA that ignores it on
// non-button elements (we use `disabled` here, but a future <a class="btn">
// needs the aria fallback).
function setLoading(btnId, spinnerId, loading) {
  const btn = document.getElementById(btnId);
  const sp  = document.getElementById(spinnerId);
  btn.disabled = loading;
  btn.setAttribute('aria-busy', loading ? 'true' : 'false');
  btn.setAttribute('aria-disabled', loading ? 'true' : 'false');
  btn.querySelector('span').style.opacity = loading ? '0' : '1';
  sp.style.display = loading ? 'block' : 'none';
}

// ── LOGIN ──
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pw    = document.getElementById('login-pw').value;

  if (!email || !pw) { showAlert('login-error'); document.getElementById('login-error').textContent = 'Please fill in all fields.'; return; }

  setLoading('login-btn', 'login-spinner', true);
  hideAllAlerts();

  if (!supabaseClient) {
    setLoading('login-btn', 'login-spinner', false);
    showAlert('login-error');
    document.getElementById('login-error').textContent = 'Sign-in is temporarily unavailable. Please try again in a moment.';
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pw });
  setLoading('login-btn', 'login-spinner', false);

  if (error) {
    console.error('[auth] signInWithPassword error:', error);
    showAlert('login-error');
    let msg = error.message || 'Could not sign in.';
    // Translate cryptic Supabase errors into something a human can act on
    if (/email not confirmed/i.test(msg)) {
      msg = 'You haven’t confirmed your email yet. Check your inbox (and spam) for the link — or click "Resend" below.';
      // Show a resend button
      const errEl = document.getElementById('login-error');
      errEl.textContent = msg + ' ';
      const resendLink = document.createElement('a');
      resendLink.style.cssText = 'color:var(--teal);cursor:pointer;text-decoration:underline;';
      resendLink.textContent = 'Resend';
      resendLink.addEventListener('click', function() { resendConfirmation(email); });
      errEl.appendChild(resendLink);
      return;
    }
    if (/invalid login credentials/i.test(msg)) {
      msg = 'Wrong email or password. Try again, or reset your password.';
    }
    document.getElementById('login-error').textContent = msg;
    return;
  }
  // Session was written to localStorage by the SDK — navigate to the destination
  window.location.href = _nextDestination();
}

// Triggered by the inline "Resend" link inside the error banner
async function resendConfirmation(email) {
  if (!supabaseClient || !email) return;
  const { error } = await supabaseClient.auth.resend({ type: 'signup', email });
  const errEl = document.getElementById('login-error');
  if (error) {
    errEl.textContent = 'Could not resend: ' + error.message;
  } else {
    errEl.style.color = 'var(--teal)';
    errEl.textContent = 'Confirmation email resent. Check your inbox in 1–2 minutes.';
  }
}

// ── SIGNUP ──
async function handleSignup() {
  const fullName = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pw    = document.getElementById('signup-pw').value;
  const terms = document.getElementById('agree-terms').checked;

  const errEl = document.getElementById('signup-error');
  const fail = (msg) => { errEl.textContent = msg; showAlert('signup-error'); };

  if (!fullName || !email || !pw) return fail('Please fill in name, email, and password.');
  if (pw.length < 8)              return fail('Password must be at least 8 characters.');
  if (!terms)                     return fail('Please accept the Terms of Service to continue.');

  setLoading('signup-btn', 'signup-spinner', true);
  hideAllAlerts();

  if (!supabaseClient) {
    setLoading('signup-btn', 'signup-spinner', false);
    return fail('Sign-up is temporarily unavailable. Please try again in a moment.');
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email, password: pw,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${APP_ORIGIN}/onboarding.html`,
    },
  });

  setLoading('signup-btn', 'signup-spinner', false);

  if (error) return fail(error.message);

  // Deferred email verify: if Supabase returned a session, route to
  // onboarding immediately. The confirmation email is still sent in
  // parallel; a banner on the dashboard nudges the user to click the
  // link when convenient. Falls back to the verify view if the project
  // is configured with email_confirm_required=true.
  document.dispatchEvent(new CustomEvent('pfc:signup-defer-verify-success', { detail: { method: 'email' } }));
  if (data && data.session) {
    location.assign('onboarding.html');
  } else {
    document.getElementById('verify-email-display').textContent = email;
    showView('verify');
  }
}

// ── FORGOT PASSWORD ──
async function handleForgot() {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) return;

  setLoading('forgot-btn', 'forgot-spinner', true);
  hideAllAlerts();

  if (!supabaseClient) {
    setLoading('forgot-btn', 'forgot-spinner', false);
    showAlert('forgot-error');
    document.getElementById('forgot-error').textContent = 'Reset is temporarily unavailable. Please try again later.';
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${APP_ORIGIN}/reset-password`,
  });

  setLoading('forgot-btn', 'forgot-spinner', false);

  if (error) {
    showAlert('forgot-error');
  } else {
    showAlert('forgot-success');
    document.getElementById('forgot-btn').style.display = 'none';
  }
}

// ── GOOGLE OAUTH ──
async function handleGoogle() {
  const errEl = document.getElementById('google-error');
  errEl.style.display = 'none';

  if (!supabaseClient) {
    errEl.textContent = 'Google sign-in is temporarily unavailable. Please use email sign up below.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('google-btn');
  btn.disabled = true;
  btn.textContent = 'Redirecting to Google…';

  // Always redirect OAuth back to the site root. index.html has a callback
  // handler that consumes the #access_token from the URL hash, writes the
  // session to localStorage, then routes the user to dashboard / onboarding /
  // ?next=. This survives Supabase's redirect-URL allow-list (which usually
  // only whitelists `/`) and avoids the "user lands on landing page with a
  // giant hash and is silently unauthenticated" bug.
  const next = _nextDestination();
  const nextParam = next && next !== 'dashboard.html'
    ? `?next=${encodeURIComponent(next.startsWith('/') ? next : '/' + next)}`
    : '';
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${APP_ORIGIN}/${nextParam}`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });

  if (error) {
    btn.disabled = false;
    btn.innerHTML = '<svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.616z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> Continue with Google';
    errEl.textContent = 'Google sign-in is not enabled yet. Use email sign up below — it takes 30 seconds.';
    errEl.style.display = 'block';
  }
}

// ── CHECK SESSION (if already logged in, redirect to ?next or dashboard) ──
async function checkSession() {
  if (!supabaseClient) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) window.location.href = _nextDestination();
}
checkSession();

// ── Surface OAuth callback errors that index.html bounced back to us ──
(function () {
  try {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (!err) return;
    const map = {
      timeout:    'Sign-in took too long. Please try again.',
      no_session: 'We received the Google response but no session was created. Try again, or use email sign-in below.',
    };
    const msg = map[err] || decodeURIComponent(err);
    const errEl = document.getElementById('google-error');
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
      errEl.classList.add('show');
    }
  } catch (_) {}
})();
