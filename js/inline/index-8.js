(function heroBandParallax() {
  if (window.matchMedia && !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
  var target = document.querySelector('.pfc-photo-band picture, .pfc-photo-band > img');
  if (!target) return;
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var rect = target.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      if (rect.bottom > 0 && rect.top < vh) {
        var center = (rect.top + rect.height / 2) - vh / 2;
        target.style.transform = 'translateY(' + (center * -0.06).toFixed(2) + 'px)';
      }
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();
})();
