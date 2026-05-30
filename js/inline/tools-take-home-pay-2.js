    // Take-home pay is a FREE public tool — no auth gate. It is a purely
    // client-side calculator (gross -> net), consistent with its sibling
    // /tools/ calculators and the salary calculator's "numbers stay in your
    // browser" promise (the free salary calc links straight here).
    // (Was PFCAuth.requireAuth(), which ALSO 404'd: its relative auth.html
    // redirect resolved to /tools/auth under this /tools/ path. The redirect
    // itself is separately fixed to an absolute /auth.html in pfc-auth.js.)
