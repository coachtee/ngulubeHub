#!/bin/bash
# install.sh — one-shot VPS setup for NgulubeHub
# Tested on: Ubuntu 22.04 / 24.04 (Contabo, Hetzner, DigitalOcean, etc.)
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo "🚀 NgulubeHub VPS install"
echo "========================"

# 1. Install Node.js 20.x if missing or older
# Use sudo only if it's available
SUDO=""
if command -v sudo &> /dev/null; then SUDO="sudo"; fi

NEED_NODE=true
if command -v node &> /dev/null; then
  NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
  if [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then
    NEED_NODE=false
  fi
fi
if $NEED_NODE; then
  echo "📦 Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
fi
echo "✅ Node: $(node -v)  npm: $(npm -v)"

# 2. Install pm2 globally
if ! command -v pm2 &> /dev/null; then
  echo "📦 Installing pm2..."
  $SUDO npm install -g pm2
fi
echo "✅ pm2: $(pm2 -v)"

# 3. Install app deps (production)
echo "📦 Installing app dependencies..."
npm install --omit=dev

# 4. Seed the database
echo "🌱 Seeding database..."
node db/seed.js

# 5. Stop any existing process and start
pm2 delete ngulubehub 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup | tail -1 | $SUDO bash || true

# 6. Open firewall port 3000 if ufw is active
if command -v ufw &> /dev/null && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
  echo "🔥 Opening ufw port 3000..."
  $SUDO ufw allow 3000/tcp || true
fi

# 7. Print final info
IP=$(curl -s --max-time 3 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo ""
echo "===================================================="
echo "✅ NgulubeHub is running."
echo "   Local:    http://localhost:3000"
echo "   Network:  http://$IP:3000"
echo ""
echo "Useful commands:"
echo "   pm2 status              # check process"
echo "   pm2 logs ngulubehub      # tail logs"
echo "   pm2 restart ngulubehub   # restart"
echo "   pm2 stop ngulubehub      # stop"
echo ""
echo "Optional — add nginx HTTPS reverse proxy:"
echo "   See README.md 'HTTPS with nginx + Let's Encrypt'"
echo "===================================================="
