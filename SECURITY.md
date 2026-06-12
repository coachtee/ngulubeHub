# Security

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.2.x   | ✅ |
| < 1.2   | ❌ |

## Reporting a vulnerability

**Please don't open a public GitHub issue for security bugs.**

Instead, email **coachtee** at the address on your GitHub profile, or use [GitHub's private vulnerability reporting](https://github.com/coachtee/ngulubeHub/security/advisories/new).

Include:
- What you found
- How to reproduce
- What you expected vs what happened
- (Optional) A suggested fix

You'll get a response within a few days. We'll work with you on coordinated disclosure — typically we fix and release a patch within 1-2 weeks before any public discussion.

## What we care about

- Authentication bypass
- Privilege escalation (admin vs superadmin)
- SQL injection (we use parameterized queries — if you find a place we don't, that's a P0)
- XSS in any rendered output (EJS `<%= %>` escapes by default — if you find a `<%- %>` on user input, that's a P0)
- Session fixation / CSRF on auth flows
- Password storage (we use bcrypt — don't propose anything weaker)

## What we don't (yet) defend against

- **CSRF** on state-changing forms. Mitigations in this MVP: login required, SameSite=Lax cookie, private deployment. We plan to add explicit CSRF tokens.
- **Rate limiting** on `/login`. There's no brute-force protection yet. A simple express-rate-limit is the right next step.
- **2FA**. Password-only.
- **Long-input DoS**. No `maxlength` on text fields.

These are documented gaps, not hidden ones. If they matter for your deployment, see the "Hardening" section below.

## Hardening for production

Before exposing the app to the public internet (rather than just your team VPN or behind nginx basic auth):

1. **Set a strong SESSION_SECRET**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   export SESSION_SECRET="..."
   pm2 restart ngulubehub
   ```
2. **Put it behind HTTPS** (Nginx Proxy Manager, Caddy, or Cloudflare Tunnel) — never run auth over plain HTTP on a public IP.
3. **Use a strong super-admin password** (16+ chars, random).
4. **Restrict by IP** at the reverse-proxy layer if you can.
5. **Set up daily SQLite backups** off-server.
6. **Watch the logs** with `pm2 logs ngulubehub` for unusual 401s (brute-force attempts) and 500s.
7. **Upgrade dependencies** regularly: `npm outdated`, then `npm update`.
