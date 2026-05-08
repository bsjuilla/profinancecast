/**
 * pfc-export.js — One-click CSV / JSON exporters.
 *
 * Usage:
 *   PFCExport.csv('debts.csv', [{name:'Card', balance:1200}, ...]);
 *   PFCExport.json('full-backup.json', PFCStorage.getJSON('all'));
 *   PFCExport.printReport('report-card-area');   // window.print() with a clean stylesheet
 */
const PFCExport = (() => {
  function _download(filename, mime, text) {
    const blob = new Blob([text], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a);
    a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /**
   * Convert an array of objects to a CSV string. Handles commas, quotes, newlines.
   * If `headers` is omitted, the union of keys from the first 50 rows is used.
   */
  function toCSV(rows, headers) {
    if (!Array.isArray(rows) || rows.length === 0) return '';
    if (!headers) {
      const seen = new Set();
      rows.slice(0, 50).forEach(r => Object.keys(r || {}).forEach(k => seen.add(k)));
      headers = [...seen];
    }
    const escape = v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = headers.map(escape).join(',');
    const body = rows.map(r => headers.map(h => escape(r ? r[h] : '')).join(',')).join('\n');
    return head + '\n' + body;
  }

  function csv(filename, rows, headers) {
    _download(filename, 'text/csv;charset=utf-8', toCSV(rows, headers));
  }
  function json(filename, data) {
    _download(filename, 'application/json', JSON.stringify(data, null, 2));
  }

  /**
   * Minimal print helper — applies a print-only stylesheet that hides chrome.
   * Useful for the report card.
   */
  function printReport(rootSelector) {
    const root = document.querySelector(rootSelector);
    if (!root) { window.print(); return; }
    const style = document.createElement('style');
    style.id = 'pfc-print-temp';
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        ${rootSelector}, ${rootSelector} * { visibility: visible !important; }
        ${rootSelector} { position: absolute; inset: 0; padding: 24px; background: #fff; color: #000; }
        a { color: #000 !important; text-decoration: none !important; }
      }
    `;
    document.head.appendChild(style);
    setTimeout(() => { window.print(); style.remove(); }, 50);
  }

  /**
   * Build a comprehensive backup of all PFCStorage data for the current user.
   * Used by Settings → Export account.
   */
  function fullBackup() {
    if (typeof PFCStorage === 'undefined') return null;
    const uid = (typeof PFCAuth !== 'undefined') ? PFCAuth.getUserId() : 'guest';
    const prefix = `pfc:${uid}:`;
    const out = { exportedAt: new Date().toISOString(), userId: uid, data: {} };
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const short = k.substring(prefix.length);
        const raw = localStorage.getItem(k);
        try { out.data[short] = JSON.parse(raw); }
        catch { out.data[short] = raw; }
      }
    }
    return out;
  }

  return { csv, json, toCSV, printReport, fullBackup };
})();
