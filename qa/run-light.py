"""
Ngulube Hub — Light Theme QA
Tests the light theme redesign.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = Path("/workspace/ngulubehub/qa/screenshots-light")
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

        # Setup
        page.goto(f"{BASE}/setup", wait_until="networkidle")
        page.fill('input[name="name"]', "Thabiso")
        page.fill('input[name="username"]', "thabiso")
        page.fill('input[name="password"]', "secret123")
        with page.expect_navigation():
            page.click('button[type="submit"]')

        # Capture every page
        print("=== Capture every key view ===")

        # Login
        page.context.clear_cookies()
        page.goto(f"{BASE}/login", wait_until="networkidle")
        shot(page, "01-login-light")

        # Login flow
        page.fill('input[name="username"]', "thabiso")
        page.fill('input[name="password"]', "secret123")
        with page.expect_navigation():
            page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")
        record("Login works", page.url.rstrip('/').endswith(BASE.rstrip('/')) or "/dashboard" in page.url)
        shot(page, "02-dashboard-light")

        # Profile
        page.goto(f"{BASE}/clients/1", wait_until="networkidle")
        shot(page, "03-profile-light")

        # /join
        page.goto(f"{BASE}/join", wait_until="networkidle")
        shot(page, "04-join-light")

        # /projects
        page.goto(f"{BASE}/projects", wait_until="networkidle")
        shot(page, "05-projects-kanban-light")

        # /projects list
        page.goto(f"{BASE}/projects?view=list", wait_until="networkidle")
        shot(page, "06-projects-list-light")

        # Project detail with tasks
        page.goto(f"{BASE}/projects/new", wait_until="networkidle")
        page.fill('input[name="name"]', "AI chatbot for Hulisani's team")
        page.fill('textarea[name="description"]', "24/7 WhatsApp bot for client intake")
        page.fill('textarea[name="problem"]', "Lost hours chasing unstructured forms")
        page.fill('textarea[name="success_criteria"]', "80% intake via the bot")
        page.select_option('select[name="status"]', "scoping")
        page.select_option('select[name="priority"]', "high")
        page.fill('input[name="target_end_date"]', "2026-08-30")
        page.fill('input[name="est_value_zar"]', "75000")
        page.select_option('select[name="risk_level"]', "medium")
        with page.expect_navigation():
            page.click('form[action="/projects"] button[type="submit"]')
        page.wait_for_load_state("networkidle")
        shot(page, "07-project-detail-light")

        # Add a few tasks
        for title, prio, due in [
            ("Map conversation flow", "high", "2026-06-25"),
            ("Wire up WhatsApp API", "urgent", "2026-06-18"),
        ]:
            page.click('button:has-text("Add task")')
            page.wait_for_timeout(100)
            page.fill('input[name="title"]', title)
            page.select_option('form#newTaskForm select[name="priority"]', prio)
            page.fill('form#newTaskForm input[name="due_date"]', due)
            with page.expect_navigation():
                page.click('form#newTaskForm button[type="submit"]')
            page.wait_for_load_state("networkidle")
        shot(page, "08-project-with-tasks-light")

        # My Tasks
        page.goto(f"{BASE}/tasks", wait_until="networkidle")
        shot(page, "09-my-tasks-light")

        # Pipeline
        page.goto(f"{BASE}/pipeline/not-contacted", wait_until="networkidle")
        shot(page, "10-pipeline-not-contacted-light")

        # Admin users
        page.goto(f"{BASE}/admin/users", wait_until="networkidle")
        shot(page, "11-admin-users-light")

        # Catalog
        page.goto(f"{BASE}/catalog", wait_until="networkidle")
        shot(page, "12-catalog-light")

        # New client form
        page.goto(f"{BASE}/clients/new", wait_until="networkidle")
        shot(page, "13-client-form-light")

        # AI catalog
        page.goto(f"{BASE}/clients/2", wait_until="networkidle")
        shot(page, "14-profile-2-light")

        # Idea inbox test
        page.goto(f"{BASE}/", wait_until="networkidle")
        page.fill('.idea-form input[name="title"]', "Mobile app for intake")
        with page.expect_navigation():
            page.click('button:has-text("Capture")')
        shot(page, "15-after-idea-capture")

        # === MOBILE ===
        print("\n=== MOBILE ===")
        ctx_m = browser.new_context(viewport=MOBILE, is_mobile=True, has_touch=True)
        page_m = ctx_m.new_page()
        page_m.goto(f"{BASE}/login", wait_until="networkidle")
        shot(page_m, "16-mobile-login-light")
        page_m.fill('input[name="username"]', "thabiso")
        page_m.fill('input[name="password"]', "secret123")
        with page_m.expect_navigation():
            page_m.click('button[type="submit"]')
        page_m.wait_for_load_state("networkidle")
        shot(page_m, "17-mobile-dashboard-light")
        page_m.goto(f"{BASE}/projects", wait_until="networkidle")
        shot(page_m, "18-mobile-projects-light")
        page_m.goto(f"{BASE}/clients/1", wait_until="networkidle")
        shot(page_m, "19-mobile-profile-light")
        page_m.goto(f"{BASE}/join", wait_until="networkidle")
        shot(page_m, "20-mobile-join-light")

        # === SUMMARY ===
        print("\n" + "=" * 60)
        print("LIGHT THEME QA")
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

        with open("/workspace/ngulubehub/qa/results-light.json", "w") as f:
            json.dump({
                "passed": passed, "failed": failed, "total": len(results),
                "results": results, "console_errors": console_errors,
            }, f, indent=2)

        browser.close()
        return failed == 0


if __name__ == "__main__":
    import sys
    sys.exit(0 if main() else 1)
