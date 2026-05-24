/* dashboard-sage.js — inline Sage form wiring (extracted for CSP).
 *
 * Previously an inline <script> block on dashboard.html (DASH-P1-6 /
 * audit DCRO-6). Moved to external file because CSP
 * `script-src-elem 'self' ...` blocks all inline scripts with no
 * 'unsafe-inline'. E2E smoke test was failing on every commit with:
 *   "Executing inline script violates the following Content Security
 *    Policy directive 'script-src-elem 'self' ...'"
 *
 * Reuses the same Authorization-header pattern as the DASH-P0-9 fix on
 * the CSV→Sage call. Renders the reply inline below the form rather
 * than bouncing to /sage.html.
 *
 * Loaded with `defer` so #dash-sage-form / #dash-sage-input /
 * #dash-sage-send / #dash-sage-reply exist when this runs.
 */
(function wireInlineSage() {
  'use strict';
  var form = document.getElementById('dash-sage-form');
  var inp  = document.getElementById('dash-sage-input');
  var btn  = document.getElementById('dash-sage-send');
  var out  = document.getElementById('dash-sage-reply');
  if (!form || !inp || !btn || !out) return;
  var inflight = false;

  async function send(e) {
    if (e) e.preventDefault();
    var msg = (inp.value || '').trim();
    if (!msg || inflight) return;
    inflight = true;
    btn.disabled = true;
    var origLabel = btn.textContent;
    btn.textContent = 'Thinking…';
    out.style.display = 'block';
    out.textContent = '…';
    try {
      var headers = { 'Content-Type': 'application/json' };
      try {
        var s = (typeof PFCAuth !== 'undefined') ? PFCAuth.getSession() : null;
        if (s && s.access_token) headers['Authorization'] = 'Bearer ' + s.access_token;
      } catch (_) {}
      var body = { message: msg };
      try {
        if (typeof PFCUser !== 'undefined' && PFCUser.get) {
          var u = PFCUser.get() || {};
          body.userContext = {
            monthlyIncome:   Number(u.income) || 0,
            monthlyExpenses: Number(u.housing || 0) + Number(u.food || 0) + Number(u.transport || 0) + Number(u.otherExp || 0),
            totalDebt:       Number(u.debt) || 0,
            totalSavings:    Number(u.savings) || 0,
          };
        }
      } catch (_) {}
      var r = await fetch('/api/sage', { method: 'POST', headers: headers, body: JSON.stringify(body) });
      if (!r.ok) {
        if (r.status === 401) {
          out.textContent = 'Sage requires a signed-in Pro account — sign in to ask a question.';
        } else if (r.status === 429) {
          out.textContent = 'You have hit your Sage monthly quota — see billing for usage details.';
        } else {
          out.textContent = 'Sage is unavailable right now (error ' + r.status + '). Please try again in a moment.';
        }
        return;
      }
      var data = await r.json();
      var reply = data.reply || data.content || data.text || '';
      out.textContent = reply || '(no response)';
    } catch (err) {
      out.textContent = 'Sage is unavailable right now — try again in a moment.';
    } finally {
      inflight = false;
      btn.disabled = false;
      btn.textContent = origLabel;
    }
  }

  form.addEventListener('submit', send);
})();
