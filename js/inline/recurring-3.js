// recurring-3.js — auth guard + CSP-safe drop-area wiring.
// R-P0-6 + R-P0-14 (audit 2026-05-24): replaces inline ondragover/leave/drop
// handlers (CSP-violating) AND adds keyboard accessibility to the drop-area.
window.addEventListener('DOMContentLoaded', () => {
  if (typeof PFCAuth !== 'undefined') PFCAuth.requireAuth();

  // Drop-area drag-and-drop wiring (was inline ondragover= / ondragleave= /
  // ondrop= which violated CSP `script-src-elem 'self'`). Same handler
  // signature as the prior inline code — `handleDrop` is defined in
  // recurring-2.js as a global function.
  const drop = document.getElementById('drop-area');
  if (drop) {
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('drag');
    });
    drop.addEventListener('dragleave', () => {
      drop.classList.remove('drag');
    });
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
      if (typeof handleDrop === 'function') handleDrop(e);
    });
    // R-P0-14: keyboard accessibility — Enter/Space triggers file picker
    // (matches the data-pfc-on-click="_pfc_trigger_click" behaviour for
    // mouse users).
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const fileInput = document.getElementById('csv-file');
        if (fileInput) fileInput.click();
      }
    });
  }
});
