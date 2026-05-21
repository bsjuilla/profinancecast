    if (window.PFC_PREVIEW_GALLERY === false && typeof PFCPlan !== 'undefined') {
      PFCPlan.requirePlan(['pro','premium']);
    } else if (typeof PFCAuth !== 'undefined') {
      PFCAuth.requireAuth();
    }
