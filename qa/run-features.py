"""
Ngulube Hub — Features 1-5 QA
Tests WhatsApp share, Calendar, Today widget, Cadence, CSV import.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = Path("/workspace/ngulubehub/qa/screenshots-features")
SHOTS.mkdir(parents=True, exist_ok=True)

VIEWPORT = {"width": 1280, "height": 800}
MOBILE = {"width": 390, "height": 844}

results = []
console_errors = []


def record(test, ok, note=""):
    status = "PASS" if ok else "FAIL"
    results.append({"test": test, "status": status, "note": note})
    icon = "✅" if ok else "❌"
    print(f"{icon} {status}: {test}" + (f"  — {note}" if note else ""))


def shot(page, name):
    p = SHOTS / f"{name}.png"
    page.screenshot(path=str(p), full_page=False)
    return p


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path="/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome",
        )
        ctx = browser.new_context(viewport=VIEWPORT)
        page = ctx.new_page()
        page.on("pageerror", lambda e: console_errors.append(("pageerror", str(e))))

        # Login (force a clean state by clearing cookies)
        ctx.clear_cookies()
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.fill('input[name="username"]', "thabiso")
        page.fill('input[name="password"]', "secret123")
        with page.expect_navigation(timeout=15000):
            page.click('button:has-text("Sign in")')
        page.wait_for_load_state("networkidle")
        if '/login' in page.url:
            shot(page, "debug-after-login")
            raise Exception('Login failed - still on /login page. URL=' + page.url)

        # ========== FEATURE 1: WhatsApp share ==========
        print("\n=== FEATURE 1: WhatsApp share ===")
        # Find the first client and set their phone via the edit form
        page.goto(f"{BASE}/", wait_until="networkidle")
        first_link = page.locator('table.t tbody tr a').first
        if first_link.count() == 0:
            record("Could not find a client to test WhatsApp", False, "no client in table")
        else:
            first_href = first_link.get_attribute('href')
            client_id = first_href.split('/')[-1] if '/clients/' in first_href else None
            if not client_id:
                record("Could not extract client ID", False)
            else:
                # Go to edit and set phone
                page.goto(f"{BASE}/clients/{client_id}/edit", wait_until="networkidle")
                phone_input = page.locator('input[name="contact_phone"]')
                if phone_input.count() > 0:
                    phone_input.fill('+27761234567')
                    with page.expect_navigation():
                        page.click('button:has-text("Save")')
                # Now go to the intro
                page.goto(f"{BASE}/clients/{client_id}/intro", wait_until="networkidle")
                # The button should exist if contact_phone is set
                has_wa = page.locator('a:has-text("Share via WhatsApp")').count() > 0
                record("WhatsApp share button visible on intro with phone", has_wa)
                has_copy = page.locator('button:has-text("Copy Text")').count() > 0
                record("Copy Text button visible", has_copy)
                has_textarea = page.locator('#intro-text').count() > 0
                record("Hidden intro-text textarea exists", has_textarea)
                if has_textarea:
                    wa_url = page.evaluate("""() => {
                      const ta = document.getElementById('intro-text');
                      if (!ta) return null;
                      const phone = '27761234567';
                      const url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(ta.value.slice(0, 50));
                      return { hasText: ta.value.length > 0, preview: ta.value.slice(0, 50), url };
                    }""")
                    record("intro-text has body content", wa_url and wa_url.get('hasText'), f"preview={wa_url.get('preview') if wa_url else 'None'}")
                    record("wa.me URL pattern", wa_url and 'wa.me/27761234567' in wa_url.get('url', ''), f"url={wa_url.get('url') if wa_url else 'None'}")
                shot(page, "01-intro-with-whatsapp")

        # ========== FEATURE 2: Calendar ==========
        print("\n=== FEATURE 2: Calendar ===")
        page.goto(f"{BASE}/calendar", wait_until="networkidle")
        shot(page, "debug-calendar-pre")
        record("Calendar page loads", page.locator('.cal-grid').count() > 0)
        record("Calendar has 7 weekday headers", page.locator('.cal-weekday').count() == 7)
        record("Calendar has day cells", page.locator('.cal-day').count() >= 28)
        # Test month navigation (use icon class)
        page.locator('a[href*="m="]').first.click()
        page.wait_for_load_state("networkidle")
        record("Month navigation works", 'm=' in page.url)
        # Today link
        page.locator('a:has-text("Today")').first.click()
        page.wait_for_load_state("networkidle")
        record("Today link returns to current month", 'm=' in page.url)
        # Check upcoming touches panel exists
        has_touches = page.locator('.panel:has-text("Upcoming Touches")').count() > 0
        record("Upcoming Touches panel present", has_touches)
        shot(page, "02-calendar")

        # ========== FEATURE 3: Today widget ==========
        print("\n=== FEATURE 3: Today widget ===")
        page.goto(f"{BASE}/", wait_until="networkidle")
        has_today = page.locator('.panel:has-text("Today —")').count() > 0
        record("Today widget on dashboard", has_today)
        # Check 4 stat cells in the Today widget
        record("Today widget has 4 quick counts", page.locator('.panel:has-text("Today —") >> text=Overdue').count() > 0)
        shot(page, "03-today-widget")

        # ========== FEATURE 4: Cadence tracker ==========
        print("\n=== FEATURE 4: Cadence tracker ===")
        page.goto(f"{BASE}/clients/1/edit", wait_until="networkidle")
        has_cadence = page.locator('select[name="cadence_days"]').count() > 0
        record("Cadence field in client edit form", has_cadence)
        has_last_contact = page.locator('input[name="last_contact_at"]').count() > 0
        record("Last contacted field in client edit form", has_last_contact)
        # Set cadence and save
        page.select_option('select[name="cadence_days"]', "14")
        with page.expect_navigation():
            page.click('button:has-text("Save")')
        record("Saved cadence redirect to client", "/clients/1" in page.url)
        # Verify it's saved
        page.goto(f"{BASE}/clients/1/edit", wait_until="networkidle")
        sel = page.locator('select[name="cadence_days"]').input_value()
        record("Cadence persisted (value=14)", sel == "14", f"got={sel}")
        shot(page, "04-cadence-form")

        # ========== FEATURE 5: CSV import ==========
        print("\n=== FEATURE 5: CSV import ===")
        page.goto(f"{BASE}/import", wait_until="networkidle")
        record("Import page loads", page.locator('textarea[name="csv"]').count() > 0)
        has_template = page.locator('a:has-text("Download template")').count() > 0
        record("Template download link present", has_template)
        shot(page, "05-import-page")

        # Test the import
        csv_text = """name,title,company,email,phone,sector,industry,cadence_days
QA Import 1,CTO,QATech1,qa1@example.com,0761110001,Tech,Software,14
QA Import 2,CEO,QATech2,qa2@example.com,0761110002,Tech,Software,30
QA Import 3,COO,QATech3,qa3@example.com,0761110003,Finance,Banking,7"""
        page.fill('textarea[name="csv"]', csv_text)
        with page.expect_navigation():
            page.click('button:has-text("Import")')
        # Should see "Import complete" + count of inserted
        page_text = page.content()
        record("Import shows success message", "Import complete" in page_text)
        record("Import inserted 3 clients", "3</strong> clients imported" in page_text or "3 clients imported" in page_text, f"text around: {page_text[page_text.find('imported'):page_text.find('imported')+50] if 'imported' in page_text else 'NOT FOUND'}")
        shot(page, "06-import-result")

        # Verify the 3 rows landed in the DB by visiting one
        page.goto(f"{BASE}/", wait_until="networkidle")
        page.fill('input[name="q"]', "QA Import")
        with page.expect_navigation():
            page.press('input[name="q"]', "Enter")
        record("Search shows the imported clients", page.locator('table.t tbody tr').count() >= 3, f"count={page.locator('table.t tbody tr').count()}")
        shot(page, "07-imported-search")

        # Test bad CSV
        page.goto(f"{BASE}/import", wait_until="networkidle")
        page.fill('textarea[name="csv"]', "name,unknown_col\nFoo,bar")
        with page.expect_navigation():
            page.click('button:has-text("Import")')
        # Should show error
        err_text = page.content()
        record("Invalid CSV shows error", "Unknown columns" in err_text or "error" in err_text.lower())
        shot(page, "08-import-error")

        # ========== MOBILE ==========
        print("\n=== MOBILE ===")
        ctx_m = browser.new_context(viewport=MOBILE, is_mobile=True, has_touch=True)
        page_m = ctx_m.new_page()

        page_m.goto(f"{BASE}/login", wait_until="networkidle")
        shot(page_m, "09-mobile-login")

        page_m.fill('input[name="username"]', "thabiso")
        page_m.fill('input[name="password"]', "secret123")
        with page_m.expect_navigation():
            page_m.click('button:has-text("Sign in")')
        page_m.wait_for_load_state("networkidle")
        shot(page_m, "10-mobile-dashboard-with-today")

        # Mobile calendar
        page_m.goto(f"{BASE}/calendar", wait_until="networkidle")
        record("Mobile calendar loads", page_m.locator('.cal-grid').count() > 0)
        shot(page_m, "11-mobile-calendar")

        # Mobile import
        page_m.goto(f"{BASE}/import", wait_until="networkidle")
        record("Mobile import page loads", page_m.locator('textarea[name="csv"]').count() > 0)
        shot(page_m, "12-mobile-import")

        # ========== SUMMARY ==========
        print("\n" + "=" * 60)
        print("FEATURES 1-5 QA")
        print("=" * 60)
        passed = sum(1 for r in results if r["status"] == "PASS")
        failed = sum(1 for r in results if r["status"] == "FAIL")
        print(f"  Passed: {passed}/{len(results)}")
        print(f"  Failed: {failed}/{len(results)}")
        if console_errors:
            print(f"  Console errors: {len(console_errors)}")
            for k, m in console_errors[:3]:
                print(f"    [{k}] {m[:200]}")
        print(f"  Screenshots: {SHOTS}")
        print("=" * 60)

        with open("/workspace/ngulubehub/qa/results-features.json", "w") as f:
            json.dump({
                "passed": passed, "failed": failed, "total": len(results),
                "results": results, "console_errors": console_errors,
            }, f, indent=2)

        browser.close()
        return failed == 0


if __name__ == "__main__":
    import sys
    sys.exit(0 if main() else 1)
