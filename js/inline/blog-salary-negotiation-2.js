  (function () {
    if (!document.getElementById('blog-back-bar')) return;
    var ref = document.referrer || '';
    try {
      var refPath = new URL(ref || 'about:blank', location.href).pathname || '';
      if (/\/journal(\.html)?$/.test(refPath)) {
        var link = document.getElementById('blog-back-link');
        if (link) {
          link.href = 'journal.html';
          link.textContent = 'â† Back to Journal';
        }
      }
    } catch (e) {}
  })();
