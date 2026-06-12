# Ngulube Hub

> A simple, fast business-client database and AI-solution matching system for a small team.
> Built for `ngulube.naleli.co.za` and similar private CRM workflows.

[![Node 20+](https://img.shields.io/badge/node-%E2%89%A520-3c873a)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![No build step](https://img.shields.io/badge/build-none-success)]()
[![Single-file DB](https://img.shields.io/badge/db-sqlite-blue)]()

Ngulube Hub is a self-hosted CRM/dashboard for keeping a clean, growing record of the people in your business network — the industries they work in, the pain points you can solve for them, and the AI solutions that match. It also generates a **one-click personalised intro brief** that you can send as a PDF/print to start the conversation.

![Dashboard](screenshot-dashboard.png)

---

## ✨ Features

- 🔐 **Login + multi-admin** — first-run setup wizard, super-admin can add/remove other admins
- 🗂️ **Dashboard** — search, filter by sector & status, see at-a-glance stats
- 👤 **Profile per client** — bio, focus areas, pain points, tags, activity log
- 🤖 **AI solutions matched** — auto-suggested from a 21-item master catalog, each with indicative ZAR pricing
- 📝 **One-click intro generator** — printable one-page brief personalised per client (greeting, sector hook, top pain points, matched solutions, total ZAR range, 30-min next-step CTA)
- ✉️ **Mark intro sent** — one button updates status + logs the interaction
- ➕ **Add/edit form** — grows the database from the UI; sector auto-suggests solutions
- 🔍 **Search** — name, company, focus area, tag, bio
- 📊 **AI catalog** — browse what we offer, filter by industry
- 💾 **Single-file backup** — `data/ngulubehub.sqlite` is the whole DB

![Profile](screenshot-profile.png)
![Intro](screenshot-intro.png)
![Admin Users](screenshot-admin.png)

---

## 🧰 Tech stack

| Layer | Choice | Why |
|------|--------|-----|
| Runtime | Node.js 20+ | Available everywhere, no native compile dance for most deps |
| HTTP | Express 4 | Smallest, most boring, most deployed framework |
| DB | SQLite (via `better-sqlite3`) | One file, no server, perfect for a private team tool |
| Views | EJS | Zero build step; HTML in, HTML out |
| Auth | `express-session` + `bcryptjs` | Cookie sessions, no external store needed at this scale |
| UI | Bootstrap 5 via CDN + custom CSS | Looks good, no asset pipeline |
| Process | `pm2` | Survives reboots, single-file config |

**No build step. No Docker required. No external services.** One `node server.js` and you're up.

---

## 🚀 Quick start

### Local (5 minutes)

```bash
git clone https://github.com/coachtee/ngulubeHub.git
cd ngulubeHub
npm install
node db/seed.js        # seeds 17 starter profiles + 21 AI solutions
node server.js         # http://localhost:3000
```

Open `http://localhost:3000`. The first time, you'll be redirected to `/setup` to create the first super-admin. Then log in and start using it.

### Production (on a VPS)

```bash
# One-time setup on a fresh Ubuntu 22.04/24.04 server
git clone https://github.com/coachtee/ngulubeHub.git
cd ngulubeHub
bash install.sh        # installs Node 20, pm2, deps, seeds, starts the service
```

`install.sh` does:
- Install Node.js 20.x via NodeSource (if missing)
- Install `pm2` globally
- `npm install --omit=dev`
- `node db/seed.js`
- `pm2 start ecosystem.config.cjs` + `pm2 save` + `pm2 startup`
- Opens ufw port 3000 (if ufw is active)

The app is then reachable at `http://YOUR_VPS:3000`. **Point your reverse proxy (Nginx, Caddy, Nginx Proxy Manager) at it for HTTPS.**

### Pointing a domain at it (Nginx Proxy Manager example)

1. Open NPM at `http://YOUR_VPS:81`
2. **Add Proxy Host:**
   - Domain: `ngulube.yourdomain.co.za`
   - Scheme: `http`
   - Forward to: `127.0.0.1:3000` (or `host.docker.internal` if NPM is in Docker)
3. **SSL tab** → Request Let's Encrypt certificate
4. **Save** → `https://ngulube.yourdomain.co.za` is live

---

## 🔐 First-time setup wizard

Open the app → redirected to `/setup` → create the first super-admin (name, username, password ≥ 6 chars). After that, all routes require login.

From the new super-admin's `/admin/users` page, you can add more admins (Hulisani, Malume, Joe, etc.) with role `admin` (read/write data) or `superadmin` (can also manage the user list).

---

## 📖 Usage

### Dashboard `/`
- Search by name, company, focus area, or tag (top-bar search)
- Filter by sector and intro status (filter row)
- See all clients as a table with status pills and AI-solution counts
- Top stats: total clients, sectors covered, not-yet-contacted, in motion

### Profile `/clients/:id`
- Full bio, focus areas, pain points, tags
- Pre-matched AI solutions with indicative ZAR pricing
- Activity log (calls, emails, WhatsApp, meetings)
- One-click **Generate Intro** → printable one-page brief
- One-click **Mark Intro Sent** → updates status + logs the interaction
- Edit / delete

### Add client `/clients/new`
- Form with sector dropdown, focus areas, pain points (one per line), tags (comma separated)
- Sector auto-suggests AI solutions

### AI catalog `/catalog`
- 21 solutions grouped by category
- Filter by name / category / industry

### Admin users `/admin/users` (super-admin only)
- List of all admins with role pill, last login
- Add admin / reset password / remove admin

---

## ⚙️ Configuration

### Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `SESSION_SECRET` | (dev fallback) | **Set this in production.** Long random string. |

Generate one:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Set it before starting:
```bash
export SESSION_SECRET="<paste the secret>"
pm2 restart ngulubehub
```

Or in `ecosystem.config.cjs`:
```js
env: { NODE_ENV: 'production', PORT: 3000, SESSION_SECRET: '...', ... }
```

---

## 🔧 Customising

### Logo

Two SVG variants in `public/img/`:
- `logo.svg` — default, a clean **N** monogram in a navy rounded square
- `logo-pig.svg` — pig-nose inspired alternative

To switch, edit `views/partials/nav.ejs`:
```ejs
<img src="/img/logo.svg" ...>   <!-- change to /img/logo-pig.svg -->
```

### AI solutions menu

Edit `db/ai_catalog.js` to add/remove/edit solutions. Then re-run the seed:
```bash
node db/seed.js
```

The seed is **idempotent** — existing clients are updated, not duplicated.

### Sector / industry classifications

Edit `db/seed.js` to update the 17 starter profiles, or add more from the UI.

---

## 🗄️ Database

SQLite file: `data/ngulubehub.sqlite`

Backup: just copy that file somewhere safe.
```bash
cp data/ngulubehub.sqlite ~/backup-$(date +%F).sqlite
```

Restore:
```bash
pm2 stop ngulubehub
cp ~/backup-2026-06-12.sqlite data/ngulubehub.sqlite
pm2 start ngulubehub
```

---

## 🔍 Useful pm2 commands

```bash
pm2 status              # process state
pm2 logs ngulubehub     # tail logs
pm2 restart ngulubehub  # restart
pm2 stop ngulubehub     # stop
pm2 monit               # live CPU / memory monitor
```

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow. Keep PRs small and focused.

## 🔒 Security

See [SECURITY.md](SECURITY.md) for how to report a vulnerability. Don't open a public issue for security bugs.

## 📄 License

[MIT](LICENSE) — do what you want, no warranty.

---

## 🗺️ Roadmap (when there's time)

- [ ] Password reset flow via email
- [ ] Email the intro directly from the UI
- [ ] Calendar link generator for "30-min next step"
- [ ] Export a client + intro as PDF server-side
- [ ] Persistent session store (so sessions survive a server restart)
- [ ] Tag-based "find me someone who knows X" search
- [ ] Slack / WhatsApp notification when a new client is added
- [ ] CSRF protection for forms
- [ ] 2FA via TOTP
