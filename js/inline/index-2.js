  // Watchdog: if GSAP hasn't initialised within 1.5s, force-reveal everything.
  // Also covers the degenerate-animation case where GSAP loaded fine but an
  // element is still at computed opacity:0 (e.g. a misconfigured gsap.from
  // animating opacity:0 -> CSS opacity:0). Either failure mode leaves users
  // staring at an empty hero — both are caught here.
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (!window.gsap) {
        document.querySelectorAll('.reveal, .reveal-stagger > *').forEach(function (el) {
          el.style.opacity = '1';
          el.style.transform = 'none';
        });
        return;
      }
      document.querySelectorAll('.reveal, .reveal-stagger > *').forEach(function (el) {
        var s = window.getComputedStyle(el);
        if (s && parseFloat(s.opacity) === 0) {
          el.style.opacity = '1';
          el.style.transform = 'none';
        }
      });
    }, 1500);
  });
