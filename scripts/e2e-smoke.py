"""
e2e-smoke.py — Two hand-picked click flows that MUST work post-Wave-11.

Flow A: Audit-mode entry
  /api/audit-login -> sets cookies -> /dashboard.html renders ->
  AUDIT MODE banner visible AND sidebar nav present.

Flow B: Dashboard interactivity (proves Wave-11 bootstrap dispatcher works)
  Click a topbar button on dashboard via its data-pfc-on-click handler.
  Verify the expected DOM state change (e.g. notifications panel toggles).

This proves that the data-pfc-on-* bootstrap dispatcher is wired
correctly for the surfaces that gate first-run experience. Visual-
regression CI catches geometry; this catches BEHAVIOR — wrong arg order
in data-pfc-arg-* dispatch, lost `this` context, bootstrap registration
ordering bugs that screenshots never reveal.

Run:  python scripts/e2e-smoke.py
Env:  AUDIT_BYPASS_TOKEN  (same as scripts/screenshot-photos.py)
Exit: 0 = both flows green; 1 = at least one flow red; 2 = config error.

Origin: VPE Wave-12 plan ITEM A.
"""
import os
import sys
from urllib.parse import quote as _urlquote
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = os.environ.get("PFC_BASE_URL", "https://www.profinancecast.com")
TOKEN = os.environ.get("AUDIT_BYPASS_TOKEN")
if not TOKEN:
    print("FATAL: AUDIT_BYPASS_TOKEN not set", file=sys.stderr)
    sys.exit(2)


def collect_console(page, sink):
    """Capture console errors + uncaught page errors into a list, EXCEPT
    those matching the known-benign patterns below.

    Known-benign means: this error fires consistently in audit-mode but
    does not indicate a Wave-11 dispatcher failure. Adding to this list
    is preferable to silently widening the tolerance — every entry
    requires a one-line justification.
    """
    BENIGN_PATTERNS = (
        # Audit-mode synthetic-user has no real Supabase session, so any
        # Supabase REST call returns 401. Expected; not a bug.
        "Failed to load resource: the server responded with a status of 401",
        # Landing page (which we briefly land on after audit-login 302) uses
        # GSAP ScrollTrigger via dynamic <script> append. There's an
        # inherent race between the dynamic-load and index-5.js's first
        # ScrollTrigger reference. This fires intermittently on cold loads
        # and is a known issue tracked separately (Wave-13 candidate).
        "ScrollTrigger is not defined",
    )

    def is_benign(text):
        return any(b in text for b in BENIGN_PATTERNS)

    def on_msg(msg):
        if msg.type != "error":
            return
        if is_benign(msg.text):
            return
        sink.append(msg.text)

    def on_pageerror(err):
        text = f"pageerror: {err}"
        if is_benign(text):
            return
        sink.append(text)

    def on_response(resp):
        # Diagnostic only (does NOT affect pass/fail): name any 5xx so a
        # failing run's log identifies the exact culprit URL. The console
        # "Failed to load resource: ... 500 ()" message carries no URL, which
        # made the original failures impossible to triage. This prints it.
        try:
            if resp.status >= 500:
                print(f"        [5xx] {resp.status} {resp.url}")
        except Exception:
            pass

    page.on("console", on_msg)
    page.on("pageerror", on_pageerror)
    page.on("response", on_response)


def flow_a_audit_dashboard(context):
    """Audit login -> dashboard renders + AUDIT MODE banner visible."""
    errors = []
    page = context.new_page()
    collect_console(page, errors)

    # 1. Hit audit-login endpoint (URL-encode in case token has &, #, $, etc.)
    resp = page.goto(
        f"{BASE}/api/audit-login?t={_urlquote(TOKEN, safe='')}",
        wait_until="domcontentloaded",
        timeout=15000,
    )
    if not resp or resp.status not in (200, 204, 302):
        return False, f"audit-login status={resp.status if resp else 'none'}", errors

    # 2. Dashboard renders
    page.goto(f"{BASE}/dashboard.html", wait_until="networkidle", timeout=20000)

    # 3. AUDIT MODE banner must be present (proves cookie split flow worked
    #    end-to-end: HttpOnly nonce + JS-readable flag both reached the page).
    try:
        page.wait_for_selector("#pfc-audit-banner", timeout=5000)
    except PWTimeout:
        return False, "AUDIT MODE banner did not render — cookie split flow broken", errors

    # 4. Sidebar nav must be present with at least one nav item.
    try:
        nav_count = page.locator("nav.sidebar .nav-item").count()
    except Exception as e:
        return False, f"sidebar query failed: {e}", errors
    if nav_count < 3:
        return False, f"sidebar nav-item count = {nav_count} (expected >=3)", errors

    # Console error budget — Wave-11 dispatcher should produce zero uncaught errors.
    if errors:
        return False, f"console errors during dashboard load: {errors[:5]}", errors

    return True, f"dashboard rendered with {nav_count} sidebar items + banner", errors


def flow_b_dashboard_button(context):
    """Click a data-pfc-on-click button on dashboard, verify DOM state change.

    Specifically: click the 'Notifications' topbar button (which has
    data-pfc-on-click="toggleNotifications") and verify the notifications
    panel becomes visible. This proves the Wave-11 bootstrap dispatcher
    actually fires the click handler, not just visually preserves the button.
    """
    errors = []
    page = context.new_page()
    collect_console(page, errors)

    # Re-issue audit cookie in this fresh page context
    page.goto(
        f"{BASE}/api/audit-login?t={_urlquote(TOKEN, safe='')}",
        wait_until="domcontentloaded",
        timeout=15000,
    )
    page.goto(f"{BASE}/dashboard.html", wait_until="networkidle", timeout=20000)

    # Find the Notifications button by its data-pfc-on-click attribute.
    notif_btn = page.locator('[data-pfc-on-click="toggleNotifications"]').first
    try:
        notif_btn.wait_for(state="visible", timeout=5000)
    except PWTimeout:
        return False, "Notifications button not found — Wave-11 attribute missing", errors

    # Capture initial panel state.
    panel_selector = "#notif-panel"
    initial_visible = page.locator(panel_selector).is_visible() if page.locator(panel_selector).count() else False

    # Click the button.
    notif_btn.click(timeout=3000)
    page.wait_for_timeout(400)  # let any toggle animation settle

    # Verify panel state changed (we don't care WHICH direction, just that
    # the click actually triggered the handler).
    final_visible = page.locator(panel_selector).is_visible() if page.locator(panel_selector).count() else False
    if initial_visible == final_visible:
        return False, (
            f"toggleNotifications click had no effect — panel visibility "
            f"unchanged ({initial_visible}). Wave-11 bootstrap dispatcher "
            f"is failing to fire handlers."
        ), errors

    # Console error budget.
    if errors:
        return False, f"console errors during button click: {errors[:5]}", errors

    return True, f"Notifications panel toggled {initial_visible}->{final_visible}", errors


def main():
    failed = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for flow_name, flow_fn in [("A audit-dashboard", flow_a_audit_dashboard),
                                    ("B dashboard-button", flow_b_dashboard_button)]:
            # Retry-once guard against transient cold-start failures. The smoke
            # test runs IMMEDIATELY after the Vercel deploy step, so the first
            # request to each serverless function is a COLD start — an
            # occasional bare 500 (empty status text) or invocation timeout is
            # a platform artifact, not a product regression. A real bug (broken
            # dispatcher, persistent 5xx, missing banner) fails BOTH attempts;
            # a cold-start flake clears on the warm second run. This mirrors
            # real-user behaviour (reload once) and does NOT widen the benign
            # tolerance — a genuine error still reds the build.
            ok, msg, errors = False, "", []
            for attempt in (1, 2):
                context = browser.new_context(
                    viewport={"width": 1440, "height": 900},
                    device_scale_factor=1,
                )
                try:
                    ok, msg, errors = flow_fn(context)
                except Exception as e:
                    ok = False
                    msg = f"unhandled exception: {e}"
                    errors = []
                context.close()
                if ok:
                    break
                if attempt == 1:
                    print(f"[retry] flow {flow_name} failed attempt 1 "
                          f"({msg}) — retrying once (cold-start guard)")
            status = "[PASS]" if ok else "[FAIL]"
            print(f"{status} flow {flow_name}: {msg}")
            if errors and ok:
                print(f"        (suppressed console noise: {len(errors)} items)")
            if not ok:
                failed += 1

        browser.close()

    if failed:
        print(f"\n=== SUMMARY: {failed} flow(s) FAILED ===")
        sys.exit(1)
    print("\n=== SUMMARY: both flows PASSED ===")
    sys.exit(0)


if __name__ == "__main__":
    main()
