// api/sage.js — Vercel Serverless Function
//
// Proxies user messages to Gemini. The Gemini key NEVER reaches the browser.
//
// Hardening added in this revision:
//   • Requires a valid Supabase JWT (Bearer token) — no more anonymous spam
//   • Per-user monthly query limit, enforced server-side based on the plan
//   • In-memory IP rate limit as a backup floor (5 req / 10s per IP)
//   • Response shape unchanged → frontend keeps working without changes
//
// Required env: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

// ── In-memory throttle (resets per cold start; good enough as a floor).
// Audit M4: keyed by userId after auth (primary) and IP (pre-auth backstop).
const _rateBuckets = new Map();
function _rateLimit(key, max = 5, windowMs = 10_000) {
  if (!key) return true;
  const now = Date.now();
  const bucket = _rateBuckets.get(key) || [];
  const recent = bucket.filter(t => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  _rateBuckets.set(key, recent);
  // Best-effort GC so map doesn't grow unboundedly.
  if (_rateBuckets.size > 5000) {
    for (const [k, v] of _rateBuckets) {
      if (!v.length || (now - v[v.length - 1]) > 60_000) _rateBuckets.delete(k);
    }
  }
  return true;
}

// Single source of truth — must match pricing.md and api/subscription/status.js.
const PLAN_LIMITS = { free: 10, pro: 200, premium: 500 };

// Owner override: env-driven (OWNER_EMAILS=comma,separated). These emails
// skip both the quota check and the usage increment so the owner can verify
// Pro behaviour without burning their own counter.
const OWNER_EMAILS = (process.env.OWNER_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Pre-auth IP backstop (M4: secondary).
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (!_rateLimit('ip:' + ip, 30, 60_000)) return res.status(429).json({ error: 'Too many requests — slow down a moment.' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return res.status(500).json({ error: 'AI service not configured.' });
  }

  // ── Auth: require a real signed-in user ─────────────────────────────────
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please sign in to use Sage.' });

  const supabase = createClient(
    process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Session expired — please sign in again.' });
  const userId = userData.user.id;
  const userEmail = (userData.user.email || '').toLowerCase();
  const isOwner = userEmail && OWNER_EMAILS.includes(userEmail);

  // Per-user rate limit (audit M4 primary): 20 req/min/user, well above interactive use.
  if (!_rateLimit('user:' + userId, 20, 60_000)) {
    return res.status(429).json({ error: 'Too many requests — slow down a moment.' });
  }

  const { message, history = [], systemPrompt, csvMode = false } = req.body || {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Missing message' });

  const limit = csvMode ? 8000 : 500;
  if (message.length > limit) return res.status(400).json({ error: 'Message too long' });

  // ── Plan-aware quota check (skipped for csvMode batch parsing AND owner) ─
  if (!csvMode && !isOwner) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, ai_queries_used, ai_queries_limit, ai_queries_reset_at')
      .eq('id', userId)
      .maybeSingle();

    const plan = profile?.plan || 'free';
    const cap  = profile?.ai_queries_limit || PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const used = profile?.ai_queries_used || 0;
    const resetAt = profile?.ai_queries_reset_at ? new Date(profile.ai_queries_reset_at).getTime() : 0;

    // Auto-reset if the period rolled over
    if (resetAt && resetAt < Date.now()) {
      await supabase.from('profiles').update({
        ai_queries_used: 0,
        ai_queries_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }).eq('id', userId);
    } else if (used >= cap) {
      return res.status(429).json({
        error: `You've used all ${cap} Sage queries for this month.`,
        upgrade: plan === 'free',
      });
    }
  }

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

  // ── CSV batch mode (low temp, JSON-array output) ──────────────────────
  if (csvMode) {
    const geminiBody = {
      contents: [{ role: 'user', parts: [{ text: message }] }],
      generationConfig: { maxOutputTokens: 1200, temperature: 0.1, topP: 0.9 },
    };
    try {
      const r = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });
      if (!r.ok) {
        console.error('Gemini CSV error:', await r.text());
        return res.status(502).json({ error: 'AI service temporarily unavailable.' });
      }
      const data = await r.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) return res.status(502).json({ error: 'No response from AI.' });
      return res.status(200).json({ reply });
    } catch (err) {
      console.error('Sage CSV API error:', err);
      return res.status(500).json({ error: 'Internal error.' });
    }
  }

  // ── Normal chat ───────────────────────────────────────────────────────
  const contents = [
    { role: 'user', parts: [{ text: systemPrompt || 'You are Sage, a helpful personal finance AI advisor.' }] },
    { role: 'model', parts: [{ text: "Understood! I'm Sage, your personal financial advisor." }] },
    ...history.slice(-10),
    { role: 'user', parts: [{ text: message }] },
  ];

  const geminiBody = {
    contents,
    generationConfig: { maxOutputTokens: 600, temperature: 0.7, topP: 0.9, stopSequences: [] },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  try {
    const r = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });
    if (!r.ok) {
      console.error('Gemini error:', await r.text());
      return res.status(502).json({ error: 'AI service temporarily unavailable. Please try again.' });
    }
    const data = await r.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) return res.status(502).json({ error: 'No response from AI. Please try again.' });

    // Increment usage counter atomically via RPC (audit M5).
    // Fallback removed — the RPC is created in 20260508_subscriptions_fixup.sql
    // and the SELECT-then-UPDATE fallback raced under concurrent calls,
    // letting Free users exceed their monthly cap.
    // Owner is exempt — testing shouldn't burn their own counter.
    if (!isOwner) {
      supabase.rpc('increment_ai_queries', { p_user_id: userId })
        .then(({ error }) => { if (error) console.error('[sage] increment_ai_queries:', error); })
        .catch(e => console.error('[sage] increment_ai_queries threw:', e));
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Sage API error:', err);
    return res.status(500).json({ error: 'Internal error. Please try again.' });
  }
}
