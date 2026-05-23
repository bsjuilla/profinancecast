// js/inline/waitlist-1.js — W24 waitlist form submit handler.
//
// CSP-clean: no inline event handlers, all wiring via JS file with
// script-src 'self'. Pattern matches the Wave-11 inline-handler-free
// architecture used across all working/marketing pages.

(function () {
  'use strict';

  const submitBtn = document.getElementById('submit-btn');
  const emailInput = document.getElementById('email');
  const useCaseSelect = document.getElementById('use-case');
  const consentCheckbox = document.getElementById('consent');
  const errorRow = document.getElementById('error-row');
  const formState = document.getElementById('form-state');
  const successState = document.getElementById('success-state');

  if (!submitBtn || !emailInput) return;

  function _showError(msg) {
    errorRow.textContent = msg;
    errorRow.classList.add('show');
  }
  function _clearError() {
    errorRow.classList.remove('show');
    errorRow.textContent = '';
  }

  async function _submit() {
    _clearError();
    const email = (emailInput.value || '').trim().toLowerCase();
    const useCase = useCaseSelect.value || '';
    const consent = consentCheckbox.checked;

    // Client-side validation — server re-validates
    if (!email) { _showError('Please enter your email.'); emailInput.focus(); return; }
    if (!/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(email)) {
      _showError("That doesn't look like a valid email.");
      emailInput.focus();
      return;
    }
    if (!consent) {
      _showError('Please tick the consent box to confirm GDPR opt-in.');
      consentCheckbox.focus();
      return;
    }

    submitBtn.disabled = true;
    const origText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting…';

    try {
      const res = await fetch('/api/waitlist/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          use_case: useCase,
          consent: true,
          source: 'waitlist_page',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        _showError(body.error || 'Could not submit — please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
        return;
      }

      // W14 funnel — fire pfc.signup_started with source
      if (window.PFCFunnel && typeof window.PFCFunnel.track === 'function') {
        try {
          window.PFCFunnel.track('pfc.signup_started', { source: 'waitlist_page' });
        } catch (_) {}
      }

      // Swap form for success state
      formState.classList.add('hide');
      successState.classList.add('show');
    } catch (e) {
      console.error('[waitlist] submit failed', e);
      _showError("Network error — please check your connection and try again.");
      submitBtn.disabled = false;
      submitBtn.textContent = origText;
    }
  }

  submitBtn.addEventListener('click', _submit);
  // Enter key in any of the fields also submits
  [emailInput, useCaseSelect].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); _submit(); }
    });
  });
})();
