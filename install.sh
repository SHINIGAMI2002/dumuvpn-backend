#!/usr/bin/env bash
# ══════════════════════════════════════════════════════
#  dumuVPN Backend — VPS Installer
#  รัน: bash install.sh
# ══════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'
GITHUB_USER="SHINIGAMI2002"
ok()   { echo -e " ${GREEN}✔${NC} $*"; }
info() { echo -e " ${CYAN}◆${NC} $*"; }
warn() { echo -e " ${YELLOW}⚠${NC}  $*"; }

echo ""
echo -e "${BOLD}  dumuVPN Backend Installer${NC}"
echo "  ─────────────────────────────────"
echo ""

# ── Node.js 20 ────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v | cut -dv -f2 | cut -d. -f1) -lt 20 ]]; then
  info "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -q nodejs
fi
ok "Node.js $(node -v)"

# ── PM2 ───────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2 --quiet
fi
ok "PM2 $(pm2 --version)"

# ── App directory ─────────────────────────────────────
APP_DIR="/opt/dumuvpn-backend"
info "Installing to ${APP_DIR}..."
mkdir -p "$APP_DIR"
cp -r . "$APP_DIR/"
cd "$APP_DIR"

# ── .env setup ────────────────────────────────────────
if [[ ! -f .env ]]; then
  cp .env.example .env
  # Auto-generate ADMIN_SECRET
  SECRET=$(openssl rand -hex 24)
  sed -i "s/change_this_to_random_secret_key/${SECRET}/" .env
  echo ""
  warn "ไฟล์ .env ถูกสร้างแล้ว กรุณาแก้ไขค่าต่างๆ ก่อน start:"
  echo "   nano ${APP_DIR}/.env"
  echo ""
else
  ok ".env already exists"
fi

# ── npm install ───────────────────────────────────────
info "Installing npm dependencies..."
npm install --production --quiet
ok "Dependencies installed"

# ── Uploads dir ───────────────────────────────────────
mkdir -p "$APP_DIR/uploads" "$APP_DIR/data" "$APP_DIR/public"
chmod 750 "$APP_DIR/uploads" "$APP_DIR/data"

# ── Copy frontend ─────────────────────────────────────
if [[ -f /tmp/dumuVPN.html ]]; then
  cp /tmp/dumuVPN.html "$APP_DIR/public/index.html"
  ok "Frontend copied to public/"
else
  warn "ไม่พบ dumuVPN.html — วาง HTML ไว้ที่ ${APP_DIR}/public/index.html"
fi

# ── PM2 ecosystem file ────────────────────────────────
cat > "$APP_DIR/ecosystem.config.cjs" << 'EOF'
module.exports = {
  apps: [{
    name:        'dumuvpn-backend',
    script:      './server.js',
    cwd:         '/opt/dumuvpn-backend',
    instances:   1,
    autorestart: true,
    watch:       false,
    max_memory_restart: '200M',
    env: { NODE_ENV: 'production' },
    error_file:  '/var/log/dumuvpn-error.log',
    out_file:    '/var/log/dumuvpn-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
}
EOF
ok "PM2 ecosystem config created"

# ── Summary ───────────────────────────────────────────
echo ""
echo -e "${BOLD}  ══════════════════════════════════════${NC}"
echo -e "${BOLD}   ✅ Installation complete!${NC}"
echo -e "${BOLD}  ══════════════════════════════════════${NC}"
echo ""
echo "  ขั้นตอนถัดไป:"
echo ""
echo -e "  ${CYAN}1)${NC} แก้ไข .env:"
echo      "     nano ${APP_DIR}/.env"
echo ""
echo -e "  ${CYAN}2)${NC} Start server:"
echo      "     cd ${APP_DIR} && pm2 start ecosystem.config.cjs"
echo      "     pm2 save && pm2 startup"
echo ""
echo -e "  ${CYAN}3)${NC} ดู log:"
echo      "     pm2 logs dumuvpn-backend"
echo ""
echo -e "  ${CYAN}4)${NC} Test:"
echo      "     curl http://localhost:3000/health"
echo ""
