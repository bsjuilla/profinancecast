(function scrollProgressBar() {
  var bar = document.querySelector('.pfc-scroll-progress');
  if (!bar) return;
  if (window.matchMedia && !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
  var ticking = false;
  function update() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var doc = document.documentElement;
      var docHeight = doc.scrollHeight - doc.clientHeight;
      var pct = docHeight > 0 ? Math.min(1, Math.max(0, window.scrollY / docHeight)) : 0;
      bar.style.transform = 'scaleX(' + pct + ')';
      ticking = false;
    });
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
})();
