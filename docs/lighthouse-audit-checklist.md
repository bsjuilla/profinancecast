# Lighthouse Audit Checklist — Phase 2 Tools

After deploy lands, run a real Core Web Vitals audit on the 5 global tool pages + 1 sample country variant. The CTO review pre-bake set a target floor of **Performance ≥ 85, SEO = 100, Accessibility ≥ 90** — this doc is how you verify and remediate.

---

## 1. The one-command audit

**Time:** 5 minutes (mostly Chrome doing work)
**Tool:** Lighthouse via Chrome DevTools, no install needed.

For each URL below:

1. Open Chrome (Incognito mode — extensions skew results)
2. Open the URL
3. F12 → DevTools → **Lighthouse** tab
4. Settings: **Mobile** device + **Performance, Accessibility, Best Practices, SEO** checked
5. Click **Analyse page load**
6. Record the 4 scores in the table below

URLs to audit:

| URL | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| https://profinancecast.com/tools/compound-interest | | | | |
| https://profinancecast.com/tools/mortgage-affordability | | | | |
| https://profinancecast.com/tools/fire-date | | | | |
| https://profinancecast.com/tools/debt-strategy-compare | | | | |
| https://profinancecast.com/tools/savings-rate | | | | |
| https://profinancecast.com/tools/compound-interest/uk | | | | |

---

## 2. Targets and what to do when they miss

### Performance floor: 85

If under 85, the most likely culprits (in order of frequency on this codebase):

| Symptom | Diagnosis | Fix |
|---|---|---|
| LCP > 2.5s | Fraunces serif loading late | Verify woff2 preload tag (see `pfc-tools-lib.js` header). If still slow, switch the heading on the failing page from Fraunces to a system serif via media query. |
| TBT > 200ms | Chart.js bundle parsing | Confirm `defer` attribute is on the Chart.js script tag. If still high, lazy-load Chart.js — defer until first user interaction with an input. |
| CLS > 0.1 | Chart canvas reflow on first render | The `.pfc-chart-wrap { height: 280px }` rule should prevent this. Inspect — chart-wrap might have lost its min-height. |
| FCP > 1.8s | Render-blocking CSS | Check that pfc-tokens.css, pfc-tool-page.css, pfc-footer.css are not blocking parse for too long. Consider inlining critical CSS for the above-the-fold hero block. |

### SEO floor: 100

A non-100 score on any tool page is a real bug — these pages were built specifically for SEO. The Lighthouse SEO checks cover:

- Has a `<title>` element ✓ (every tool page does)
- Has a meta description ✓
- Page has a canonical link ✓ (self-referencing per country)
- Robots.txt is valid ✓ (site-wide)
- Document has a valid `<html lang>` ✓ (per-country: en-GB, fr-FR, etc.)
- Tap targets are large enough (mobile)
- No `noindex` directive
- Hreflang values are valid

If SEO < 100, the most common cause is **hreflang values are invalid** — usually a typo. Cross-check against the hreflang matrix:

```
en, x-default, en-GB, en-IE, fr-FR, de-DE, en-US, en-CA, en-AU, en-SG
```

### Accessibility floor: 90

If under 90, common issues:

| Issue | Where to fix |
|---|---|
| Color contrast (gold on dark) | `--gold` (#D4AF6A) on `--canvas` (#0B1410) is ~6.4:1 — passes AA for normal text but AAA for large only. If a tooltip or small label fails, switch to `--ink` (#F0EDE2) for body text. |
| Missing aria-label on icon-only buttons | Audit the "✕" remove buttons in `debt-strategy-compare/*.html` — they should have `aria-label="Remove this debt"`. |
| Missing form labels | Every `<input>` in the tool grid has a `<label for="…">` already. If Lighthouse complains, the `for` attribute likely mismatches the input `id`. |

### Best Practices floor: 95

If under 95, usually CSP-related — check `vercel.json` Content-Security-Policy header.

---

## 3. After remediation

After fixing any issues:

1. Re-run Lighthouse on the failing URL
2. If the fix lands, repeat for the other 5 audited URLs to make sure the fix didn't regress them
3. Commit + push under the message pattern: `perf(tools): lighthouse {target} fix for {audit-name}`

---

## 4. Automated audit (optional, when you want to run this regularly)

If you want this as a one-command terminal script later — install Lighthouse CLI:

```bash
npm install -g lighthouse
```

Then create `scripts/audit-tools.sh`:

```bash
#!/usr/bin/env bash
set -e
URLS=(
  "https://profinancecast.com/tools/compound-interest"
  "https://profinancecast.com/tools/mortgage-affordability"
  "https://profinancecast.com/tools/fire-date"
  "https://profinancecast.com/tools/debt-strategy-compare"
  "https://profinancecast.com/tools/savings-rate"
)
mkdir -p audit-reports
for url in "${URLS[@]}"; do
  slug=$(echo "$url" | sed 's|.*/||')
  lighthouse "$url" \
    --form-factor=mobile \
    --only-categories=performance,accessibility,best-practices,seo \
    --output=html \
    --output-path="audit-reports/${slug}.html" \
    --chrome-flags="--headless"
done
echo "Reports in audit-reports/"
```

Run with `bash scripts/audit-tools.sh`. Each report is a standalone HTML file you can open in a browser.

---

## 5. What "passing" means

The 5 tools are passing the Lighthouse gate when:

- All 5 global URLs score Performance ≥ 85, SEO = 100, Accessibility ≥ 90, Best Practices ≥ 95
- The 1 sample country variant matches the same floors
- Plausible `tool_view` and `tool_compute` events fire on every audit run (visible in Plausible dashboard within ~30 seconds)

Once that's true, the Phase 2 launch is complete and you're measuring everything that matters from here on.
