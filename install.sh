#!/bin/bash
# install.sh — one-shot VPS setup for Ngulube Hub
# Tested on: Ubuntu 22.04 / 24.04 (Contabo, Hetzner, DigitalOcean, etc.)
#
# Design notes:
#   * No sudo required. We install Node via NVM (in ~/.nvm) and pm2 globally via npm.
#   * Idempotent: safe to re-run.
#   * If Node is already installed system-wide and >= 20, we use it.
#   * If you DO have sudo and prefer system-wide Node, run `bash install.sh --system`
#     to fall back to the apt-get path.

set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

USE_SYSTEM=false
if [ "${1:-}" = "--system" ]; then USE_SYSTEM=true; fi

SUDO=""
if command -v sudo &> /dev/null; then SUDO="sudo -n"; fi  # -n = non-interactive, fail if not cached

echo "🚀 Ngulube Hub VPS install"
echo "=========================="

# ---------- 1. Install Node.js ----------
NEED_NODE=true
if command -v node &> /dev/null; then
  NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
  if [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then
    NEED_NODE=false
  fi
fi

if $NEED_NODE; then
  if $USE_SYSTEM && [ -n "$SUDO" ] && $SUDO true 2>/dev/null; then
    echo "📦 Installing Node.js 20.x via apt (system, sudo available)..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
    $SUDO apt-get install -y nodejs
  else
    echo "📦 Installing Node.js 20.x via NVM (no sudo)..."
    export NVM_DIR="$HOME/.nvm"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    fi
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    nvm install 20
    nvm use 20
    nvm alias default 20
  fi
fi

# Make node/npm reachable for the rest of this script and for future shells
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi

echo "✅ Node: $(node -v)  npm: $(npm -v)"

# ---------- 2. Install pm2 globally ----------
if ! command -v pm2 &> /dev/null; then
  echo "📦 Installing pm2 globally..."
  if $USE_SYSTEM && [ -n "$SUDO" ] && $SUDO true 2>/dev/null; then
    $SUDO npm install -g pm2
  else
    # user-local global install
    npm install -g pm2
    # ensure ~/.npm-global/bin is on PATH for future shells
    if ! echo "$PATH" | grep -q "$HOME/.npm-global/bin"; then
      SHELL_RC="$HOME/.bashrc"
      [ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"
      if [ -w "$SHELL_RC" ] || [ -w "$(dirname "$SHELL_RC")" ]; then
        grep -q ".npm-global/bin" "$SHELL_RC" 2>/dev/null || echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "$SHELL_RC"
      fi
    fi
  fi
fi
echo "✅ pm2: $(pm2 -v)"

# ---------- 3. Install app deps (production) ----------
echo "📦 Installing app dependencies..."
npm install --omit=dev

# ---------- 4. Seed the database ----------
echo "🌱 Seeding database..."
node db/seed.js

# ---------- 5. Start / restart the service ----------
pm2 delete ngulubehub 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
# Try to set up pm2 to survive reboots (best-effort, may need sudo)
if $USE_SYSTEM && [ -n "$SUDO" ] && $SUDO true 2>/dev/null; then
  pm2 startup | tail -1 | $SUDO bash || true
fi

# ---------- 6. Open firewall port 3000 (best-effort) ----------
if command -v ufw &> /dev/null; then
  if [ -n "$SUDO" ] && $SUDO true 2>/dev/null; then
    if $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
      echo "🔥 Opening ufw port 3000..."
      $SUDO ufw allow 3000/tcp || true
    fi
  else
    echo "ℹ️  ufw is installed but no sudo available — open port 3000 manually if needed."
  fi
fi

# ---------- 7. Final info ----------
IP=$(curl -s --max-time 3 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo ""
echo "===================================================="
echo "✅ Ngulube Hub is running."
echo "   Local:    http://localhost:3000"
echo "   Network:  http://$IP:3000"
echo ""
echo "First-time setup: visit http://$IP:3000 to create the super-admin."
echo ""
echo "Useful commands:"
echo "   pm2 status              # check process"
echo "   pm2 logs ngulubehub     # tail logs"
echo "   pm2 restart ngulubehub  # restart"
echo "   pm2 stop ngulubehub     # stop"
echo ""
echo "Optional — add nginx HTTPS reverse proxy:"
echo "   See README.md 'HTTPS with nginx + Let's Encrypt'"
echo "===================================================="
