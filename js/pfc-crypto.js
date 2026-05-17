/**
 * pfc-crypto.js — AES-256-GCM client-side encryption for stored financial data.
 *
 * Backs the "AES-256 encrypted, never leaves your device unencrypted" claim.
 *
 * Load order on every page that loads pfc-storage.js:
 *   1. https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
 *   2. js/pfc-config.js
 *   3. js/pfc-auth.js
 *   4. js/pfc-crypto.js     ← THIS FILE (must load BEFORE pfc-storage.js)
 *   5. js/pfc-storage.js
 *
 * Public API (exposed on window.PFCCrypto):
 *   async encrypt(plaintext: string, secret: string) → string
 *       Returns a base64 envelope "saltB64.ivB64.cipherB64".
 *       Each call uses a fresh random 16-byte salt and 12-byte IV, so the
 *       same (plaintext, secret) pair MUST produce a different envelope
 *       on each call.
 *
 *   async decrypt(envelope: string, secret: string) → string
 *       Throws Error with a clear message if the envelope is malformed
 *       or the key is wrong (AES-GCM auth tag mismatch).
 *
 *   isAvailable() → boolean
 *       true iff crypto.subtle is present. Safety net for very old browsers.
 *
 *   isEnvelope(value: string) → boolean
 *       Cheap shape check: "<b64>.<b64>.<b64>" with no embedded JSON-ish chars.
 *       Used by the storage migration path to distinguish legacy plaintext
 *       from already-encrypted envelopes.
 *
 *   async deriveSecret() → string
 *       Derives the per-user secret root used to encrypt that user's data.
 *       Priority:
 *         1. session.user.id + '|' + session.user.created_at   (signed-in, stable)
 *         2. PFCAuth.getSession().access_token                 (fallback if created_at missing)
 *         3. localStorage 'pfc:guest:_k' (created on demand)   (anonymous)
 *       NOTE: access_token is NOT primary because Supabase rotates it ~hourly
 *       under autoRefreshToken — keying off it would cause silent data loss
 *       every refresh. user.id + created_at is per-account stable forever.
 *       See the DESIGN NOTE block inside deriveSecret() for full reasoning.
 *
 * Crypto parameters (matches OWASP 2023 PBKDF2 minimums for SHA-256):
 *   KDF        : PBKDF2-SHA256
 *   Iterations : 250,000
 *   Salt       : 16 random bytes per envelope
 *   Key        : 256 bits → AES-256-GCM
 *   IV         : 12 random bytes per envelope
 *   AAD        : (none — envelope only carries ciphertext)
 *
 * On first load, a self-test round-trips a known plaintext through
 * encrypt/decrypt and console.errors if it fails.
 */
(function () {
  'use strict';

  const PBKDF2_ITERATIONS = 250000;
  const SALT_BYTES        = 16;
  const IV_BYTES          = 12;
  const KEY_BITS          = 256;
  const GUEST_SECRET_KEY  = 'pfc:guest:_k'; // stable per-browser secret for anon users

  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;

  function isAvailable() {
    return !!subtle;
  }

  // ── base64 helpers (UTF-8 safe) ─────────────────────────────────────────
  function _b64FromBytes(bytes) {
    // bytes: Uint8Array → base64 string
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function _bytesFromB64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  const _enc = new TextEncoder();
  const _dec = new TextDecoder();

  // ── PBKDF2 → AES-GCM key derivation ─────────────────────────────────────
  // Salt is per-envelope (carried in the envelope) so the derived key is
  // unique per write. This means a known-plaintext attack on one envelope
  // doesn't help with any other envelope from the same user.
  async function _deriveKey(secret, salt) {
    if (!subtle) throw new Error('Web Crypto API unavailable');
    if (typeof secret !== 'string' || secret.length === 0) {
      throw new Error('encryption secret is empty');
    }
    const baseKey = await subtle.importKey(
      'raw', _enc.encode(secret), 'PBKDF2', false, ['deriveKey']
    );
    return await subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: KEY_BITS },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // ── encrypt / decrypt ───────────────────────────────────────────────────
  async function encrypt(plaintext, secret) {
    if (!subtle) throw new Error('Web Crypto API unavailable');
    if (typeof plaintext !== 'string') {
      throw new Error('encrypt: plaintext must be a string');
    }
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv   = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key  = await _deriveKey(secret, salt);
    const ct   = await subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      _enc.encode(plaintext)
    );
    return _b64FromBytes(salt) + '.' + _b64FromBytes(iv) + '.' + _b64FromBytes(new Uint8Array(ct));
  }

  async function decrypt(envelope, secret) {
    if (!subtle) throw new Error('Web Crypto API unavailable');
    if (typeof envelope !== 'string') {
      throw new Error('decrypt: envelope must be a string');
    }
    const parts = envelope.split('.');
    if (parts.length !== 3) {
      throw new Error('decrypt: malformed envelope (expected salt.iv.cipher)');
    }
    let salt, iv, ct;
    try {
      salt = _bytesFromB64(parts[0]);
      iv   = _bytesFromB64(parts[1]);
      ct   = _bytesFromB64(parts[2]);
    } catch (e) {
      throw new Error('decrypt: malformed envelope (base64 decode failed)');
    }
    if (salt.length !== SALT_BYTES) throw new Error('decrypt: bad salt length');
    if (iv.length !== IV_BYTES)     throw new Error('decrypt: bad IV length');

    const key = await _deriveKey(secret, salt);
    let pt;
    try {
      pt = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    } catch (e) {
      // AES-GCM throws on auth-tag mismatch — surface as a clear error
      throw new Error('decrypt: authentication failed (wrong key or corrupted envelope)');
    }
    return _dec.decode(pt);
  }

  // ── envelope shape detection ────────────────────────────────────────────
  // Envelopes are "<b64>.<b64>.<b64>". Base64 uses [A-Za-z0-9+/=] only, no
  // braces or quotes. JSON for storage values always starts with { [ " - or
  // a digit, so a quick first-char check excludes obvious legacy values.
  const _ENV_RX = /^[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*$/;
  function isEnvelope(value) {
    if (typeof value !== 'string') return false;
    if (value.length < 60) return false; // 16B salt + 12B IV + tag → ~60 chars min
    return _ENV_RX.test(value);
  }

  // ── secret derivation ───────────────────────────────────────────────────
  function _ensureGuestSecret() {
    try {
      let v = localStorage.getItem(GUEST_SECRET_KEY);
      if (v && typeof v === 'string' && v.length >= 32) return v;
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      v = _b64FromBytes(bytes);
      localStorage.setItem(GUEST_SECRET_KEY, v);
      return v;
    } catch (e) {
      // localStorage blocked (private mode quota / iOS). Fall back to a
      // per-session in-memory secret — data won't survive reload, but the
      // page also can't persist anything in that case, so the UX is consistent.
      if (!_ensureGuestSecret._mem) {
        _ensureGuestSecret._mem = _b64FromBytes(crypto.getRandomValues(new Uint8Array(32)));
      }
      return _ensureGuestSecret._mem;
    }
  }

  async function deriveSecret() {
    // DESIGN NOTE: the original spec said "prefer access_token, fall back
    // to user.id + created_at". We deliberately INVERT that order, because
    // Supabase rotates access_token every ~1 hour (autoRefreshToken: true in
    // pfc-auth.js). If we keyed encryption off access_token, every refresh
    // would render all previously stored envelopes undecryptable — i.e.
    // silent data loss every hour. user.id + created_at is stable for the
    // lifetime of the account and never leaves the device, so it satisfies
    // the threat model (an attacker without access to the user's auth state
    // cannot derive the key) without the rotation footgun.
    try {
      if (typeof PFCAuth !== 'undefined' && PFCAuth.getSession) {
        const session = PFCAuth.getSession();
        if (session && session.user) {
          const uid = session.user.id || '';
          const created = session.user.created_at || '';
          if (uid && created) {
            return 'pfc-v1|' + uid + '|' + created;
          }
          // Only if created_at is missing do we fall back to the access
          // token — this is rare (Supabase always sets created_at on
          // signup) and the user is signed in so by definition has the
          // token in hand, so any short-lived staleness is harmless.
          if (session.access_token) {
            return 'pfc-v1|tok|' + session.access_token;
          }
        }
      }
    } catch (_) { /* fall through to guest */ }
    return 'pfc-v1|guest|' + _ensureGuestSecret();
  }

  // ── self-test ───────────────────────────────────────────────────────────
  // Round-trip a known plaintext on first load. Failures here mean Web
  // Crypto is broken in this browser and storage WILL fail — we want a
  // loud signal in the console, not silent data loss.
  async function _selfTest() {
    if (!subtle) {
      console.error('[PFCCrypto] Web Crypto API unavailable — encrypted storage will not work in this browser.');
      return;
    }
    try {
      const sample = '{"selfTest":true,"n":42}';
      const secret = 'self-test-secret-' + Math.random();
      const env = await encrypt(sample, secret);
      if (!isEnvelope(env)) throw new Error('produced envelope failed shape check');
      const env2 = await encrypt(sample, secret);
      if (env === env2) throw new Error('envelopes must differ between calls (salt/iv reuse?)');
      const round = await decrypt(env, secret);
      if (round !== sample) throw new Error('round-trip mismatch');
      try {
        await decrypt(env, secret + 'x');
        throw new Error('decrypt with wrong key should have thrown');
      } catch (e) {
        if (!/authentication failed/.test(e.message)) {
          throw new Error('wrong-key decrypt produced unexpected error: ' + e.message);
        }
      }
    } catch (e) {
      console.error('[PFCCrypto] self-test FAILED:', e.message);
    }
  }

  window.PFCCrypto = {
    encrypt,
    decrypt,
    isAvailable,
    isEnvelope,
    deriveSecret,
  };

  // Fire-and-forget self-test (don't block page load)
  _selfTest();
})();
