/**
 * pfc-config.js — Single source of truth for client config.
 *
 * Load this BEFORE pfc-auth.js / pfc-storage.js / pfc-entitlements.js on every page.
 * Anon keys are public by design (Supabase calls them "publishable"); RLS at the
 * database layer is what protects user data, NOT the anon key.
 *
 * If you ever rotate the Supabase anon key, change it here ONCE.
 */
window.PFC_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://hmopwxjkxqvubkifplnk.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhtb3B3eGpreHF2dWJraWZwbG5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzAyOTMsImV4cCI6MjA5MTkwNjI5M30.wCiB9DTSa1Yxy8-3PqLS9P05rrULzcVg_kLbxVuVCUk',
  PAYPAL_CLIENT_ID: 'AfB2Q0pvmI6fTYSe-JsUn2SHz8ZaDwIcjS-ZTP2jTHnIAQ_j1lkgZHac0gH7sVOVX9GckNnFTCDEP2WN',
  // origin used for OAuth redirects — falls back to current origin so dev/preview deploys work
  APP_ORIGIN: (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : 'https://profinancecast.com',
});
