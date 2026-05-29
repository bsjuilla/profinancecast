/**
 * pfc-statement-parser.js — Shared bank-statement parser (CSV + PDF).
 *
 * SINGLE SOURCE OF TRUTH for every page that ingests a bank statement.
 * Before this module the dashboard (js/inline/dashboard-2.js) and the
 * recurring page (js/inline/recurring-2.js) each had their OWN CSV parser
 * that drifted apart. This module unifies them. Consumers call:
 *
 *   const res = await PFCStatementParser.parseFile(file);
 *   // res = { ok, transactions, validation, format }
 *
 * or, for raw text/buffers:
 *   PFCStatementParser.parseCSV(text)            -> transaction[]
 *   await PFCStatementParser.parsePDF(arrayBuf)  -> transaction[]
 *   PFCStatementParser.validateStatement(txns)   -> { valid, reason, count }
 *   PFCStatementParser.keywordCategorise(desc)   -> category | null
 *
 * Transaction shape (unchanged from the original dashboard parser, so the
 * dashboard report/apply pipeline keeps working byte-for-byte):
 *   { date, rawDate, desc, amount, isDebit, cat, aiAssisted }
 *   - date:   normalised 'YYYY-MM-DD' where parseable, else the raw string
 *   - amount: positive number (sign carried by isDebit)
 *   - isDebit: true = money out (expense), false = money in (income)
 *
 * PRIVACY: 100% client-side. This module NEVER makes a network request.
 * (The optional AI-categorisation step lives in the consumer, not here, and
 *  is gated behind an explicit user toggle — see dashboard-2.js.)
 *
 * Classic script — exposes window.PFCStatementParser. No build step, no ESM,
 * matching the rest of the js/ layer (pfc-auth.js, pfc-storage.js, etc.).
 */
(function () {
  'use strict';

  // ── Column header synonyms for CSV auto-detection ───────────────────────
  // Ported verbatim from dashboard-2.js so existing CSVs parse identically.
  const COL_SYNONYMS = {
    date:   ['date','transaction date','trans date','value date','posted date','posting date','txn date'],
    desc:   ['description','details','narrative','merchant','payee','reference','particulars','transaction description','libelle','trans description','memo'],
    debit:  ['debit','amount debit','withdrawal','debit amount','paid out','dr','charges'],
    credit: ['credit','amount credit','deposit','credit amount','paid in','cr','amount received'],
    amount: ['amount','net amount','transaction amount','value','montant'],
  };

  // ── Keyword categorisation rules ─────────────────────────────────────────
  // Ported from dashboard-2.js (Stream A removed the two Mauritius-specific
  // keywords). European/international coverage. Consumers may still run an
  // optional AI pass for anything this returns null for.
  const KEYWORD_RULES = [
    { cat: 'income', keys: ['salary','salaire','payroll','wages','pay credit','direct dep','direct credit','bank transfer in','virement recu','transfer received','freelance payment','dividend','interest earned','refund credit','cashback','commission credit'] },
    { cat: 'housing', keys: ['rent','loyer','mortgage','hypotheque','lease','electricite','electricity','water authority','internet','fiber','ftth','broadband','landlord','syndic','condominium','council tax','facility mgmt','facilities'] },
    { cat: 'food', keys: ['tesco','sainsbury','asda','lidl','aldi','carrefour','auchan','spar','monoprix','rewe','edeka','albert heijn','mercadona','food court','kfc','mcdonalds','mc donald','pizza','burger','resto','restaurant','bistro','cafe','coffee','boulangerie','patisserie','bakery','subway','domino','wolt','glovo','uber eat','deliveroo','just eat','takeaway','grocery','alimentation','supermarket'] },
    { cat: 'transport', keys: ['shell','total ','bp ','esso','aral','repsol','petrol','diesel','fuel','parking','toll','autoroute','bus ','autobus','metro','train','rail','sncf','db bahn','trainline','taxi','bolt ','uber ','free now','hertz','avis','europcar','sixt','garage','mecanique','mechanics','tyre','tire','air france','british airways','lufthansa','klm','easyjet','ryanair','vueling','emirates','airport'] },
    { cat: 'subscriptions', keys: ['netflix','spotify','apple ','amazon prime','disney+','deezer','canal+','canal plus','sky ','now tv','microsoft 365','office 365','adobe','dropbox','google one','icloud','linkedin','canva','zoom ','slack ','notion','github','digitalocean','aws ','cloudflare','openai','midjourney','chatgpt'] },
    { cat: 'entertainment', keys: ['cinema','odeon','vue ','pathe','gaumont','concert','event ','ticketing','sport ','gym ','fitness','puregym','yoga','swimming','golf','tennis','steam ','playstation','nintendo','xbox','game '] },
    { cat: 'health', keys: ['pharmacy','pharmacie','apotheke','boots','doctor','clinic','hospital','nhs','dentist','optician','opticien','laboratory','physiotherapy','medecin','medical','health ins','assurance sante','bupa','axa health','vitality'] },
  ];

  // ── Delimiter detection ──────────────────────────────────────────────────
  // CRITICAL for European statements: they use ';' as the field delimiter AND
  // ',' as the DECIMAL separator (e.g. "15/01/2024;LIDL;45,20;"). The original
  // dashboard parser split on ',' ';' AND '\t' all at once, so "45,20" was torn
  // into two cells and every European amount was mangled. We now detect the one
  // true delimiter from the header row (most frequent of , ; \t outside quotes)
  // and split on ONLY that.
  function detectDelimiter(line) {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQ = !inQ;
      else if (!inQ && counts[c] !== undefined) counts[c]++;
    }
    let best = ',', bestN = counts[','];
    if (counts[';'] > bestN) { best = ';'; bestN = counts[';']; }
    if (counts['\t'] > bestN) { best = '\t'; bestN = counts['\t']; }
    return best;
  }

  // ── CSV row splitter (quote-aware; single detected delimiter) ────────────
  function parseCSVRow(line, delim) {
    if (delim === undefined) delim = detectDelimiter(line);
    const result = []; let cell = ''; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuote = !inQuote; }
      else if (c === delim && !inQuote) { result.push(cell); cell = ''; }
      else { cell += c; }
    }
    result.push(cell);
    return result;
  }

  function findColumns(headers) {
    // Short codes ('dr','cr') must match the WHOLE header cell — otherwise
    // they match as substrings inside real words (e.g. 'cr' inside
    // "des-CR-iption", 'dr' inside "ad-DR-ess"), which would wrongly bind the
    // credit/debit column to the description column and drop every row. This
    // was a latent bug in the original dashboard parser (masked only because
    // real CSVs usually had an explicit Credit/Debit column that matched a
    // longer synonym first). Longer synonyms keep substring matching.
    const find = (synonyms) => headers.findIndex(h =>
      synonyms.some(s => (s.length <= 2 ? h === s : h.includes(s))));
    const colIdx = {
      date:   find(COL_SYNONYMS.date),
      desc:   find(COL_SYNONYMS.desc),
      debit:  find(COL_SYNONYMS.debit),
      credit: find(COL_SYNONYMS.credit),
      amount: find(COL_SYNONYMS.amount),
    };
    if (colIdx.debit !== -1 || colIdx.credit !== -1) colIdx.amount = -1;
    return colIdx;
  }

  // ── Date normaliser → 'YYYY-MM-DD' (best-effort; returns raw on no match) ─
  function formatDate(raw) {
    const s = String(raw == null ? '' : raw).replace(/['"]/g, '').trim();
    // ISO 2024-01-15
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // DD/MM/YYYY or DD-MM-YYYY (European default — primary for EU audience)
    const m1 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
    // DD/MM/YY (2-digit year)
    const m1b = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
    if (m1b) return `20${m1b[3]}-${m1b[2].padStart(2, '0')}-${m1b[1].padStart(2, '0')}`;
    // DD MMM YYYY  e.g. "15 Jan 2024"
    const MONTHS = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
    const m3 = s.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})/i);
    if (m3 && MONTHS[m3[2].toLowerCase()]) return `${m3[3]}-${MONTHS[m3[2].toLowerCase()]}-${m3[1].padStart(2, '0')}`;
    return s;
  }

  function cleanDesc(d) {
    return String(d == null ? '' : d).replace(/\s+/g, ' ').replace(/[*#]/g, '').trim().slice(0, 80);
  }

  // ── Amount normaliser — handles BOTH "1,234.56" (US/UK) and "1.234,56" (EU)
  // Returns { value, isDebit } where value is a positive magnitude.
  // isDebit detection: leading '-', trailing '-', parentheses, or trailing DR.
  function normaliseAmount(raw) {
    let s = String(raw == null ? '' : raw).trim();
    if (!s) return { value: 0, isDebit: false };
    let negative = false;
    // Parentheses = negative (accounting convention)
    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
    // Trailing/leading DR / CR markers
    if (/\bdr\b/i.test(s)) negative = true;
    if (/\bcr\b/i.test(s)) negative = false;
    s = s.replace(/\b(dr|cr)\b/ig, '');
    // Strip currency symbols, codes, spaces (keep digits, separators, sign)
    s = s.replace(/[^\d.,\-]/g, '');
    if (/^-/.test(s) || /-$/.test(s)) negative = true;
    s = s.replace(/-/g, '');
    if (!s) return { value: 0, isDebit: negative };
    // Decide decimal separator: the LAST separator that has 1-2 trailing
    // digits is the decimal point. Handles "1.234,56", "1,234.56", "1234,5".
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    let decPos = Math.max(lastComma, lastDot);
    let intPart, fracPart = '';
    if (decPos !== -1 && s.length - decPos - 1 <= 2 && s.length - decPos - 1 >= 1) {
      intPart = s.slice(0, decPos).replace(/[.,]/g, '');
      fracPart = s.slice(decPos + 1).replace(/[.,]/g, '');
    } else {
      intPart = s.replace(/[.,]/g, '');
    }
    const num = parseFloat(intPart + (fracPart ? '.' + fracPart : '')) || 0;
    return { value: Math.abs(num), isDebit: negative };
  }

  // ── CSV → transactions (faithful port of dashboard parseCSV) ─────────────
  function parseCSV(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
    if (lines.length < 2) return [];

    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const row = lines[i].toLowerCase();
      if (COL_SYNONYMS.date.some(s => row.includes(s)) || COL_SYNONYMS.desc.some(s => row.includes(s))) {
        headerIdx = i; break;
      }
    }

    const headers = parseCSVRow(lines[headerIdx]).map(h => h.toLowerCase().trim().replace(/['"]/g, ''));
    const colIdx = findColumns(headers);
    if (colIdx.date === -1 || colIdx.desc === -1) throw new Error('No date/description columns found');

    const txns = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const row = parseCSVRow(lines[i]);
      if (!row.length || row.every(c => !c.trim())) continue;

      const rawDate = (row[colIdx.date] || '').trim().replace(/['"]/g, '');
      const rawDesc = (row[colIdx.desc] || '').trim().replace(/['"]/g, '');
      if (!rawDate && !rawDesc) continue;

      let amount = 0, isDebit = false;
      if (colIdx.amount !== -1) {
        const a = normaliseAmount(row[colIdx.amount] || '');
        amount = a.value; isDebit = a.isDebit;
      } else {
        const d = colIdx.debit !== -1 ? normaliseAmount(row[colIdx.debit] || '').value : 0;
        const c = colIdx.credit !== -1 ? normaliseAmount(row[colIdx.credit] || '').value : 0;
        if (d > 0) { amount = d; isDebit = true; }
        else if (c > 0) { amount = c; isDebit = false; }
        else continue;
      }
      if (!amount) continue;

      txns.push({
        date: formatDate(rawDate), rawDate,
        desc: cleanDesc(rawDesc), amount, isDebit,
        cat: null, aiAssisted: false,
      });
    }
    return txns;
  }

  // ── PDF line-parser (bank-agnostic, best-effort) ─────────────────────────
  // Input: an array of reassembled text lines (one visual row per element).
  // Output: transaction[]. Each line that contains BOTH a recognisable date
  // and a trailing amount becomes a transaction. Description = the text
  // between the date and the amount.
  const _DATE_RX = /(\d{4}-\d{2}-\d{2})|(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})|(\d{1,2}\s+[A-Za-z]{3,}\.?\s+\d{4})/;
  // A money token: optional sign/paren, digits with , or . separators, ≥1 decimal group.
  const _AMOUNT_RX = /[-(]?\s*\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})\)?-?(?:\s*(?:DR|CR))?/i;

  function parsePdfLines(lines) {
    const txns = [];
    for (const lineRaw of lines) {
      const line = String(lineRaw || '').trim();
      if (line.length < 6) continue;
      const dm = line.match(_DATE_RX);
      if (!dm) continue;
      // Find ALL amount-like tokens; the LAST one is almost always the txn amount
      // (statements put running balance last sometimes — we take the last amount
      // before any trailing balance by preferring the final money token).
      const amounts = line.match(new RegExp(_AMOUNT_RX.source, 'ig')) || [];
      if (!amounts.length) continue;
      const amtToken = amounts[amounts.length - 1];
      const { value, isDebit } = normaliseAmount(amtToken);
      if (!value) continue;
      const dateToken = dm[0];
      // Description = text between the date token and the amount token.
      let desc = line;
      const dIdx = line.indexOf(dateToken);
      const aIdx = line.lastIndexOf(amtToken);
      if (dIdx !== -1 && aIdx !== -1 && aIdx > dIdx) {
        desc = line.slice(dIdx + dateToken.length, aIdx);
      }
      txns.push({
        date: formatDate(dateToken), rawDate: dateToken,
        desc: cleanDesc(desc), amount: value, isDebit,
        cat: null, aiAssisted: false,
      });
    }
    return txns;
  }

  // ── PDF → transactions (client-side via pdf.js) ──────────────────────────
  // Requires window.pdfjsLib (loaded + workerSrc configured by the host page).
  // We only use TEXT extraction — no image decoding — so no 'unsafe-eval' is
  // needed in the CSP. Items are grouped into visual lines by their Y position.
  async function parsePDF(arrayBuffer) {
    const pdfjs = (typeof window !== 'undefined') &&
      (window.pdfjsLib || (window['pdfjs-dist/build/pdf']));
    if (!pdfjs || typeof pdfjs.getDocument !== 'function') {
      throw new Error('PDF support unavailable (pdf.js not loaded)');
    }
    const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const allLines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // Group text items into lines by rounded Y (transform[5]); sort each
      // line left-to-right by X (transform[4]). Bank statements are tabular,
      // so same-row items share a Y within a couple of points.
      const rows = new Map();
      for (const item of content.items) {
        if (!item.str || !item.transform) continue;
        const y = Math.round(item.transform[5]);
        // bucket within ±2px so sub-pixel jitter doesn't split a row
        let key = y;
        for (const k of rows.keys()) { if (Math.abs(k - y) <= 2) { key = k; break; } }
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push({ x: item.transform[4], s: item.str });
      }
      // Pages render top-to-bottom = descending Y; sort rows by Y desc.
      const ys = [...rows.keys()].sort((a, b) => b - a);
      for (const y of ys) {
        const lineStr = rows.get(y).sort((a, b) => a.x - b.x).map(o => o.s).join(' ').replace(/\s+/g, ' ').trim();
        if (lineStr) allLines.push(lineStr);
      }
    }
    return parsePdfLines(allLines);
  }

  // ── Keyword categoriser ──────────────────────────────────────────────────
  function keywordCategorise(desc) {
    const lower = String(desc || '').toLowerCase();
    for (const rule of KEYWORD_RULES) {
      for (const kw of rule.keys) {
        if (lower.includes(kw)) return rule.cat;
      }
    }
    return null;
  }

  // ── Statement validation — reject files that aren't bank statements ──────
  // A real statement has multiple dated rows with amounts. We require at least
  // MIN_VALID transactions whose date normalised to a real ISO date AND whose
  // amount is finite & positive. Anything less is almost certainly not a
  // statement (random CSV, a single-row export, a non-financial PDF).
  const MIN_VALID = 3;
  function validateStatement(txns) {
    const list = Array.isArray(txns) ? txns : [];
    const valid = list.filter(t =>
      t && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isFinite(t.amount) && t.amount > 0
    );
    if (valid.length >= MIN_VALID) {
      return { valid: true, reason: '', count: valid.length, total: list.length };
    }
    return {
      valid: false,
      count: valid.length,
      total: list.length,
      reason: list.length === 0
        ? "We couldn't find any transactions in this file. Make sure it's a bank-statement export (CSV or PDF)."
        : "This doesn't look like a bank statement — we found too few dated transactions with amounts. Try your bank's CSV export.",
    };
  }

  // ── Unified entry point ──────────────────────────────────────────────────
  // Reads a File, dispatches by type, parses, and validates in one call.
  // Returns { ok, format, transactions, validation, error }.
  async function parseFile(file) {
    if (!file) return { ok: false, error: 'No file provided' };
    const name = (file.name || '').toLowerCase();
    const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';
    try {
      let transactions;
      let format;
      if (isPdf) {
        format = 'pdf';
        const buf = await file.arrayBuffer();
        transactions = await parsePDF(buf);
      } else {
        format = 'csv';
        const text = await file.text();
        transactions = parseCSV(text);
      }
      const validation = validateStatement(transactions);
      return { ok: validation.valid, format, transactions, validation };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'Could not read the file', transactions: [], validation: { valid: false, count: 0, total: 0, reason: (e && e.message) || 'Parse error' } };
    }
  }

  const api = {
    COL_SYNONYMS, KEYWORD_RULES,
    parseCSV, parsePDF, parsePdfLines, parseFile,
    parseCSVRow, findColumns, formatDate, cleanDesc, normaliseAmount,
    keywordCategorise, validateStatement,
    MIN_VALID,
  };

  if (typeof window !== 'undefined') window.PFCStatementParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
