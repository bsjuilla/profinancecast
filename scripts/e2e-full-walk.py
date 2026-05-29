"""
e2e-full-walk.py — Walk EVERY internal page as BOTH a free and a pro user.

Goes far beyond scripts/e2e-smoke.py (which only checks the dashboard). For
each plan (pro, then free) it logs in via /api/audit-login?plan=<plan> and
visits every signed-in page, asserting:
  • the page renders (sidebar present) OR — for a Pro-only page seen by a
    FREE user — the app correctly gates it (redirect to billing / upgrade);
  • a Pro user is NOT gated out of Pro pages;
  • zero non-benign console errors during load.

The free/pro split is enabled by the pfc_audit_plan cookie that
/api/audit-login?plan= sets (see api/audit-login.js). It carries no secret —
the audit TOKEN still gates all access; the plan param only changes which
entitlement the seeded, client-only audit view renders.

Run:  AUDIT_BYPASS_TOKEN=... python scripts/e2e-full-walk.py
Env:  AUDIT_BYPASS_TOKEN   (same secret scripts/e2e-smoke.py uses)
      PFC_BASE_URL         (default https://www.profinancecast.com)
Exit: 0 = all page/plan checks green; 1 = at least one failed; 2 = config error.
"""
import os
import sys
from urllib.parse import quote as _q
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = os.environ.get("PFC_BASE_URL", "https://www.profinancecast.com")
TOKEN = os.environ.get("AUDIT_BYPASS_TOKEN")
if not TOKEN:
    print("FATAL: AUDIT_BYPASS_TOKEN not set", file=sys.stderr)
    sys.exit(2)

# (path, label, pro_only). pro_only pages must render for pro and be GATED
# (redirect to billing / upgrade) for free.
PAGES = [
    ("/dashboard.html",        "dashboard",        False),
    ("/net-worth.html",        "net-worth",        False),
    ("/goals.html",            "goals",            False),
    ("/recurring.html",        "recurring",        False),
    ("/debt-optimizer.html",   "debt-optimizer",   False),
    ("/salary-calculator.html","salary-calculator",False),
    ("/cash-forecast.html",    "cash-forecast",    False),
    ("/history.html",          "history",          False),
    ("/settings.html",         "settings",         False),
    ("/billing.html",          "billing",          False),
    ("/portfolio.html",        "portfolio",        True),
    ("/scenarios.html",        "scenarios",        True),
    ("/sage.html",             "ask-sage",         True),
    ("/report-card.html",      "report-card",      True),
]

BENIGN = (
    # Audit user has no real Supabase session, so Supabase REST calls 401.
    "the server responded with a status of 401",
    # Intermittent CDN/animation race + post-deploy cold-start 5xx — not a
    # page defect (see scripts/e2e-smoke.py for the rationale).
    "ScrollTrigger is not defined",
    "the server responded with a status of 500 ()",
)


def make_collector(sink):
    def on_msg(msg):
        if msg.type == "error" and not any(b in msg.text for b in BENIGN):
            sink.append(msg.text)
    def on_pageerror(err):
        t = f"pageerror: {err}"
        if not any(b in t for b in BENIGN):
            sink.append(t)
    def on_response(resp):
        try:
            if resp.status >= 500:
                print(f"        [5xx] {resp.status} {resp.url}")
        except Exception:
            pass
    return on_msg, on_pageerror, on_response


def login(page, plan):
    resp = page.goto(
        f"{BASE}/api/audit-login?t={_q(TOKEN, safe='')}&plan={plan}",
        wait_until="domcontentloaded", timeout=15000,
    )
    if not resp or resp.status not in (200, 204, 302):
        return False
    return True


def check_page(page, path, label, pro_only, plan):
    """Returns (ok, detail)."""
    errors = []
    on_msg, on_pageerror, on_response = make_collector(errors)
    page.on("console", on_msg)
    page.on("pageerror", on_pageerror)
    page.on("response", on_response)
    try:
        page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=20000)
    except PWTimeout:
        return False, "load timeout"

    final_url = page.url
    gated = ("billing" in final_url and "billing.html" not in path) or \
            page.locator('[data-pro-lock], .pro-lock, [data-upgrade-cta]').count() > 0

    # Gating expectations.
    if pro_only and plan == "free":
        if not gated:
            # Some pages gate in-place (lock overlay) rather than redirect; also
            # accept an explicit upgrade prompt in the body text.
            body = (page.locator("body").inner_text(timeout=3000) or "").lower()
            if not any(k in body for k in ("upgrade to pro", "pro plan", "founders")):
                return False, f"Pro page NOT gated for free user (url={final_url})"
        return True, "correctly gated for free"
    if pro_only and plan in ("pro", "premium"):
        if gated:
            return False, f"Pro user wrongly gated out (url={final_url})"

    # Render check (free pages, and pro pages for pro users): sidebar present.
    try:
        nav = page.locator("nav.sidebar .nav-item, nav .nav-item, .sidebar .nav-item").count()
    except Exception:
        nav = 0
    if nav < 3 and "billing" not in final_url:
        return False, f"sidebar nav not found (nav-items={nav})"

    if errors:
        return False, f"console errors: {errors[:4]}"
    return True, f"rendered ({nav} nav items)"


def run_plan(browser, plan):
    failed = 0
    print(f"\n=== Walking as {plan.upper()} user ===")
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = ctx.new_page()
    if not login(page, plan):
        print(f"[FAIL] {plan}: audit-login failed")
        ctx.close()
        return 1
    for path, label, pro_only in PAGES:
        ok, detail = False, ""
        for attempt in (1, 2):  # retry-once cold-start guard
            p2 = ctx.new_page()
            try:
                ok, detail = check_page(p2, path, label, pro_only, plan)
            except Exception as e:
                ok, detail = False, f"exception: {e}"
            p2.close()
            if ok:
                break
        tag = "[PASS]" if ok else "[FAIL]"
        gate = " (pro-only)" if pro_only else ""
        print(f"  {tag} {plan}/{label}{gate}: {detail}")
        if not ok:
            failed += 1
    ctx.close()
    return failed


def main():
    total = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for plan in ("pro", "free"):
            total += run_plan(browser, plan)
        browser.close()
    n = len(PAGES) * 2
    if total:
        print(f"\n=== SUMMARY: {total}/{n} checks FAILED ===")
        sys.exit(1)
    print(f"\n=== SUMMARY: all {n} page/plan checks PASSED ===")
    sys.exit(0)


if __name__ == "__main__":
    main()
