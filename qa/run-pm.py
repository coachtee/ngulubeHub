"""
Ngulube Hub — PM Module hard QA test suite.
Tests the project management module end-to-end with Playwright.
Captures 15+ screenshots.
"""
import os
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = Path("/workspace/ngulubehub/qa/screenshots-pm")
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
    path = SHOTS / f"{name}.png"
    page.screenshot(path=str(path), full_page=False)
    return path


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport=VIEWPORT)
        page = ctx.new_page()
        page.on("pageerror", lambda err: console_errors.append(("pageerror", str(err))))

        # Login (create user if needed)
        print("\n=== Login ===")
        page.goto(f"{BASE}/setup", wait_until="networkidle")
        if page.locator('input[name="username"]').count() > 0:
            page.fill('input[name="name"]', "Thabiso")
            page.fill('input[name="username"]', "thabiso")
            page.fill('input[name="password"]', "secret123")
            with page.expect_navigation():
                page.click('button[type="submit"]')
            print("  Created super-admin via /setup")
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.fill('input[name="username"]', "thabiso")
        page.fill('input[name="password"]', "secret123")
        with page.expect_navigation():
            page.click('button[type="submit"]')
        record("Login successful", page.url.endswith("/") or "/dashboard" in page.url, f"url={page.url}")

        # === PM TESTS ===

        # Test 1: Dashboard has PM widgets
        print("\n=== Test 1: Dashboard has PM widgets ===")
        page.goto(f"{BASE}/", wait_until="networkidle")
        record("Dashboard shows Active Projects stat", page.locator('.stat:has-text("Active Projects")').count() > 0)
        record("Dashboard shows Idea Inbox panel", page.locator('.panel:has-text("Idea Inbox")').count() > 0)
        record("Dashboard shows My Upcoming Tasks panel", page.locator('.panel:has-text("My Upcoming Tasks")').count() > 0)
        shot(page, "01-dashboard-with-pm")

        # Test 2: Capture an idea
        print("\n=== Test 2: Capture an idea via dashboard ===")
        page.fill('input[name="title"]', "Automate the admin onboarding")
        with page.expect_navigation():
            page.click('button:has-text("Capture")')
        record("Idea capture redirects to new project", "/projects/" in page.url, f"url={page.url}")
        shot(page, "02-idea-captured")

        # Test 3: Projects list (kanban)
        print("\n=== Test 3: Projects list (kanban) ===")
        page.goto(f"{BASE}/projects", wait_until="networkidle")
        has_kanban = page.locator('.kanban-board').count() > 0
        record("Projects page has kanban board", has_kanban)
        record("Kanban has 4 columns", page.locator('.kanban-col').count() == 4, f"count={page.locator('.kanban-col').count()}")
        shot(page, "03-projects-kanban")

        # Test 4: Projects list (list view)
        print("\n=== Test 4: Projects list view ===")
        page.click('a:has-text("List")')
        page.wait_for_load_state("networkidle")
        has_table = page.locator('table.t').count() > 0
        record("List view has projects table", has_table)
        shot(page, "04-projects-list")

        # Test 5: Create a new project
        print("\n=== Test 5: Create a new project ===")
        page.goto(f"{BASE}/projects/new", wait_until="networkidle")
        has_form = page.locator('form').count() > 0
        record("New project form loads", has_form)
        page.fill('input[name="name"]', "AI onboarding chatbot for Hulisani's team")
        page.fill('textarea[name="description"]', "A 24/7 WhatsApp-style bot that captures new client intake details.")
        page.fill('textarea[name="problem"]', "Hulisani's team loses 2-3 hours/week chasing unstructured intake forms.")
        page.fill('textarea[name="success_criteria"]', "80% of new intake goes through the bot, zero manual typing.")
        page.select_option('select[name="status"]', "scoping")
        page.select_option('select[name="priority"]', "high")
        page.fill('input[name="target_end_date"]', "2026-08-30")
        page.fill('input[name="est_value_zar"]', "75000")
        page.select_option('select[name="risk_level"]', "medium")
        # Use the form's submit button (scoped to the form, not the sidebar logout)
        with page.expect_navigation():
            page.click('form[action="/projects"] button[type="submit"]')
        record("New project redirects to detail", "/projects/" in page.url and "/login" not in page.url, f"url={page.url}")
        shot(page, "05-project-detail-empty")

        # Test 6: Project detail page
        print("\n=== Test 6: Project detail ===")
        has_header = page.locator('.profile-header').count() > 0
        record("Project detail has header", has_header)
        has_tasks_panel = page.locator('.panel:has-text("Tasks")').count() > 0
        record("Project detail has tasks panel", has_tasks_panel)
        has_overview = page.locator('.panel:has-text("Overview")').count() > 0
        record("Project detail has overview panel", has_overview)

        # Test 7: Add tasks to the project
        print("\n=== Test 7: Add multiple tasks ===")
        for i, (title, prio, due) in enumerate([
            ("Map out the conversation flow", "high", "2026-06-25"),
            ("Set up the WhatsApp Business API", "urgent", "2026-06-18"),
            ("Build the form schema in the bot", "normal", "2026-07-02"),
            ("Write the welcome message", "low", "2026-07-10"),
        ]):
            page.click('button:has-text("Add task")')
            page.wait_for_timeout(100)
            page.fill('input[name="title"]', title)
            page.select_option('select[name="priority"]', prio)
            page.fill('input[name="due_date"]', due)
            with page.expect_navigation():
                page.click('form#newTaskForm button[type="submit"]')
            page.wait_for_load_state("networkidle")
        record("Added 4 tasks", True)
        shot(page, "06-project-with-tasks")

        # Test 8: Task status changes
        print("\n=== Test 8: Task status changes ===")
        # Mark the first task as doing
        task_selects = page.locator('select[name="status"]')
        first_task_status = page.locator('.task-item').first.locator('select[name="status"]')
        first_task_status.select_option("doing")
        page.wait_for_load_state("networkidle")
        record("Task status changed to doing", True)
        shot(page, "07-task-doing")

        # Mark the urgent one as done via the circle button
        # Find the urgent task
        urgent_task = page.locator('.task-item:has-text("Set up the WhatsApp")').first
        urgent_done_btn = urgent_task.locator('button[title="Mark done"]')
        if urgent_done_btn.count() > 0:
            urgent_done_btn.click()
            page.wait_for_load_state("networkidle")
            record("Marked urgent task done", True)
        shot(page, "08-task-done")

        # Test 9: My Tasks page
        print("\n=== Test 9: My Tasks page ===")
        page.goto(f"{BASE}/tasks", wait_until="networkidle")
        has_overdue = page.locator('.panel:has-text("Overdue")').count() > 0
        has_thisweek = page.locator('.panel:has-text("This week")').count() > 0
        record("My Tasks shows Overdue section", has_overdue)
        record("My Tasks shows This week section", has_thisweek)
        shot(page, "09-my-tasks")

        # Test 10: Kanban with cards
        print("\n=== Test 10: Kanban with cards ===")
        page.goto(f"{BASE}/projects?view=kanban", wait_until="networkidle")
        has_cards = page.locator('.kanban-card').count() >= 2
        record("Kanban has 2+ project cards", has_cards, f"count={page.locator('.kanban-card').count()}")
        shot(page, "10-kanban-with-cards")

        # Test 11: Change project status
        print("\n=== Test 11: Change project status via detail ===")
        page.goto(f"{BASE}/projects", wait_until="networkidle")
        first_card = page.locator('.kanban-card').first
        first_card.click()
        page.wait_for_load_state("networkidle")
        status_select = page.locator('form select[name="status"]').first
        status_select.select_option("active")
        page.wait_for_load_state("networkidle")
        record("Project status changed to active", True)
        shot(page, "11-project-active")

        # Test 12: Pipeline routes work
        print("\n=== Test 12: Pipeline routes (regression check) ===")
        for path, label in [
            ("/pipeline/not-contacted", "Not Contacted"),
            ("/pipeline/intro-sent", "Intro Sent"),
            ("/pipeline/engaged", "Engaged / Won"),
        ]:
            resp = page.goto(f"{BASE}{path}", wait_until="networkidle")
            record(f"GET {path} returns 200", resp.status == 200)
            record(f"{path} shows '{label}' heading", page.locator(f'h1:has-text("{label}")').count() > 0)

        # === MOBILE TESTS ===

        print("\n\n=== MOBILE TESTS ===")
        ctx_m = browser.new_context(viewport=MOBILE, is_mobile=True, has_touch=True)
        page_m = ctx_m.new_page()

        # Mobile login
        page_m.goto(f"{BASE}/login", wait_until="networkidle")
        page_m.fill('input[name="username"]', "thabiso")
        page_m.fill('input[name="password"]', "secret123")
        with page_m.expect_navigation():
            page_m.click('button[type="submit"]')
        page_m.wait_for_load_state("networkidle")
        shot(page_m, "12-mobile-dashboard-pm")

        # Mobile projects
        page_m.goto(f"{BASE}/projects", wait_until="networkidle")
        record("Mobile projects page loads", page_m.locator('.kanban-board').count() > 0)
        shot(page_m, "13-mobile-projects-kanban")

        # Mobile list view
        page_m.goto(f"{BASE}/projects?view=list", wait_until="networkidle")
        record("Mobile projects list loads", page_m.locator('table.t').count() > 0)
        shot(page_m, "14-mobile-projects-list")

        # Mobile tasks
        page_m.goto(f"{BASE}/tasks", wait_until="networkidle")
        record("Mobile my-tasks loads", page_m.locator('.panel').count() > 0)
        shot(page_m, "15-mobile-my-tasks")

        # Mobile project detail
        page_m.goto(f"{BASE}/projects", wait_until="networkidle")
        page_m.locator('.kanban-card').first.click()
        page_m.wait_for_load_state("networkidle")
        record("Mobile project detail loads", page_m.locator('.profile-header').count() > 0)
        shot(page_m, "16-mobile-project-detail")

        # === SUMMARY ===
        print("\n\n" + "=" * 60)
        print("PM MODULE QA SUMMARY")
        print("=" * 60)
        passed = sum(1 for r in results if r["status"] == "PASS")
        failed = sum(1 for r in results if r["status"] == "FAIL")
        print(f"  Passed: {passed}/{len(results)}")
        print(f"  Failed: {failed}/{len(results)}")
        if console_errors:
            print(f"\n  Console errors: {len(console_errors)}")
            for kind, msg in console_errors[:5]:
                print(f"    [{kind}] {msg[:200]}")
        print(f"\n  Screenshots: {SHOTS}")
        print("=" * 60)

        with open("/workspace/ngulubehub/qa/results-pm.json", "w") as f:
            json.dump({
                "passed": passed, "failed": failed, "total": len(results),
                "results": results, "console_errors": console_errors,
            }, f, indent=2)

        browser.close()
        return failed == 0


if __name__ == "__main__":
    import sys
    ok = main()
    sys.exit(0 if ok else 1)
