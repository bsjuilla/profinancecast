// api/sage.js — Vercel Serverless Function
// Lives at /api/sage.js in your project root.
// Proxies requests to Gemini so your API key NEVER reaches the browser.
//
// HOW TO SET UP YOUR API KEY (safe method):
//   1. Go to vercel.com → your project → Settings → Environment Variables
//   2. Add:  Name = GEMINI_API_KEY  |  Value = your key  |  Environments = all
//   3. Redeploy once — done. The key is encrypted on Vercel's servers.
//   NEVER paste your key directly in this file.

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return res.status(500).json({ error: 'API key not configured. Add GEMINI_API_KEY to Vercel environment variables.' });
  }

  const { message, history = [], systemPrompt, csvMode = false } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing message' });
  }

  // Normal chat: 500 char limit. CSV batch mode: allow up to 8000 chars
  const limit = csvMode ? 8000 : 500;
  if (message.length > limit) {
    return res.status(400).json({ error: 'Message too long' });
  }

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

  // ── CSV batch mode: single-turn, low temperature, expects JSON array back ──
  if (csvMode) {
    const geminiBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: message }]
        }
      ],
      generationConfig: {
        maxOutputTokens: 1200,
        temperature: 0.1,   // Low temperature for consistent JSON output
        topP: 0.9,
      }
    };

    try {
      const geminiRes = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody)
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error('Gemini CSV error:', errText);
        return res.status(502).json({ error: 'AI service temporarily unavailable.' });
      }

      const data = await geminiRes.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!reply) {
        return res.status(502).json({ error: 'No response from AI.' });
      }

      return res.status(200).json({ reply });

    } catch (err) {
      console.error('Sage CSV API error:', err);
      return res.status(500).json({ error: 'Internal error.' });
    }
  }

  // ── Normal chat mode (original behaviour, fully preserved) ──

  // Build conversation history for multi-turn context
  const contents = [
    // System instruction as first user message (Gemini 1.5 flash approach)
    {
      role: 'user',
      parts: [{ text: systemPrompt || 'You are Sage, a helpful personal finance AI advisor.' }]
    },
    {
      role: 'model',
      parts: [{ text: "Understood! I'm Sage, your personal financial advisor. I have your complete financial picture and I'm ready to help." }]
    },
    // Inject conversation history (last 10 turns to stay within token limits)
    ...history.slice(-10),
    // Current message
    {
      role: 'user',
      parts: [{ text: message }]
    }
  ];

  const geminiBody = {
    contents,
    generationConfig: {
      maxOutputTokens: 600,     // ~400 words — enough for detailed advice
      temperature: 0.7,          // Balanced creativity
      topP: 0.9,
      stopSequences: []
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
    ]
  };

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', errText);
      return res.status(502).json({ error: 'AI service temporarily unavailable. Please try again.' });
    }

    const data = await geminiRes.json();

    // Extract text safely
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return res.status(502).json({ error: 'No response from AI. Please try again.' });
    }

    // Return clean response
    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Sage API error:', err);
    return res.status(500).json({ error: 'Internal error. Please try again.' });
  }
}
