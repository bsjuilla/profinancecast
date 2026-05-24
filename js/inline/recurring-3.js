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
    // R-A11Y-26 fix — create a polite ARIA live region inside the drop area
    // so screen-reader users hear when the drag-over state changes (visual
    // .drag class is silent for them). Region is sr-only via .visually-hidden.
    let liveRegion = document.getElementById('drop-area-live');
    if (!liveRegion) {
      liveRegion = document.createElement('span');
      liveRegion.id = 'drop-area-live';
      liveRegion.className = 'visually-hidden';
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      drop.appendChild(liveRegion);
    }
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!drop.classList.contains('drag')) {
        drop.classList.add('drag');
        liveRegion.textContent = 'File ready to drop. Release to upload.';
      }
    });
    drop.addEventListener('dragleave', () => {
      drop.classList.remove('drag');
      liveRegion.textContent = '';
    });
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
      liveRegion.textContent = 'Uploading your statement.';
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
