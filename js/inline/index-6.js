(function animateHeroCurveIn() {
  if (window.matchMedia && !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
  // Defer past initForecast()'s first recompute() (ready() uses setTimeout(50)).
  setTimeout(function () {
    var path = document.getElementById('fc-line');
    var area = document.getElementById('fc-area');
    if (!path) return;
    var len = 0;
    try { len = path.getTotalLength(); } catch (_) { return; }
    if (!len) return;
    path.style.transition = 'none';
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    var prevAreaOpacity;
    if (area) {
      prevAreaOpacity = area.style.opacity;
      area.style.opacity = '0';
    }
    // Force reflow so the initial hidden state is committed before we
    // attach the transition.
    void path.getBoundingClientRect();
    path.style.transition = 'stroke-dashoffset 1600ms cubic-bezier(0.16, 1, 0.3, 1)';
    path.style.strokeDashoffset = '0';
    if (area) {
      area.style.transition = 'opacity 1200ms ease-out 400ms';
      area.style.opacity = prevAreaOpacity || '';
    }
  }, 120);
})();
