# Contributing to Ngulube Hub

Thanks for your interest. This is a small, focused project — we value small, focused pull requests.

## Ground rules

- **Be kind.** Disagree on ideas, not on people.
- **One thing per PR.** Don't mix a refactor with a feature with a bug fix.
- **Test before you push.** The app should still boot with `node server.js` and the QA tests should pass.

## Local development setup

```bash
git clone https://github.com/coachtee/ngulubeHub.git
cd ngulubeHub
npm install
node db/seed.js
node server.js
# or, for auto-reload during dev:
npm run dev
```

The app starts on `http://localhost:3000` and redirects to `/setup` on first run (no users exist). Create the first super-admin and you're in.

## Code style

- **JavaScript:** Standard, 2-space indent, single quotes, semicolons. No transpilation, no bundler. Aim for code that reads top-to-bottom.
- **EJS templates:** Same indent. Prefer `<%= %>` for escaped output. Never use `<%- %>` on user input.
- **CSS:** A single `public/css/app.css` file. Use the CSS variables in `:root` for colors and spacing.
- **SQL:** Always use parameterized queries (`db.prepare('SELECT * FROM t WHERE id = ?').get(id)`). Never string-interpolate user input into SQL.
- **Dependencies:** Avoid adding new ones unless there's no other way. If you must, update `package.json` and the README.

## Before you open a PR

1. Pull the latest `main` and rebase: `git pull --rebase origin main`
2. Test locally with the existing data: `node server.js` and click around.
3. Wipe and re-seed to test the first-run flow: `rm data/ngulubehub.sqlite* && node db/seed.js && node server.js` and visit `/setup`.
4. Smoke-test the deploy: `bash install.sh` should complete without error on a fresh Ubuntu VM.
5. Update `README.md` if you added a route, env var, dependency, or changed the deploy instructions.
6. If you added or changed an AI solution in `db/ai_catalog.js`, also update the count in `README.md` (21 solutions).

## Commit messages

Format: `<scope>: <one-line summary>`

Examples:
- `auth: add password change flow for admins`
- `catalog: drop legacy "AI X-Ray" entry, add new "AI Image Quality Control"`
- `ui: fix dashboard table overflow on mobile`
- `docs: clarify SESSION_SECRET requirement`

Body should answer **what** and **why**, not how.

## Reporting a bug

Open an issue with:
- What you did (steps to reproduce)
- What you expected
- What you got (screenshots, console output, server logs)
- Your environment (Node version, OS, how you installed)

## Security

**Don't open a public issue for security bugs.** See [SECURITY.md](SECURITY.md).
