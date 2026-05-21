(function ruleDrawIn() {
  var rules = document.querySelectorAll('.section-index .rule');
  if (!rules.length) return;
  var reduce = window.matchMedia && !window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    rules.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  rules.forEach(function (el) { io.observe(el); });
})();
