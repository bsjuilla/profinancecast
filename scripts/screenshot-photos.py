"""
Drive headless Chromium against the live site with the AUDIT_BYPASS cookie
pre-set so we can screenshot every Pro-gated page WITHOUT typing a password.

For each modified page:
  1. Visit /api/audit-login?t=<TOKEN> to receive the pfc_audit_session cookie
  2. Navigate to the page
  3. Wait for network idle + any <picture>/<img> to settle
  4. Take a full-page screenshot to /tmp/pfc-screenshots/<page>.png
  5. Extract bounding boxes of every <figure class="pfc-photo-figure"> and
     dump them as JSON so we can grep for "image too wide" cases without
     manually opening 26 screenshots.

Run:  python scripts/screenshot-photos.py
"""
import json
import os
import sys
from pathlib import Path
from urllib.parse import quote as _urlquote
from playwright.sync_api import sync_playwright

BASE = "https://www.profinancecast.com"
# Read from env so the token never lives in git. Set via:
#   $env:AUDIT_BYPASS_TOKEN = "..."   (PowerShell)
#   export AUDIT_BYPASS_TOKEN=...     (bash)
TOKEN = os.environ.get("AUDIT_BYPASS_TOKEN")
if not TOKEN:
    print("FATAL: AUDIT_BYPASS_TOKEN env var not set", file=__import__('sys').stderr)
    print("       Set it to match the Vercel env var value, then re-run.", file=__import__('sys').stderr)
    raise SystemExit(2)
OUT_DIR = Path("/tmp/pfc-screenshots") if os.name != "nt" else Path(os.environ["TEMP"]) / "pfc-screenshots"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Every page that received a photo in the integrate-photos pass.
PAGES = [
    "/dashboard.html",
    "/sage.html",
    "/portfolio.html",
    "/scenarios.html",
    "/report-card.html",
    "/debt-optimizer.html",
    "/goals.html",
    "/net-worth.html",
    "/cash-forecast.html",
    "/salary-calculator.html",
    "/recurring.html",
    "/history.html",
    "/journal.html",
    "/onboarding.html",
    "/auth.html",
    "/about.html",
    "/help.html",
    "/blog.html",
    "/blog-emergency-fund.html",
    "/blog-50-30-20.html",
    "/blog-debt-avalanche-method.html",
    "/blog-index-funds.html",
    "/blog-inflation.html",
    "/blog-net-worth.html",
    "/blog-salary-negotiation.html",
    "/tools/take-home-pay.html",
    "/tools/debt-strategy.html",
]


def main():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=1,
        )

        # 1) Issue the audit cookie via the Edge endpoint. The token may contain
        # URL-meaningful characters (`#`, `&`, `?`, `+`, `%`, `=`) so URL-encode
        # it before placing in the query string. quote() with safe='' encodes
        # everything including '/' just to be paranoid.
        page = context.new_page()
        resp = page.goto(f"{BASE}/api/audit-login?t={_urlquote(TOKEN, safe='')}", wait_until="domcontentloaded")
        if not resp or resp.status not in (200, 204):
            print(f"FATAL: audit-login returned {resp.status if resp else 'no response'}", file=sys.stderr)
            sys.exit(1)
        cookies = context.cookies()
        has_audit = any(c["name"] == "pfc_audit_session" for c in cookies)
        if not has_audit:
            print("FATAL: pfc_audit_session cookie not set", file=sys.stderr)
            print(json.dumps(cookies, indent=2))
            sys.exit(1)
        print(f"OK: audit cookie set ({len(cookies)} total cookies)")

        # 2) For each page, screenshot + dump figure bounding boxes
        for path in PAGES:
            slug = path.strip("/").replace("/", "_").replace(".html", "") or "index"
            try:
                page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=20000)
                page.wait_for_timeout(800)  # let lazy images settle
                shot_path = OUT_DIR / f"{slug}.png"
                page.screenshot(path=str(shot_path), full_page=True)

                # Bounding boxes of every figure
                boxes = page.evaluate(
                    """() => Array.from(document.querySelectorAll('figure.pfc-photo-figure')).map(f => {
                        const img = f.querySelector('img');
                        const r = (img||f).getBoundingClientRect();
                        return {
                            cls: img ? img.className : null,
                            w: Math.round(r.width),
                            h: Math.round(r.height),
                            x: Math.round(r.left),
                            y: Math.round(r.top + window.scrollY),
                            src: img ? (img.currentSrc||img.src).split('/').pop() : null
                        };
                    })"""
                )
                viewport_w = page.evaluate("() => document.documentElement.clientWidth")

                # Flag oversized images (>1100px wide on a 1440 viewport is suspect)
                flags = []
                for b in boxes:
                    if b["w"] > 1100:
                        flags.append(f"OVERSIZED({b['w']}px) {b['src']} class={b['cls']}")
                    if b["x"] < 0 or b["x"] + b["w"] > viewport_w + 50:
                        flags.append(f"OFFSCREEN(x={b['x']}, x+w={b['x']+b['w']}, vw={viewport_w}) {b['src']}")

                status = "FLAG" if flags else "OK"
                results.append({"page": path, "boxes": boxes, "flags": flags, "viewport_w": viewport_w})
                print(f"[{status}] {path}  figures={len(boxes)}  shot={shot_path.name}")
                for f in flags:
                    print(f"       !! {f}")
            except Exception as e:
                print(f"[ERR] {path}: {e}")
                results.append({"page": path, "error": str(e)})

        browser.close()

    out_json = OUT_DIR / "_report.json"
    out_json.write_text(json.dumps(results, indent=2))
    print(f"\nWrote {out_json}")

    # Summary
    total_flags = sum(len(r.get("flags", [])) for r in results)
    print(f"\n=== SUMMARY ===")
    print(f"Pages screenshotted: {len(results)}")
    print(f"Total flags: {total_flags}")
    if total_flags:
        print("Pages with flags:")
        for r in results:
            if r.get("flags"):
                print(f"  {r['page']}: {len(r['flags'])} flag(s)")


if __name__ == "__main__":
    main()
