(function bentoTickers() {
  if (window.matchMedia && !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
  if (typeof window._pfcCountUp !== 'function') return;
  if (!('IntersectionObserver' in window)) return;
  var targets = document.querySelectorAll('.pfc-ticker');
  if (!targets.length) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var el = entry.target;
        window._pfcCountUp(el, el.textContent, 1200);
        io.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  targets.forEach(function (el) { io.observe(el); });
})();
