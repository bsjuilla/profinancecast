// js/pfc-icons.js — central inline-SVG icon module.
//
// D-DES-2-FOLLOWUP (CEO call 2026-05-24) — site-wide replacement for the
// emoji glyphs that used to live in CAT_META (/recurring) and TYPE_COLORS
// (/debt-optimizer). Replacing emoji with curated SVGs gives consistent
// rendering across OS emoji fonts, scales correctly with currentColor, and
// matches the existing sidebar nav icon vocabulary (16×16 viewBox, single
// stroke, 1.4 stroke-width, no fill).
//
// Why not external assets / sprite sheet?
// — Inline SVG strings ship in the same JS bundle so there's no extra HTTP
//   round-trip and no chance of CSP image-src violations.
// — Each icon is small (~150-300 bytes), total module weight ~3-4KB
//   gzipped. Negligible vs the win of vendor-independent rendering.
//
// API
// ---
// PFCIcons.get(key, options) → trusted SVG string
//   key:     'credit-card' | 'personal-loan' | 'car-loan' | 'student-loan'
//          | 'mortgage' | 'streaming' | 'software' | 'utilities'
//          | 'insurance' | 'finance' | 'health' | 'other'
//          Unknown key → returns the `other` icon (silent fallback).
//   options: { size?: number = 16, className?: string = '' }
//
// XSS safety: all returned strings are HARDCODED. No user input flows into
// the SVG. Callers can interpolate the return value into innerHTML safely.
// Callers must still escHtml() any user-controlled text (e.g. debt name)
// rendered alongside the icon.
//
// Migration trail: a `tech-debt` marker comment in CAT_META / TYPE_COLORS
// references this module so future "add new category" PRs pick a KEY, not
// an emoji.

(function () {
  'use strict';

  // Each icon: 16×16 viewBox, stroke="currentColor", stroke-width="1.4",
  // fill="none", stroke-linecap/linejoin="round" for the smooth corners
  // that match the existing nav-item SVGs.
  //
  // The wrapping <svg> has aria-hidden="true" because semantic labelling
  // happens at the BUTTON / CARD level via aria-label; the icon itself is
  // decoration adjacent to the text label.
  const ICONS = {
    'credit-card':
      // Card outline + magnetic stripe + chip
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M1.5 6.5h13" stroke="currentColor" stroke-width="1.4"/><rect x="3" y="9" width="3.5" height="2" rx="0.4" stroke="currentColor" stroke-width="1.2"/></svg>',
    'personal-loan':
      // Open document with a coin
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 1.5h7l2.5 2.5v9.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 1.5V4h2.5" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="10" r="2" stroke="currentColor" stroke-width="1.3"/></svg>',
    'car-loan':
      // Side profile of a car
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M2 10.5V8.5l1.5-3.5h9L14 8.5v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M1.5 10.5h13" stroke="currentColor" stroke-width="1.4"/><circle cx="4.5" cy="11.5" r="1.5" stroke="currentColor" stroke-width="1.3"/><circle cx="11.5" cy="11.5" r="1.5" stroke="currentColor" stroke-width="1.3"/></svg>',
    'student-loan':
      // Mortarboard / graduation cap
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M1 6l7-3.5L15 6l-7 3.5L1 6Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M4 7.5v3.5c0 1 2 2 4 2s4-1 4-2V7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    'mortgage':
      // House with door
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M2 8l6-5.5L14 8v5.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 14.5V10h2v4.5" stroke="currentColor" stroke-width="1.4"/></svg>',
    'streaming':
      // Play triangle inside a rounded rect
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 5.5L10.5 8L6.5 10.5V5.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    'software':
      // Laptop / monitor
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="3" width="12" height="8" rx="1.2" stroke="currentColor" stroke-width="1.4"/><path d="M1 13.5h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M6.5 13.5L7 11.5h2L9.5 13.5" stroke="currentColor" stroke-width="1.2"/></svg>',
    'utilities':
      // Lightning bolt
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M9 1L3 9h4l-1 6 6-8h-4l1-6Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    'insurance':
      // Shield
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.5L2.5 3.5v4c0 3.5 2.5 6 5.5 7c3-1 5.5-3.5 5.5-7v-4L8 1.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.5 8.5L7.5 10.5L11 6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'finance':
      // Bank columns
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.5L1.5 5h13L8 1.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M2.5 5v7m3-7v7m5-7v7m3-7v7" stroke="currentColor" stroke-width="1.4"/><path d="M1.5 14h13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    'health':
      // Heart
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M8 13.5s-5-3-5-7a3 3 0 0 1 5-2.2A3 3 0 0 1 13 6.5c0 4-5 7-5 7Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    'other':
      // Page / document
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 1.5h6L13 5v9a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.5 1.5V5h3" stroke="currentColor" stroke-width="1.4"/><path d="M5 8.5h6M5 11h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  };

  // Inline tweak — apply optional size/className without parsing/re-serialising
  // the SVG. Most callers don't need size variation (16×16 is the canonical
  // size matching .nav-item svg dimensions); the option exists for future
  // surfaces that want a larger glyph.
  function get(key, options) {
    const opts = options || {};
    const k = (typeof key === 'string') ? key : 'other';
    let svg = ICONS[k] || ICONS.other;
    if (opts.size && opts.size !== 16) {
      const s = parseInt(opts.size, 10) || 16;
      svg = svg.replace(/width="16" height="16"/, 'width="' + s + '" height="' + s + '"');
    }
    if (opts.className) {
      // Inject className on the root <svg>. Safe because className is a
      // string we control — caller-provided but escaped-style — and we
      // only ever insert it inside the svg tag's attribute list.
      const safeClass = String(opts.className).replace(/"/g, '&quot;');
      svg = svg.replace(/<svg /, '<svg class="' + safeClass + '" ');
    }
    return svg;
  }

  // Defensive: every key in the published API surface should resolve. Used
  // by tests; in production the silent fallback to 'other' takes over.
  function has(key) {
    return Object.prototype.hasOwnProperty.call(ICONS, key);
  }

  if (typeof window !== 'undefined') {
    window.PFCIcons = { get: get, has: has, VERSION: '1.0.0' };
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { get: get, has: has };
  }
})();
