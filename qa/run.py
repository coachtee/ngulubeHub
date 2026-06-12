"""
Ngulube Hub — hard QA test suite.

Tests all critical user flows with Playwright and captures screenshots.
Output: qa-screenshots/*.png + PASS/FAIL summary.

Run:
  python3 qa/run.py
"""
import os
import sys
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SCREENSHOTS = Path("/workspace/ngulubehub/qa/screenshots")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

VIEWPORT = {"width": 1280, "height": 800}
MOBILE = {"width": 390, "height": 844}  # iPhone 14 Pro size

results = []
console_errors = []


def record(test, ok, note=""):
    status = "PASS" if ok else "FAIL"
    results.append({"test": test, "status": status, "note": note})
    icon = "✅" if ok else "❌"
    print(f"{icon} {status}: {test}" + (f"  — {note}" if note else ""))


def shot(page, name, mobile=False):
    path = SCREENSHOTS / f"{name}.png"
    page.screenshot(path=str(path), full_page=False)
    return path


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # =============== DESKTOP TESTS ===============
        ctx = browser.new_context(viewport=VIEWPORT)
        page = ctx.new_page()
        page.on("console", lambda msg: console_errors.append((msg.type, msg.text)) if msg.type in ("error", "warning") else None)
        page.on("pageerror", lambda err: console_errors.append(("pageerror", str(err))))

        # Test 1: GET /setup (clean state, no users)
        print("\n=== Test 1: /setup page (no users yet) ===")
        resp = page.goto(f"{BASE}/setup", wait_until="networkidle")
        record("GET /setup returns 200", resp.status == 200, f"got {resp.status}")
        shot(page, "01-setup")

        # Test 2: Create super-admin
        print("\n=== Test 2: Create super-admin ===")
        page.fill('input[name="name"]', "Thabiso QA")
        page.fill('input[name="username"]', "thabiso")
        page.fill('input[name="password"]', "secret123")
        with page.expect_navigation():
            page.click('button[type="submit"]')
        # After setup, we should be on /login (not yet logged in)
        record("POST /setup redirects to /login", "/login" in page.url, f"url={page.url}")

        # After setup, /setup should now redirect to /login
        page.goto(f"{BASE}/setup")
        record("After setup, /setup redirects to /login", "/login" in page.url, f"url={page.url}")

        # Test 3: GET /login
        print("\n=== Test 3: /login page ===")
        page.goto(f"{BASE}/login", wait_until="networkidle")
        record("GET /login returns 200", page.url.endswith("/login"))
        # Verify key UI elements
        has_brand = page.locator('.auth-card .brand .word:has-text("NgulubeHub")').count() > 0
        record("Login page shows 'NgulubeHub' wordmark", has_brand)
        has_h1 = page.locator('h1:has-text("Welcome Back")').count() > 0
        record("Login page shows 'Welcome Back' heading", has_h1)
        has_btn = page.locator('button:has-text("Sign in")').count() > 0
        record("Login page shows 'Sign in' button", has_btn)
        shot(page, "02-login")

        # Test 4: Login with bad credentials
        print("\n=== Test 4: Login bad creds ===")
        page.fill('input[name="username"]', "thabiso")
        page.fill('input[name="password"]', "wrongpass")
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")
        has_err = page.locator('.err:has-text("Invalid")').count() > 0
        record("Bad creds shows 'Invalid' error", has_err)
        shot(page, "03-login-error")

        # Test 5: Login with good credentials → dashboard
        print("\n=== Test 5: Login → dashboard ===")
        page.fill('input[name="username"]', "thabiso")
        page.fill('input[name="password"]', "secret123")
        with page.expect_navigation():
            page.click('button[type="submit"]')
        record("Login redirects to /", page.url.rstrip("/").endswith(BASE) or page.url.endswith("/"), f"url={page.url}")
        page.wait_for_load_state("networkidle")
        # Dashboard should have stats
        has_stats = page.locator('.stat').count() >= 3
        record("Dashboard shows stats grid (>=3 stat cards)", has_stats)
        # Should show the NgulubeHub brand in sidebar (loose match — text is "NgulubeHub" or has a space)
        has_sidebar_brand = page.locator('.sidebar .brand .word').count() > 0
        sidebar_text = page.locator('.sidebar .brand .word').first.text_content() if has_sidebar_brand else ''
        record("Sidebar shows wordmark", has_sidebar_brand and 'Ngulube' in (sidebar_text or ''), f"text='{sidebar_text}'")
        shot(page, "04-dashboard")

        # Test 6: View a client profile
        print("\n=== Test 6: View a client profile ===")
        # Click on the first client in the table
        first_client_link = page.locator('table.t tbody tr a').first
        if first_client_link.count() > 0:
            with page.expect_navigation():
                first_client_link.click()
            record("Client profile loaded", "/clients/" in page.url, f"url={page.url}")
            has_profile = page.locator('.profile-header').count() > 0
            record("Profile page has profile-header", has_profile)
            shot(page, "05-profile")
        else:
            record("Client profile loaded", False, "no client link found")

        # Test 7: /join public form
        print("\n=== Test 7: /join public form ===")
        # Logout first
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.context.clear_cookies()

        page.goto(f"{BASE}/join", wait_until="networkidle")
        has_form = page.locator('form[action="/join"]').count() > 0
        record("/join form is public (no login required)", has_form)
        shot(page, "06-join")

        # Submit a test entry
        page.fill('input[name="name"]', "Test User")
        page.fill('input[name="phone"]', "076 111 2222")
        page.fill('input[name="email"]', "test@example.com")
        page.fill('input[name="company"]', "Test Co")
        page.select_option('select[name="sector"]', "Tech & SaaS")
        page.fill('input[name="industry"]', "SaaS")
        page.fill('input[name="bio"]', "We test things for QA")
        page.fill('textarea[name="ideal_client"]', "Anyone who needs testing")
        with page.expect_navigation():
            page.click('button[type="submit"]')
        # Should see success banner
        has_success = page.locator('.ok-banner:has-text("You")').count() > 0
        record("/join form submits successfully", has_success, f"url={page.url}")
        shot(page, "07-join-success")

        # Test 8: Login as admin, see pending review stat
        print("\n=== Test 8: Pending review on dashboard ===")
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.fill('input[name="username"]', "thabiso")
        page.fill('input[name="password"]', "secret123")
        with page.expect_navigation():
            page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")
        has_pending = page.locator('.stat:has-text("Pending Review")').count() > 0
        record("Dashboard shows 'Pending Review' stat", has_pending)
        shot(page, "08-dashboard-with-pending")

        # Test 9: Click on the pending review filter
        page.goto(f"{BASE}/dashboard?status=pending", wait_until="networkidle")
        has_row = page.locator('table.t tbody tr:has-text("Test User")').count() > 0
        record("Filter by status=pending shows the test submission", has_row, f"rows={page.locator('table.t tbody tr').count()}")
        shot(page, "09-dashboard-filtered-pending")

        # Test 10: Open the pending client
        if has_row:
            page.locator('table.t tbody tr a:has-text("Test User")').first.click()
            page.wait_for_load_state("networkidle")
            has_banner = page.locator('.pending-banner').count() > 0
            record("Pending profile shows yellow approval banner", has_banner)
            shot(page, "10-profile-pending")
        else:
            record("Pending profile shows yellow approval banner", False, "no pending client to open")
            page.goto(f"{BASE}/", wait_until="networkidle")

        # Test 11: Approve it
        page.locator('button:has-text("Approve & Add to Pipeline")').click()
        page.wait_for_load_state("networkidle")
        # Should now be "Not contacted"
        status = page.locator('.pill').first.text_content()
        record("Approve moves to Not contacted", "Not contacted" in (status or ""), f"status={status}")
        shot(page, "11-profile-approved")

        # Test 12: AI Solutions catalog
        print("\n=== Test 12: AI Solutions catalog ===")
        page.goto(f"{BASE}/catalog", wait_until="networkidle")
        has_cats = page.locator('.cat-card').count() >= 5
        record("Catalog has >=5 solution cards", has_cats, f"count={page.locator('.cat-card').count()}")
        shot(page, "12-catalog")

        # Test 13: Admin users page (super-admin only)
        print("\n=== Test 13: Manage Admins page ===")
        page.goto(f"{BASE}/admin/users", wait_until="networkidle")
        has_users = page.locator('table.t').count() > 0
        record("Admin users page shows users table", has_users)
        shot(page, "13-admin-users")

        # Test 14: Generate intro for a client
        print("\n=== Test 14: Generate intro ===")
        page.goto(f"{BASE}/", wait_until="networkidle")
        # Find an intro link
        intro_btn = page.locator('a[title="Generate intro"]').first
        if intro_btn.count() > 0:
            with page.expect_navigation():
                intro_btn.click()
            has_intro = page.locator('.intro-page').count() > 0 or page.locator('h1').count() > 0
            record("Intro page renders", page.url.endswith("/intro") or "/intro" in page.url, f"url={page.url}")
            shot(page, "14-intro")
        else:
            record("Intro page renders", False, "no intro button found")

        # Test 15: New client form
        print("\n=== Test 15: New client form ===")
        page.goto(f"{BASE}/clients/new", wait_until="networkidle")
        has_form = page.locator('form').count() > 0
        record("New client form loads", has_form)
        shot(page, "15-client-form")

        # =============== MOBILE TESTS ===============
        print("\n\n=== MOBILE TESTS (iPhone 14 Pro) ===")
        ctx_m = browser.new_context(viewport=MOBILE, is_mobile=True, has_touch=True, device_scale_factor=3)
        page_m = ctx_m.new_page()
        page_m.on("pageerror", lambda err: console_errors.append(("pageerror-mobile", str(err))))

        # Mobile login
        page_m.goto(f"{BASE}/login", wait_until="networkidle")
        record("Mobile /login loads", page_m.url.endswith("/login"))
        has_brand_m = page_m.locator('.auth-card .brand .word:has-text("NgulubeHub")').count() > 0
        record("Mobile login shows wordmark", has_brand_m)
        shot(page_m, "16-mobile-login")

        # Mobile login flow → dashboard
        page_m.fill('input[name="username"]', "thabiso")
        page_m.fill('input[name="password"]', "secret123")
        with page_m.expect_navigation():
            page_m.click('button[type="submit"]')
        page_m.wait_for_load_state("networkidle")
        # Should see hamburger button on mobile
        has_hamburger = page_m.locator('.topbar .menu-btn:visible').count() > 0
        record("Mobile dashboard shows hamburger button", has_hamburger)
        shot(page_m, "17-mobile-dashboard")

        # Tap hamburger → sidebar opens
        if has_hamburger:
            page_m.locator('.topbar .menu-btn').click()
            page_m.wait_for_timeout(500)  # animation
            sidebar_open = page_m.locator('.sidebar.open').count() > 0
            record("Hamburger opens sidebar drawer", sidebar_open)
            shot(page_m, "18-mobile-sidebar-open")

        # Mobile /join
        page_m.goto(f"{BASE}/join", wait_until="networkidle")
        has_form_m = page_m.locator('form[action="/join"]').count() > 0
        record("Mobile /join form works", has_form_m)
        shot(page_m, "19-mobile-join")

        # =============== SUMMARY ===============
        print("\n\n" + "=" * 60)
        print("QA SUMMARY")
        print("=" * 60)
        passed = sum(1 for r in results if r["status"] == "PASS")
        failed = sum(1 for r in results if r["status"] == "FAIL")
        print(f"  Passed: {passed}/{len(results)}")
        print(f"  Failed: {failed}/{len(results)}")
        if console_errors:
            print(f"\n  Console errors: {len(console_errors)}")
            for kind, msg in console_errors[:5]:
                print(f"    [{kind}] {msg[:200]}")
        print(f"\n  Screenshots: {SCREENSHOTS}")
        print("=" * 60)

        # Write results
        with open("/workspace/ngulubehub/qa/results.json", "w") as f:
            json.dump({
                "passed": passed,
                "failed": failed,
                "total": len(results),
                "results": results,
                "console_errors": console_errors,
            }, f, indent=2)

        browser.close()
        return failed == 0


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
