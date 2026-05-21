(function () {
  const nav = document.getElementById('nav');
  if (!nav) return;
  let scheduled = false;
  function syncScrolled() {
    scheduled = false;
    const past = window.scrollY > 80;
    if (past) nav.setAttribute('data-scrolled', 'true');
    else nav.removeAttribute('data-scrolled');
  }
  function onScroll() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(syncScrolled);
  }
  syncScrolled();
  window.addEventListener('scroll', onScroll, { passive: true });
})();
