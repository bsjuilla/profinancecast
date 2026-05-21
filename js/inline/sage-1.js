    (function gatePro() {
      function doGate() {
        if (typeof PFCPlan !== 'undefined' && typeof PFCPlan.requirePlan === 'function') {
          PFCPlan.requirePlan(['pro','premium']);
        }
      }
      if (typeof PFCAuth !== 'undefined' && typeof PFCAuth.onReady === 'function') {
        PFCAuth.onReady(doGate);
      } else {
        doGate();
      }
    })();
