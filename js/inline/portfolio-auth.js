// Route guard: redirect unauthed users to sign-in. Same pattern as every
// other gated page in the codebase.
window.addEventListener('DOMContentLoaded', () => {
  if (typeof PFCAuth !== 'undefined') PFCAuth.requireAuth();
});
