window._pfcCountUp = function (el, finalText, durationMs, targetNode) {
  // targetNode lets a caller animate a Text child node (e.g. preserving
  // a trailing <span> like "7 months"). Defaults to the element itself.
  var node = targetNode || el;
  var match = String(finalText).match(/-?\d[\d,]*/);
  if (!match) return;
  var target = parseInt(match[0].replace(/,/g, ''), 10);
  if (!isFinite(target)) return;
  var prefix = finalText.slice(0, match.index);
  var suffix = finalText.slice(match.index + match[0].length);
  var start = performance.now();
  function step(now) {
    var t = Math.min(1, (now - start) / durationMs);
    var eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    var v = Math.round(target * eased);
    var rendered = prefix + v.toLocaleString() + suffix;
    if (node.nodeType === 3) node.nodeValue = rendered;
    else node.textContent = rendered;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
};
(function animateHeroCountUps() {
  if (window.matchMedia && !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
  // Defer past initForecast()'s first recompute() so the elements hold
  // their FINAL text — that's the count-up's destination value.
  setTimeout(function () {
    if (!('IntersectionObserver' in window)) return;
    var rNw   = document.getElementById('r-nw');
    var rDebt = document.getElementById('r-debt-free');
    var targets = [];
    if (rNw)   targets.push({ el: rNw,   finalText: rNw.textContent, node: rNw });
    if (rDebt) {
      // r-debt-free is rendered as "7<span>...months</span>". Animate only
      // the leading numeric text node so the trailing " months" span is
      // preserved verbatim.
      var firstChild = rDebt.firstChild;
      if (firstChild && firstChild.nodeType === 3 && /\d/.test(firstChild.nodeValue)) {
        targets.push({ el: rDebt, finalText: firstChild.nodeValue, node: firstChild });
      } else if (firstChild) {
        // Fallback: animate textContent (loses span). Acceptable degradation.
        targets.push({ el: rDebt, finalText: rDebt.textContent, node: rDebt });
      }
    }
    if (!targets.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var t = targets.find(function (tt) { return tt.el === entry.target; });
          if (t) window._pfcCountUp(t.el, t.finalText, 900, t.node);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    targets.forEach(function (t) { io.observe(t.el); });
  }, 140);
})();
